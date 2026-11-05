import 'server-only';
export async function sendTelegram(text:string){
  const token=process.env.TELEGRAM_BOT_TOKEN,chat=process.env.TELEGRAM_CHAT_ID;
  if(!token||!chat)throw new Error('Configure o bot e o canal no servidor');
  // Never log this URL: the Bot API includes its credential in the path.
  const response=await fetch(`https://api.telegram.org/bot${token}/sendMessage`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({chat_id:chat,text}),signal:AbortSignal.timeout(15000)});
  const result=await response.json();
  if(!response.ok||!result.ok)throw new Error('Telegram não confirmou a publicação. Revise o canal antes de tentar novamente.');
  return String(result.result.message_id);
}
