import {shopeeProductLink} from '../../lib/shopee-saved';
import {resolveShopeeProductLink} from '../shopee/resolve-link';

// Isolated to the MTProto test. Existing Shopee imports keep their parser unchanged.
export function mtprotoShopeeLink(raw:string):ReturnType<typeof shopeeProductLink>{
 try{return shopeeProductLink(raw);}catch(error){
  if(raw.length>2048||/[\s<>\\]/.test(raw))throw error;
  const u=new URL(raw),match=u.pathname.match(/^\/opaanlp\/(\d+)\/(\d+)\/?$/);
  if(u.protocol!=='https:'||u.username||u.password||u.port||!['shopee.com.br','www.shopee.com.br'].includes(u.hostname)||!match)throw error;
  return shopeeProductLink('https://shopee.com.br/product/'+match[1]+'/'+match[2]);
 }
}
export async function resolveMtprotoShopeeLink(raw:string,http:typeof fetch=fetch){
 const parsed=mtprotoShopeeLink(raw);
 return resolveShopeeProductLink(parsed.canonical,(async(input,init)=>{
  const response=await http(input,init),location=response.headers.get('location');
  if(location&&[301,302,303,307,308].includes(response.status)){
   try{
    const target=mtprotoShopeeLink(new URL(location,String(input)).href);
    if(target.shopId&&target.itemId){
     // Use only the validated identity in a product redirect. No tracking is copied,
     // no affiliate URL is generated and the destination page is never downloaded.
     await response.body?.cancel();return new Response(null,{status:response.status,headers:{location:target.canonical}});
    }
   }catch{/* The existing resolver rejects untrusted targets before following them. */}
  }
  return response;
 }) as typeof fetch);
}
