import {z} from 'zod';
import {sessionDb,apiError,dbError} from '@/server/session';
import {captionError} from '@/lib/caption-editor';
import {productSchema} from '@/lib/domain';
export async function POST(request:Request,context:{params:Promise<{id:string}>}){try{
 const {db,user}=await sessionDb(request),id=z.string().uuid().parse((await context.params).id);
 const {scheduledAt}=z.object({scheduledAt:z.string().datetime()}).parse(await request.json());
 const row=await db.from('offers').select('snapshot,caption').eq('id',id).eq('owner_id',user.id).single();
 if(row.error)throw dbError(row.error);
 const issue=captionError(row.data.caption,productSchema.parse(row.data.snapshot));if(issue)throw new Error(issue);
 // Every scheduled offer remains human-reviewed unless a specific authorized refresh is enabled.
 const {error}=await db.rpc('dropou_economy_schedule_offer',{p_offer:id,p_at:scheduledAt,p_human:process.env.MERCADO_LIVRE_LOOKUP_APPROVED!=='true'||row.data.snapshot.store!=='Mercado Livre'||!row.data.snapshot.source||row.data.snapshot.dataOrigin==='screenshot'});
 if(error)throw dbError(error);return Response.json({ok:true});
}catch(e){return apiError(e);}}
