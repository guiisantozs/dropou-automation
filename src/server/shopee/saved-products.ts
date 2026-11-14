import {reserveShopee} from './on-demand';
import type {OperationId} from '../../lib/workspace-brands';
import {shopeeProduct} from '../../lib/shopee-product';
import type {SupabaseClient} from '@supabase/supabase-js';
import {requestShopeeOperation,productBatchQuery,parseShopeeBatch,ShopeeApiError} from './client';
import {resolveShopeeProductLink} from './resolve-link';
import {shopeeProductLink,type SavedShopeeProduct} from '../../lib/shopee-saved';
import {priceCurrent,type ShopeeOffer} from '../../lib/shopee-automation';
type Claimed=SavedShopeeProduct&{lease_token:string};
export const savedShopeeColumns='id,input_url,canonical_url,data,state,error,prepared_product_id,created_at,updated_at';
async function checked<T extends {data:unknown;error:unknown}>(promise:PromiseLike<T>):Promise<T['data']>{const r=await promise;if(r.error)throw new Error('Não foi possível acessar os produtos salvos. Confira a migração e tente novamente.');return r.data;}
export async function saveShopeeLinks(db:SupabaseClient,owner:string,links:string[],brand:OperationId='dropou'){
 const valid=new Map<string,ReturnType<typeof shopeeProductLink>>(),invalid:{line:number;message:string}[]=[];
 for(const [index,url]of links.entries())try{const p=shopeeProductLink(url.trim());valid.set(p.canonical,p);}catch(e){invalid.push({line:index+1,message:(e as Error).message});}
 if(!valid.size)return {ids:[],allIds:[],received:0,invalid};
 const rows=[...valid.values()].map(p=>({owner_id:owner,brand_id:brand,input_url:p.url,canonical_url:p.canonical,shop_id:p.shopId,item_id:p.itemId}));
 await checked(db.from('shopee_saved_products').upsert(rows,{onConflict:'owner_id,brand_id,canonical_url',ignoreDuplicates:true}));
 const saved=await checked(db.from('shopee_saved_products').select('id,state,data').eq('owner_id',owner).eq('brand_id',brand).in('canonical_url',[...valid.keys()])) as {id:string;state:string;data:ShopeeOffer|null}[];
 return {allIds:saved.map(r=>r.id),ids:saved.filter(r=>r.state!=='ready'||!r.data||!priceCurrent(r.data)).map(r=>r.id),received:saved.length,invalid};
}
export async function resolveSavedShopeeProducts(db:SupabaseClient,owner:string,ids:string[],refresh=false,env:Record<string,string|undefined>=process.env,http:typeof fetch=fetch,brand:OperationId='dropou'){
 const claimed=await checked(db.rpc('dropou_shopee_saved_claim_channel',{p_brand:brand,p_owner:owner,p_ids:ids,p_refresh:refresh})) as Claimed[];
 if(!claimed.length)return {ids:[] as string[],processed:0,stopped:false};
 await checked(db.from('shopee_usage_events').insert(claimed.map(()=>({owner_id:owner,brand_id:brand,kind:'manual_import'}))));
 const completed:string[]=[],missing:{row:Claimed;shopId:string;itemId:string}[]=[];
 async function finish(row:Claimed,data:ShopeeOffer|null,error?:string){const id=await checked(db.rpc('dropou_shopee_saved_finish_channel',{p_brand:brand,p_owner:owner,p_id:row.id,p_token:row.lease_token,p_data:data,p_error:error||null}));if(typeof id==='string')completed.push(id);if(data){const cached=await db.from('shopee_import_cache').upsert({owner_id:owner,shop_id:data.shopId,item_id:data.itemId,data,checked_at:data.checkedAt},{onConflict:'owner_id,shop_id,item_id'});if(cached.error)throw new Error('Não foi possível guardar o cache desta importação.');}}
 // Resolve short redirects in parallel; each path is bounded and host-checked.
 const resolved=await Promise.allSettled(claimed.map(row=>resolveShopeeProductLink(row.input_url,http)));
 for(let i=0;i<claimed.length;i++){
  const row=claimed[i],result=resolved[i];if(result.status==='rejected'){await finish(row,null,result.reason instanceof Error?result.reason.message:'Não foi possível identificar o produto.');continue;}
  const {shopId,itemId}=result.value;
  const cache=await checked(db.from('shopee_import_cache').select('data').eq('owner_id',owner).eq('shop_id',shopId).eq('item_id',itemId).maybeSingle()) as {data:ShopeeOffer}|null;
  if(!refresh&&cache?.data&&priceCurrent(cache.data)){await finish(row,cache.data);await checked(db.from('shopee_usage_events').insert({owner_id:owner,brand_id:brand,kind:'cache_hit'}));continue;}
  missing.push({row,shopId,itemId});
 }
 if(!missing.length)return {ids:completed,processed:completed.length,stopped:false};
 const unique=[...new Map(missing.map(item=>[item.shopId+':'+item.itemId,item])).values()];
 const token=claimed[0].lease_token;
 try{
  const offers=await requestShopeeOperation(productBatchQuery(unique),{appId:env.SHOPEE_AFFILIATE_APP_ID,secret:env.SHOPEE_AFFILIATE_SECRET,approved:env.SHOPEE_AFFILIATE_APPROVED==='true'},
   ()=>reserveShopee(db,owner,brand,'saved-products:'+token,'manual',env),
   async(id,state,retry)=>{await checked(db.rpc('dropou_shopee_finish',{p_request:id,p_state:state,p_retry_seconds:state==='auth'?21600:state==='contract'?86400:retry}));},
   raw=>parseShopeeBatch(raw,unique),http);
  for(const item of missing){const index=unique.findIndex(u=>u.itemId===item.itemId&&u.shopId===item.shopId);const data=offers[index];await finish(item.row,data,data?undefined:'A API de afiliados não retornou dados completos para este produto. O link continua salvo; tente novamente mais tarde.');}
  return {ids:completed,processed:completed.length,stopped:false};
 }catch(e){
  const message=e instanceof ShopeeApiError?e.message:'Não foi possível buscar os dados agora. Os links continuam salvos.';
  for(const item of missing)await finish(item.row,null,message);
  return {ids:completed,processed:completed.length,stopped:true,message,errorCode:e instanceof ShopeeApiError?e.code:'provider',retryAt:e instanceof ShopeeApiError&&e.retrySeconds?new Date(Date.now()+e.retrySeconds*1000).toISOString():null};
 }
}
export async function lookupSavedShopeeProduct(db:SupabaseClient,owner:string,url:string,brand:OperationId){
 const saved=await saveShopeeLinks(db,owner,[url],brand);
 if(!saved.allIds?.length)throw new Error(saved.invalid[0]?.message||'Não foi possível salvar o link.');
 const resolved=await resolveSavedShopeeProducts(db,owner,saved.allIds,false,process.env,fetch,brand);
 const id=resolved.ids?.[0]||saved.allIds[0],row=await db.from('shopee_saved_products').select('data,error').eq('id',id).eq('owner_id',owner).eq('brand_id',brand).single();
 if(row.error||!row.data?.data)throw new Error(row.data?.error||'O link ficou salvo. Preencha os dados manualmente ou retome a consulta em Meus links Shopee.');
 return shopeeProduct(row.data.data,crypto.randomUUID(),brand);
}
