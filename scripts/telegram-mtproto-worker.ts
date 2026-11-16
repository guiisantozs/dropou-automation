// Dedicated persistent process; never imported by Next routes or the publication dispatcher.
import {randomUUID} from 'node:crypto';
import {performance} from 'node:perf_hooks';
import {createClient} from '@supabase/supabase-js';
import {MtprotoFailure} from '../src/server/mtproto/security';
import {workerConfiguration,WorkerConfigurationFailure} from '../src/server/mtproto/config';
import {mtprotoHttpServer} from '../src/server/mtproto/http';
import {GramAccountClient} from '../src/server/mtproto/adapter';
import {DatabaseMtprotoStore,checked,type ConnectionRow} from '../src/server/mtproto/store';
import {MtprotoService} from '../src/server/mtproto/service';
import {PersistentMirrorOffers} from '../src/server/mtproto/persistent-offers';
import {mtprotoAffiliateConverter} from '../src/server/mtproto/shopee-affiliate';

async function main(){
 const config=workerConfiguration(process.env,process.argv.includes('--diagnostic'));
 const {apiId,apiHash,secret,key,host,port}=config;
 if(config.diagnostic){
  const server=mtprotoHttpServer({secret,ready:()=>false,diagnostic:true,command:async()=>{throw new MtprotoFailure('diagnostic_only');}});
  await new Promise<void>((resolve,reject)=>{server.once('error',reject);server.listen(port,host,resolve);});
  console.info('Worker MTProto em diagnóstico local. HTTP privado ativo; login e banco desabilitados.');
  const shutdown=()=>{server.close(()=>process.exit(0));server.closeIdleConnections();};
  process.on('SIGINT',shutdown);process.on('SIGTERM',shutdown);return;
 }
 const db=createClient(config.url!,config.dbKey!,{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:(input,init)=>fetch(input,{...init,signal:AbortSignal.timeout(10000)})}});
 const holder=randomUUID();let deadline=0,shuttingDown=false,renewing=false,ticking=false;
 const active=()=>!shuttingDown&&performance.now()<deadline;
 const offers=new PersistentMirrorOffers(db,holder,active,mtprotoAffiliateConverter(db));
 await offers.ready(); // Fail before restoring accounts if the new schema is absent.
 const service=new MtprotoService(new DatabaseMtprotoStore(db,holder),key,(s,p)=>new GramAccountClient(s,apiId,apiHash,p),active,()=>Date.now(),offers);
 async function renew(){
  if(renewing)return;renewing=true;const started=performance.now();
  try{const granted=checked(await db.rpc('dropou_mtproto_lease',{p_holder:holder}));if(!granted)throw new MtprotoFailure('lease');deadline=started+20000;}
  catch{const wasRunning=deadline>0;deadline=0;await service.closeAll();if(wasRunning){console.error('Worker MTProto perdeu a exclusividade. Reinício seguro necessário.');process.exit(1);}}
  finally{renewing=false;}
 }
 await renew();if(!active())throw new MtprotoFailure('lease');
 const server=mtprotoHttpServer({secret,ready:active,command:(scope,command)=>service.command(scope,command)});
 await new Promise<void>((resolve,reject)=>{server.once('error',reject);server.listen(port,host,resolve);});
 async function tick(){
  if(ticking||!active())return;ticking=true;
  try{
   offers.prune();
   const rows=checked(await db.from('telegram_mtproto_connections').select('*').in('status',['connected','code','password','error']).limit(200));
   for(const row of rows as ConnectionRow[]){if(!active())break;await service.maintain(row);}
   await offers.drain();
   checked(await db.from('telegram_mtproto_diagnostics').delete().lt('received_at',new Date(Date.now()-3600000).toISOString()));
  }catch{/* No provider payload, credentials or personal data in process logs. */}
  finally{ticking=false;}
 }
 const renewTimer=setInterval(()=>{void renew();},5000),tickTimer=setInterval(()=>{void tick();},15000);
 // Stop sockets promptly if the DB heartbeat stalls, before the 30-second DB lease can transfer.
 const fenceTimer=setInterval(()=>{if(!active())void service.closeAll();},1000);
 await tick();console.info('MTProto worker pronto. Nenhum envio ou histórico habilitado.');
 async function shutdown(){if(shuttingDown)return;shuttingDown=true;deadline=0;clearInterval(renewTimer);clearInterval(tickTimer);clearInterval(fenceTimer);server.close();await service.closeAll();await db.rpc('dropou_mtproto_lease',{p_holder:holder,p_release:true});process.exit(0);}
 process.on('SIGINT',()=>{void shutdown();});process.on('SIGTERM',()=>{void shutdown();});
}
main().catch(error=>{console.error(error instanceof WorkerConfigurationFailure?'Worker MTProto não iniciou. Configuração ausente/inválida: '+error.fields.join(', ')+'.':'Worker MTProto não iniciou. Confira configuração, migração e exclusividade do worker.');process.exitCode=1;});
