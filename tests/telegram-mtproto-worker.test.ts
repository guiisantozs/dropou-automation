import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {mtprotoHttpServer} from '../src/server/mtproto/http';
import {workerConfiguration,WorkerConfigurationFailure} from '../src/server/mtproto/config';

function env(){return {TELEGRAM_MTPROTO_API_ID:'123456',TELEGRAM_MTPROTO_API_HASH:'a'.repeat(32),TELEGRAM_MTPROTO_SESSION_KEY:randomBytes(32).toString('base64'),TELEGRAM_MTPROTO_WORKER_SECRET:randomBytes(32).toString('hex')};}
test('worker diagnostic config validates secrets, restricts binding to loopback and never silently enables normal mode',()=>{
 const values=env();assert.equal(workerConfiguration(values,true).diagnostic,true);
 assert.throws(()=>workerConfiguration(values),error=>error instanceof WorkerConfigurationFailure&&error.fields.includes('SUPABASE_SECRET_KEY ou SUPABASE_SERVICE_ROLE_KEY')&&!JSON.stringify(error).includes(values.TELEGRAM_MTPROTO_WORKER_SECRET));
 assert.throws(()=>workerConfiguration({...values,TELEGRAM_MTPROTO_WORKER_HOST:'0.0.0.0'},true),WorkerConfigurationFailure);
 assert.throws(()=>workerConfiguration({...values,TELEGRAM_MTPROTO_WORKER_PORT:'0'},true),WorkerConfigurationFailure);
 assert.throws(()=>workerConfiguration({...values,TELEGRAM_MTPROTO_SESSION_KEY:'invalid'},true),WorkerConfigurationFailure);
 assert.equal(workerConfiguration({...values,SUPABASE_URL:'https://example.invalid',SUPABASE_SECRET_KEY:'fixture-only'}).diagnostic,false);
});
test('actual worker HTTP authenticates loopback requests and diagnostic mode blocks all account commands before parsing',async()=>{
 const secret=randomBytes(32).toString('hex');let calls=0;
 const server=mtprotoHttpServer({secret,diagnostic:true,ready:()=>true,command:async()=>{calls++;throw new Error('must never execute');}});
 await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));const address=server.address();assert.ok(address&&typeof address!=='string');const base='http://127.0.0.1:'+address.port;
 try{
  assert.equal((await fetch(base+'/health')).status,401);
  assert.equal((await fetch(base+'/health',{headers:{Authorization:'Bearer wrong'}})).status,401);
  const headers={Authorization:'Bearer '+secret};
  const response=await fetch(base+'/health',{headers});assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'no-store');assert.equal(response.headers.get('access-control-allow-origin'),null);
  assert.deepEqual(await response.json(),{ready:false,mode:'diagnostic',transportReady:true,accountLoginEnabled:false,databaseReady:false});
  for(const body of ['{}','{malformed',JSON.stringify({scope:{owner:'10000000-0000-4000-8000-000000000001',brand:'dropou'},command:{action:'login',phone:'+5511999999999',consent:true}})]){
   const blocked=await fetch(base+'/command',{method:'POST',headers,body});assert.equal(blocked.status,503);assert.deepEqual(await blocked.json(),{code:'diagnostic_only'});
  }
  assert.equal(calls,0);
 }finally{server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));}
});
test('normal worker HTTP keeps lease readiness and schema validation before invoking account operations',async()=>{
 const secret=randomBytes(32).toString('hex');let ready=false,calls=0;
 const server=mtprotoHttpServer({secret,ready:()=>ready,command:async(scope,command)=>{calls++;assert.equal(scope.brand,'dropou');assert.equal(command.action,'stop');return {ok:true};}});
 await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));const address=server.address();assert.ok(address&&typeof address!=='string');const base='http://127.0.0.1:'+address.port,headers={Authorization:'Bearer '+secret};
 try{
  assert.equal((await fetch(base+'/health',{headers})).status,503);assert.equal((await fetch(base+'/command',{method:'POST',headers,body:'{}'})).status,503);assert.equal(calls,0);
  ready=true;assert.equal((await fetch(base+'/health',{headers})).status,200);
  assert.equal((await fetch(base+'/command',{method:'POST',headers,body:'{}'})).status,400);assert.equal(calls,0);
  const sent=await fetch(base+'/command',{method:'POST',headers,body:JSON.stringify({scope:{owner:'10000000-0000-4000-8000-000000000001',brand:'dropou'},command:{action:'stop'}})});assert.equal(sent.status,200);assert.deepEqual(await sent.json(),{ok:true});assert.equal(calls,1);
 }finally{server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));}
});
