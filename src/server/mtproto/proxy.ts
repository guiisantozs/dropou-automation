import 'server-only';
import {MtprotoFailure,workerOrigin} from './security';
import type {Scope} from './store';
import type {MtprotoCommand} from '../../lib/telegram-mtproto';
import {mtprotoErrors} from '../../lib/telegram-mtproto';

export async function mtprotoWorker(scope:Scope,command:MtprotoCommand){
 const origin=workerOrigin(process.env.TELEGRAM_MTPROTO_WORKER_URL),secret=process.env.TELEGRAM_MTPROTO_WORKER_SECRET||'';
 if(secret.length<32)throw new MtprotoFailure('unavailable');
 let result:Response;
 try{result=await fetch(origin+'/command',{method:'POST',headers:{Authorization:'Bearer '+secret,'Content-Type':'application/json'},body:JSON.stringify({scope,command}),cache:'no-store',redirect:'error',signal:AbortSignal.timeout(25000)});}catch{throw new MtprotoFailure('unavailable');}
 const data=await result.json().catch(()=>null);
 if(!result.ok)throw new MtprotoFailure(typeof data?.code==='string'&&data.code in mtprotoErrors?data.code:'unavailable',Number.isSafeInteger(data?.retryAfter)?data.retryAfter:0);
 // Worker responses are deliberately small. Session material is never returned by its handlers.
 return data;
}
