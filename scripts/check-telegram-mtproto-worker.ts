// Loopback HTTP check only. Never submits phone, code, password, session or a valid account command.
import {workerConfiguration,WorkerConfigurationFailure} from '../src/server/mtproto/config';
import {workerOrigin} from '../src/server/mtproto/security';

async function main(){
 const config=workerConfiguration(process.env,true),origin=workerOrigin(process.env.TELEGRAM_MTPROTO_WORKER_URL);
 const url=new URL(origin);
 if(url.protocol!=='http:'||!['127.0.0.1','localhost','[::1]'].includes(url.hostname))throw new Error('local_only');
 const call=(path:string,authorization?:string,method='GET',body?:string)=>fetch(origin+path,{method,headers:{...(authorization?{Authorization:authorization}:{}),...(body?{'Content-Type':'application/json'}:{})},body,redirect:'error',cache:'no-store',signal:AbortSignal.timeout(5000)});
 const unauthorized=await call('/health');if(unauthorized.status!==401)throw new Error('authorization');
 const wrongSecret=await call('/health','Bearer invalid-diagnostic-credential');if(wrongSecret.status!==401)throw new Error('authorization');
 const health=await call('/health','Bearer '+config.secret),data=await health.json();
 if(health.status!==200||data.mode!=='diagnostic'||data.ready!==false||data.transportReady!==true||data.accountLoginEnabled!==false||data.databaseReady!==false)throw new Error('not_diagnostic');
 const blocked=await call('/command','Bearer '+config.secret,'POST','{}'),result=await blocked.json();
 if(blocked.status!==503||result.code!=='diagnostic_only')throw new Error('command_enabled');
 console.info('HTTP privado local: OK (200 com segredo correto).');
 console.info('Proteção de acesso: OK (401 sem segredo e com segredo incorreto).');
 console.info('Comandos de conta: bloqueados (503 diagnostic_only).');
 console.info('Prontidão para login real: não; banco e Telegram desabilitados neste modo.');
}
main().catch(error=>{console.error(error instanceof WorkerConfigurationFailure?'Configuração local inválida: '+error.fields.join(', ')+'.':'Falha na verificação HTTP local. Confira se o worker iniciou com --diagnostic e a URL privada está correta.');process.exitCode=1;});
