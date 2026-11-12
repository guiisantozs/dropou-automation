import nextEnv from '@next/env';
import {createClient} from '@supabase/supabase-js';
import {readFileSync,writeFileSync} from 'node:fs';
import {requestShopee,shopeeEndpoint} from '../src/server/shopee/client';
import {assessShopeeOffer,shopeeConfigSchema,shopeeCaption,priceCurrent,bahiaDay} from '../src/lib/shopee-automation';
import {productSchema} from '../src/lib/domain';
import {safePublicationCaption} from '../src/lib/publication-copy';
import {resolveTelegramTarget,sendTelegramTo,TelegramFailure} from '../src/server/telegram-core';

// One specific post explicitly approved in chat on 12/11/2026. Never a cron entry.
// Uses the ordinary manual queue/claim/receipt; global automation stays paused.
nextEnv.loadEnvConfig(process.cwd(),true,{info(){},error(){}});
const slot='shopee-approved-test:keyboard-20261112',shopId='764842647',itemId='20343023230',destination='-1003981538831';
const reportPath='outputs/shopee-live/first-telegram-test-receipt.json';
let report:Record<string,unknown>={state:'preflight',messageSent:false};
const save=()=>writeFileSync(reportPath,JSON.stringify(report,null,2)+'\n');
async function main(){
 const env=process.env,key=env.SUPABASE_SECRET_KEY||env.SUPABASE_SERVICE_ROLE_KEY;
 if(!key||!env.NEXT_PUBLIC_SUPABASE_URL||new URL(env.NEXT_PUBLIC_SUPABASE_URL).hostname!=='wqpdyfipjsnyzxktacqh.supabase.co')throw new Error('Backend Dropou ausente.');
 if(env.SHOPEE_AUTOMATION_LIVE!=='false'||env.SHOPEE_TELEGRAM_TEST_ENABLED!=='false')throw new Error('Mantenha as rotinas e o teste isolado desativados.');
 const db=createClient(env.NEXT_PUBLIC_SUPABASE_URL,key,{auth:{persistSession:false,autoRefreshToken:false}});
 async function checked<T extends {data:any;error:unknown}>(p:PromiseLike<T>):Promise<T['data']>{const r=await p;if(r.error)throw new Error('Operação recusada pelo banco. Nenhum retry automático.');return r.data;}
 const dispatch=await checked(db.from('telegram_dispatch_config').select('owner_ids,automation_enabled').eq('id',true).single());
 if(!dispatch||dispatch.automation_enabled||dispatch.owner_ids.length!==1)throw new Error('Exige dispatcher pausado e administrador inequívoco.');
 const owner=dispatch.owner_ids[0];
 async function paused(){
  const global=await checked(db.from('telegram_dispatch_config').select('automation_enabled,owner_ids').eq('id',true).single());
  const s=await checked(db.from('operation_settings').select('telegram_chat_id,automation_enabled,shopee_config').eq('owner_id',owner).eq('brand_id','dropou').single());
  if(!s||!global)throw new Error('Configuração ausente.');
  const c=shopeeConfigSchema.parse(s.shopee_config);
  if(global.automation_enabled||!global.owner_ids.includes(owner)||s.automation_enabled||c.enabled||!c.dryRun||s.telegram_chat_id!==destination)throw new Error('Pausa, administrador ou destino alterado.');
  return c;
 }
 const config=await paused(),telegramEnv={...env,TELEGRAM_CHAT_ID:destination,TELEGRAM_CHANNEL_ID:destination};
 const target=await resolveTelegramTarget(telegramEnv);if(target.id!==destination)throw new Error('Destino diferente do aprovado.');
 const draft=JSON.parse(readFileSync('outputs/shopee-live/first-telegram-test.json','utf8'));
 const cache=await checked(db.from('shopee_offers').select('*').eq('id',draft.candidateId).eq('owner_id',owner).eq('brand_id','dropou').single());
 if(cache.shop_id!==shopId||cache.item_id!==itemId||['rejected','removed'].includes(cache.decision)||draft.destinationId!==destination)throw new Error('Oferta diferente da autorização.');
 const already=await checked(db.from('runs').select('slot').eq('owner_id',owner).eq('slot',slot).maybeSingle());
 if(already)throw new Error('Autorização já reservada. Confira o recibo; não reenvie.');
 const canonical='shopee.com.br/product/'+shopId+'/'+itemId;
 const existing=await checked(db.from('products').select('id').eq('owner_id',owner).eq('brand_id','dropou').eq('canonical_url',canonical));
 const history=await checked(db.from('channel_events').select('id').eq('owner_id',owner).eq('channel','telegram').eq('destination_id',destination).eq('snapshot->source->>itemId',shopId+':'+itemId).in('event',['sent','legacy_telegram_verified']));
 if(!existing||!history||existing.length||history.length)throw new Error('Produto ou publicação já existe, ou leitura indisponível; revisar antes de repetir.');
 if(!process.argv.includes('--execute-approved-20261112')){console.log(JSON.stringify({ready:true,destination:target.title,caption:draft.caption,willSend:false}));return;}
 if(bahiaDay()!=='2026-11-12')throw new Error('Esta autorização específica é de 12/11/2026.');
 // Durable one-use authorization BEFORE external calls. Any uncertain outcome is held.
 await checked(db.from('runs').insert({owner_id:owner,slot}));
 report={...report,state:'reserved',destination:target.id,approval:slot};save();
 let requestId:string|undefined;
 const offers=await requestShopee({shopId,itemId,limit:1},{appId:env.SHOPEE_AFFILIATE_APP_ID,secret:env.SHOPEE_AFFILIATE_SECRET,approved:env.SHOPEE_AFFILIATE_APPROVED==='true'},async()=>{
  requestId=await checked(db.rpc('dropou_shopee_reserve',{p_owner:owner,p_key:slot,p_kind:'revalidate',p_global_limit:10}));return requestId||null;
 },async(id,state,retry)=>{await checked(db.rpc('dropou_shopee_finish',{p_request:id,p_state:state,p_retry_seconds:state==='auth'?21600:retry}));});
 const offer=offers.find(o=>o.shopId===shopId&&o.itemId===itemId);if(!offer)throw new Error('A API não retornou o produto aprovado.');
 const assessment=assessShopeeOffer(offer,config),caption='🧪 TESTE DROPOU\n\n'+shopeeCaption(offer);
 if(!assessment.eligible||!priceCurrent(offer)||offer.image!==draft.photo||caption!==draft.caption)throw new Error('Preço, imagem, link ou qualidade mudou. Não enviado.');
 await checked(db.rpc('dropou_shopee_cache',{p_owner:owner,p_rows:[{shop_id:shopId,item_id:itemId,data:offer,score:assessment.score,eligible:true,reasons:[],checked_at:offer.checkedAt}]}));
 const reservation=await checked(db.from('shopee_requests').select('created_at').eq('id',requestId!).single());
 if(!reservation)throw new Error('Reserva de API ausente.');
 const product=productSchema.parse({id:crypto.randomUUID(),operation:'dropou',name:offer.name,niche:'Tech & Games',store:'Shopee',price:offer.price,previousPrice:null,previousVerified:false,originalUrl:offer.productLink,affiliateUrl:offer.offerLink,image:offer.image,installments:'',installmentsVerified:false,inStock:null,paymentMethod:'nao_informado',pixVerified:false,checkedAt:offer.checkedAt,status:'encontrado',scheduledAt:null,createdAt:new Date().toISOString(),demo:false,dataOrigin:'official',source:{provider:'shopee',itemId:shopId+':'+itemId,verifiedAt:offer.checkedAt,priceEndpoint:shopeeEndpoint,referenceAmount:null,previousEvidence:'none'}});
 const safe=safePublicationCaption(product);
 await checked(db.from('products').insert({id:product.id,owner_id:owner,brand_id:'dropou',canonical_url:canonical,data:product}));
 const savedOffer=await checked(db.from('offers').insert({owner_id:owner,brand_id:'dropou',product_id:product.id,caption:safe,snapshot:product,status:'rascunho'}).select('id').single());
 if(!savedOffer)throw new Error('Oferta não persistida.');
 const job=await checked(db.rpc('dropou_publication_queue_v2',{p_owner:owner,p_offer:savedOffer.id,p_channel:'telegram',p_at:reservation.created_at,p_target:{...target,mediaMode:'photo',photoConfirmed:true},p_caption:safe,p_source:safe,p_mode:'safe',p_allow_safe:false}));
 report={...report,jobId:job.id,productId:product.id,caption,photo:offer.image,observedAt:offer.checkedAt,state:'queued'};save();
 await paused();
 const claim=await checked(db.rpc('dropou_publication_claim_v2',{p_job:job.id,p_target:target.key,p_automatic:false}));if(!claim)throw new Error('A reserva manual não foi obtida.');
 let ids:string[]=[];
 async function receipt(state:string,error?:string){await checked(db.rpc('dropou_publication_receipt',{p_job:job.id,p_ids:ids,p_state:state,p_error:error||null}));}
 try{
  // Same evidence representation as the managed Shopee worker, after the manual
  // claim and the exact approved-caption comparison; never asserts inventory.
  await checked(db.from('telegram_jobs').update({publication_mode:'official',caption,shopee_offer_id:cache.id,shopee_evidence:offer}).eq('id',job.id).eq('owner_id',owner).eq('state','sending').select('id').single());
  await checked(db.from('deliveries').update({publication_mode:'official',caption,snapshot:product}).eq('product_id',product.id).eq('owner_id',owner).eq('channel','telegram').eq('state','sending').select('product_id').single());
  let sends=0;
  const sendOnly:typeof fetch=async(input,init)=>{if(!String(input).endsWith('/sendPhoto')||++sends!==1)throw new Error('Apenas uma chamada sendPhoto foi autorizada.');return fetch(input,init);};
  await sendTelegramTo(telegramEnv,target,caption,offer.image,sendOnly,async received=>{ids=received;report={...report,state:'sending',messageSent:true,messageIds:ids};save();await receipt('sending');},async()=>{
   const latestConfig=await paused();if(!priceCurrent(offer)||caption!==draft.caption||!assessShopeeOffer(offer,latestConfig).eligible)throw new TelegramFailure('Conferência expirada ou prévia alterada.','failed');
   const latestCache=await checked(db.from('shopee_offers').select('decision').eq('id',cache.id).eq('owner_id',owner).single());
   if(!latestCache||['rejected','removed'].includes(latestCache.decision))throw new TelegramFailure('Oferta removida antes do envio.','failed');
   const current=await checked(db.from('telegram_jobs').select('state,caption,shopee_evidence,destination_id').eq('id',job.id).single());
   if(!current||current.state!=='sending'||current.caption!==caption||current.destination_id!==target.id)throw new TelegramFailure('Reserva ou destino alterado.','failed');
  },{mediaMode:'photo',previewUrl:offer.offerLink});
  await receipt('sent');report={...report,state:'sent',messageSent:true,messageIds:ids,url:'https://t.me/dropoutech/'+ids[0]};save();
 }catch(e){const failure=e instanceof TelegramFailure?e:new TelegramFailure('Recibo pendente. Confira o canal antes de repetir.','uncertain',ids);try{await receipt(failure.outcome,failure.message);}catch{}report={...report,state:failure.outcome,messageIds:ids,error:failure.message};save();throw failure;}
 await checked(db.from('logs').insert({owner_id:owner,brand_id:'dropou',event:'Teste Shopee autorizado no canal principal',detail:JSON.stringify({approval:slot,jobId:job.id,destination:target.id,messageIds:ids,automationEnabled:false})}));
 console.log(JSON.stringify(report,null,2));
}
main().catch(e=>{let error=String(e instanceof Error?e.message:'Falha no teste.');for(const name of ['TELEGRAM_BOT_TOKEN','SUPABASE_SECRET_KEY','SUPABASE_SERVICE_ROLE_KEY','SHOPEE_AFFILIATE_SECRET']){const value=process.env[name];if(value)error=error.split(value).join('[redacted]');}report={...report,error:error.slice(0,400)};save();console.error(JSON.stringify(report,null,2));process.exitCode=1;});
