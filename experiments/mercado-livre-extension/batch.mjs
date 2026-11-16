import {productUrl, itemId} from './core.mjs';

export const MAX_BATCH = 5;

export function parseBatchInput(input) {
  if (typeof input !== 'string') throw new Error('Informe pelo menos um link normal do Mercado Livre.');
  const lines=input.split(/\r?\n/).map(x=>x.trim()).filter(Boolean);
  if (!lines.length) throw new Error('Cole pelo menos um link, um por linha.');
  if (lines.length > MAX_BATCH) throw new Error('Máximo de '+MAX_BATCH+' links por teste para evitar excesso de acessos.');
  const items=[];
  const seen=new Set();
  for (const line of lines) {
    const url=productUrl(line);
    const id=itemId(url);
    const key=id ? 'item:'+id : 'url:'+url;
    if (seen.has(key)) continue;
    seen.add(key);
    items.push({source:url,state:'queued',candidate:null,identity:null,message:''});
  }
  if (!items.length) throw new Error('Nenhum link novo no lote.');
  return items;
}

export function progressSummary(items) {
  if(!Array.isArray(items)) throw new Error('Lote inválido.');
  return {
    total:items.length,
    pending:items.filter(x=>['queued','opening','working'].includes(x.state)).length,
    candidates:items.filter(x=>x.state==='candidate').length,
    failed:items.filter(x=>x.state==='needs_attention').length,
  };
}

export function nextItemIndex(items) {
  return items.findIndex(item=>item.state==='queued');
}

export function appendPageToDraft(draft, pageUrl) {
  const next=productUrl(pageUrl);
  const lines=String(draft||'').split(/\r?\n/).map(x=>x.trim()).filter(Boolean);
  const newId=itemId(next);
  const duplicate=lines.some(line=>{
    try {
      const existing=productUrl(line), oldId=itemId(existing);
      return (newId && oldId && newId===oldId) || existing===next;
    } catch { return false; }
  });
  if(duplicate) return {value:lines.join('\n'),added:false};
  if (lines.length>=MAX_BATCH) throw new Error('A lista está cheia: máximo de '+MAX_BATCH+' links.');
  return {value:[...lines,next].join('\n'),added:true};
}
