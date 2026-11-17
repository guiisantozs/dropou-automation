import {operationSupports} from '@/lib/operation-capabilities';
import {sessionDb,apiError,dbError} from '@/server/session';
import {publicationAdmin} from '@/server/telegram-offer';
import {operationSettingsSchema} from '@/lib/operation-settings';
import {telegramConnectionSchema} from '@/lib/telegram-connection';
import {firstName} from '@/lib/dashboard-access';
import {telegramTarget,operationTelegramEnv} from '@/server/telegram';
import {sendTelegramTo} from '@/server/telegram-core';
export async function GET(request:Request){try{const {db,user,access}=await sessionDb(request);const r=await db.from('operation_settings').select(new URL(request.url).searchParams.get('summary')==='true'?'brand_id,display_name':'*').eq('owner_id',user.id).order('brand_id');if(r.error)throw dbError(r.error);return Response.json({access,profile:{firstName:firstName(access.displayName||user.user_metadata?.first_name||user.user_metadata?.full_name||user.user_metadata?.name)},operations:r.data},{headers:{'Cache-Control':'no-store'}});}catch(e){return apiError(e);}}
export async function PATCH(request:Request){try{
 const {user,operation}=await sessionDb(request),{db}=await publicationAdmin(user.id),body=operationSettingsSchema.parse(await request.json());
 if(!operationSupports(body.brand_id,'whatsappDestination')&&(body.whatsapp_name||body.whatsapp_url))throw new Error('FORBIDDEN: As integrações desta marca ainda não estão disponíveis.');
 if(operation!=='all'&&operation!==body.brand_id)throw new Error('Selecione a marca correta para configurar.');
 const old=await db.from('operation_settings').select('telegram_chat_id,telegram_bot_env').eq('owner_id',user.id).eq('brand_id',body.brand_id).single();if(old.error)throw dbError(old.error);
 const changed=old.data.telegram_chat_id!==body.telegram_chat_id||old.data.telegram_bot_env!==body.telegram_bot_env;
 const r=await db.from('operation_settings').update({...body,updated_at:new Date().toISOString(),...(changed?{telegram_title:null,telegram_verified_at:null}:{})}).eq('owner_id',user.id).eq('brand_id',body.brand_id).select().single();if(r.error)throw dbError(r.error);
 return Response.json({operation:r.data});
 }catch(e){return apiError(e);}}
export async function POST(request:Request){try{
 const {user,access,actorId,operation}=await sessionDb(request);if(!access.admin)throw new Error('FORBIDDEN: Somente administradores testam integrações.');
 const {db}=await publicationAdmin(user.id),body=telegramConnectionSchema.parse(await request.json());
 if(!operationSupports(body.brand,'telegramManual'))throw new Error('FORBIDDEN: Telegram indisponível nesta operação.');
 if(operation!=='all'&&operation!==body.brand)throw new Error('FORBIDDEN: Selecione a operação correspondente.');
 const target=await telegramTarget(user.id,body.brand,true);
 if(body.action==='test'){
  if(body.confirmation!=='ENVIAR TESTE'||!body.requestId)throw new Error('Confirme explicitamente o envio do teste ao canal salvo.');
  if(!operationSupports(body.brand,'automaticPublishing')&&body.targetKey!==target.key)throw new Error('O bot ou canal mudou. Verifique a conexão e confirme novamente.');
  const reserved=await db.from('operation_audit').insert({id:body.requestId,owner_id:user.id,actor_id:actorId,brand_id:body.brand,action:'Teste Telegram autorizado',detail:{destination:target.id}});
  if(reserved.error)throw new Error('Este teste já foi solicitado ou não pôde ser reservado. Confira o canal antes de repetir.');
  const ids=await sendTelegramTo(await operationTelegramEnv(user.id,body.brand),target,'Teste de conexão Dropou · '+target.title+'\nO bot está conectado a este destino.',undefined,fetch,async()=>{},async()=>{const latest=await telegramTarget(user.id,body.brand,true);if(latest.key!==target.key)throw new Error('O destino mudou durante o teste.');},{mediaMode:'text'});
  return Response.json({telegram:{available:true,...target},messageIds:ids,sentAt:new Date().toISOString()});
 }
 return Response.json({telegram:{available:true,...target}});
}catch(e){return apiError(e);}}
