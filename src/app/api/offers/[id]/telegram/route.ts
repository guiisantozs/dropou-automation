import {sessionDb,apiError} from '@/server/session';
import {publishTelegram} from '@/server/telegram-offer';
import {z} from 'zod';
export async function POST(request:Request,context:{params:Promise<{id:string}>}){try{
 const {user}=await sessionDb(request),id=z.string().uuid().parse((await context.params).id);
 const body=z.object({caption:z.string().min(1).max(4000),targetKey:z.string().length(64),confirmed:z.literal(true)}).parse(await request.json());
 return Response.json(await publishTelegram(user.id,id,body.caption,body.targetKey));
}catch(e){return apiError(e);}}
