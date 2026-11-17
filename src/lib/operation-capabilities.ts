import {isLocalOperation,type OperationScope} from './workspace-brands';

export const dedicatedTelegramBots={beleza:'TELEGRAM_BELEZA_BOT_TOKEN',casa:'TELEGRAM_CASA_BOT_TOKEN',natal:'TELEGRAM_NATAL_BOT_TOKEN'} as const;
export const legacyTelegramBots=['TELEGRAM_BOT_TOKEN','TELEGRAM_CELULARES_BOT_TOKEN','TELEGRAM_TENIS_BOT_TOKEN','TELEGRAM_AUTOMOTO_BOT_TOKEN'] as const;
export const telegramBotEnvs=[...legacyTelegramBots,...Object.values(dedicatedTelegramBots)] as const;
export type OperationCapability='telegramManual'|'telegramSchedule'|'automaticPublishing'|'mtproto'|'whatsappDestination';
export function operationSupports(operation:OperationScope|string,capability:OperationCapability){
 if(operation==='all')return false;
 if(isLocalOperation(operation))return capability==='telegramManual'||capability==='telegramSchedule';
 return ['dropou','bruto','moda','celulares','tenis','automoto'].includes(operation);
}
export function telegramBotAllowed(operation:string,env:string){
 return operation in dedicatedTelegramBots?dedicatedTelegramBots[operation as keyof typeof dedicatedTelegramBots]===env:legacyTelegramBots.includes(env as typeof legacyTelegramBots[number]);
}
