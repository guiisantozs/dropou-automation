import {shopeeProductLink} from '../../lib/shopee-saved';
export async function resolveShopeeProductLink(input:string,http:typeof fetch=fetch){
 let current=input;
 for(let hop=0;hop<=3;hop++){
  const parsed=shopeeProductLink(current);if(parsed.shopId&&parsed.itemId)return {...parsed,shopId:parsed.shopId,itemId:parsed.itemId};
  if(hop===3)break;
  // Follow only bounded HEAD redirects on the explicit Shopee host allowlist.
  // No HTML parsing, arbitrary URL fetching or automatic redirects.
  const response=await http(current,{method:'HEAD',redirect:'manual',cache:'no-store',signal:AbortSignal.timeout(5000)});
  const location=response.headers.get('location');await response.body?.cancel();
  if(![301,302,303,307,308].includes(response.status)||!location)break;
  current=new URL(location,current).href;shopeeProductLink(current);
 }
 throw new Error('Não foi possível identificar o produto nesse link curto. Abra-o na Shopee e copie o link completo do produto.');
}
