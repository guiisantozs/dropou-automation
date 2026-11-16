const HOSTS = ['mercadolivre.com.br', 'mercadolivre.com', 'mercadolibre.com', 'meli.la'];

export function parseMercadoLivreUrl(value) {
  let url;
  try {
    url = new URL(String(value || '').trim());
  } catch {
    throw new Error('Cole uma URL completa iniciada por https://.');
  }
  const hostname = url.hostname.toLowerCase();
  const allowed = HOSTS.some((host) => hostname === host || hostname.endsWith('.' + host));
  if (url.protocol !== 'https:' || url.username || url.password || !allowed) {
    throw new Error('Somente endereços HTTPS oficiais do Mercado Livre ou meli.la.');
  }
  return url;
}

export function getItemId(value) {
  const url = typeof value === 'string' ? parseMercadoLivreUrl(value) : value;
  const param = url.searchParams.get('wid') || url.searchParams.get('item_id') || '';
  const match = (param + ' ' + url.pathname).match(/MLB[-_ ]?(\d{6,})/i);
  return match ? 'MLB' + match[1] : null;
}

export function assessGeneratedLink(original, generated) {
  const source = parseMercadoLivreUrl(original);
  const result = parseMercadoLivreUrl(generated);
  if (source.href === result.href) {
    return { accepted: false, identity: 'unchanged', message: 'O link retornado é idêntico ao original.' };
  }
  const oldId = getItemId(source);
  const newId = getItemId(result);
  if (oldId && newId && oldId !== newId) {
    return { accepted: false, identity: 'mismatch', message: 'O link retornado parece apontar para outro anúncio.' };
  }
  return {
    accepted: true,
    identity: oldId && newId ? 'same_listing' : 'not_confirmed',
    message: 'Formato válido. Atribuição de afiliado e comissão ainda precisam ser confirmadas no Mercado Livre.',
  };
}
