import {z} from 'zod';
import {sessionDb,apiError,dbError} from '@/server/session';
import {publicationAdmin,queuePublication} from '@/server/telegram-offer';
export async function POST(request:Request,context:{params:Promise<{id:string}>}){try{
 const {user}=await sessionDb(request),id=z.string().uuid().parse((await context.params).id);
 const body=z.object({scheduledAt:z.string().datetime(),channel:z.enum(['telegram','whatsapp']),caption:z.string().min(1).max(4000),targetKey:z.string().optional(),mode:z.enum(['safe','verified']),sourceCaption:z.string().min(1).max(4000),allowSafe:z.literal(true)}).parse(await request.json());
 if(Date.parse(body.scheduledAt)<=Date.now())throw new Error('Escolha um horário futuro em America/Bahia.');
 const job=await queuePublication(user.id,id,body.channel,body.scheduledAt,body.caption,body.targetKey,body.mode,body.sourceCaption,true);return Response.json({job});
}catch(e){return apiError(e);}}
export async function DELETE(request:Request,context:{params:Promise<{id:string}>}){try{
 const {user}=await sessionDb(request),{db}=await publicationAdmin(user.id),id=z.string().uuid().parse((await context.params).id);
 const result=await db.rpc('dropou_publication_cancel',{p_owner:user.id,p_offer:id});if(result.error)throw dbError(result.error);return Response.json({ok:true});
}catch(e){return apiError(e);}}
