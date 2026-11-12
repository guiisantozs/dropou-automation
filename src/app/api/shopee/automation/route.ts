import {z} from 'zod';
import {sessionDb,apiError} from '@/server/session';
import {publicationAdmin} from '@/server/telegram-offer';
import {shopeeAutomation} from '@/server/shopee/automation';
import {adminDb} from '@/server/db';
import {shopeeProduct} from '@/lib/shopee-product';
import {bahiaDay,shopeeConfigSchema,assessShopeeOffer,type OfferObservation} from '@/lib/shopee-automation';
export const runtime='nodejs';
export const maxDuration=60;
export const dynamic='force-dynamic';
async function context(request:Request){const session=await sessionDb(request);if(session.operation!=='dropou')throw new Error('Selecione Dropou | Tech & Games. Os demais nichos permanecem desativados.');const admin=await publicationAdmin(session.user.id);return {...session,...admin};}
function check<T extends {error:unknown;data:unknown}>(r:T):T['data']{if(r.error)throw new Error('A estrutura Shopee não está disponível. Aplique somente a migração incremental de automação.');return r.data;}
export async function GET(request:Request){try{
 const {db,user,enabled}=await context(request),day=bahiaDay();
 const [settings,offers,requests,runs,jobs,global,observations]=await Promise.all([
  db.from('operation_settings').select('shopee_config,automation_enabled,telegram_chat_id,telegram_title,telegram_verified_at').eq('owner_id',user.id).eq('brand_id','dropou').single(),
  db.from('shopee_offers').select('*').eq('owner_id',user.id).eq('brand_id','dropou').order('checked_at',{ascending:false}).limit(200),
  db.from('shopee_requests').select('id,kind,state,created_at,blocked_until').eq('owner_id',user.id).eq('brand_id','dropou').eq('day',day).order('created_at',{ascending:false}).limit(100),
  db.from('shopee_runs').select('id,day,state,preview,error,updated_at').eq('owner_id',user.id).eq('brand_id','dropou').order('day',{ascending:false}).limit(14),
  db.from('telegram_jobs').select('id,state,caption,scheduled_at,sent_at,destination_title,message_ids,error,shopee_offer_id').eq('owner_id',user.id).eq('brand_id','dropou').not('shopee_offer_id','is',null).order('scheduled_at',{ascending:false}).limit(100),
  db.from('shopee_requests').select('id',{count:'exact',head:true}).eq('day',day),
  db.from('shopee_observations').select('shop_id,item_id,observed_at,sales,rating,price,price_max').eq('owner_id',user.id).eq('brand_id','dropou').gte('observed_at',new Date(Date.now()-30*86400000).toISOString()).order('observed_at',{ascending:false}).limit(5000),
 ]);
 const s=check(settings);if(!s)throw new Error('Operação não configurada.');const config=shopeeConfigSchema.parse(s.shopee_config);check(global);
 const history=check(observations) as OfferObservation[];
 const assessed=check(offers)?.map(row=>{const assessment=assessShopeeOffer(row.data,config,history);return {...row,assessment,score:assessment.score,eligible:assessment.eligible,reasons:assessment.reasons};});
 return Response.json({config,offers:assessed?.filter(o=>o.assessment.relevant),discardedOtherNiches:assessed?.filter(o=>!o.assessment.relevant).length||0,requests:check(requests),runs:check(runs),jobs:check(jobs),day,globalUsed:global.count||0,globalLimit:Number(process.env.SHOPEE_DAILY_REQUEST_LIMIT||10),dispatcherEnabled:enabled,operationEnabled:s.automation_enabled,destination:s.telegram_title||s.telegram_chat_id,verified:!!s.telegram_verified_at,credentialsReady:!!process.env.SHOPEE_AFFILIATE_APP_ID&&!!process.env.SHOPEE_AFFILIATE_SECRET&&process.env.SHOPEE_AFFILIATE_APPROVED==='true',liveReleased:process.env.SHOPEE_AUTOMATION_LIVE==='true',testReady:process.env.SHOPEE_TELEGRAM_TEST_ENABLED==='true'&&!!process.env.TELEGRAM_TEST_CHAT_ID},{headers:{'Cache-Control':'no-store'}});
 }catch(e){return apiError(e);}}
