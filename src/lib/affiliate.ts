import type {Product} from './domain';
export function affiliateStore(input:string):Product['store']{
 const u=new URL(input);
 if(u.protocol!=='https:'||u.username||u.password)throw new Error('Cole um link de afiliado HTTPS válido.');
 const host=u.hostname;
 if(['mercadolivre.com.br','mercadolivre.com','mercadolibre.com','meli.la'].some(d=>host===d||host.endsWith('.'+d)))return 'Mercado Livre';
 if(['shopee.com.br','shope.ee'].some(d=>host===d||host.endsWith('.'+d)))return 'Shopee';
 throw new Error('Link não reconhecido. Use um link oficial do Mercado Livre ou da Shopee.');
}
