import {checkCandidate} from './core.mjs';
import {parseBatchInput, nextItemIndex} from './batch.mjs';

const STORAGE_KEY = 'dropouMercadoLivreJob';
const ENABLED_KEY = 'dropouMercadoLivreEnabled';
const DRAFT_KEY = 'dropouMercadoLivreDraft';
const GENERATOR_URL = 'https://www.mercadolivre.com.br/afiliados/linkbuilder#hub';
const running = new Set();

// O clique no ícone abre o painel lateral global, que permanece disponível
// durante a navegação do usuário entre abas. Nenhuma aba de produto é controlada.
if (chrome.sidePanel?.setPanelBehavior) {
  chrome.sidePanel.setPanelBehavior({openPanelOnActionClick:true}).catch(() => {});
}
chrome.runtime.onInstalled?.addListener(() => {
  chrome.sidePanel?.setPanelBehavior?.({openPanelOnActionClick:true}).catch(() => {});
});

async function readJob() {
  const data = await chrome.storage.session.get(STORAGE_KEY);
  return data[STORAGE_KEY] || null;
}
async function isEnabled() {
  const data = await chrome.storage.session.get(ENABLED_KEY);
  return data[ENABLED_KEY] === true;
}
async function saveJob(job) {
  if (!await isEnabled()) return false;
  const current = await readJob();
  if (!current || current.id !== job.id) return false;
  await chrome.storage.session.set({[STORAGE_KEY]:job});
  return true;
}
async function closeTab(tabId) {
  if (Number.isInteger(tabId)) await chrome.tabs.remove(tabId).catch(()=>{});
}
function safeError(error) { return String(error?.message || error).slice(0,230); }
function currentItem(job) { return job.items[job.currentIndex]; }

