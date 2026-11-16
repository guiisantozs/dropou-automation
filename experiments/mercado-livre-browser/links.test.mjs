import test from 'node:test';
import assert from 'node:assert/strict';
import {parseMercadoLivreUrl, getItemId, assessGeneratedLink} from './links.mjs';

test('aceita links de produto do Mercado Livre', () => {
  assert.equal(getItemId('https://produto.mercadolivre.com.br/MLB-1234567890-produto-_JM'), 'MLB1234567890');
});
test('rejeita URL de terceiros, HTTP e credenciais na URL', () => {
  for (const value of ['http://mercadolivre.com.br/p/MLB1234567890', 'https://mercadolivre.com.br.evil.test/x', 'https://usuario:senha@mercadolivre.com.br/x']) {
    assert.throws(() => parseMercadoLivreUrl(value));
  }
});
test('não confunde anúncio com outro anúncio', () => {
  const result = assessGeneratedLink(
    'https://produto.mercadolivre.com.br/MLB-1234567890-a-_JM',
    'https://produto.mercadolivre.com.br/MLB-9876543210-b-_JM?matt_tool=1',
  );
  assert.equal(result.accepted, false);
  assert.equal(result.identity, 'mismatch');
});
test('link curto aceito sem alegar atribuição verificada', () => {
  const result = assessGeneratedLink(
    'https://produto.mercadolivre.com.br/MLB-1234567890-a-_JM',
    'https://meli.la/ABC123',
  );
  assert.equal(result.accepted, true);
  assert.equal(result.identity, 'not_confirmed');
});
test('não aceita URL idêntica como conversão', () => {
  const url = 'https://produto.mercadolivre.com.br/MLB-1234567890-a-_JM';
  assert.equal(assessGeneratedLink(url, url).accepted, false);
});
