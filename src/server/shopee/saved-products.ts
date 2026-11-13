import type {SupabaseClient} from '@supabase/supabase-js';
import {requestShopeeOperation,productBatchQuery,parseShopeeBatch,ShopeeApiError} from './client';
import {resolveShopeeProductLink} from './resolve-link';
import {shopeeProductLink,type SavedShopeeProduct} from '../../lib/shopee-saved';
import {priceCurrent,type ShopeeOffer} from '../../lib/shopee-automation';
type Claimed=SavedShopeeProduct&{lease_token:string};
export const savedShopeeColumns='id,input_url,canonical_url,data,state,error,prepared_product_id,created_at,updated_at';
async function checked<T extends {data:unknown;error:unknown}>(promise:PromiseLike<T>):Promise<T['data']>{const r=await promise;if(r.error)throw new Error('Não foi possível acessar os produtos salvos. Confira a migração e tente novamente.');return r.data;}
export async function saveShopeeLinks(db:SupabaseClient,owner:string,links:string[]){
 const valid=new Map<string,ReturnType<typeof shopeeProductLink>>(),invalid:{line:number;message:string}[]=[];
 for(const [index,url]of links.entries())try{const p=shopeeProductLink(url.trim());valid.set(p.canonical,p);}catch(e){invalid.push({line:index+1,message:(e as Error).message});}
 if(!valid.size)return {ids:[],received:0,invalid};
 const rows=[...valid.values()].map(p=>({owner_id:owner,brand_id:'dropou',input_url:p.url,canonical_url:p.canonical,shop_id:p.shopId,item_id:p.itemId}));
 await checked(db.from('shopee_saved_products').upsert(rows,{onConflict:'owner_id,brand_id,canonical_url',ignoreDuplicates:true}));
 const saved=await checked(db.from('shopee_saved_products').select('id,state').eq('owner_id',owner).eq('brand_id','dropou').in('canonical_url',[...valid.keys()])) as {id:string;state:string}[];
 return {ids:saved.filter(r=>r.state!=='ready').map(r=>r.id),received:saved.length,invalid};
}
export async function resolveSavedShopeeProducts(db:SupabaseClient,owner:string,ids:string[],refresh=false,env:Record<string,string|undefined>=process.env,http:typeof fetch=fetch){
 const claimed=await checked(db.rpc('dropou_shopee_saved_claim',{p_owner:owner,p_ids:ids,p_refresh:refresh})) as Claimed[];
 if(!claimed.length)return {processed:0,stopped:false};
 const completed:string[]=[],missing:{row:Claimed;shopId:string;itemId:string}[]=[];
 async function finish(row:Claimed,data:ShopeeOffer|null,error?:string){const id=await checked(db.rpc('dropou_shopee_saved_finish',{p_owner:owner,p_id:row.id,p_token:row.lease_token,p_data:data,p_error:error||null}));if(typeof id==='string')completed.push(id);}
 // Resolve short redirects in parallel; each path is bounded and host-checked.
 const resolved=await Promise.allSettled(claimed.map(row=>resolveShopeeProductLink(row.input_url,http)));
 for(let i=0;i<claimed.length;i++){
  const row=claimed[i],result=resolved[i];if(result.status==='rejected'){await finish(row,null,result.reason instanceof Error?result.reason.message:'Não foi possível identificar o produto.');continue;}
  const {shopId,itemId}=result.value;
  const cache=await checked(db.from('shopee_offers').select('data').eq('owner_id',owner).eq('brand_id','dropou').eq('shop_id',shopId).eq('item_id',itemId).maybeSingle()) as {data:ShopeeOffer}|null;
  if(!refresh&&cache?.data&&priceCurrent(cache.data)){await finish(row,cache.data);continue;}
  missing.push({row,shopId,itemId});
 }
 if(!missing.length)return {processed:completed.length,stopped:false};
 const unique=[...new Map(missing.map(item=>[item.shopId+':'+item.itemId,item])).values()];
 const token=claimed[0].lease_token,configured=Number(env.SHOPEE_DAILY_REQUEST_LIMIT||10),limit=Number.isInteger(configured)&&configured>=1&&configured<=1000?configured:10;
 try{
  const offers=await requestShopeeOperation(productBatchQuery(unique),{appId:env.SHOPEE_AFFILIATE_APP_ID,secret:env.SHOPEE_AFFILIATE_SECRET,approved:env.SHOPEE_AFFILIATE_APPROVED==='true'},
   async()=>await checked(db.rpc('dropou_shopee_reserve',{p_owner:owner,p_key:'saved-products:'+token,p_kind:'search',p_global_limit:limit})) as string|null,
   async(id,state,retry)=>{await checked(db.rpc('dropou_shopee_finish',{p_request:id,p_state:state,p_retry_seconds:state==='auth'?21600:state==='contract'?86400:retry}));},
   raw=>parseShopeeBatch(raw,unique),http);
  for(const item of missing){const index=unique.findIndex(u=>u.itemId===item.itemId&&u.shopId===item.shopId);const data=offers[index];await finish(item.row,data,data?undefined:'A API de afiliados não retornou dados completos para este produto. O link continua salvo; tente novamente mais tarde.');}
  return {processed:completed.length,stopped:false};
 }catch(e){
  const message=e instanceof ShopeeApiError?e.message:'Não foi possível buscar os dados agora. Os links continuam salvos.';
  for(const item of missing)await finish(item.row,null,message);
  return {processed:completed.length,stopped:true,message};
 }
}