async function launchNext(job) {
  if (!await isEnabled()) return;
  const index = nextItemIndex(job.items);
  if (index === -1) {
    await saveJob({...job,tabId:null,state:'completed',message:'Lote concluído. Revise cada link candidato antes de publicar.',result:null,identity:null});
    return;
  }
  const nextItems = job.items.map((x,i)=>i===index ? {...x,state:'opening',message:'Abrindo gerador...'} : x);
  const opening={...job,items:nextItems,currentIndex:index,tabId:null,state:'opening',productUrl:nextItems[index].source,message:'Abrindo o gerador na aba inativa...',result:null,identity:null};
  if (!await saveJob(opening)) return;
  let tab;
  try { tab = await chrome.tabs.create({url:GENERATOR_URL,active:false}); }
  catch(error) {
    const failed=nextItems.map((x,i)=>i===index ? {...x,state:'needs_attention',message:'Não foi possível abrir o gerador.'} : x);
    await saveJob({...opening,items:failed,state:'needs_attention',message:'Não foi possível abrir o gerador. '+safeError(error)});
    return;
  }
  if (!await isEnabled() || (await readJob())?.id !== job.id) {await closeTab(tab.id);return;}
  const active={...opening,tabId:tab.id};
  await saveJob(active);
  await injectIfReady(tab.id);
}
async function injectIfReady(tabId) {
  if (running.has(tabId)) return;
  running.add(tabId);
  try {
    if (!await isEnabled()) return;
    const job=await readJob();
    if (!job || job.tabId!==tabId || job.state!=='opening') return;
    const tab=await chrome.tabs.get(tabId);
    if (tab.status!=='complete') return;
    const items=job.items.map((x,i)=>i===job.currentIndex ? {...x,state:'working',message:'Localizando gerador...'}:x);
    await saveJob({...job,items,state:'working',message:'Localizando o Gerador de Links...'});
    await chrome.scripting.executeScript({target:{tabId},files:['page.js']});
  } catch {
    const job=await readJob();
    if (job?.tabId===tabId) {
      const items=job.items.map((x,i)=>i===job.currentIndex ? {...x,state:'needs_attention',message:'Confira login e página do gerador.'}:x);
      await saveJob({...job,items,state:'needs_attention',message:'Não foi possível acessar o formulário. Abra a aba para conferir.'});
    }
  } finally { running.delete(tabId); }
}
chrome.tabs.onUpdated.addListener((tabId,change)=>{
  if(change.status==='complete') injectIfReady(tabId);
});
chrome.tabs.onRemoved.addListener(async tabId=>{
  const job=await readJob();
  if(job?.tabId!==tabId || !['opening','working'].includes(job.state)) return;
  const items=job.items.map((x,i)=>i===job.currentIndex ? {...x,state:'needs_attention',message:'Aba fechada antes de concluir.'}:x);
  await saveJob({...job,tabId:null,items,state:'needs_attention',message:'A aba de teste foi fechada antes de concluir. Você pode pular esse item.'});
});
chrome.runtime.onMessage.addListener((request,sender,sendResponse)=>{
  (async()=>{
    if(request?.type==='setEnabled') {
      // Off acts as explicit stop and clears only data owned by the extension.
      await chrome.storage.session.set({[ENABLED_KEY]:false});
      const old=await readJob();
      await closeTab(old?.tabId);
      await chrome.storage.session.remove([STORAGE_KEY,DRAFT_KEY]);
      if(request.enabled === true) await chrome.storage.session.set({[ENABLED_KEY]:true});
      sendResponse({ok:true,enabled:request.enabled===true});
      return;
    }
    if(request?.type==='start') {
      if(!await isEnabled()) throw new Error('Ative o conversor antes de começar.');
      const current=await readJob();
      if(current) throw new Error('Há um teste na sessão. Use Novo teste para limpar antes de iniciar outro.');
      const items=parseBatchInput(request.productUrl);
      const job={id:crypto.randomUUID(),items,currentIndex:-1,tabId:null,state:'queued',message:'Preparando testes...',productUrl:null,result:null,identity:null,closeOnSuccess:request.closeOnSuccess!==false,startedAt:Date.now()};
      await chrome.storage.session.set({[STORAGE_KEY]:job});
      await launchNext(job);
      sendResponse({ok:true});
      return;
    }
    if(request?.type==='getTask') {
      const job=await readJob();
      if(!await isEnabled() || !sender.tab?.id || job?.tabId!==sender.tab.id || job.state!=='working') {
        sendResponse({ok:false});
        return;
      }
      sendResponse({ok:true,productUrl:job.productUrl,jobId:job.id});
      return;
    }
    if(request?.type==='progress' || request?.type==='finished') {
      if(!await isEnabled()) {sendResponse({ok:false});return;}
      const job=await readJob(),tabId=sender.tab?.id;
      if(!job || !tabId || job.tabId!==tabId || job.state!=='working' || request.jobId!==job.id) {
        sendResponse({ok:false});return;
      }
      const at=job.currentIndex, item=currentItem(job);
      if(request.type==='progress') {
        const message=String(request.message || 'Processando...').slice(0,180);
        const items=job.items.map((x,i)=>i===at ? {...x,message}:x);
        await saveJob({...job,items,message});
        sendResponse({ok:true});return;
      }
      if(request.success && typeof request.resultUrl==='string') {
        try {
          const result=checkCandidate(item.source,request.resultUrl);
          if(!result.ok) throw new Error(result.message);
          const items=job.items.map((x,i)=>i===at ? {...x,state:'candidate',candidate:request.resultUrl,identity:result.identity,message:result.message}:x);
          if(items.length===1) {
            const candidate={...job,items,state:'candidate',message:result.message,result:request.resultUrl,identity:result.identity};
            await saveJob(candidate);
            if(job.closeOnSuccess) {
              await saveJob({...candidate,tabId:null});
              await closeTab(tabId);
            }
          } else {
            // Mark completion before closing so onRemoved cannot treat it as an error.
            await saveJob({...job,items,state:'advancing',tabId:null,message:'Link candidato capturado. Próximo item...'});
            await closeTab(tabId);
            await launchNext({...job,items,tabId:null});
          }
        } catch(error) {
          const message=safeError(error);
          const items=job.items.map((x,i)=>i===at?{...x,state:'needs_attention',message}:x);
          await saveJob({...job,items,state:'needs_attention',message:'Falha de validação: '+message});
        }
      } else {
        const message=String(request.message || 'Não foi possível capturar o resultado.').slice(0,230);
        const items=job.items.map((x,i)=>i===at?{...x,state:'needs_attention',message}:x);
        await saveJob({...job,items,state:'needs_attention',message:'Teste pausado para revisão. '+message});
      }
      sendResponse({ok:true});return;
    }
    if(request?.type==='skip') {
      if(!await isEnabled()) throw new Error('O conversor está desligado.');
      const job=await readJob();
      if(!job || job.state!=='needs_attention') throw new Error('Não há item aguardando revisão.');
      const items=job.items.map((x,i)=>i===job.currentIndex?{...x,state:'needs_attention'}:x);
      await saveJob({...job,tabId:null,state:'advancing',items});
      await closeTab(job.tabId);
      await launchNext({...job,tabId:null,items});
      sendResponse({ok:true});return;
    }
    if(request?.type==='showTab') {
      if(!await isEnabled()) throw new Error('O conversor está desligado.');
      const job=await readJob();
      if(!job?.tabId) throw new Error('Não há aba de teste aberta.');
      const tab=await chrome.tabs.update(job.tabId,{active:true});
      await chrome.windows.update(tab.windowId,{focused:true});
      sendResponse({ok:true});return;
    }
    if(request?.type==='reset') {
      const job=await readJob();
      await chrome.storage.session.remove([STORAGE_KEY,DRAFT_KEY]);
      await closeTab(job?.tabId);
      sendResponse({ok:true});return;
    }
    throw new Error('Operação desconhecida.');
  })().catch(error=>sendResponse({ok:false,error:safeError(error)}));
  return true;
});
