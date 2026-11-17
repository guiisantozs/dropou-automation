import {createHash} from 'node:crypto';
import {dedicatedTelegramBots,telegramBotAllowed} from '../lib/operation-capabilities';
import type {TelegramTarget} from './telegram-core';

export function telegramOperationConfig(settings:{telegram_bot_env?:string;telegram_chat_id?:string|null;telegram_bot_username?:string|null},brand:string,env:Record<string,string|undefined>){
 const bot=settings.telegram_bot_env||'TELEGRAM_BOT_TOKEN';
 if(!telegramBotAllowed(brand,bot))throw new Error('Selecione o bot exclusivo desta operação em Configurações.');
 const chat=settings.telegram_chat_id||(brand==='dropou'?(env.TELEGRAM_CHAT_ID||env.TELEGRAM_CHANNEL_ID):null);
 if(!chat)throw new Error('Configure o canal Telegram desta marca em Configurações.');
 const token=env[bot];if(!token)throw new Error('Token do bot não configurado no servidor: '+bot+'.');
 return {TELEGRAM_BOT_TOKEN:token,TELEGRAM_CHAT_ID:chat,TELEGRAM_CHANNEL_ID:chat,TELEGRAM_EXPECTED_BOT_USERNAME:settings.telegram_bot_username||undefined,DROPOU_TARGET_SETTING:settings.telegram_chat_id||'',DROPOU_BOT_SETTING:bot};
}
export function bindTelegramTarget(target:TelegramTarget,owner:string,brand:string,env:Record<string,string|undefined>):TelegramTarget{
 return brand in dedicatedTelegramBots?{...target,key:createHash('sha256').update(JSON.stringify([owner,brand,env.DROPOU_BOT_SETTING,env.TELEGRAM_BOT_TOKEN,target.id])).digest('hex')}:target;
}
