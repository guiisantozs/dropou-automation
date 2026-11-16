import {sessionDb,apiError} from '@/server/session';
import {publicationAdmin} from '@/server/telegram-offer';
import {mtprotoErrors,type MtprotoStatus} from '@/lib/telegram-mtproto';
import {readMtprotoCommand} from '@/server/mtproto/input';
import {mtprotoWorker} from '@/server/mtproto/proxy';
import {MtprotoFailure} from '@/server/mtproto/security';
import type {MtprotoShopeeQueue} from '@/lib/telegram-mtproto-shopee';

export const runtime='nodejs';
export const maxDuration=30;
const headers={'Cache-Control':'no-store','Pragma':'no-cache'};
async function context(request:Request){
 const session=await sessionDb(request);
 if(!session.access.admin)throw new Error('FORBIDDEN: Somente administradores podem gerenciar conexões Telegram.');
 if(session.operation==='all')throw new Error('Selecione uma marca para gerenciar sua conexão Telegram.');
 const {db}=await publicationAdmin(session.user.id);
 return {db,scope:{owner:session.user.id,brand:session.operation}};
}
function failure(error:unknown){
 if(error instanceof MtprotoFailure)return Response.json({error:(mtprotoErrors[error.code]||mtprotoErrors.unavailable)+(error.retryAfter?` Tente novamente em ${error.retryAfter} segundos.`:''),code:error.code,retryAfter:error.retryAfter},{status:error.code==='input'?400:error.code==='flood'?429:503,headers});
 const response=apiError(error);response.headers.set('Cache-Control','no-store');return response;
}
export async function GET(request:Request){try{
 const {db,scope}=await context(request),now=new Date();
 const [connection,lease]=await Promise.all([
  db.from('telegram_mtproto_connections').select('id,status,auth_expires_at,error_code,selected,test_channel_id,test_started_at,test_expires_at,heartbeat_at').eq('owner_id',scope.owner).eq('brand_id',scope.brand).maybeSingle(),
  db.from('telegram_mtproto_worker_lease').select('expires_at').eq('id',true).maybeSingle(),
 ]);
 if(connection.error||lease.error)throw new Error('CONFIG: Aplique a migração incremental de conexões MTProto neste ambiente.');
 const c=connection.data,workerOnline=!!lease.data&&Date.parse(lease.data.expires_at)>now.getTime();
 let diagnostics:MtprotoStatus['diagnostics']=[];
 if(c){const r=await db.from('telegram_mtproto_diagnostics').select('message_id,channel_id,message_at,received_at,kind').eq('connection_id',c.id).gte('received_at',new Date(now.getTime()-3600000).toISOString()).order('received_at',{ascending:false}).limit(50);if(r.error)throw new MtprotoFailure('storage');diagnostics=r.data;}
 const live=workerOnline&&!!c?.heartbeat_at&&Date.parse(c.heartbeat_at)>now.getTime()-90000;
 let shopee:MtprotoShopeeQueue|undefined;
 if(scope.brand==='dropou'&&c?.status==='connected'){
  try{shopee=await mtprotoWorker(scope,{action:'offers'}) as MtprotoShopeeQueue;}
  catch{shopee={available:false,items:[],expiresAt:null,limitReached:false,error:'Fila indisponível. Confira se o worker está online e atualizado.'};}
 }
 const expired=!!c?.auth_expires_at&&Date.parse(c.auth_expires_at)<=now.getTime();
 const status:MtprotoStatus={configured:!!process.env.TELEGRAM_MTPROTO_WORKER_URL&&(process.env.TELEGRAM_MTPROTO_WORKER_SECRET||'').length>=32,workerOnline,status:c?.status==='connected'?(live?'connected':'error'):c?.status==='error'?'error':'disconnected',step:!expired&&(c?.status==='code'||c?.status==='password')?c.status:null,error:expired?mtprotoErrors.expired:c?.error_code?mtprotoErrors[c.error_code]||mtprotoErrors.provider:c?.status==='connected'&&!live?mtprotoErrors.unavailable:null,selected:c?.selected||[],test:c?.test_channel_id&&c.test_expires_at&&Date.parse(c.test_expires_at)>now.getTime()?{channelId:c.test_channel_id,startedAt:c.test_started_at,expiresAt:c.test_expires_at}:null,diagnostics,serverNow:now.toISOString()};
 return Response.json({...status,...(shopee?{shopee}:{})},{headers});
}catch(error){return failure(error);}}
export async function POST(request:Request){try{
 const {scope}=await context(request);
 const command=await readMtprotoCommand(request);
 return Response.json(await mtprotoWorker(scope,command),{headers});
}catch(error){return failure(error);}}
