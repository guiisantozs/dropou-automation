import {z} from 'zod';
import {sessionDb,apiError,dbError} from '@/server/session';
import {publicationAdmin} from '@/server/telegram-offer';
export async function GET(request:Request){try{
 const {db}=await sessionDb(request),page=z.coerce.number().int().min(0).max(10000).parse(new URL(request.url).searchParams.get('page')||0);
 const result=await db.rpc('dropou_schedule_page',{p_page:page});if(result.error)throw dbError(result.error);
 const ids=[...new Set<string>(result.data.jobs.map((j:{product_id:string})=>j.product_id))],summary=ids.length?await db.rpc('dropou_product_channel_summaries',{p_ids:ids}):{data:[],error:null};if(summary.error)throw dbError(summary.error);
 return Response.json({...result.data,channels:Object.fromEntries(summary.data.map((r:any)=>[r.product_id,{telegram:r.telegram,whatsapp:r.whatsapp}])),serverNow:new Date().toISOString()},{headers:{'Cache-Control':'no-store'}});
}catch(e){return apiError(e);}}
async function change(request:Request,action:'reschedule'|'cancel'){try{
 const {user,actorId,db:session}=await sessionDb(request),body=z.object({id:z.string().uuid(),confirmed:z.literal(true),scheduledAt:z.string().datetime().optional()}).parse(await request.json());
 const row=await session.from('telegram_jobs').select('id').eq('owner_id',user.id).eq('id',body.id).maybeSingle();if(row.error)throw dbError(row.error);if(!row.data)throw new Error('FORBIDDEN: Agendamento indisponível neste canal.');
 const {db}=await publicationAdmin(user.id),r=await db.rpc('dropou_schedule_change',{p_owner:user.id,p_job:body.id,p_actor:actorId,p_action:action,p_at:body.scheduledAt||null});if(r.error)throw dbError(r.error);return Response.json(r.data);
}catch(e){return apiError(e);}}
export const PATCH=(request:Request)=>change(request,'reschedule');
export const DELETE=(request:Request)=>change(request,'cancel');
