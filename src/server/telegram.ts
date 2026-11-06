import 'server-only';
import {telegramText} from '@/lib/telegram-text';
export async function sendTelegram(text:string,image?:string){
  const token=process.env.TELEGRAM_BOT_TOKEN,chat=process.env.TELEGRAM_CHAT_ID;
  if(!token||!chat)throw new Error('Configure o bot e o canal no servidor');
  const formatted=telegramText(text);
  // Never log this URL: the Bot API includes its credential in the path.
  const response=await fetch(`https://api.telegram.org/bot${token}/${image?'sendPhoto':'sendMessage'}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(image?{chat_id:chat,photo:image,caption:formatted.text,caption_entities:formatted.entities}:{chat_id:chat,...formatted}),signal:AbortSignal.timeout(15000)});
  const result=await response.json();
  if(!response.ok||!result.ok)throw new Error('Telegram não confirmou a publicação. Revise o canal antes de tentar novamente.');
  return String(result.result.message_id);
}
