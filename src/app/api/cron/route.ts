import {timingSafeEqual} from 'node:crypto';
import {adminDb} from '@/server/db';
import {dispatchJob} from '@/server/telegram-offer';
import {shopeeAutomation} from '@/server/shopee/automation';
import {maintainSavedProducts} from '@/server/saved-retention';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export const maxDuration=60;
export async function POST(request:Request){
 const received=request.headers.get('authorization')||'';if(!received.startsWith('Bearer ')||received.length<20)return Response.json({error:'Não autorizado'},{status:401});
 try{
  const db=adminDb(),config=await db.from('telegram_dispatch_config').select('secret,automation_enabled').eq('id',true).single();
  const expected='Bearer '+config.data?.secret;
  if(config.error||Buffer.byteLength(received)!==Buffer.byteLength(expected)||!timingSafeEqual(Buffer.from(received),Buffer.from(expected)))return Response.json({error:'Não autorizado'},{status:401});
  // Housekeeping reuses this scheduler and continues while publishing is paused.
  async function maintenance(){try{return await maintainSavedProducts(db);}catch{return {pending:true};}}
  if(!config.data.automation_enabled)return Response.json({paused:true,maintenance:await maintenance()});
  // Sending jobs never return to the queue after a crash or a timeout.
  const stale=await db.from('telegram_jobs').select('id,message_ids').eq('channel','telegram').eq('state','sending').lt('started_at',new Date(Date.now()-120000).toISOString()).limit(20);
  if(stale.error)throw stale.error;
  for(const job of stale.data||[]){const r=await db.rpc('dropou_publication_receipt',{p_job:job.id,p_ids:job.message_ids,p_state:'uncertain',p_error:'Execução interrompida. Confira o canal antes de repetir.'});if(r.error)throw r.error;}
  const due=await db.rpc('dropou_due_operation_jobs');if(due.error)throw due.error;const jobs={data:(due.data||[]).map((id:string)=>({id}))};
  let processed=0;for(const job of jobs.data||[]){try{await dispatchJob(job.id,true);processed++;}catch{ /* Outcome is retained. A queued preflight failure is blocked for review. */
   const r=await db.from('telegram_jobs').update({state:'blocked',error:'Não foi possível conferir canal, legenda ou imagem. Revise a configuração e autorize novamente.'}).eq('id',job.id).eq('state','queued');if(r.error)throw r.error;
  }}
  // Reuse idle invocations only for already scheduled legacy Shopee jobs.
  // Discovery and planning require an explicit operator request.
  if(!processed){
   const shopeeConfig=await db.from('operation_settings').select('owner_id').eq('brand_id','dropou').contains('shopee_config',{enabled:true}).limit(1);
   if(!shopeeConfig.error&&shopeeConfig.data.length){try{await shopeeAutomation().tick();}catch{ /* Sanitized failures remain in shopee_runs/requests. */ }}
  }
  return Response.json({processed,maintenance:await maintenance()});
 }catch{return Response.json({error:'Falha no processamento. Consulte o histórico; não repita envios incertos.'},{status:500});}
}
export const GET=POST;
