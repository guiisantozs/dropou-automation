import {channelShopeeConfig} from '@/lib/channel-shopee-config';
import {z} from 'zod';
import {sessionDb,apiError,dbError} from '@/server/session';
import {publicationAdmin} from '@/server/telegram-offer';
import {searchChannel} from '@/server/shopee/on-demand';
import {isShopeeOperation} from '@/lib/workspace-brands';
import {bahiaDay,shopeeConfigSchema,assessShopeeOffer} from '@/lib/shopee-automation';
import {shopeeLimit} from '@/lib/shopee-limits';
import {operatorAudit} from '@/server/operator-audit';
import {manualShopeeAction} from '@/server/shopee/manual-actions';
export const runtime='nodejs';export const maxDuration=60;export const dynamic='force-dynamic';
async function context(request:Request){const session=await sessionDb(request);if(!isShopeeOperation(session.operation))throw new Error('Selecione um canal Dropou com integra??o Shopee.');const admin=await publicationAdmin(session.user.id);return {...session,...admin,operation:session.operation};}
export async function GET(request:Request){try{
 const {db,user,operation,enabled,access}=await context(request),day=bahiaDay();
 const [settings,offers,requests,events,runs,jobs,global]=await Promise.all([
  db.from('operation_settings').select('shopee_config,radar,automation_enabled,telegram_title,telegram_chat_id,telegram_verified_at,manual_daily_limit,discovery_daily_limit').eq('owner_id',user.id).eq('brand_id',operation).single(),
  db.from('shopee_offers').select('*').eq('owner_id',user.id).eq('brand_id',operation).order('checked_at',{ascending:false}).limit(200),
  db.from('shopee_requests').select('id,kind,state,created_at,blocked_until').eq('owner_id',user.id).eq('brand_id',operation).eq('day',day).order('created_at',{ascending:false}).limit(1000),
  db.from('shopee_usage_events').select('kind').eq('owner_id',user.id).eq('brand_id',operation).gte('created_at',day+'T00:00:00-03:00').limit(10000),
  db.from('shopee_runs').select('id,day,state,preview,error,updated_at').eq('owner_id',user.id).eq('brand_id',operation).order('day',{ascending:false}).limit(14),
  db.from('telegram_jobs').select('id,state,caption,scheduled_at,sent_at,destination_title,message_ids,error,shopee_offer_id').eq('owner_id',user.id).eq('brand_id',operation).not('shopee_offer_id','is',null).order('scheduled_at',{ascending:false}).limit(100),
  db.from('shopee_requests').select('id',{count:'exact',head:true}).eq('day',day).eq('kind','search'),
 ]);for(const r of [settings,offers,requests,events,runs,jobs,global])if(r.error)throw dbError(r.error);
 const s=settings.data!,config=channelShopeeConfig(s),rows=offers.data!.map(row=>({...row,assessment:assessShopeeOffer(row.data,config,[],operation)}));
 return Response.json({config,admin:access.admin,offers:rows.filter(o=>o.assessment.relevant),discardedOtherNiches:rows.filter(o=>!o.assessment.relevant).length,requests:requests.data,runs:runs.data,jobs:jobs.data,globalUsed:global.count||0,globalLimit:shopeeLimit(process.env,'search'),day,
  budget:{manualUsed:requests.data!.filter(r=>r.kind==='manual').length,manualLimit:s.manual_daily_limit,discoveryUsed:requests.data!.filter(r=>r.kind==='search').length,discoveryLimit:s.discovery_daily_limit,imports:events.data!.filter(r=>r.kind==='manual_import').length,cacheHits:events.data!.filter(r=>r.kind==='cache_hit').length,limitErrors:requests.data!.filter(r=>r.state==='rate_limit').length},
  dispatcherEnabled:enabled,operationEnabled:s.automation_enabled,destination:s.telegram_title||s.telegram_chat_id,verified:!!s.telegram_verified_at,
  credentialsReady:!!process.env.SHOPEE_AFFILIATE_APP_ID&&!!process.env.SHOPEE_AFFILIATE_SECRET&&process.env.SHOPEE_AFFILIATE_APPROVED==='true',liveReleased:process.env.SHOPEE_AUTOMATION_LIVE==='true',testReady:process.env.SHOPEE_TELEGRAM_TEST_ENABLED==='true'&&!!process.env.TELEGRAM_TEST_CHAT_ID,manualOnly:true},{headers:{'Cache-Control':'no-store'}});
 }catch(e){return apiError(e);}}
export async function PATCH(request:Request){try{const {db,user,operation,access}=await context(request);if(!access.admin)throw new Error('FORBIDDEN: Somente administradores alteram os filtros.');const config=shopeeConfigSchema.parse(await request.json());const r=await db.from('operation_settings').update({shopee_config:config,updated_at:new Date().toISOString()}).eq('owner_id',user.id).eq('brand_id',operation);if(r.error)throw dbError(r.error);return Response.json({config});}catch(e){return apiError(e);}}
const action=z.discriminatedUnion('action',[
 z.object({action:z.literal('search')}),z.object({action:z.literal('plan')}),
 z.object({action:z.literal('prepare'),id:z.uuid()}),
 z.object({action:z.literal('decide'),id:z.uuid(),decision:z.enum(['approved','rejected','removed'])}),
 z.object({action:z.literal('allow-repeat'),id:z.uuid(),confirmation:z.literal('LIBERAR REPETIÇÃO')}),
]);
export async function POST(request:Request){try{
 const {db,user,operation,actorId}=await context(request),body=action.parse(await request.json());
 if(body.action!=='search'){const result=await manualShopeeAction(db,user.id,operation,body);await operatorAudit(user.id,actorId,operation,'Curadoria Shopee: '+body.action,'id' in body?body.id:undefined);return Response.json(result);}
 const result=await searchChannel(db,user.id,operation);if(!result.busy)await operatorAudit(user.id,actorId,operation,'Busca de produtos solicitada');return Response.json(result);
}catch(e){return apiError(e);}}
