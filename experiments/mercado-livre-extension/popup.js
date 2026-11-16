const KEY = 'dropouMercadoLivreJob';
const el = id => document.getElementById(id);
let current = null;

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
  el('statusPanel').hidden = !hasJob;
  el('startForm').hidden = hasJob;
  if (!hasJob) return;
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
  }
}
async function refresh() {
  const stored = await chrome.storage.session.get(KEY);
  render(stored[KEY] || null);
}
el('startForm').addEventListener('submit',async event => {
  event.preventDefault();
  setError();
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
  if(!current?.result) return;
  try { await navigator.clipboard.writeText(current.result); el('copy').textContent='Copiado!'; }
  catch(error){setError('Não foi possível copiar automaticamente. Selecione o link acima.');}
});
chrome.storage.onChanged.addListener((changes,area) => {
  if (area==='session' && changes[KEY]) render(changes[KEY].newValue || null);
});
refresh().catch(error=>setError(error.message));
