import {z} from 'zod';
import {sessionDb,apiError,dbError} from '@/server/session';
import {publicationAdmin} from '@/server/telegram-offer';
import {telegramTarget} from '@/server/telegram';
import {productSchema} from '@/lib/domain';
import {publicationCaptionError} from '@/lib/publication-copy';
import {operationSupports} from '@/lib/operation-capabilities';
export async function GET(request:Request){try{
 const {db,user}=await sessionDb(request),page=z.coerce.number().int().min(0).max(10000).parse(new URL(request.url).searchParams.get('page')||0);
 const result=await db.rpc('dropou_schedule_page',{p_page:page});if(result.error)throw dbError(result.error);
 const ids=[...new Set<string>(result.data.jobs.map((j:{product_id:string})=>j.product_id))],summary=ids.length?await db.rpc('dropou_product_channel_summaries',{p_ids:ids}):{data:[],error:null};if(summary.error)throw dbError(summary.error);
 const current=ids.length?await db.from('products').select('id,data').eq('owner_id',user.id).in('id',ids):{data:[],error:null};if(current.error)throw dbError(current.error);
 const products=new Map((current.data||[]).map(p=>[p.id,p.data]));
 const jobs=result.data.jobs.map((j:{product_id:string;data:unknown})=>({...j,data:products.get(j.product_id)||j.data}));
 const brands=[...new Set<string>(result.data.jobs.map((j:{brand_id:string})=>j.brand_id))];
 const settings=brands.length?await db.from('operation_settings').select('brand_id,automation_enabled').eq('owner_id',user.id).in('brand_id',brands):{data:[],error:null};if(settings.error)throw dbError(settings.error);
 const admin=await publicationAdmin(user.id),execution=Object.fromEntries((settings.data||[]).map(s=>[s.brand_id,{paused:operationSupports(s.brand_id,'automaticPublishing')&&(!admin.enabled||!s.automation_enabled)}]));
 return Response.json({...result.data,jobs,execution,channels:Object.fromEntries(summary.data.map((r:any)=>[r.product_id,{telegram:r.telegram,whatsapp:r.whatsapp}])),serverNow:new Date().toISOString()},{headers:{'Cache-Control':'no-store'}});
}catch(e){return apiError(e);}}
async function change(request:Request,action:'reschedule'|'cancel'){try{
 const {user,actorId,db:session}=await sessionDb(request),body=z.object({id:z.string().uuid(),confirmed:z.literal(true),scheduledAt:z.string().datetime().optional(),repair:z.object({before:z.string().max(4000),caption:z.string().min(1).max(4000),expected:productSchema}).optional()}).parse(await request.json());
 const row=await session.from('telegram_jobs').select('*').eq('owner_id',user.id).eq('id',body.id).maybeSingle();if(row.error)throw dbError(row.error);if(!row.data)throw new Error('FORBIDDEN: Agendamento indisponível neste canal.');
 const {db}=await publicationAdmin(user.id);
 let targetKey=row.data.destination_key;
 if(action==='reschedule'){
  if(!['queued','ready','blocked','failed'].includes(row.data.state)||row.data.message_ids?.length)throw new Error('Entrega concluída, parcial ou incerta não permite reagendamento.');
  if(!body.scheduledAt||Date.parse(body.scheduledAt)<=Date.now())throw new Error('Escolha uma nova data futura.');
  if(row.data.channel==='telegram'){const target=await telegramTarget(user.id,row.data.brand_id,true);if(target.key!==targetKey)throw new Error('O destino ou bot mudou. Confira a configuração.');targetKey=target.key;}
  if(body.repair&&(row.data.shopee_offer_id||row.data.publication_mode==='official'))throw new Error('Revise este agendamento na automação Shopee existente.');
  if(row.data.publication_mode!=='official'){
   const product=body.repair?.expected||productSchema.parse(row.data.snapshot),text=body.repair?.caption||row.data.caption;
   const issue=publicationCaptionError(text,product,body.repair?'verified':row.data.publication_mode);if(issue)throw new Error(issue);
  }
 }
 if(action==='cancel'&&body.repair)throw new Error('Solicitação inválida.');
 const r=body.repair?await db.rpc('dropou_schedule_review',{p_owner:user.id,p_actor:actorId,p_job:body.id,p_expected:body.repair.expected,p_before:body.repair.before,p_caption:body.repair.caption,p_at:body.scheduledAt,p_target_key:targetKey,p_confirmed:true}):await db.rpc('dropou_schedule_change',{p_owner:user.id,p_job:body.id,p_actor:actorId,p_action:action,p_at:body.scheduledAt||null});if(r.error)throw dbError(r.error);return Response.json(r.data);
}catch(e){return apiError(e);}}
export const PATCH=(request:Request)=>change(request,'reschedule');
export const DELETE=(request:Request)=>change(request,'cancel');
