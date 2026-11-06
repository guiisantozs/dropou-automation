import 'server-only';
import {resolveTelegramTarget,sendTelegramTo,TelegramTarget} from './telegram-core';
let cached:{target:TelegramTarget;expires:number;config:string}|undefined;
export async function telegramTarget(){
 const config=[process.env.TELEGRAM_BOT_TOKEN,process.env.TELEGRAM_CHAT_ID,process.env.TELEGRAM_CHANNEL_ID].join('|');
 if(cached&&cached.config===config&&cached.expires>Date.now())return cached.target;
 const target=await resolveTelegramTarget(process.env);cached={target,config,expires:Date.now()+60000};return target;
}
export async function sendTelegram(text:string,image?:string){return (await sendTelegramTo(process.env,await telegramTarget(),text,image)).join(',');}
