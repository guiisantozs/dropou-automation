import type {SupabaseClient} from '@supabase/supabase-js';
import {requestShopee,ShopeeApiError} from './client';
import {bahiaDay,assessShopeeOffer} from '../../lib/shopee-automation';
import {onDemandKeywords} from '../../lib/shopee-search';
import {shopeeLimit} from '../../lib/shopee-limits';
import type {OperationId} from '../../lib/workspace-brands';
import {channelShopeeConfig} from '../../lib/channel-shopee-config';
export async function reserveShopee(db:SupabaseClient,owner:string,brand:OperationId,key:string,purpose:'manual'|'search',env:Record<string,string|undefined>){
 const r=await db.rpc('dropou_shopee_reserve_v2',{p_owner:owner,p_brand:brand,p_key:key,p_kind:purpose,p_global_limit:shopeeLimit(env,purpose)});
 if(r.error)throw new Error('Controle de consumo Shopee indisponível. Confira a migração incremental.');
 if(!r.data?.id)throw new ShopeeApiError(r.data?.reason||'budget',r.data?.retryAt?Math.max(1,Math.ceil((Date.parse(r.data.retryAt)-Date.now())/1000)):0);
 return r.data.id as string;
}
export async function searchChannel(db:SupabaseClient,owner:string,brand:OperationId,env:Record<string,string|undefined>=process.env,http:typeof fetch=fetch){
 const credentials={appId:env.SHOPEE_AFFILIATE_APP_ID,secret:env.SHOPEE_AFFILIATE_SECRET,approved:env.SHOPEE_AFFILIATE_APPROVED==='true'};
 if(!credentials.appId||!credentials.secret||!credentials.approved)throw new ShopeeApiError('credentials');
 const lease=await db.rpc('dropou_shopee_search_claim',{p_owner:owner,p_brand:brand});
 if(lease.error)throw new Error('Não foi possível reservar a busca deste canal.');
 if(!lease.data)return {busy:true,cached:true,message:'Uma busca está em andamento ou acabou de terminar. Atualize a curadoria sem consumir outra consulta.'};
 const token=lease.data as string;
 let found=0,received=0,calls=0,successfulCalls=0;const errors:string[]=[],diagnostics:{code:string;httpStatus?:number;providerCode?:string;keyword:string}[]=[],identities=new Set<string>();let retryAt:string|undefined;
 try{
  const settings=await db.from('operation_settings').select('radar,shopee_config').eq('owner_id',owner).eq('brand_id',brand).single();
  if(settings.error)throw new Error('Configuração do canal indisponível.');
  const config=channelShopeeConfig(settings.data);
  const keywords=onDemandKeywords(brand,config,settings.data.radar||{},settings.data.shopee_config||{},bahiaDay());
  // Bounded explicit search. No planning, approval or publication as a side effect.
  for(let i=0;i<Math.min(3,keywords.length);i++){
   const keyword=keywords[i];
   try{
    const offers=await requestShopee({keyword,listType:2,sortType:2,limit:50},credentials,
     async()=>{const id=await reserveShopee(db,owner,brand,'on-demand:'+token+':'+i,'search',env);calls++;return id;},
     async(id,state,retry)=>{const r=await db.rpc('dropou_shopee_finish',{p_request:id,p_state:state,p_retry_seconds:state==='auth'?21600:state==='contract'?86400:retry});if(r.error)throw new Error('Falha ao registrar a consulta.');},http);
    received+=offers.length;
    const rows=offers.map(o=>{const assessment=assessShopeeOffer(o,config,[],brand);return {shop_id:o.shopId,item_id:o.itemId,data:o,score:assessment.score,eligible:assessment.eligible,reasons:assessment.reasons,checked_at:o.checkedAt,assessment};}).filter(r=>r.assessment.relevant);
    const save=await db.rpc('dropou_shopee_cache_channel',{p_brand:brand,p_owner:owner,p_rows:rows});if(save.error)throw new Error('Falha ao salvar os resultados da busca.');for(const row of rows)identities.add(row.shop_id+':'+row.item_id);found=identities.size;successfulCalls++;
   }catch(e){const error=e as Error,detail=e instanceof ShopeeApiError?e.diagnostic:undefined;errors.push(error.message+(detail?' (HTTP '+detail.httpStatus+(detail.providerCode?', código '+detail.providerCode:'')+').':''));diagnostics.push({code:e instanceof ShopeeApiError?e.code:'storage',...detail,keyword});if(e instanceof ShopeeApiError&&e.retrySeconds)retryAt=new Date(Date.now()+(e.code==='auth'?21600:e.code==='contract'?86400:e.retrySeconds)*1000).toISOString();break;}
  }
  const status:'partial'|'failed'|'complete'=errors.length?(successfulCalls?'partial':'failed'):'complete';
  return {found,received,calls,successfulCalls,errors,diagnostics,status,retryAt,message:status==='failed'?'A busca não foi concluída. Os produtos que já estavam na curadoria foram preservados.':(status==='partial'?'Busca parcial. ':'')+received+' produto(s) recebido(s), '+found+' relacionado(s) ao canal. A curadoria remove duplicados e decisões anteriores.'};
 }finally{
  const r=await db.from('shopee_search_leases').update({lease_until:new Date().toISOString(),last_finished_at:new Date().toISOString()}).eq('owner_id',owner).eq('brand_id',brand).eq('token',token);
  if(r.error)throw new Error('A busca terminou, mas não foi possível liberar sua reserva. Aguarde um minuto antes de tentar novamente.');
 }
}
