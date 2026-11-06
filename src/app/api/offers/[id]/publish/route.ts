import {sessionDb,apiError,dbError} from '@/server/session';
import {z} from 'zod';
import {publicationCaptionError} from '@/lib/publication-copy';
import {productSchema} from '@/lib/domain';
import {adminDb} from '@/server/db';
import {publicationDbError} from '@/server/telegram-offer';
export async function POST(request:Request,context:{params:Promise<{id:string}>}){try{
 const {db,user}=await sessionDb(request),id=z.string().uuid().parse((await context.params).id),{destination,caption,mode,sourceCaption,republicationKey}=z.object({destination:z.string().trim().min(2).max(120),confirmed:z.literal(true),caption:z.string().min(1).max(4000),sourceCaption:z.string().min(1).max(4000),mode:z.enum(['safe','verified']),republicationKey:z.string().uuid().optional()}).parse(await request.json());
 const row=await db.from('offers').select('caption,snapshot').eq('id',id).eq('owner_id',user.id).single();if(row.error)throw dbError(row.error);
 const issue=publicationCaptionError(caption,productSchema.parse(row.data.snapshot),mode);if(issue)throw new Error(issue);
 const {data,error}=await db.rpc(republicationKey?'dropou_publication_manual_round':'dropou_publication_manual_v2',{p_offer:id,p_destination:destination,p_caption:caption,p_mode:mode,p_source:sourceCaption,...(republicationKey?{p_intent:republicationKey}:{})});if(error)throw publicationDbError(error);
 let queueUpdated=false;
 try{const queue=await adminDb().from('telegram_jobs').update({state:'sent',sent_at:data.published_at,destination_title:data.destination}).eq('offer_id',id).eq('owner_id',user.id).eq('channel','whatsapp').in('state',['ready','queued','blocked']);queueUpdated=!queue.error;}catch{/* The confirmed publication remains authoritative if the optional queue sync is unavailable. */}
 return Response.json({publication:data,queueUpdated});
}catch(e){return apiError(e);}}
