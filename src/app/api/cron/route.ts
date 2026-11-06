import {timingSafeEqual} from 'node:crypto';
import {adminDb} from '@/server/db';
import {dispatchJob} from '@/server/telegram-offer';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export const maxDuration=60;
export async function POST(request:Request){
 const received=request.headers.get('authorization')||'';if(!received.startsWith('Bearer ')||received.length<20)return Response.json({error:'Não autorizado'},{status:401});
 try{
  const db=adminDb(),config=await db.from('telegram_dispatch_config').select('secret,automation_enabled').eq('id',true).single();
  const expected='Bearer '+config.data?.secret;
  if(config.error||Buffer.byteLength(received)!==Buffer.byteLength(expected)||!timingSafeEqual(Buffer.from(received),Buffer.from(expected)))return Response.json({error:'Não autorizado'},{status:401});
  if(!config.data.automation_enabled)return Response.json({paused:true});
  // Sending jobs never return to the queue after a crash or a timeout.
  const stale=await db.from('telegram_jobs').select('id,message_ids').eq('channel','telegram').eq('state','sending').lt('started_at',new Date(Date.now()-120000).toISOString()).limit(20);
  if(stale.error)throw stale.error;
  for(const job of stale.data||[]){const r=await db.rpc('dropou_publication_receipt',{p_job:job.id,p_ids:job.message_ids,p_state:'uncertain',p_error:'Execução interrompida. Confira o canal antes de repetir.'});if(r.error)throw r.error;}
  const jobs=await db.from('telegram_jobs').select('id').eq('state','queued').lte('scheduled_at',new Date().toISOString()).order('scheduled_at').limit(1);if(jobs.error)throw jobs.error;
  let processed=0;for(const job of jobs.data||[]){try{await dispatchJob(job.id,true);processed++;}catch{ /* Outcome is retained. A queued preflight failure is blocked for review. */
   const r=await db.from('telegram_jobs').update({state:'blocked',error:'Não foi possível conferir canal, legenda ou imagem. Revise a configuração e autorize novamente.'}).eq('id',job.id).eq('state','queued');if(r.error)throw r.error;
  }}
  return Response.json({processed});
 }catch{return Response.json({error:'Falha no processamento. Consulte o histórico; não repita envios incertos.'},{status:500});}
}
export const GET=POST;
