import {sessionDb,apiError,dbError} from '@/server/session';
import {publicationAdmin} from '@/server/telegram-offer';
import {telegramTarget} from '@/server/telegram';
import {z} from 'zod';
export async function GET(request:Request){try{
 const {user}=await sessionDb(request),{enabled}=await publicationAdmin(user.id);
 let telegram;try{telegram={available:true,...await telegramTarget()};}catch(e){telegram={available:false,reason:(e as Error).message};}
 return Response.json({enabled,telegram,timezone:'America/Bahia'},{headers:{'Cache-Control':'no-store'}});
}catch(e){return apiError(e);}}
export async function PATCH(request:Request){try{
 const {user}=await sessionDb(request),{db}=await publicationAdmin(user.id),{enabled}=z.object({enabled:z.boolean()}).parse(await request.json());
 const r=await db.rpc('dropou_set_automation',{p_owner:user.id,p_enabled:enabled});if(r.error)throw dbError(r.error);
 return Response.json(r.data);
}catch(e){return apiError(e);}}
