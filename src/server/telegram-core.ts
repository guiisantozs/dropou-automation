import {createHash} from 'node:crypto';
import {telegramText} from '../lib/telegram-text';
import type {TelegramMediaMode} from '../lib/telegram-presentation';
export type TelegramTarget={id:string;title:string;key:string};
export class TelegramFailure extends Error{
 constructor(message:string,public outcome:'failed'|'uncertain'|'partial',public ids:string[]=[]){super(message);}
}
export function telegramConfig(env:Record<string,string|undefined>){
 const token=env.TELEGRAM_BOT_TOKEN,chat=env.TELEGRAM_CHAT_ID||env.TELEGRAM_CHANNEL_ID;
 if(!token||!chat)throw new Error('Configure TELEGRAM_BOT_TOKEN e TELEGRAM_CHAT_ID (ou TELEGRAM_CHANNEL_ID) no servidor.');
 if(env.TELEGRAM_CHAT_ID&&env.TELEGRAM_CHANNEL_ID&&env.TELEGRAM_CHAT_ID!==env.TELEGRAM_CHANNEL_ID)throw new Error('Os dois canais Telegram configurados são diferentes. Corrija a configuração antes de publicar.');
 return {token,chat};
}
async function call(token:string,method:string,body:object,http:typeof fetch){
 let response:Response,data:any;
 try{response=await http(`https://api.telegram.org/bot${token}/${method}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(15000)});data=await response.json();}
 catch{throw new TelegramFailure('Resposta do Telegram desconhecida. Confira o canal; o envio não será repetido automaticamente.','uncertain');}
 if(!response.ok||data.ok!==true){
  if(data.ok===false&&Number(data.error_code)>=400&&Number(data.error_code)<500)throw new TelegramFailure(Number(data.error_code)===403?'O bot não tem permissão para publicar no canal. Configure-o como administrador.':'Telegram recusou a solicitação. Confira o canal, o conteúdo e as permissões.','failed');
  throw new TelegramFailure('O Telegram não confirmou o resultado. Revise o canal antes de repetir.','uncertain');
 }
 return data.result;
}
export async function resolveTelegramTarget(env:Record<string,string|undefined>,http:typeof fetch=fetch):Promise<TelegramTarget>{
 const {token,chat}=telegramConfig(env);
 const [me,target]=await Promise.all([call(token,'getMe',{},http),call(token,'getChat',{chat_id:chat},http)]);
 if(target.type!=='channel'||!target.id||typeof target.title!=='string'||!me.id)throw new Error('Configure um canal Telegram válido para o bot.');
 const member=await call(token,'getChatMember',{chat_id:String(target.id),user_id:me.id},http);
 if(member.status!=='creator'&&(member.status!=='administrator'||member.can_post_messages!==true))throw new Error('O bot precisa ser administrador com permissão de postar no canal.');
 const id=String(target.id);return {id,title:target.title,key:createHash('sha256').update(id).digest('hex')};
}
export async function sendTelegramTo(env:Record<string,string|undefined>,target:TelegramTarget,text:string,image?:string,http:typeof fetch=fetch,progress:(ids:string[])=>Promise<void>=async()=>{},beforeSend:()=>Promise<void>=async()=>{},options:{mediaMode?:TelegramMediaMode;previewUrl?:string}={}){
 const {token}=telegramConfig(env),formatted=telegramText(text),ids:string[]=[];
 const mediaMode=options.mediaMode||(image?'photo':'text');
 if(mediaMode==='photo'&&!image)throw new TelegramFailure('Adicione uma foto para publicar com capa acima da legenda.','failed');
 if(formatted.text.length>4096)throw new TelegramFailure('Legenda excede o limite de texto do Telegram.','failed');
 async function send(method:string,body:object){
  await beforeSend();
  const result=await call(token,method,{chat_id:target.id,...body},http);
  if(!Number.isSafeInteger(result?.message_id)||result.message_id<=0||String(result?.chat?.id)!==target.id)throw new TelegramFailure('Resposta de entrega inválida. Envio retido para revisão.','uncertain',ids);
  ids.push(String(result.message_id));await progress([...ids]);
 }
 try{
  if(mediaMode==='photo')await send('sendPhoto',{photo:image,show_caption_above_media:false,...(formatted.text.length<=1024?{caption:formatted.text,caption_entities:formatted.entities}:{})});
  if(mediaMode!=='photo'||formatted.text.length>1024)await send('sendMessage',{...formatted,link_preview_options:mediaMode==='link_preview'?{is_disabled:false,show_above_text:true,prefer_large_media:true,url:options.previewUrl}:{is_disabled:true},...(ids.length?{reply_parameters:{message_id:Number(ids[0])}}:{})});
  return ids;
 }catch(error){
  const e=error instanceof TelegramFailure?error:new TelegramFailure('Não foi possível registrar o recibo. Confira o canal antes de repetir.','uncertain');
  throw new TelegramFailure(ids.length?'Publicação parcial ou confirmação pendente. Confira as mensagens no canal; não reenvie automaticamente.':e.message,ids.length?'partial':e.outcome,ids);
 }
}
