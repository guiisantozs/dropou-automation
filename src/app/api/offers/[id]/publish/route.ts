import {sessionDb,apiError,dbError} from '@/server/session';
import {z} from 'zod';
import {captionError} from '@/lib/caption-editor';
import {productSchema} from '@/lib/domain';
import {adminDb} from '@/server/db';
export async function POST(request:Request,context:{params:Promise<{id:string}>}){try{
 const {db,user}=await sessionDb(request),id=z.string().uuid().parse((await context.params).id),{destination}=z.object({destination:z.string().trim().min(2).max(120),confirmed:z.literal(true)}).parse(await request.json());
 const row=await db.from('offers').select('caption,snapshot').eq('id',id).eq('owner_id',user.id).single();if(row.error)throw dbError(row.error);
 const issue=captionError(row.data.caption,productSchema.parse(row.data.snapshot));if(issue)throw new Error(issue);
 const {data,error}=await db.rpc('dropou_publication_manual',{p_offer:id,p_destination:destination});if(error)throw dbError(error);
 let queueUpdated=false;
 try{const queue=await adminDb().from('telegram_jobs').update({state:'sent',sent_at:data.published_at,destination_title:data.destination}).eq('offer_id',id).eq('owner_id',user.id).eq('channel','whatsapp').in('state',['ready','queued','blocked']);queueUpdated=!queue.error;}catch{/* The confirmed publication remains authoritative if the optional queue sync is unavailable. */}
 return Response.json({publication:data,queueUpdated});
}catch(e){return apiError(e);}}
