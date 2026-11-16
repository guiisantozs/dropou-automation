import test from 'node:test';
import assert from 'node:assert/strict';
import {productUrl,affiliateCandidate,checkCandidate} from './core.mjs';

test('produto oficial HTTPS permitido',()=>assert.match(productUrl('https://www.mercadolivre.com.br/placa-de-video/p/MLB63690358?polycard_client=search'),/^https:/));
test('host semelhante/URL insegura rejeitado',()=>{
  for(const url of ['http://www.mercadolivre.com.br/x','https://www.mercadolivre.com.br.evil.test/x','https://user:pass@www.mercadolivre.com.br/x','https://meli.la/1nNvewF']) assert.throws(()=>productUrl(url));
});
test('link meli.la é candidato não comprovado',()=>{
  const r=checkCandidate('https://produto.mercadolivre.com.br/MLB-1234567890-test-_JM','https://meli.la/1nNvewF');
  assert.deepEqual([r.ok,r.identity],[true,'not_confirmed']);
});
test('identidade de anúncio incompatível bloqueada',()=>assert.equal(checkCandidate('https://produto.mercadolivre.com.br/MLB-1234567890-a-_JM','https://produto.mercadolivre.com.br/MLB-1234567891-b-_JM?matt_tool=1').ok,false));
test('não aceita a mesma URL',()=>assert.equal(checkCandidate('https://www.mercadolivre.com.br/p/MLB1234567890','https://www.mercadolivre.com.br/p/MLB1234567890').ok,false));
test('não aceita candidato externo',()=>assert.throws(()=>affiliateCandidate('https://google.com/anything')));