export async function PATCH(request:Request){try{
 const {db,user}=await context(request),config=shopeeConfigSchema.parse(await request.json());
 check(await db.from('operation_settings').update({shopee_config:config,updated_at:new Date().toISOString()}).eq('owner_id',user.id).eq('brand_id','dropou'));
 await shopeeAutomation().reassess(user.id);
 // Pausing cancels queued managed posts; resuming never recovers elapsed slots.
 if(!config.enabled||config.dryRun)check(await db.from('telegram_jobs').update({state:'cancelled',error:'Rotina Shopee pausada ou colocada em simulação.'}).eq('owner_id',user.id).eq('state','queued').not('shopee_offer_id','is',null));
 check(await db.from('logs').insert({owner_id:user.id,brand_id:'dropou',event:'Configuração da automação Shopee',detail:JSON.stringify({enabled:config.enabled,dryRun:config.dryRun,dailyLimit:config.dailyLimit})}));return Response.json({config});
 }catch(e){return apiError(e);}}
const actionSchema=z.discriminatedUnion('action',[z.object({action:z.literal('search')}),z.object({action:z.literal('plan')}),z.object({action:z.literal('prepare'),id:z.string().uuid()}),z.object({action:z.literal('decide'),id:z.string().uuid(),decision:z.enum(['approved','rejected','removed'])}),z.object({action:z.literal('allow-repeat'),id:z.string().uuid(),confirmation:z.literal('LIBERAR REPETIÇÃO')})]);
export async function POST(request:Request){try{
 const {db,user}=await context(request),body=actionSchema.parse(await request.json()),automation=shopeeAutomation();
 if(body.action==='search')return Response.json(await automation.scan(user.id));
 if(body.action==='plan')return Response.json(await automation.plan(user.id));
 const offer=check(await db.from('shopee_offers').select('*').eq('id',body.id).eq('owner_id',user.id).eq('brand_id','dropou').single());if(!offer)throw new Error('Oferta não encontrada.');
 if(body.action==='prepare'||body.action==='decide'&&body.decision==='approved'){
  if(body.action==='prepare'&&offer.decision!=='approved')throw new Error('Aprove a oferta antes de preparar a publicação.');
  const assessment=await automation.review(user.id,offer.data);if(!assessment.eligible)throw new Error('Aprovação bloqueada: '+assessment.reasons.join(' · '));
  const staged=await adminDb().rpc('dropou_shopee_stage',{p_owner:user.id,p_cache:offer.id,p_product:shopeeProduct(offer.data,offer.id),p_assessment:assessment});
  if(staged.error)throw new Error('Não foi possível preparar o produto. Atualize a curadoria e confira se o cadastro está arquivado.');
  return Response.json({updated:true,productId:staged.data});
 }
 if(body.action==='decide'){
  check(await db.from('shopee_offers').update({decision:body.decision}).eq('id',body.id).eq('owner_id',user.id));
  if(body.decision!=='approved')check(await db.from('telegram_jobs').update({state:'cancelled',error:'Removida ou rejeitada na curadoria Shopee.'}).eq('owner_id',user.id).eq('shopee_offer_id',body.id).eq('state','queued'));
  if(offer.prepared_product_id)check(await db.from('telegram_jobs').update({state:'cancelled',error:'Removida ou rejeitada na curadoria Shopee.'}).eq('owner_id',user.id).eq('brand_id','dropou').eq('product_id',offer.prepared_product_id).eq('state','queued'));
 }else{
  const assessment=await automation.review(user.id,offer.data);if(!assessment.eligible)throw new Error('Repetição bloqueada: '+assessment.reasons.join(' · '));
  check(await db.from('shopee_offers').update({repeat_until:new Date(Date.now()+600000).toISOString(),decision:'approved'}).eq('id',body.id).eq('owner_id',user.id));
 }
 check(await db.from('logs').insert({owner_id:user.id,brand_id:'dropou',event:'Curadoria Shopee',detail:JSON.stringify({offer:body.id,action:body.action,...('decision' in body?{decision:body.decision}:{repeatMinutes:10})})}));
 return Response.json({updated:true});
 }catch(e){return apiError(e);}}
