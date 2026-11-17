// Isolated world, installed only on the exact production origin. No credential access.
(()=>{
 const origin='https://dropou-automation.vercel.app',protocol='dropou-ml-v1';
 if(location.origin!==origin||window.top!==window)return;
 chrome.runtime.onMessage.addListener((message,sender,reply)=>{
  if(sender.id!==chrome.runtime.id||message?.protocol!==protocol||!['connect','receive'].includes(message.command))return;
  const id=crypto.randomUUID();let finished=false;
  const done=value=>{if(finished)return;finished=true;clearTimeout(timer);window.removeEventListener('message',listener);reply(value);};
  const listener=event=>{
   if(event.source!==window||event.origin!==origin||event.data?.protocol!==protocol||event.data?.direction!=='to-extension'||event.data.id!==id)return;
   const value=event.data.result;
   if(!value||typeof value.ok!=='boolean')return;
   // Forward a small allowlist; access tokens and arbitrary page data can never cross this bridge.
   if(!value.ok){done({ok:false,error:typeof value.error==='string'?value.error.slice(0,240):'A plataforma recusou a solicitação.'});return;}
   if(message.command==='connect'){
    if(!/^[a-f0-9-]{36}$/.test(value.connectionId)||!['dropou','bruto','moda','celulares','tenis','automoto'].includes(value.operation)||!Number.isFinite(value.expiresAt)||value.expiresAt>Date.now()+301000)return;
    done({ok:true,connectionId:value.connectionId,operation:value.operation,expiresAt:value.expiresAt});
   }else if(value.requestId===message.payload?.requestId&&['pending','existing'].includes(value.status))done({ok:true,requestId:value.requestId,status:value.status});
  };
  const timer=setTimeout(()=>done({ok:false,error:'Sem confirmação do Dropou. Abra a aba, entre e reconecte. O mesmo item pode ser reenviado com segurança.'}),message.command==='connect'?8000:40000);
  window.addEventListener('message',listener);
  window.postMessage({protocol,direction:'to-page',id,command:message.command,payload:message.payload,connectionId:message.connectionId},origin);
  return true;
 });
})();
