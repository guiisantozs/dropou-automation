import type {SupabaseClient} from '@supabase/supabase-js';
import {assessShopeeOffer,bahiaDay,bahiaTime,futureSlots,liveShopeeAllowed,priceCurrent,shopeeCaption,shopeeConfigSchema,diversifyOffers,offerFingerprint,type OfferObservation,type ShopeeOffer,type ShopeeConfig} from '../../lib/shopee-automation';
import {shopeeSearchPlan} from '../../lib/shopee-search';
import {shopeeProduct as product} from '../../lib/shopee-product';
import {requestShopee,ShopeeApiError,shopeeEndpoint} from './client';
import {sendTelegramTo,TelegramFailure,type TelegramTarget} from '../telegram-core';
import {reserveDropouHeadline} from '../dropou-captions';

type CacheRow={id:string;data:ShopeeOffer;decision:string;eligible:boolean;score:number;checked_at:string;repeat_until?:string|null};
export type ShopeeDependencies={db:SupabaseClient;env:Record<string,string|undefined>;http?:typeof fetch;target:(owner:string)=>Promise<TelegramTarget>;telegramEnv:(owner:string)=>Promise<Record<string,string|undefined>>};
export function shopeeEngine(deps:ShopeeDependencies){
 const {db,env}=deps;
 async function checked<T extends {error:unknown;data:unknown}>(promise:PromiseLike<T>):Promise<T['data']>{const r=await promise;if(r.error)throw new Error('Banco Shopee indisponível. Confira a migração incremental e as permissões.');return r.data;}
 async function settings(owner:string){const s=await checked(db.from('operation_settings').select('*').eq('owner_id',owner).eq('brand_id','dropou').single()) as any;return {...s,config:shopeeConfigSchema.parse(s.shopee_config)};}
 const credentials=()=>({appId:env.SHOPEE_AFFILIATE_APP_ID,secret:env.SHOPEE_AFFILIATE_SECRET,approved:env.SHOPEE_AFFILIATE_APPROVED==='true'});
 function ready(){const c=credentials();if(!c.appId||!c.secret||!c.approved)throw new ShopeeApiError('credentials');}
 async function observations(owner:string){return await checked(db.from('shopee_observations').select('shop_id,item_id,observed_at,sales,rating,price,price_max').eq('owner_id',owner).eq('brand_id','dropou').gte('observed_at',new Date(Date.now()-30*86400000).toISOString()).order('observed_at',{ascending:false}).limit(5000)) as OfferObservation[];}
 async function query(owner:string,key:string,kind:'search'|'revalidate',input:Parameters<typeof requestShopee>[0]){
  const history=await checked(db.from('shopee_requests').select('request_key,state').eq('owner_id',owner).eq('brand_id','dropou').eq('day',bahiaDay()).in('request_key',[key+':1',key+':2'])) as {request_key:string;state:string}[];
  if(history.some(r=>r.state==='ok'||r.state==='reserved')||history.length>=(kind==='search'?1:2))return null;
  const attempt=history.length+1,rawLimit=Number(env.SHOPEE_DAILY_REQUEST_LIMIT||10),globalLimit=Number.isInteger(rawLimit)&&rawLimit>=1&&rawLimit<=1000?rawLimit:10;
  return requestShopee(input,credentials(),async()=>await checked(db.rpc('dropou_shopee_reserve',{p_owner:owner,p_key:key+':'+attempt,p_kind:kind,p_global_limit:globalLimit})) as string|null,async(id,state,retry)=>{
   const seconds=state==='auth'?21600:state==='contract'?86400:Math.min(86400,Math.max(retry,60*2**(attempt-1)));
   await checked(db.rpc('dropou_shopee_finish',{p_request:id,p_state:state,p_retry_seconds:seconds}));
  },deps.http);
 }
 async function save(owner:string,offers:ShopeeOffer[],config:ShopeeConfig){
  if(!offers.length)return;
  const previous=await checked(db.from('shopee_offers').select('data').eq('owner_id',owner).eq('brand_id','dropou').in('item_id',offers.map(o=>o.itemId))) as {data:ShopeeOffer}[];
  const history=await observations(owner);
  const rows=[];
  for(const offer of [...new Map(offers.map(o=>[o.shopId+':'+o.itemId,o])).values()]){
   const old=previous.find(r=>r.data.itemId===offer.itemId&&r.data.shopId===offer.shopId)?.data;
   if(old&&Date.parse(old.checkedAt)>Date.parse(offer.checkedAt))continue;
   if(old&&old.priceMax===old.price&&offer.priceMax===offer.price){
    if(old.price>offer.price&&Date.parse(old.checkedAt)<Date.parse(offer.checkedAt)){offer.previousPrice=old.price;offer.previousAt=old.checkedAt;}
    else if(old.previousPrice&&old.previousAt){offer.previousPrice=old.previousPrice;offer.previousAt=old.previousAt;}
   }
   const a=assessShopeeOffer(offer,config,history);
   rows.push({shop_id:offer.shopId,item_id:offer.itemId,data:offer,score:a.score,eligible:a.eligible,reasons:a.reasons,checked_at:offer.checkedAt,assessment:a});
  }
  await checked(db.rpc('dropou_shopee_cache',{p_owner:owner,p_rows:rows}));
 }
 async function reassess(owner:string){
  const history=await observations(owner);
  const {config}=await settings(owner),rows=await checked(db.from('shopee_offers').select('data').eq('owner_id',owner).eq('brand_id','dropou').gte('checked_at',new Date(Date.now()-48*3600000).toISOString()).order('checked_at',{ascending:false}).limit(2000)) as {data:ShopeeOffer}[];
  for(let start=0;start<rows.length;start+=50){const batch=rows.slice(start,start+50).map(({data})=>{const a=assessShopeeOffer(data,config,history);return {shop_id:data.shopId,item_id:data.itemId,data,score:a.score,eligible:a.eligible,reasons:a.reasons,checked_at:data.checkedAt,assessment:a};});await checked(db.rpc('dropou_shopee_cache',{p_owner:owner,p_rows:batch}));}
 }
 async function plan(owner:string){
  const s=await settings(owner),config:ShopeeConfig=s.config;
  const rows=await checked(db.from('shopee_offers').select('*').eq('owner_id',owner).eq('brand_id','dropou').in('decision',config.requireReview?['approved']:['approved','found']).gt('checked_at',new Date(Date.now()-config.cacheHours*3600000).toISOString()).order('score',{ascending:false}).limit(200)) as CacheRow[];
  const history=await observations(owner),sent=await checked(db.from('channel_events').select('snapshot').eq('owner_id',owner).eq('brand_id','dropou').eq('channel','telegram').eq('destination_id',s.telegram_chat_id||'').in('event',['sent','legacy_telegram_verified']).gte('created_at',new Date(Date.now()-30*86400000).toISOString()).order('created_at',{ascending:false}).limit(500)) as {snapshot:{name:string}}[];
  const manual=await checked(db.from('product_channel_marks').select('snapshot').eq('owner_id',owner).eq('brand_id','dropou').eq('channel','telegram').is('revoked_at',null).gte('published_at',new Date(Date.now()-30*86400000).toISOString()).limit(500)) as {snapshot:{name:string}}[];
 const rejected=await checked(db.from('shopee_offers').select('data').eq('owner_id',owner).eq('brand_id','dropou').in('decision',['rejected','removed']).limit(2000)) as {data:ShopeeOffer}[];
 const refused=new Set(rejected.map(e=>offerFingerprint(e.data.name)));
 const published=new Set([...sent,...manual].map(e=>offerFingerprint(e.snapshot.name)));
  const candidates=rows.map(r=>({...r,assessment:assessShopeeOffer(r.data,config,history)})).filter(r=>r.assessment.eligible&&(!published.has(r.assessment.fingerprint)||r.repeat_until&&Date.parse(r.repeat_until)>Date.now()));
  const chosen=diversifyOffers(candidates,candidates.length,refused);
  const preview:unknown[]=[],live=liveShopeeAllowed(config,env)&&s.automation_enabled;
  const slots=futureSlots(config),occupied=await checked(db.from('telegram_jobs').select('shopee_slot').eq('owner_id',owner).eq('brand_id','dropou').not('shopee_slot','is',null).gte('scheduled_at',bahiaDay()+'T00:00:00-03:00')) as {shopee_slot:string}[];
  const available=slots.filter(at=>!occupied.some(j=>j.shopee_slot===bahiaDay(at)+'T'+bahiaTime(at)));
  const target=live&&chosen.length&&available.length?await deps.target(owner):null;
  for(const at of available){
   let row:CacheRow|undefined;
   while((row=chosen.shift())){
    if(live){const j=await checked(db.rpc('dropou_shopee_enqueue',{p_owner:owner,p_cache:row.id,p_at:at.toISOString(),p_target:target,p_product:product(row.data)}));if(!j)continue;}
    preview.push({offerId:row.id,name:row.data.name,image:row.data.image,score:row.score,selectionReason:'Pontuação, variedade de categoria/marca/faixa e histórico do canal',scheduledAt:at.toISOString(),caption:shopeeCaption(row.data),mode:live?'queued':'simulation'});break;
   }
  }
  await checked(db.from('shopee_runs').update({preview,updated_at:new Date().toISOString()}).eq('owner_id',owner).eq('brand_id','dropou').eq('day',bahiaDay()));
  return {mode:live?'live':'simulation',preview,reviewRequired:config.requireReview};
 }
 async function scan(owner:string,automatic=false){
  const {config}=await settings(owner);if(automatic)return {paused:true};ready();
  const runId=await checked(db.rpc('dropou_shopee_run',{p_owner:owner})) as string|null;
  if(!runId){const current=await checked(db.from('shopee_runs').select('state').eq('owner_id',owner).eq('brand_id','dropou').eq('day',bahiaDay()).maybeSingle()) as {state:string}|null;if(current?.state==='running')return {busy:true,cached:true};return {...await plan(owner),cached:true};}
  try{
   const start=Date.now();
   for(const search of shopeeSearchPlan(config,bahiaDay())){
    if(Date.now()-start>30000)throw new Error('Rodada parcial; a próxima execução retoma as consultas pendentes.');
    const offers=await query(owner,'search:'+search.key,'search',search.input);
    if(offers)await save(owner,offers,config);
   }
   const result=await plan(owner);
   const failures=await checked(db.from('shopee_requests').select('state').eq('owner_id',owner).eq('brand_id','dropou').eq('day',bahiaDay()).in('state',['auth','provider','rate_limit','contract','reserved'])) as {state:string}[];
   const warning=failures.length?'Rodada parcial: houve consultas recusadas. Confira o orçamento e os erros; os filtros foram preservados.':null;
   await checked(db.from('shopee_runs').update({state:'complete',lease_until:null,error:warning,updated_at:new Date().toISOString()}).eq('id',runId));return {...result,warning};
  }catch(e){const message=e instanceof ShopeeApiError?e.message:'Rodada interrompida. Confira os registros; consultas já reservadas não são repetidas.';await checked(db.from('shopee_runs').update({state:'error',lease_until:null,error:message,updated_at:new Date().toISOString()}).eq('id',runId));throw new Error(message);}
 }
 async function dispatch(id:string){
  if(env.SHOPEE_AUTOMATION_LIVE!=='true')return {sent:false,simulation:true};
  const prepared=await checked(db.rpc('dropou_shopee_prepare',{p_job:id})) as any;if(!prepared)return {sent:false};
  let sending=false,ids:string[]=[];
  async function block(message:string){await checked(db.from('telegram_jobs').update({state:'blocked',error:message}).eq('id',id).eq('state','queued').eq('shopee_lease_token',prepared.shopee_lease_token));}
  async function receipt(state:string,received=ids,error?:string){await checked(db.rpc('dropou_publication_receipt',{p_job:id,p_ids:received,p_state:state,p_error:error||null}));}
  try{
   const s=await settings(prepared.owner_id),config:ShopeeConfig=s.config;
   if(!liveShopeeAllowed(config,env)||!s.automation_enabled)return {sent:false};
   if(Date.now()-Date.parse(prepared.scheduled_at)>600000){await block('Horário perdido; publicação pulada.');return {sent:false};}
   let row=await checked(db.from('shopee_offers').select('*').eq('id',prepared.shopee_offer_id).eq('owner_id',prepared.owner_id).single()) as CacheRow;
   if(!assessShopeeOffer(row.data,config).eligible||['rejected','removed'].includes(row.decision)){await block('Oferta rejeitada ou fora dos critérios atuais.');return {sent:false};}
   if(!priceCurrent(row.data)){
    try{
     const fresh=await query(prepared.owner_id,'revalidate:'+id+':'+prepared.publication_round,'revalidate',{itemId:row.data.itemId,shopId:row.data.shopId,limit:1});
     const exact=fresh?.find(o=>o.itemId===row.data.itemId&&o.shopId===row.data.shopId);
     if(fresh&&!exact){await block('A Shopee não retornou mais esta oferta. Horário pulado.');return {sent:false};}
     if(exact){await save(prepared.owner_id,[exact],config);row=await checked(db.from('shopee_offers').select('*').eq('id',row.id).single()) as CacheRow;}
    }catch(e){if(config.stalePolicy==='skip'){await block(e instanceof ShopeeApiError?e.message:'Não foi possível confirmar o preço.');return {sent:false};}}
   }
   if(!assessShopeeOffer(row.data,config).eligible||!priceCurrent(row.data)){await block('Preço ou critérios não confirmados; revalide o valor antes de publicar.');return {sent:false};}
   const headline=await reserveDropouHeadline(db,prepared.owner_id,prepared.product_id,row.data.name,prepared.caption||'');
   const target=await deps.target(prepared.owner_id),caption=shopeeCaption(row.data,Date.now(),headline),p={...product(row.data,prepared.product_id),createdAt:prepared.snapshot.createdAt};
   const claim=await checked(db.rpc('dropou_shopee_claim',{p_job:id,p_token:prepared.shopee_lease_token,p_target:target.key,p_product:p,p_caption:caption,p_evidence:row.data})) as any;if(!claim)return {sent:false};sending=true;
   const telegramEnv=await deps.telegramEnv(prepared.owner_id);
   const before=async()=>{
    const latest=await settings(prepared.owner_id),global=await checked(db.from('telegram_dispatch_config').select('automation_enabled').eq('id',true).single()) as any;
    const current=await checked(db.from('shopee_offers').select('decision,eligible,data').eq('id',row.id).single()) as CacheRow;
    if(!global.automation_enabled||!latest.automation_enabled||!liveShopeeAllowed(latest.config,env)||latest.telegram_chat_id!==target.id||!current.eligible||['rejected','removed'].includes(current.decision)||(latest.config.requireReview&&current.decision!=='approved')||JSON.stringify(current.data)!==JSON.stringify(row.data)||!assessShopeeOffer(row.data,latest.config).eligible||!priceCurrent(row.data)&&/R\$/.test(caption))throw new TelegramFailure('Pausa, destino ou condições alteradas antes do envio.','failed');
   };
   await before();
   ids=await sendTelegramTo(telegramEnv,target,caption,row.data.image,deps.http,async received=>{ids=received;await receipt('sending');},before,{mediaMode:'photo',previewUrl:row.data.offerLink});
   await receipt('sent');return {sent:true,messageIds:ids};
  }catch(e){
   if(sending){const failure=e instanceof TelegramFailure?e:new TelegramFailure('Resultado ou recibo incerto; confira o canal.','uncertain',ids);await receipt(failure.outcome,failure.ids,failure.message);}
   else await block('Falha antes do envio. Confira credenciais, orçamento e canal.');
   return {sent:false};
  }
 }
 async function tick(){
  const rows=await checked(db.from('operation_settings').select('owner_id,shopee_config,automation_enabled').eq('brand_id','dropou').eq('automation_enabled',true)) as any[];
  // One due publication OR one daily search per invocation, within Vercel's limit.
  for(const row of rows){const c=shopeeConfigSchema.parse(row.shopee_config);if(!c.enabled)continue;
   const due=await checked(db.from('telegram_jobs').select('id').eq('owner_id',row.owner_id).eq('state','queued').not('shopee_offer_id','is',null).lte('scheduled_at',new Date().toISOString()).order('scheduled_at').limit(1)) as {id:string}[];
   if(due[0]&&liveShopeeAllowed(c,env)){await dispatch(due[0].id);return;}
   // Discovery and planning are initiated exclusively by an operator.

  }
 }
 async function review(owner:string,offer:ShopeeOffer){const {config}=await settings(owner);return assessShopeeOffer(offer,config,await observations(owner));}
 return {scan,plan,dispatch,tick,settings,reassess,review};
}
