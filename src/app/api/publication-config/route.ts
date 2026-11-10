import {sessionDb,apiError,dbError} from '@/server/session';
import {publicationAdmin} from '@/server/telegram-offer';
import {operationSettings} from '@/server/operations';
import {createHash} from 'node:crypto';
import {z} from 'zod';
export async function GET(request:Request){try{
 const {user,operation}=await sessionDb(request),{db}=await publicationAdmin(user.id);
 if(operation==='all')return Response.json({enabled:false,telegram:{available:false,reason:'Selecione uma marca para configurar ou publicar.'}});
 const s=await operationSettings(db,user.id,operation),id=s.telegram_chat_id||(operation==='dropou'?(process.env.TELEGRAM_CHAT_ID||process.env.TELEGRAM_CHANNEL_ID):null);
 const available=!!id&&!!s.telegram_verified_at;
 return Response.json({enabled:s.automation_enabled,telegram:available?{available:true,id,title:s.telegram_title,key:createHash('sha256').update(id).digest('hex')}:{available:false,reason:'Configure e verifique o canal desta marca em Configurações.'},whatsapp:{name:s.whatsapp_name,url:s.whatsapp_url},timezone:'America/Bahia'},{headers:{'Cache-Control':'no-store'}});
}catch(e){return apiError(e);}}
export async function PATCH(request:Request){try{
 const {user,operation}=await sessionDb(request);if(operation==='all')throw new Error('Selecione uma marca para ativar a rotina.');
 const {db}=await publicationAdmin(user.id),{enabled}=z.object({enabled:z.boolean()}).parse(await request.json());
 const r=await db.rpc('dropou_set_operation_automation',{p_owner:user.id,p_brand:operation,p_enabled:enabled});if(r.error)throw dbError(r.error);return Response.json(r.data);
}catch(e){return apiError(e);}}
