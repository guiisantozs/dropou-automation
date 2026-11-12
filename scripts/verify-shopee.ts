import nextEnv from '@next/env';
import {createClient} from '@supabase/supabase-js';
import {mkdirSync,writeFileSync} from 'node:fs';
import {shopeeEngine} from '../src/server/shopee/engine';
import {bahiaDay,shopeeCaption,shopeeConfigSchema,assessShopeeOffer} from '../src/lib/shopee-automation';
import {resolveTelegramTarget} from '../src/server/telegram-core';
import {shopeeAuthorization,shopeeEndpoint,parseShopeeOffers} from '../src/server/shopee/client';

// Explicit live READ test. API requests use the same durable budget/cache engine.
// This script cannot send Telegram messages, queue live jobs or enable routines.
nextEnv.loadEnvConfig(process.cwd(),true,{info(){},error(){}});
const itemProbe=process.argv.find(a=>a.startsWith('--probe-item='))?.slice('--probe-item='.length);
const probeKind=process.argv.includes('--probe-performance-keyword')?'performance-keyword':process.argv.includes('--probe-performance')?'performance':itemProbe?'item':process.argv.includes('--probe-gaming-category')?'gaming-category':process.argv.includes('--probe-schema')?'schema':process.argv.includes('--probe-keyword-ranked')?'keyword-ranked':process.argv.includes('--probe-recommended-batch')?'recommended-batch':process.argv.includes('--probe-full')?'full-fields':process.argv.includes('--probe-keyword-full')?'keyword-full':process.argv.includes('--probe-keyword')?'keyword':process.argv.includes('--minimal-probe')?'minimal':null;
const env=process.env,probe=!!probeKind,live=process.argv.includes('--live')||probe;
const secrets=[env.SHOPEE_AFFILIATE_APP_ID,env.SHOPEE_AFFILIATE_SECRET,env.SUPABASE_SECRET_KEY,env.SUPABASE_SERVICE_ROLE_KEY,env.TELEGRAM_BOT_TOKEN].filter(Boolean) as string[];
const safe=(value:unknown)=>{let text=String(value);for(const secret of secrets)text=text.split(secret).join('[redacted]');return text.slice(0,500);};
async function main(){
 const url=env.NEXT_PUBLIC_SUPABASE_URL,key=env.SUPABASE_SECRET_KEY||env.SUPABASE_SERVICE_ROLE_KEY;
 if(!url||new URL(url).hostname!=='wqpdyfipjsnyzxktacqh.supabase.co'||!key)throw new Error('Configure o backend do projeto Dropou.');
 if(env.SHOPEE_AUTOMATION_LIVE!=='false')throw new Error('Mantenha SHOPEE_AUTOMATION_LIVE=false para este teste.');
 const db=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
 async function checked<T extends {error:unknown;data:unknown}>(operation:PromiseLike<T>):Promise<T['data']>{const r=await operation;if(r.error)throw new Error('Leitura/gravação de teste recusada pelo Supabase.');return r.data;}
 const dispatch=await checked(db.from('telegram_dispatch_config').select('owner_ids,automation_enabled').eq('id',true).single());
 if(!dispatch||dispatch.automation_enabled||dispatch.owner_ids.length!==1)throw new Error('O teste exige dispatcher pausado e um administrador inequívoco.');
 const owner=dispatch.owner_ids[0],settings=await checked(db.from('operation_settings').select('shopee_config,automation_enabled,telegram_chat_id').eq('owner_id',owner).eq('brand_id','dropou').single());
 if(!settings||settings.automation_enabled)throw new Error('Mantenha a operação pausada.');
 const config=shopeeConfigSchema.parse(settings.shopee_config);if(config.enabled||!config.dryRun)throw new Error('O teste exige rotina desativada e simulação ativa.');
 const before=await checked(db.from('shopee_requests').select('id').eq('day',bahiaDay()));
 const diagnostics:unknown[]=[],engine=shopeeEngine({db,env,target:async()=>{throw new Error('Este teste não resolve destinos de envio.');},telegramEnv:async()=>{throw new Error('Este teste não publica.');},http:async(input,init)=>{
  const address=new URL(String(input));if(address.href!=='https://open-api.affiliate.shopee.com.br/graphql')throw new Error('Somente a busca oficial é permitida.');
  const response=await fetch(input,init);let errors:unknown[]=[];try{const body=await response.clone().json();errors=(body.errors||[]).map((e:{message?:unknown;extensions?:{code?:unknown}})=>({message:safe(e.message),code:safe(e.extensions?.code||'')}));}catch{}
  diagnostics.push({status:response.status,errors});return response;
 }});
 let result:unknown={notRun:true},failure:string|null=null;
 if(probe){
  if(itemProbe&&!/^\d{1,16}\/\d{1,16}$/.test(itemProbe))throw new Error('Use --probe-item=shopId/itemId com IDs numéricos.');
  if(!env.SHOPEE_AFFILIATE_APP_ID||!env.SHOPEE_AFFILIATE_SECRET||env.SHOPEE_AFFILIATE_APPROVED!=='true')throw new Error('Configure e autorize as credenciais.');
  const reservation=await checked(db.rpc('dropou_shopee_reserve',{p_owner:owner,p_key:'diagnostic:'+probeKind+(itemProbe?':'+itemProbe:'')+'-product-offer:v1',p_kind:'search',p_global_limit:Number(env.SHOPEE_DAILY_REQUEST_LIMIT||10)}));
  if(!reservation)throw new Error('Consulta mínima já reservada, orçamento esgotado ou backoff ativo.');
  const full=['full-fields','keyword-full','keyword-ranked','recommended-batch','gaming-category','item','performance','performance-keyword'].includes(probeKind!),keyword=['keyword','keyword-full','keyword-ranked'].includes(probeKind!);
  let body=JSON.stringify({query:`{productOfferV2(page:1,limit:${probeKind==='recommended-batch'?20:keyword&&full?10:1}${probeKind==='keyword-ranked'?',listType:1,sortType:2,keyword:"ps5"':keyword?',keyword:"controle ps5"':''}){nodes{${full?'itemId shopId productName imageUrl offerLink productLink priceMin priceMax ratingStar sales commissionRate priceDiscountRate':'itemId'}}}}`});
  if(probeKind==='performance-keyword')body=JSON.stringify({query:'{productOfferV2(page:1,limit:50,listType:2,sortType:2,keyword:"gamer"){nodes{itemId shopId productName imageUrl offerLink productLink priceMin priceMax ratingStar sales commissionRate priceDiscountRate}}}'});
  if(probeKind==='performance')body=JSON.stringify({query:'{productOfferV2(page:1,limit:50,listType:2,sortType:2){nodes{itemId shopId productName imageUrl offerLink productLink priceMin priceMax ratingStar sales commissionRate priceDiscountRate}}}'});
  if(probeKind==='gaming-category')body=JSON.stringify({query:'{productOfferV2(page:1,limit:20,productCatId:11059980){nodes{itemId shopId productName imageUrl offerLink productLink priceMin priceMax ratingStar sales commissionRate priceDiscountRate}}}'});
  if(itemProbe){const [shopId,itemId]=itemProbe.split('/');body=JSON.stringify({query:`{productOfferV2(page:1,limit:1,shopId:${shopId},itemId:${itemId}){nodes{itemId shopId productName imageUrl offerLink productLink priceMin priceMax ratingStar sales commissionRate priceDiscountRate}}}`});}
  if(probeKind==='schema')body=JSON.stringify({query:'{__schema{queryType{fields{name args{name description defaultValue type{kind name ofType{kind name}}}}}}}'});
  let state='provider';
  try{const response=await fetch(shopeeEndpoint,{method:'POST',headers:{'Content-Type':'application/json',Authorization:shopeeAuthorization(env.SHOPEE_AFFILIATE_APP_ID,env.SHOPEE_AFFILIATE_SECRET,body)},body,redirect:'error',cache:'no-store',signal:AbortSignal.timeout(8000)}),raw=await response.json();
   const errors=(raw.errors||[]).map((e:{message?:unknown;extensions?:{code?:unknown;message?:unknown}})=>({message:safe(e.message),code:safe(e.extensions?.code||''),detail:safe(e.extensions?.message||'')}));
   diagnostics.push({query:JSON.parse(body).query,status:response.status,errors});const valid=response.ok&&!errors.length&&(probeKind==='schema'?Array.isArray(raw.data?.__schema?.queryType?.fields):Array.isArray(raw.data?.productOfferV2?.nodes));
   state=valid?'ok':errors.some((e:{code:string})=>e.code==='10020')?'auth':'provider';result={probeKind,valid,nodeCount:valid&&probeKind!=='schema'?raw.data.productOfferV2.nodes.length:0,...(valid&&probeKind==='schema'?{schema:raw.data.__schema.queryType.fields.filter((f:{name:string})=>f.name==='productOfferV2')}: {})};if(!valid)failure='A consulta de diagnóstico não retornou dados válidos.';
   if(valid&&full){const parsed=parseShopeeOffers(raw);if(parsed.length)await checked(db.rpc('dropou_shopee_cache',{p_owner:owner,p_rows:parsed.map(data=>{const a=assessShopeeOffer(data,config);return {shop_id:data.shopId,item_id:data.itemId,data,score:a.score,eligible:a.eligible,reasons:a.reasons,checked_at:data.checkedAt};})}));result={...result as object,normalizedCount:parsed.length,nodeKeys:raw.data.productOfferV2.nodes[0]?Object.keys(raw.data.productOfferV2.nodes[0]):[]};}
  }catch{failure='Falha de rede na consulta mínima.';}finally{await checked(db.rpc('dropou_shopee_finish',{p_request:reservation,p_state:state,p_retry_seconds:state==='auth'?21600:60}));}
 }else if(live){try{result=await engine.scan(owner);}catch(e){failure=safe(e instanceof Error?e.message:'Falha na rodada.');}}
 const requests=await checked(db.from('shopee_requests').select('kind,state,created_at,blocked_until').eq('owner_id',owner).eq('day',bahiaDay()).order('created_at'));
 const cached=await checked(db.from('shopee_offers').select('id,data,score,eligible,reasons,decision').eq('owner_id',owner).eq('brand_id','dropou').order('score',{ascending:false}).limit(100));
 let telegram:unknown={notChecked:true};
 if(live&&env.TELEGRAM_BOT_TOKEN){
  const chat=settings.telegram_chat_id||env.TELEGRAM_CHAT_ID;
  try{const target=await resolveTelegramTarget({...env,TELEGRAM_CHAT_ID:chat,TELEGRAM_CHANNEL_ID:chat});telegram={channelId:target.id,title:target.title,administrator:true,messageSent:false};}catch(e){telegram={error:safe(e instanceof Error?e.message:'Falha na verificação Telegram.'),messageSent:false};}
 }
 const report={checkedAt:new Date().toISOString(),liveRead:live,day:bahiaDay(),requestsBefore:before?.length||0,requests,apiDiagnostics:diagnostics,result,failure,telegram,cachedCount:cached?.length||0,eligibleCount:cached?.filter(o=>o.eligible).length||0,offers:(cached||[]).map(o=>({...o,caption:shopeeCaption(o.data)}))};
 mkdirSync('outputs/shopee-live',{recursive:true});const reportPath=`outputs/shopee-live/${new Date().toISOString().replace(/[:.]/g,'-')}-${probeKind||'scan'}.json`;writeFileSync(reportPath,JSON.stringify(report,null,2)+'\n');
 console.log(JSON.stringify({reportPath,...report,offers:report.offers.slice(0,5)},null,2));
 if(failure)process.exitCode=1;
}
main().catch(e=>{console.error(safe(e instanceof Error?e.message:'Falha no teste.'));process.exitCode=1;});
