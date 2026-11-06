import {z} from 'zod';
import {sessionDb,apiError,dbError} from '@/server/session';
import {adminDb} from '@/server/db';
export async function POST(request:Request,context:{params:Promise<{id:string}>}){try{
 const {user}=await sessionDb(request),id=z.string().uuid().parse((await context.params).id),body=z.object({channel:z.enum(['telegram','whatsapp']),requestKey:z.string().uuid(),confirmed:z.literal(true)}).parse(await request.json());
 const result=await adminDb().rpc('dropou_prepare_republication',{p_owner:user.id,p_offer:id,p_channel:body.channel,p_request:body.requestKey});if(result.error)throw dbError(result.error);return Response.json({intent:{id:result.data.id,channel:result.data.channel}});
}catch(e){return apiError(e);}}
