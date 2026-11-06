import {z} from 'zod';
import {sessionDb,apiError} from '@/server/session';
import {publishTelegram} from '@/server/telegram-offer';
export async function POST(request:Request,context:{params:Promise<{id:string}>}){try{
 const {user}=await sessionDb(request),id=z.string().uuid().parse((await context.params).id);
 const messageId=await publishTelegram(user.id,id);return Response.json({messageId});
}catch(e){return apiError(e);}}
