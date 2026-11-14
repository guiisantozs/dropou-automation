import type {ShopeeOffer} from './shopee-automation';
export type SavedShopeeProduct={id:string;input_url:string;canonical_url:string;data:ShopeeOffer|null;state:'pending'|'fetching'|'ready'|'error';error:string|null;prepared_product_id:string|null;created_at:string;updated_at:string;catalog_at?:string|null};
export const shopeeLinkHosts=['shopee.com.br','www.shopee.com.br','s.shopee.com.br','shope.ee','br.shp.ee'];
export function shopeeProductLink(raw:string){
 if(raw.length>2048||/[\s<>\\]/.test(raw))throw new Error('Use um link HTTPS de produto da Shopee.');
 let u:URL;try{u=new URL(raw);}catch{throw new Error('Link inválido. Cole a URL completa da Shopee.');}
 if(u.protocol!=='https:'||u.username||u.password||u.port||!shopeeLinkHosts.includes(u.hostname))throw new Error('Use somente links oficiais de produtos Shopee Brasil.');
 const path=decodeURIComponent(u.pathname),m=path.match(/(?:\/product\/(\d+)\/(\d+)(?:\/|$)|-i\.(\d+)\.(\d+)(?:\/|$))/);
 if(m){const shopId=(m[1]||m[3]).replace(/^0+(?=\d)/,''),itemId=(m[2]||m[4]).replace(/^0+(?=\d)/,'');
  if([shopId,itemId].some(id=>!/^\d{1,19}$/.test(id)||BigInt(id)<1||BigInt(id)>BigInt('9223372036854775807')))throw new Error('Identificação do produto inválida.');
  return {url:raw,canonical:`https://shopee.com.br/product/${shopId}/${itemId}`,shopId,itemId};
 }
 if(['s.shopee.com.br','shope.ee','br.shp.ee'].includes(u.hostname)&&/^\/[A-Za-z0-9_-]{2,100}\/?$/.test(u.pathname))return {url:raw,canonical:u.origin+u.pathname.replace(/\/$/,''),shopId:null,itemId:null};
 throw new Error('Cole um link de produto ou o link de compartilhamento da Shopee. Links de loja e busca não identificam um produto.');
}
export function savedShopeeCaptionData(o:ShopeeOffer){return {priceRange:o.priceMax>o.price,observedAt:o.checkedAt,rating:o.rating,sales:o.sales};}
