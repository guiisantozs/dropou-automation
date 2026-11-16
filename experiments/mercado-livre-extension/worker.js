import {productUrl, checkCandidate} from './core.mjs';

const STORAGE_KEY = 'dropouMercadoLivreJob';
const ENABLED_KEY = 'dropouMercadoLivreEnabled';
const isEnabled = async () => (await chrome.storage.session.get(ENABLED_KEY))[ENABLED_KEY] === true;

const GENERATOR_URL = 'https://www.mercadolivre.com.br/afiliados/linkbuilder#hub';
const running = new Set();

async function readJob() {
  const stored = await chrome.storage.session.get(STORAGE_KEY);
  return stored[STORAGE_KEY] || null;
}
async function updateJob(tabId, changes) {
  if (!await isEnabled()) return;
  const current = await readJob();
  if (!current || current.tabId !== tabId) return;
  await chrome.storage.session.set({[STORAGE_KEY]: {...current, ...changes}});
}
async function injectIfReady(tabId) {
  if (running.has(tabId)) return;
  running.add(tabId);
  try {
    if (!await isEnabled()) return;
    const job = await readJob();
    if (!job || job.tabId !== tabId || job.state !== 'opening') return;
    const tab = await chrome.tabs.get(tabId);
    if (tab.status !== 'complete') return;
    await updateJob(tabId, {state:'working',message:'Localizando o Gerador de Links...'});
    await chrome.scripting.executeScript({target:{tabId},files:['page.js']});
  } catch (error) {
    await updateJob(tabId, {state:'needs_attention',message:'Não foi possível acessar o formulário. Abra a aba de teste para conferir o login e a página.'});
  } finally {
    running.delete(tabId);
  }
}
chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status === 'complete') injectIfReady(tabId);
});
chrome.tabs.onRemoved.addListener(async tabId => {
  const job = await readJob();
  if (job?.tabId === tabId && ['opening','working'].includes(job.state)) {
    await updateJob(tabId, {state:'needs_attention',tabId:null,message:'A aba de teste foi fechada antes de terminar.'});
  }
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  (async () => {
    if (request?.type === 'setEnabled') {
      if (request.enabled === true) {
        await chrome.storage.session.set({[ENABLED_KEY]:true});
        sendResponse({ok:true,enabled:true});
        return;
      }
      // Interrupção explícita: bloqueia novas operações antes de encerrar a aba.
      await chrome.storage.session.set({[ENABLED_KEY]:false});
      const old = await readJob();
      if (old?.tabId) await chrome.tabs.remove(old.tabId).catch(()=>{});
      await chrome.storage.session.remove(STORAGE_KEY);
      sendResponse({ok:true,enabled:false});
      return;
    }
    if (request?.type === 'start') {
      if (!await isEnabled()) throw new Error('Ative a extensão antes de iniciar um teste.');
      const url = productUrl(request.productUrl);
      const current = await readJob();
      if (current && ['opening','working'].includes(current.state)) {
        throw new Error('Já existe um teste em andamento. Conclua-o antes de iniciar outro.');
      }
      const tab = await chrome.tabs.create({url:GENERATOR_URL,active:false});
      if (!await isEnabled()) {
        await chrome.tabs.remove(tab.id).catch(()=>{});
        throw new Error('A extensão foi desligada antes do início do teste.');
      }
      const job = {tabId:tab.id,productUrl:url,state:'opening',message:'Abrindo o gerador em uma aba inativa...',closeOnSuccess:request.closeOnSuccess !== false,result:null,identity:null,startedAt:Date.now()};
      await chrome.storage.session.set({[STORAGE_KEY]:job});
      sendResponse({ok:true,tabId:tab.id});
      injectIfReady(tab.id);
      return;
    }
    if (request?.type === 'getTask') {
      if (!await isEnabled()) { sendResponse({ok:false}); return; }
      const job = await readJob();
      if (!sender.tab?.id || job?.tabId !== sender.tab.id || job.state !== 'working') {
        sendResponse({ok:false});
      } else {
        sendResponse({ok:true,productUrl:job.productUrl});
      }
      return;
    }
    if (request?.type === 'progress' || request?.type === 'finished') {
      if (!await isEnabled()) { sendResponse({ok:false}); return; }
      const tabId = sender.tab?.id;
      const job = await readJob();
      if (!tabId || job?.tabId !== tabId || job.state !== 'working') {
        sendResponse({ok:false});
        return;
      }
      if (request.type === 'progress') {
        await updateJob(tabId,{message:String(request.message || 'Processando...').slice(0,200)});
      } else if (request.success && typeof request.resultUrl === 'string') {
        try {
          const result = checkCandidate(job.productUrl,request.resultUrl);
          if (!result.ok) throw new Error(result.message);
          await updateJob(tabId,{state:'candidate',message:result.message,result:request.resultUrl,identity:result.identity});
          if (job.closeOnSuccess) {
            await chrome.tabs.remove(tabId).catch(()=>{});
            await updateJob(tabId,{tabId:null});
          }
        } catch (error) {
          await updateJob(tabId,{state:'needs_attention',message:String(error.message || error).slice(0,250)});
        }
      } else {
        await updateJob(tabId,{state:'needs_attention',message:String(request.message || 'O resultado não pôde ser capturado.').slice(0,250)});
      }
      sendResponse({ok:true});
      return;
    }
    if (request?.type === 'showTab') {
      if (!await isEnabled()) throw new Error('Extensão desligada.');
      const job = await readJob();
      if (!job?.tabId) throw new Error('Não há aba de teste aberta.');
      const tab = await chrome.tabs.update(job.tabId,{active:true});
      await chrome.windows.update(tab.windowId,{focused:true});
      sendResponse({ok:true});
      return;
    }
    if (request?.type === 'reset') {
      const job = await readJob();
      if (job?.tabId) await chrome.tabs.remove(job.tabId).catch(()=>{});
      await chrome.storage.session.remove(STORAGE_KEY);
      sendResponse({ok:true});
      return;
    }
    throw new Error('Operação desconhecida.');
  })().catch(error => sendResponse({ok:false,error:String(error.message || error).slice(0,220)}));
  return true;
});
