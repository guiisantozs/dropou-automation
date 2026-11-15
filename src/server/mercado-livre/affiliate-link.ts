import {mercadoLivreIdentity,mercadoLivreUrl} from '../../lib/mercado-livre-link';
import {resolveMercadoLivreLink} from './resolve-link';
export async function associateMercadoLivreAffiliate(url:string,productUrl:string,http:typeof fetch=fetch){
 mercadoLivreUrl(url);const original=mercadoLivreIdentity(productUrl);let destination;
 try{destination=await resolveMercadoLivreLink(url,http);}catch{destination=mercadoLivreIdentity(url);}
 if(original.itemId&&destination.itemId&&original.itemId!==destination.itemId)throw new Error('Este link leva a outro anúncio. Gere o link do mesmo produto no Portal do Afiliado.');
 if(!original.itemId&&original.catalogId&&destination.catalogId&&original.catalogId!==destination.catalogId)throw new Error('Este link leva a outro produto do catálogo.');
 if(!original.itemId&&original.userProductId&&destination.userProductId&&original.userProductId!==destination.userProductId)throw new Error('Este link leva a outro produto.');
 return {url:url.trim(),state:'informed' as const,confirmed:true,matchesProduct:original.itemId&&destination.itemId?true:null,message:'Link informado pelo usuário. O formato e o destino identificável foram conferidos; atribuição e comissão são apuradas pelo Mercado Livre.'};
}
