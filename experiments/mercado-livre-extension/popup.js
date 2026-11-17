import {appendPageToDraft, MAX_BATCH} from './batch.mjs';
import {CONNECTION_KEY} from './dropou.mjs';

const KEY='dropouMercadoLivreJob';
const DRAFT_KEY='dropouMercadoLivreDraft';
const ENABLED_KEY='dropouMercadoLivreEnabled';
const el=id=>document.getElementById(id);
let current=null,enabled=false,draftLoaded=false;
let draftQueue=Promise.resolve();

function countDraft() {
  const count=el('source').value.split(/\r?\n/).filter(line=>line.trim()).length;
  el('draftCount').textContent=count+' / '+MAX_BATCH+' links no rascunho';
}
function saveDraft() {
  const value=el('source').value.slice(0,30000);
  draftQueue=draftQueue.catch(()=>{}).then(()=>chrome.storage.session.set({[DRAFT_KEY]:value}));
  return draftQueue;
}

const stateNames={
  queued:'Aguardando',
  opening:'Abrindo gerador',
  working:'Convertendo',
  candidate:'Link candidato',
  needs_attention:'Revisão necessária',
  advancing:'Próximo produto',
  completed:'Lote concluído',
};
function ask(message) {
  return new Promise((resolve,reject)=>{
    chrome.runtime.sendMessage(message,response=>{
      if(chrome.runtime.lastError) {reject(new Error(chrome.runtime.lastError.message));return;}
      if(!response?.ok) {reject(new Error(response?.error||'Ação não concluída.'));return;}
      resolve(response);
    });
  });
}
const setError=(message='')=>{el('error').textContent=message;};
function clearResults() {
  el('result').removeAttribute('href');
  el('result').textContent='';
  el('result').hidden=true;
  el('message').textContent='';
  el('summary').textContent='';
  el('summary').hidden=true;
  el('queue').replaceChildren();
  el('queue').hidden=true;
  el('copy').hidden=true;
  el('skip').hidden=true;
}
function render(job) {
  current=job;
  const hasJob=!!job;
  el('toggle').textContent=enabled?'Desligar':'Ativar';
  el('toggle').classList.toggle('secondary',enabled);
  el('switchHint').textContent=enabled?'Ativo somente nesta sessão do Chrome':'Desligado: nenhuma conversão será iniciada';
  el('statusPanel').hidden=!hasJob||!enabled;
  el('startForm').hidden=hasJob||!enabled;
  if(!hasJob||!enabled) {
    current=null;
    clearResults();
    return;
  }
  el('status').textContent=stateNames[job.state]||'Teste';
  el('message').textContent=job.message||'';
  el('show').hidden=!job.tabId;
  el('skip').hidden=!(job.state==='needs_attention' && Array.isArray(job.items) && job.items.length>1);
  if(job.result && job.items?.length===1) {
    el('result').href=job.result;
    el('result').textContent=job.result;
    el('result').hidden=false;
    el('copy').hidden=false;
  } else {
    el('result').removeAttribute('href');
    el('result').textContent='';
    el('result').hidden=true;
    el('copy').hidden=true;
  }
  const items=Array.isArray(job.items)?job.items:[];
  if(!items.length) {
    el('summary').hidden=true;
    el('queue').hidden=true;
    return;
  }
  const candidates=items.filter(x=>x.state==='candidate').length;
  const failures=items.filter(x=>x.state==='needs_attention').length;
  const waiting=items.filter(x=>['queued','opening','working'].includes(x.state)).length;
  el('summary').textContent=items.length+' produtos • '+candidates+' candidatos • '+failures+' revisões • '+waiting+' pendentes';
  el('summary').hidden=false;
  const entries=items.map((item,index)=>{
    const li=document.createElement('li');
    const label=document.createElement('span');
    label.className='state';
    label.textContent=(index+1)+'. '+(stateNames[item.state]||'Aguardando');
    const source=document.createElement('span');
    source.className='source';
    source.textContent=item.source||'Produto';
    li.append(label,source);
    if(item.candidate){
      const a=document.createElement('a');
      a.className='candidate';
      a.href=item.candidate;
      a.target='_blank';
      a.rel='noopener noreferrer';
      a.textContent=item.candidate;
      li.append(a);
    }
    if(item.message && item.state==='needs_attention'){
      const hint=document.createElement('span');
      hint.className='source';
      hint.textContent=item.message;
      li.append(hint);
    }
    if(item.state==='candidate'&&item.candidate){
      const button=document.createElement('button');button.type='button';button.textContent=item.transfer?.state==='sending'?'Aguardando confirmação…':'Enviar ao Dropou';button.disabled=!enabled||!['candidate','completed'].includes(job.state)||item.transfer?.state==='sending';
      button.addEventListener('click',async()=>{button.disabled=true;setError();try{await ask({type:'sendDropou',index});}catch(error){setError(error.message);}finally{await refresh();}});li.append(button);
      if(item.transfer){const hint=document.createElement('span');hint.className='source';hint.textContent=item.transfer.message;li.append(hint);}
    }
    return li;
  });
  el('queue').replaceChildren(...entries);
  el('queue').hidden=false;
}
async function refresh() {
  const stored=await chrome.storage.session.get([KEY,ENABLED_KEY,DRAFT_KEY,CONNECTION_KEY]);
  if(!draftLoaded) {
    el('source').value=typeof stored[DRAFT_KEY]==='string'?stored[DRAFT_KEY]:'';
    draftLoaded=true;
    countDraft();
  }
  enabled=stored[ENABLED_KEY]===true;
  const connection=stored[CONNECTION_KEY];el('connectionHint').textContent=connection&&connection.expiresAt>Date.now()?'Conectado: '+connection.operation+' · confirme a operação na aba Dropou':'Selecione a operação na aba autenticada e conecte. A conexão dura cinco minutos.';
  el('connectDropou').disabled=!enabled;
  render(stored[KEY]||null);
}
el('connectDropou').addEventListener('click',async()=>{el('connectDropou').disabled=true;setError();try{await ask({type:'connectDropou'});}catch(error){setError(error.message);}finally{await refresh();}});
el('toggle').addEventListener('click',async()=>{
  setError();
  el('toggle').disabled=true;
  try {
    const target=!enabled;
    await draftQueue;
    await ask({type:'setEnabled',enabled:target});
    if(!target) {el('source').value='';countDraft();}
    await refresh();
  }catch(error){setError(error.message);await refresh();}
  finally{el('toggle').disabled=false;}
});
el('source').addEventListener('input',()=>{
  countDraft();
  saveDraft().catch(error=>setError('Rascunho não salvo: '+error.message));
});
el('addCurrent').addEventListener('click',async()=>{
  setError();
  el('addCurrent').disabled=true;
  try {
    const tabs=await chrome.tabs.query({active:true,currentWindow:true});
    const url=tabs[0]?.url;
    if(!url) throw new Error('Não foi possível ler o endereço da aba atual.');
    const next=appendPageToDraft(el('source').value,url);
    if(!next.added) {setError('Esse anúncio já está no rascunho.');return;}
    el('source').value=next.value;
    countDraft();
    await saveDraft();
  }catch(error){setError(error.message);}
  finally{el('addCurrent').disabled=false;}
});
el('startForm').addEventListener('submit',async event=>{
  event.preventDefault();
  setError();
  if(!enabled){setError('Ative a extensão primeiro.');return;}
  el('start').disabled=true;
  try{
    await draftQueue;
    await ask({type:'start',productUrl:el('source').value,closeOnSuccess:el('autoClose').checked});
    await refresh();
  }catch(error){setError(error.message);}
  finally{el('start').disabled=false;}
});
el('show').addEventListener('click',async()=>{
  try{await ask({type:'showTab'});}catch(error){setError(error.message);}
});
el('skip').addEventListener('click',async()=>{
  el('skip').disabled=true;
  try{await ask({type:'skip'});setError();await refresh();}
  catch(error){setError(error.message);}
  finally{el('skip').disabled=false;}
});
el('reset').addEventListener('click',async()=>{
  try{await draftQueue;await ask({type:'reset'});el('source').value='';countDraft();setError();await refresh();}
  catch(error){setError(error.message);}
});
el('copy').addEventListener('click',async()=>{
  if(!current?.result||!enabled)return;
  try{await navigator.clipboard.writeText(current.result);el('copy').textContent='Copiado!';}
  catch{setError('Não foi possível copiar automaticamente. Selecione o link acima.');}
});
chrome.storage.onChanged.addListener((changes,area)=>{
  if(area==='session'&&(changes[KEY]||changes[ENABLED_KEY]||changes[CONNECTION_KEY])) refresh().catch(error=>setError(error.message));
});
refresh().catch(error=>setError(error.message));
