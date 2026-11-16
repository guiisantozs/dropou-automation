// Shared by the extension and Node test runner. Never reads account/session data.
const SOURCE_HOSTS = ['mercadolivre.com.br', 'mercadolivre.com'];
const RESULT_HOSTS = [...SOURCE_HOSTS, 'meli.la'];
function parseAllowed(input, hosts) {
  if (typeof input !== 'string' || input.length < 10 || input.length > 6000) {
    throw new Error('O link está vazio ou ultrapassou o limite de tamanho.');
  }
  let url;
  try { url = new URL(input.trim()); }
  catch { throw new Error('Cole um endereço completo começando com https://.'); }
  const host = url.hostname.toLowerCase();
  if (url.protocol !== 'https:' || url.username || url.password || url.port ||
      !hosts.some(h => host === h || host.endsWith('.' + h))) {
    throw new Error('Use somente links oficiais HTTPS do Mercado Livre.');
  }
  return url;
}
export function productUrl(input) {
  return parseAllowed(input, SOURCE_HOSTS).href;
}
export function affiliateCandidate(input) {
  return parseAllowed(input, RESULT_HOSTS).href;
}
export function itemId(input) {
  const url = new URL(input);
  const fromQuery = url.searchParams.get('wid') || url.searchParams.get('item_id') || '';
  const match = (fromQuery + ' ' + url.pathname).match(/MLB[-_ ]?(\d{6,})/i);
  return match ? 'MLB' + match[1] : null;
}
export function checkCandidate(original, generated) {
  const source = productUrl(original);
  const result = affiliateCandidate(generated);
  if (source === result) return {ok:false,identity:'unchanged',message:'Link igual ao original; não foi comprovada conversão.'};
  const a=itemId(source), b=itemId(result);
  if(a && b && a !== b) return {ok:false,identity:'mismatch',message:'O link aponta para outro anúncio.'};
  return {
    ok:true,
    identity:a && b ? 'same_listing' : 'not_confirmed',
    message:'Link candidato capturado. Atribuição à sua conta/etiqueta e comissão NÃO foram comprovadas automaticamente.',
  };
}
