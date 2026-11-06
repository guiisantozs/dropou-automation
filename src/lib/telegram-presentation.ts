import type {Product} from './domain';
import {telegramText} from './telegram-text';
export type TelegramMediaMode='photo'|'link_preview'|'text';
export type TelegramPresentation={mediaMode:TelegramMediaMode;photoConfirmed:boolean};
export function telegramPresentationError(p:Product,options:TelegramPresentation){
 if(options.mediaMode==='photo'&&!p.imagePath&&!p.image)return 'Adicione uma foto para publicar com capa acima da legenda.';
 if(options.mediaMode==='photo'&&!options.photoConfirmed)return 'Confirme que a foto está autorizada e não contém condições comerciais não confirmadas.';
 return null;
}
export const telegramMessageCount=(text:string,mode:TelegramMediaMode)=>mode==='photo'&&telegramText(text).text.length>1024?2:1;
