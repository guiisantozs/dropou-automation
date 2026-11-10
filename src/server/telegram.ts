import 'server-only';
import {resolveTelegramTarget,sendTelegramTo,TelegramTarget} from './telegram-core';
import {adminDb} from './db';
import {operationSettings} from './operations';
import type {OperationId} from '@/lib/workspace-brands';
const cached=new Map<string,{target:TelegramTarget;expires:number}>();
export async function operationTelegramEnv(owner:string,brand:OperationId){const settings=await operationSettings(adminDb(),owner,brand);const chat=settings.telegram_chat_id||(brand==='dropou'?(process.env.TELEGRAM_CHAT_ID||process.env.TELEGRAM_CHANNEL_ID):null);if(!chat)throw new Error('Configure o canal Telegram desta marca em Configurações.');return {...process.env,TELEGRAM_CHAT_ID:chat,TELEGRAM_CHANNEL_ID:chat,DROPOU_TARGET_SETTING:settings.telegram_chat_id||''};}
export async function telegramTarget(owner?:string,brand:OperationId='dropou',force=false){
 const env:Record<string,string|undefined>=owner?await operationTelegramEnv(owner,brand):process.env;
 const key=[owner||'',brand,env.TELEGRAM_BOT_TOKEN,env.TELEGRAM_CHAT_ID,env.TELEGRAM_CHANNEL_ID].join('|');
 const previous=cached.get(key);if(!force&&previous&&previous.expires>Date.now())return previous.target;
 const target=await resolveTelegramTarget(env);cached.set(key,{target,expires:Date.now()+60000});
 if(owner){let update=adminDb().from('operation_settings').update({telegram_title:target.title,telegram_verified_at:new Date().toISOString()}).eq('owner_id',owner).eq('brand_id',brand);update=env.DROPOU_TARGET_SETTING?update.eq('telegram_chat_id',env.DROPOU_TARGET_SETTING):update.is('telegram_chat_id',null);const r=await update.select('brand_id');if(r.error||r.data.length!==1)throw new Error('Não foi possível registrar a verificação do canal.');}
 return target;
}
export async function sendTelegram(text:string,image?:string){return (await sendTelegramTo(process.env,await telegramTarget(),text,image)).join(',');}
