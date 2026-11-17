import {createHash} from 'node:crypto';
import {celularesConfigSchema,celularSearchTerms} from '../../lib/celulares-curation';
import type {SupabaseClient} from '@supabase/supabase-js';
import {requestShopee,ShopeeApiError} from './client';
import {bahiaDay,assessShopeeOffer} from '../../lib/shopee-automation';
import {onDemandKeywords} from '../../lib/shopee-search';
import {reserveShopee} from './budget';
export {reserveShopee} from './budget';
import type {OperationId} from '../../lib/workspace-brands';
import {channelShopeeConfig} from '../../lib/channel-shopee-config';
import {memberCurationProfile} from '../../lib/member-curation';
export async function searchChannel(db:SupabaseClient,owner:string,brand:OperationId,env:Record<string,string|undefined>=process.env,http:typeof fetch=fetch){
 const credentials={appId:env.SHOPEE_AFFILIATE_APP_ID,secret:env.SHOPEE_AFFILIATE_SECRET,approved:env.SHOPEE_AFFILIATE_APPROVED==='true'};
 if(!credentials.appId||!credentials.secret||!credentials.approved)throw new ShopeeApiError('credentials');
 const lease=await db.rpc('dropou_shopee_search_claim',{p_owner:owner,p_brand:brand});
 if(lease.error)throw new Error('Não foi possível reservar a busca deste canal.');
 if(!lease.data)return {busy:true,cached:true,message:'Uma busca está em andamento ou acabou de terminar. Atualize a curadoria sem consumir outra consulta.'};
 const token=lease.data as string;
 let found=0,received=0,calls=0,successfulCalls=0;const errors:string[]=[],diagnostics:{code:string;httpStatus?:number;providerCode?:string;keyword:string}[]=[],identities=new Set<string>();let retryAt:string|undefined;
 try{
  const settings=await db.from('operation_settings').select('radar,shopee_config,celulares_curation').eq('owner_id',owner).eq('brand_id',brand).single();
  if(settings.error)throw new Error('Configuração do canal indisponível.');
  const config=channelShopeeConfig(settings.data,brand),policy=celularesConfigSchema.parse(settings.data.celulares_curation||{});
  const policyHash=createHash('sha256').update(JSON.stringify({policy,radar:settings.data.radar,config:settings.data.shopee_config,...(memberCurationProfile(brand)?{memberVersion:1,effectiveConfig:config}:{} )})).digest('hex');
  let cursor=0;const member=memberCurationProfile(brand);
  if(member){const window=await db.rpc('dropou_member_search_window',{p_owner:owner,p_brand:brand,p_token:token,p_policy_hash:policyHash,p_steps:3});if(window.error)throw new Error('Cache desta curadoria indisponível. Confira a migração incremental Shopee das novas marcas.');if(window.data.cached)return {status:'complete' as const,cached:true,calls:0,found:0,received:0,message:'Curadoria atualizada com o cache recente deste dashboard. Nenhuma consulta Shopee consumida.',retryAt:window.data.retryAt};cursor=Number(window.data.cursor);}
  if(brand==='celulares'){const window=await db.rpc('dropou_celulares_search_window',{p_owner:owner,p_token:token,p_steps:policy.requestsPerSearch,p_cache_minutes:policy.cacheMinutes,p_policy_hash:policyHash});if(window.error)throw new Error('Controle de cache da curadoria indisponível.');if(window.data.cached)return {status:'complete' as const,cached:true,calls:0,found:0,received:0,message:'Curadoria atualizada com o cache recente. Nenhuma consulta Shopee consumida.',retryAt:window.data.retryAt};cursor=Number(window.data.cursor);}
  const custom=Array.isArray(settings.data.radar?.keywords)?settings.data.radar.keywords:Array.isArray(settings.data.shopee_config?.keywords)?settings.data.shopee_config.keywords:[];
  const memberTerms=[...new Set<string>(custom.filter((s:unknown):s is string=>typeof s==='string'&&s.trim().length>=2&&s.trim().length<=80).map((s:string)=>s.trim()))].slice(0,50);
  const terms=memberTerms.length?memberTerms:config.keywords;
  const keywords=brand==='celulares'?celularSearchTerms(cursor,policy,custom.filter((s:unknown):s is string=>typeof s==='string'&&s.trim().length>=2&&s.trim().length<=80).map((s:string)=>s.trim()).slice(0,50)):member?Array.from({length:Math.min(3,terms.length)},(_,i)=>terms[(cursor+i)%terms.length]):onDemandKeywords(brand,config,settings.data.radar||{},settings.data.shopee_config||{},bahiaDay());
  if(!keywords.length)throw new Error('Nenhum termo de busca configurado para este nicho. Peça ao administrador para revisar os filtros.');
  // Bounded explicit search. No planning, approval or publication as a side effect.
  for(let i=0;i<Math.min(brand==='celulares'?policy.requestsPerSearch:3,keywords.length);i++){
   const keyword=keywords[i];
   try{
    const offers=await requestShopee({keyword,listType:2,sortType:2,limit:50},credentials,
     async()=>{const id=await reserveShopee(db,owner,brand,'on-demand:'+token+':'+i,'search',env);calls++;return id;},
     async(id,state,retry)=>{const r=await db.rpc('dropou_shopee_finish',{p_request:id,p_state:state,p_retry_seconds:state==='auth'?21600:state==='contract'?86400:retry});if(r.error)throw new Error('Falha ao registrar a consulta.');},http);
    received+=offers.length;
    const rows=offers.map(o=>{const assessment=assessShopeeOffer(o,config,[],brand,policy);return {shop_id:o.shopId,item_id:o.itemId,data:o,score:assessment.score,eligible:assessment.eligible,reasons:assessment.reasons,checked_at:o.checkedAt,assessment};}).filter(r=>r.assessment.relevant);
    const save=brand==='celulares'?await db.rpc('dropou_celulares_cache',{p_owner:owner,p_token:token,p_rows:rows}):await db.rpc('dropou_shopee_cache_channel',{p_brand:brand,p_owner:owner,p_rows:rows});if(save.error)throw new Error('Falha ao salvar os resultados da busca.');for(const row of rows)identities.add(row.shop_id+':'+row.item_id);found=identities.size;successfulCalls++;
   }catch(e){const error=e as Error,detail=e instanceof ShopeeApiError?e.diagnostic:undefined;errors.push(error.message+(detail?' (HTTP '+detail.httpStatus+(detail.providerCode?', código '+detail.providerCode:'')+').':''));diagnostics.push({code:e instanceof ShopeeApiError?e.code:'storage',...detail,keyword});if(e instanceof ShopeeApiError&&e.retrySeconds)retryAt=new Date(Date.now()+(e.code==='auth'?21600:e.code==='contract'?86400:e.retrySeconds)*1000).toISOString();break;}
  }
  if(brand==='celulares'&&!errors.length){const complete=await db.rpc('dropou_celulares_search_complete',{p_owner:owner,p_token:token,p_policy_hash:policyHash});if(complete.error)throw new Error('A busca foi concluída, mas o cache não pôde ser registrado. Atualize a lista antes de tentar novamente.');}
  if(member&&!errors.length){const complete=await db.rpc('dropou_member_search_complete',{p_owner:owner,p_brand:brand,p_token:token,p_policy_hash:policyHash});if(complete.error)throw new Error('Resultados salvos; não foi possível registrar o prazo do cache. Atualize a lista antes de tentar novamente.');}
  const status:'partial'|'failed'|'complete'=errors.length?(successfulCalls?'partial':'failed'):'complete';
  return {found,received,calls,successfulCalls,errors,diagnostics,status,retryAt,message:status==='failed'?'A busca não foi concluída. Os produtos que já estavam na curadoria foram preservados.':(status==='partial'?'Busca parcial. ':'')+received+' produto(s) recebido(s), '+found+' relacionado(s) ao canal. A curadoria remove duplicados e decisões anteriores.'};
 }finally{
  const r=await db.from('shopee_search_leases').update({lease_until:new Date().toISOString(),last_finished_at:new Date().toISOString()}).eq('owner_id',owner).eq('brand_id',brand).eq('token',token);
  if(r.error)throw new Error('A busca terminou, mas não foi possível liberar sua reserva. Aguarde um minuto antes de tentar novamente.');
 }
}
