import {sessionDb,apiError,dbError} from '@/server/session';
import {publicationAdmin} from '@/server/telegram-offer';
import {operationSettingsSchema} from '@/lib/operation-settings';
import {operationSchema} from '@/lib/workspace-brands';
import {telegramTarget} from '@/server/telegram';
import {z} from 'zod';
export async function GET(request:Request){try{const {db,user}=await sessionDb(request);const r=await db.from('operation_settings').select(new URL(request.url).searchParams.get('summary')==='true'?'brand_id,display_name':'*').eq('owner_id',user.id).order('brand_id');if(r.error)throw dbError(r.error);return Response.json({operations:r.data},{headers:{'Cache-Control':'no-store'}});}catch(e){return apiError(e);}}
export async function PATCH(request:Request){try{
 const {user,operation}=await sessionDb(request),{db}=await publicationAdmin(user.id),body=operationSettingsSchema.parse(await request.json());
 if(operation!=='all'&&operation!==body.brand_id)throw new Error('Selecione a marca correta para configurar.');
 const old=await db.from('operation_settings').select('telegram_chat_id').eq('owner_id',user.id).eq('brand_id',body.brand_id).single();if(old.error)throw dbError(old.error);
 const changed=old.data.telegram_chat_id!==body.telegram_chat_id;
 const r=await db.from('operation_settings').update({...body,updated_at:new Date().toISOString(),...(changed?{telegram_title:null,telegram_verified_at:null}:{})}).eq('owner_id',user.id).eq('brand_id',body.brand_id).select().single();if(r.error)throw dbError(r.error);
 return Response.json({operation:r.data});
 }catch(e){return apiError(e);}}
export async function POST(request:Request){try{const {user}=await sessionDb(request);await publicationAdmin(user.id);const {brand}=z.object({brand:operationSchema}).parse(await request.json());const target=await telegramTarget(user.id,brand,true);return Response.json({telegram:{available:true,...target}});}catch(e){return apiError(e);}}
