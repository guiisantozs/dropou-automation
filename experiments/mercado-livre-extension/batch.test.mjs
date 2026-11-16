import test from 'node:test';
import assert from 'node:assert/strict';
import {MAX_BATCH,parseBatchInput,progressSummary,nextItemIndex,appendPageToDraft} from './batch.mjs';

const a='https://produto.mercadolivre.com.br/MLB-1234567890-gpu-_JM';
const b='https://produto.mercadolivre.com.br/MLB-1234567891-monitor-_JM';
const c='https://www.mercadolivre.com.br/p/MLB2345678901';

test('lote aceita um ou mais links e mantém ordem',()=>{
  assert.deepEqual(parseBatchInput(a+'\n'+b).map(x=>x.source),[a,b]);
});
test('links do mesmo anúncio são deduplicados',()=>{
  const items=parseBatchInput(a+'\n'+a+'?utm_source=test'+'\n'+b);
  assert.equal(items.length,2);
});
test('lote limita o número de URLs sem truncamento silencioso',()=>{
  assert.throws(()=>parseBatchInput(Array.from({length:MAX_BATCH+1},(_,i)=>c+'?page='+i).join('\n')),/Máximo/);
});
test('links inseguros no lote são rejeitados',()=>{
  assert.throws(()=>parseBatchInput(a+'\nhttps://mercadolivre.com.br.evil.test/x'));
  assert.throws(()=>parseBatchInput('http://www.mercadolivre.com.br/x'));
});
test('lote vazio é rejeitado',()=>assert.throws(()=>parseBatchInput('\n  \n')));
test('estatísticas e próximo item são determinísticos',()=>{
  const items=parseBatchInput([a,b,c].join('\n'));
  items[0].state='candidate';items[1].state='needs_attention';
  assert.equal(nextItemIndex(items),2);
  assert.deepEqual(progressSummary(items),{total:3,pending:1,candidates:1,failed:1});
});

test('adiciona produto da aba atual e evita repetir o anúncio',()=>{
  const first=appendPageToDraft('',a);
  assert.deepEqual(first,{value:a,added:true});
  const duplicate=appendPageToDraft(first.value,a+'?utm_source=teste');
  assert.equal(duplicate.added,false);
  assert.equal(duplicate.value,a);
  const second=appendPageToDraft(first.value,b);
  assert.equal(second.added,true);
  assert.equal(second.value,a+'\n'+b);
});
test('não adiciona uma sexta URL nem uma página fora do Mercado Livre',()=>{
  const full=Array.from({length:MAX_BATCH},(_,i)=>c+'?variant='+i).join('\n');
  assert.throws(()=>appendPageToDraft(full,a),/máximo/);
  assert.throws(()=>appendPageToDraft('', 'https://example.com/'),/Mercado Livre/);
});
