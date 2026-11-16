const KEY = 'dropouMercadoLivreJob';
const ENABLED_KEY = 'dropouMercadoLivreEnabled';
const el = id => document.getElementById(id);
let current = null;
let enabled = false;

function ask(message) {
  return new Promise((resolve,reject) => {
    chrome.runtime.sendMessage(message,response => {
      if (chrome.runtime.lastError) { reject(new Error(chrome.runtime.lastError.message)); return; }
      if (!response?.ok) { reject(new Error(response?.error || 'Não foi possível executar a operação.')); return; }
      resolve(response);
    });
  });
}
function setError(message='') { el('error').textContent = message; }
function render(job) {
  current = job;
  const hasJob = !!job;
  el('toggle').textContent = enabled ? 'Desligar' : 'Ativar';
  el('toggle').classList.toggle('secondary',enabled);
  el('switchHint').textContent = enabled ? 'Ativo só neste navegador/sessão' : 'Desligado: nenhuma geração será iniciada';
  el('statusPanel').hidden = !hasJob || !enabled;
  el('startForm').hidden = hasJob || !enabled;
  if (!hasJob || !enabled) {
    current = null;
    el('result').removeAttribute('href');
    el('result').textContent = '';
    el('message').textContent = '';
    el('copy').hidden = true;
    return;
  }
  const names = {
    opening:'Abrindo o gerador',
    working:'Convertendo produto',
    candidate:'Link candidato capturado',
    needs_attention:'Ação manual necessária',
  };
  el('status').textContent = names[job.state] || 'Teste';
  el('message').textContent = job.message || '';
  el('result').hidden = !job.result;
  el('copy').hidden = !job.result;
  el('show').hidden = !job.tabId;
  if (job.result) {
    el('result').href = job.result;
    el('result').textContent = job.result;
  } else {
    el('result').removeAttribute('href');
    el('result').textContent = '';
  }
}
async function refresh() {
  const stored = await chrome.storage.session.get([KEY,ENABLED_KEY]);
  enabled = stored[ENABLED_KEY] === true;
  render(stored[KEY] || null);
}
el('toggle').addEventListener('click',async () => {
  setError();
  el('toggle').disabled = true;
  try {
    const target = !enabled;
    await ask({type:'setEnabled',enabled:target});
    if (!target) el('source').value = '';
    await refresh();
  } catch(error) {
    setError(error.message);
    await refresh();
  } finally {el('toggle').disabled = false;}
});
el('startForm').addEventListener('submit',async event => {
  event.preventDefault();
  setError();
  if(!enabled) {setError('Ative a extensão para iniciar.');return;}
  el('start').disabled = true;
  try {
    await ask({type:'start',productUrl:el('source').value.trim(),closeOnSuccess:el('autoClose').checked});
    await refresh();
  } catch(error) {setError(error.message);}
  finally {el('start').disabled = false;}
});
el('show').addEventListener('click',async () => {
  try { await ask({type:'showTab'}); window.close(); } catch(error){setError(error.message);}
});
el('reset').addEventListener('click',async () => {
  try { await ask({type:'reset'});setError();await refresh(); }
  catch(error){setError(error.message);}
});
el('copy').addEventListener('click',async () => {
  if(!current?.result || !enabled) return;
  try { await navigator.clipboard.writeText(current.result); el('copy').textContent='Copiado!'; }
  catch(error){setError('Não foi possível copiar automaticamente. Selecione o link acima.');}
});
chrome.storage.onChanged.addListener((changes,area) => {
  if (area==='session' && (changes[KEY] || changes[ENABLED_KEY])) {
    refresh().catch(error=>setError(error.message));
  }
});
refresh().catch(error=>setError(error.message));
