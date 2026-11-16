import {encryptionKey} from './security';

export class WorkerConfigurationFailure extends Error {
 constructor(public fields:string[]){super('worker_configuration');}
}
export function workerConfiguration(env:Record<string,string|undefined>,diagnostic=false){
 const invalid:string[]=[],apiId=Number(env.TELEGRAM_MTPROTO_API_ID),apiHash=env.TELEGRAM_MTPROTO_API_HASH||'',secret=env.TELEGRAM_MTPROTO_WORKER_SECRET||'';
 if(!Number.isSafeInteger(apiId)||apiId<=0)invalid.push('TELEGRAM_MTPROTO_API_ID');
 if(!/^[a-f0-9]{32}$/i.test(apiHash))invalid.push('TELEGRAM_MTPROTO_API_HASH');
 if(secret.length<32)invalid.push('TELEGRAM_MTPROTO_WORKER_SECRET');
 let key:Buffer|undefined;try{key=encryptionKey(env.TELEGRAM_MTPROTO_SESSION_KEY);}catch{invalid.push('TELEGRAM_MTPROTO_SESSION_KEY');}
 const host=env.TELEGRAM_MTPROTO_WORKER_HOST||'127.0.0.1',port=Number(env.PORT||env.TELEGRAM_MTPROTO_WORKER_PORT||8081);
 if(!Number.isSafeInteger(port)||port<1||port>65535)invalid.push('TELEGRAM_MTPROTO_WORKER_PORT ou PORT');
 if(diagnostic&&!['127.0.0.1','::1','localhost'].includes(host))invalid.push('TELEGRAM_MTPROTO_WORKER_HOST (diagnóstico exige loopback)');
 const url=env.SUPABASE_URL||env.NEXT_PUBLIC_SUPABASE_URL,dbKey=env.SUPABASE_SECRET_KEY||env.SUPABASE_SERVICE_ROLE_KEY;
 if(!diagnostic){
  if(!url)invalid.push('SUPABASE_URL ou NEXT_PUBLIC_SUPABASE_URL');
  if(!dbKey)invalid.push('SUPABASE_SECRET_KEY ou SUPABASE_SERVICE_ROLE_KEY');
 }
 if(invalid.length)throw new WorkerConfigurationFailure(invalid);
 return {apiId,apiHash,secret,key:key!,host,port,url,dbKey,diagnostic};
}
