import {telegramOperationConfig,bindTelegramTarget} from './telegram-operation-config';
import 'server-only';
import {createHash} from 'node:crypto';
import {resolveTelegramTarget,sendTelegramTo,TelegramTarget} from './telegram-core';
import {adminDb} from './db';
import {operationSettings} from './operations';
import type {OperationId} from '@/lib/workspace-brands';
const cached=new Map<string,{target:TelegramTarget;expires:number}>();
export async function operationTelegramEnv(owner:string,brand:OperationId){const settings=await operationSettings(adminDb(),owner,brand);return {...process.env,...telegramOperationConfig(settings,brand,process.env)};}
export async function telegramTarget(owner?:string,brand:OperationId='dropou',force=false){
 const env:Record<string,string|undefined>=owner?await operationTelegramEnv(owner,brand):process.env;
 const key=createHash('sha256').update(JSON.stringify([owner,brand,env.TELEGRAM_BOT_TOKEN,env.TELEGRAM_CHAT_ID,env.TELEGRAM_EXPECTED_BOT_USERNAME])).digest('hex');
 const previous=cached.get(key);if(!force&&previous&&previous.expires>Date.now())return previous.target;
 const resolved=await resolveTelegramTarget(env);const target=owner?bindTelegramTarget(resolved,owner,brand,env):resolved;
 if(owner){let update=adminDb().from('operation_settings').update({telegram_chat_id:target.id,telegram_title:target.title,telegram_verified_at:new Date().toISOString()}).eq('owner_id',owner).eq('brand_id',brand).eq('telegram_bot_env',env.DROPOU_BOT_SETTING!);update=env.DROPOU_TARGET_SETTING?update.eq('telegram_chat_id',env.DROPOU_TARGET_SETTING):update.is('telegram_chat_id',null);const r=await update.select('brand_id');if(r.error||r.data.length!==1)throw new Error('Não foi possível registrar a verificação do canal.');}
 cached.set(key,{target,expires:Date.now()+60000});return target;
}
export async function sendTelegram(text:string,image?:string){return (await sendTelegramTo(process.env,await telegramTarget(),text,image)).join(',');}
