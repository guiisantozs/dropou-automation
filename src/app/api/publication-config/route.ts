import {operationSupports} from '@/lib/operation-capabilities';
import {telegramOperationConfig,bindTelegramTarget} from '@/server/telegram-operation-config';
import {sessionDb,apiError,dbError} from '@/server/session';
import {publicationAdmin} from '@/server/telegram-offer';
import {operationSettings} from '@/server/operations';
import {createHash} from 'node:crypto';
import {z} from 'zod';
import {telegramTarget} from '@/server/telegram';
export async function GET(request:Request){try{
 const {user,operation}=await sessionDb(request),{db}=await publicationAdmin(user.id);
 if(operation==='all')return Response.json({enabled:false,telegram:{available:false,reason:'Selecione uma marca para configurar ou publicar.'}});
 const s=await operationSettings(db,user.id,operation);let id=s.telegram_chat_id||(operation==='dropou'?(process.env.TELEGRAM_CHAT_ID||process.env.TELEGRAM_CHANNEL_ID):null),verificationError='';
 let env:Record<string,string|undefined>={},tokenError='';try{env=telegramOperationConfig(s,operation,process.env);}catch(e){tokenError=(e as Error).message;}const tokenPresent=!!env.TELEGRAM_BOT_TOKEN;
 if(id&&tokenPresent&&!s.telegram_verified_at){try{const t=await telegramTarget(user.id,operation,true);id=t.id;s.telegram_title=t.title;s.telegram_verified_at=new Date().toISOString();}catch(e){verificationError=(e as Error).message;}}
 const available=!!id&&!!s.telegram_verified_at&&tokenPresent;
 return Response.json({enabled:s.automation_enabled,manualTelegramScheduling:!operationSupports(operation,'automaticPublishing'),slots:s.routine_slots,serverNow:new Date().toISOString(),telegram:available?{available:true,id,title:s.telegram_title||id,key:bindTelegramTarget({id,title:s.telegram_title||id,key:createHash('sha256').update(id).digest('hex')},user.id,operation,env).key}:{available:false,id:id||undefined,title:s.telegram_title||undefined,reason:verificationError||tokenError||(!tokenPresent?'Token do bot não configurado no servidor.':id?'O canal está salvo, mas a permissão do bot ainda precisa ser verificada.':'Configure o canal desta marca em Configurações.')},whatsapp:{name:s.whatsapp_name,url:s.whatsapp_url},timezone:'America/Bahia'},{headers:{'Cache-Control':'no-store'}});
}catch(e){return apiError(e);}}
export async function PATCH(request:Request){try{
 const {user,operation}=await sessionDb(request);if(!operationSupports(operation,'automaticPublishing'))throw new Error('FORBIDDEN: A automação permanece desativada nesta operação.');
 const {db}=await publicationAdmin(user.id),{enabled}=z.object({enabled:z.boolean()}).parse(await request.json());
 const r=await db.rpc('dropou_set_operation_automation',{p_owner:user.id,p_brand:operation,p_enabled:enabled});if(r.error)throw dbError(r.error);return Response.json(r.data);
}catch(e){return apiError(e);}}
