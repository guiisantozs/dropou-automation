import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {mtprotoCommand} from '../src/lib/telegram-mtproto';
import {authorizedWorker,decryptState,encryptState,encryptionKey,MtprotoFailure,providerFailure,workerOrigin} from '../src/server/mtproto/security';
import {MtprotoService} from '../src/server/mtproto/service';
import type {AccountClient,LiveMessage,Peer} from '../src/server/mtproto/adapter';
import {GramAccountClient} from '../src/server/mtproto/adapter';
import {Api} from 'telegram';
import {returnBigInt} from 'telegram/Helpers.js';
import {readMtprotoCommand} from '../src/server/mtproto/input';
import type {ConnectionRow,MtprotoStore,Scope} from '../src/server/mtproto/store';
import {MtprotoShopeeTestQueue} from '../src/server/mtproto/shopee-queue';

const owner='10000000-0000-4000-8000-000000000001',other='10000000-0000-4000-8000-000000000002';
const channel={id:'12345',title:'Canal controlado de teste',controlled:true};
class FakeClient implements AccountClient {
 closed=false;authorizedValue=false;needsPassword=false;revocationFails=false;controlled=true;callback?:(m:LiveMessage)=>Promise<void>;
 async connect(){}async close(){this.closed=true;}save(){return 'secret-session-fixture';}
 async sendCode(){return 'secret-hash-fixture';}
 async signIn(_phone:string,_hash:string,code:string){if(code!=='12345')throw {errorMessage:'PHONE_CODE_INVALID'};this.authorizedValue=!this.needsPassword;return this.needsPassword?'password' as const:'connected' as const;}
 async password(value:string){if(value!=='correct-fixture')throw {errorMessage:'PASSWORD_HASH_INVALID'};this.authorizedValue=true;}
 async authorized(){return this.authorizedValue;}
 async logout(){if(this.revocationFails)throw new Error('private provider payload');this.authorizedValue=false;}
 async channels(){return {channels:[channel],more:false};}
 async resolve(id:string){if(id!==channel.id)throw new MtprotoFailure('source');return {channel:{...channel,controlled:this.controlled},peer:{id,hash:'456'}};}
 watch(callback:(m:LiveMessage)=>Promise<void>){this.callback=callback;}
}
function fixture(offers?:MtprotoShopeeTestQueue){
 let time=Date.parse('2026-11-15T18:00:00Z'),active=true;const key=randomBytes(32),rows=new Map<string,ConnectionRow>(),events:LiveMessage[]=[],clients:FakeClient[]=[];
 const store:MtprotoStore={
  async load(scope:Scope){const id=scope.owner+':'+scope.brand;let row=rows.get(id);if(!row){row={id,owner_id:scope.owner,brand_id:scope.brand,status:'disconnected',encrypted_state:null,auth_expires_at:null,attempts:0,next_attempt_at:new Date(0).toISOString(),error_code:null,selected:[],test_channel_id:null,test_started_at:null,test_expires_at:null,heartbeat_at:null};rows.set(id,row);}return structuredClone(row);},
  async update(row,patch){const next={...rows.get(row.id)!,...patch};rows.set(row.id,next);return structuredClone(next);},
  async clearDiagnostics(){events.length=0;},async record(_row,m){events.push(m);},
 };
 const factory=(session:string,_peers:Peer[])=>{const client=new FakeClient();client.authorizedValue=!!session;clients.push(client);return client;};
 const make=()=>new MtprotoService(store,key,factory,()=>active,()=>time,offers);
 const service=make(),scope={owner,brand:'dropou'};
 return {service,store,key,clients,rows,events,scope,make,advance(ms:number){time+=ms;},now:()=>time,setActive(v:boolean){active=v;},row:()=>rows.get(owner+':dropou')!,async login(twoFa=false){await service.command(scope,{action:'login',phone:'+5511999999999',consent:true});clients.at(-1)!.needsPassword=twoFa;return service.command(scope,{action:'code',code:'12345'});}};
}
test('MTProto vault authenticates owner, brand, key and ciphertext; worker secret and URL validation fail closed',()=>{
 const key=encryptionKey(randomBytes(32).toString('base64')),value={session:'private-session'},cipher=encryptState(value,key,owner+':dropou');
 assert.ok(!cipher.includes('private-session'));assert.deepEqual(decryptState(cipher,key,owner+':dropou'),value);
 for(const scope of [other+':dropou',owner+':celulares'])assert.throws(()=>decryptState(cipher,key,scope),/vault/);
 assert.throws(()=>decryptState(cipher.slice(0,-4)+'AAAA',key,owner+':dropou'),/vault/);assert.throws(()=>encryptionKey('short'),/vault/);
 const secret='a'.repeat(40);assert.equal(authorizedWorker('Bearer '+secret,secret),true);assert.equal(authorizedWorker('Bearer wrong',secret),false);assert.equal(authorizedWorker(undefined,secret),false);
 assert.equal(workerOrigin('http://127.0.0.1:8081'),'http://127.0.0.1:8081');assert.equal(workerOrigin('https://worker.example.invalid'),'https://worker.example.invalid');
 for(const url of ['http://worker.example.invalid','https://x.invalid/path','https://secret@x.invalid','https://x.invalid?secret=1'])assert.throws(()=>workerOrigin(url));
 assert.equal(mtprotoCommand.safeParse({action:'login',phone:'+5511999999999',consent:false}).success,false);assert.equal(mtprotoCommand.safeParse({action:'code',code:'12345',owner}).success,false);
 assert.equal(providerFailure({errorMessage:'FLOOD_WAIT_120',seconds:120}).retryAfter,120);assert.equal(providerFailure(new Error('secret provider contents')).code,'provider');
});
test('MTProto bounds streamed login bodies before parsing, preserves Unicode 2FA and never reflects invalid secret input',async()=>{
 const bytes=Buffer.from(JSON.stringify({action:'password',password:'senha-çã-fixture'}));
 const stream=new ReadableStream<Uint8Array>({start(c){for(const byte of bytes)c.enqueue(Uint8Array.of(byte));c.close();}});
 const result=await readMtprotoCommand(new Request('http://localhost',{method:'POST',body:stream,duplex:'half'} as RequestInit));assert.deepEqual(result,{action:'password',password:'senha-çã-fixture'});
 for(const body of ['{"password":"PRIVATE FIXTURE"','x'.repeat(4097),JSON.stringify({action:'code',code:'12345',owner})]){
  await assert.rejects(readMtprotoCommand(new Request('http://localhost',{method:'POST',body})),e=>e instanceof MtprotoFailure&&e.code==='input'&&!e.message.includes('PRIVATE'));
 }
});
test('MTProto code and 2FA persist only encrypted session state, survive worker restart, and purge pending phone/hash on success',async()=>{
 const f=fixture();try{
  const response=await f.login(true);assert.deepEqual(response,{ok:true,step:'password'});assert.equal(f.row().status,'password');
  assert.ok(!f.row().encrypted_state!.includes('+5511'));assert.ok(!f.row().encrypted_state!.includes('secret-hash'));
  await f.service.closeAll();f.advance(3000);const restarted=f.make();
  await assert.rejects(restarted.command(f.scope,{action:'password',password:'wrong-fixture'}),/password/);assert.equal(f.row().status,'password');
  f.advance(3000);const complete=await restarted.command(f.scope,{action:'password',password:'correct-fixture'});assert.deepEqual(complete,{ok:true,step:null});
  const secret=decryptState<Record<string,unknown>>(f.row().encrypted_state!,f.key,owner+':dropou');assert.deepEqual(Object.keys(secret).sort(),['peers','session']);assert.equal(f.row().auth_expires_at,null);assert.equal(f.row().status,'connected');
  assert.ok(!JSON.stringify(complete).includes('session'));await restarted.closeAll();
 }finally{await f.service.closeAll();}
});
test('MTProto login expires, applies resend cooldown and caps wrong codes without changing other owners or brands',async()=>{
 const f=fixture();try{
  await f.service.command(f.scope,{action:'login',phone:'+5511999999999',consent:true});
  await assert.rejects(f.service.command(f.scope,{action:'login',phone:'+5511999999999',consent:true}),/reconnect/);
  for(let i=0;i<8;i++){f.advance(3000);await assert.rejects(f.service.command(f.scope,{action:'code',code:'99999'}),/code/);}
  f.advance(3000);await assert.rejects(f.service.command(f.scope,{action:'code',code:'99999'}),/attempts/);assert.equal(f.row().encrypted_state,null);
  await f.service.command({owner,brand:'celulares'},{action:'login',phone:'+5511999999999',consent:true});
  await f.service.command({owner:other,brand:'dropou'},{action:'login',phone:'+5511999999999',consent:true});
  assert.equal(f.rows.get(owner+':celulares')!.status,'code');assert.equal(f.rows.get(other+':dropou')!.status,'code');
  f.advance(301000);await f.service.maintain(f.rows.get(owner+':celulares')!);assert.equal(f.rows.get(owner+':celulares')!.encrypted_state,null);assert.equal(f.rows.get(other+':dropou')!.status,'code');
 }finally{await f.service.closeAll();}
});
test('MTProto receives only selected live controlled-source metadata inside the test window; stop and lease loss suppress callbacks',async()=>{
 const f=fixture();try{
  await f.login();await f.service.command(f.scope,{action:'select',ids:[channel.id]});
  await assert.rejects(f.service.command(f.scope,{action:'test',channelId:'999',controlled:true}),/source/);
  await f.service.command(f.scope,{action:'test',channelId:channel.id,controlled:true});const client=f.clients.at(-1)!;
  const msg={id:1,channelId:channel.id,date:f.now()/1000,kind:'text' as const};
  await client.callback!({...msg,channelId:'999'});await client.callback!({...msg,date:msg.date-1});assert.equal(f.events.length,0);
  await client.callback!(msg);assert.equal(f.events.length,1);assert.deepEqual(Object.keys(f.events[0]).sort(),['channelId','date','id','kind']);
  f.setActive(false);await client.callback!({...msg,id:2});assert.equal(f.events.length,1);f.setActive(true);
  f.advance(600001);await client.callback!({...msg,id:3,date:f.now()/1000});assert.equal(f.events.length,1);
  await f.service.command(f.scope,{action:'stop'});assert.equal(f.events.length,0);assert.equal(f.row().test_channel_id,null);await client.callback!(msg);assert.equal(f.events.length,0);
 }finally{await f.service.closeAll();}
});
test('MTProto revalidates administration and restarts with a fresh live boundary; disconnect clears local state on unconfirmed logout',async()=>{
 const f=fixture();try{
  await f.login();await f.service.command(f.scope,{action:'select',ids:[channel.id]});
  f.clients.at(-1)!.controlled=false;await assert.rejects(f.service.command(f.scope,{action:'test',channelId:channel.id,controlled:true}),/source/);f.clients.at(-1)!.controlled=true;
  await f.service.command(f.scope,{action:'test',channelId:channel.id,controlled:true});const oldDate=f.now()/1000;
  await f.service.closeAll();f.advance(10000);const restarted=f.make();await restarted.maintain(f.row());
  const current=f.clients.at(-1)!;await current.callback!({id:4,channelId:channel.id,date:oldDate,kind:'photo'});assert.equal(f.events.length,0);
  await current.callback!({id:5,channelId:channel.id,date:f.now()/1000,kind:'photo'});assert.equal(f.events.length,1);
  current.revocationFails=true;const result=await restarted.command(f.scope,{action:'disconnect'});assert.equal('revocationConfirmed' in result&&result.revocationConfirmed,false);assert.equal(f.row().encrypted_state,null);assert.equal(f.row().status,'disconnected');assert.deepEqual(f.row().selected,[]);assert.equal(f.events.length,0);assert.ok(current.closed);await restarted.closeAll();
 }finally{await f.service.closeAll();}
});
test('MTProto serializes commands per owner/brand while allowing independent accounts',async()=>{
 const f=fixture();try{
  await f.login();const c=f.clients.at(-1)!;let release!:()=>void;c.channels=()=>new Promise(resolve=>{release=()=>resolve({channels:[channel],more:false});});
  const first=f.service.command(f.scope,{action:'channels'});await new Promise(resolve=>setImmediate(resolve));
  await assert.rejects(f.service.command(f.scope,{action:'channels'}),/busy/);
  await f.service.command({owner:other,brand:'dropou'},{action:'login',phone:'+5511999999999',consent:true});release();assert.deepEqual(await first,{channels:[channel],more:false});
 }finally{await f.service.closeAll();}
});
test('GramJS adapter maps native MTProto updates to metadata, ignores private/protected/temporary messages and keeps RPC attempts enabled',async()=>{
 const adapter=new GramAccountClient('',123456,'a'.repeat(32),[{id:'12345',hash:'456'}]);
 const raw=(adapter as unknown as {client:{_requestRetries:number;_eventBuilders:[unknown,(event:unknown)=>Promise<void>][];invoke:unknown}}).client;
 const seen:LiveMessage[]=[];assert.ok(raw._requestRetries>=1);
 try{
  adapter.watch(async event=>{seen.push(event);});const callback=raw._eventBuilders[0][1];
  const args={id:3,date:Math.floor(Date.now()/1000),message:'PRIVATE FIXTURE BODY',peerId:new Api.PeerChannel({channelId:returnBigInt('12345')})};
  await callback({message:new Api.Message({...args,peerId:new Api.PeerUser({userId:returnBigInt('999')})})});
  await callback({message:new Api.Message({...args,noforwards:true})});await callback({message:new Api.Message({...args,ttlPeriod:60})});assert.equal(seen.length,0);
  await callback({message:new Api.Message(args)});assert.equal(seen.length,1);assert.equal(JSON.stringify(seen).includes(args.message),false);
  const {shopeeLinks,...metadata}=seen[0];assert.deepEqual(metadata,{id:3,channelId:'12345',date:args.date,kind:'text'});assert.deepEqual(shopeeLinks?.(),{urls:[],invalid:0,limited:false});
  Object.defineProperty(raw,'invoke',{value:async()=>{throw {errorMessage:'SESSION_PASSWORD_NEEDED'};},configurable:true});assert.equal(await adapter.signIn('+5511999999999','fixture','12345'),'password');
  Object.defineProperty(raw,'invoke',{value:async()=>{throw {errorMessage:'FLOOD_WAIT_120',seconds:120};},configurable:true});await assert.rejects(adapter.authorized(),e=>providerFailure(e).code==='flood');
 }finally{await adapter.close();}
});

test('live Shopee identification runs only after source/date/DB fencing and read-only queue commands do not create a connection',async()=>{
 let f!:ReturnType<typeof fixture>,reads=0,extractions=0;
 const queue=new MtprotoShopeeTestQueue(async()=>{reads++;return {status:'missing'};},()=>true,()=>f.now());f=fixture(queue);
 try{
  const empty=await f.service.command({owner:other,brand:'dropou'},{action:'offers'});assert.deepEqual((empty as any).items,[]);assert.equal(f.rows.size,0);
  await f.login();await f.service.command(f.scope,{action:'select',ids:[channel.id]});await f.service.command(f.scope,{action:'test',channelId:channel.id,controlled:true});
  const emit=f.clients.at(-1)!.callback!,message:LiveMessage={id:1,channelId:channel.id,date:f.now()/1000,kind:'text',shopeeLinks:()=>{extractions++;return {urls:['https://shopee.com.br/product/123/456'],invalid:0,limited:false};}};
  await emit({...message,channelId:'other'});await emit({...message,date:message.date-1});assert.equal(extractions,0);
  const record=f.store.record;f.store.record=async()=>false;await emit(message);assert.equal(extractions,0);f.store.record=record;
  await emit(message);await queue.settled(f.scope);assert.equal(reads,1);assert.equal(queue.snapshot(f.scope).items[0].shopId,'123');
  await f.service.command(f.scope,{action:'stop'});await emit({...message,id:2});assert.equal(queue.snapshot(f.scope).items.length,0);assert.equal(extractions,1);
 }finally{await f.service.closeAll();}
});

test('native photo captions expose only lazily extracted Shopee URLs including hidden text links',async()=>{
 const adapter=new GramAccountClient('',123456,'a'.repeat(32));
 const raw=(adapter as any).client;const seen:LiveMessage[]=[];
 try{
  adapter.watch(async event=>{seen.push(event);});
  const caption='🎮 Confira aqui';
  await raw._eventBuilders[0][1]({message:new Api.Message({id:7,date:123,peerId:new Api.PeerChannel({channelId:returnBigInt('12345')}),message:caption,media:new Api.MessageMediaPhoto({photo:new Api.PhotoEmpty({id:returnBigInt('1')})}),entities:[new Api.MessageEntityTextUrl({offset:3,length:11,url:'https://s.shopee.com.br/abc123?tracking=secret'})]})});
  assert.equal(seen[0].kind,'photo');assert.equal(JSON.stringify(seen).includes(caption),false);assert.deepEqual(seen[0].shopeeLinks?.().urls,['https://s.shopee.com.br/abc123']);
  await raw._eventBuilders[0][1]({message:new Api.Message({id:8,date:123,peerId:new Api.PeerChannel({channelId:returnBigInt('12345')}),message:'Confira https://shopee.com.br/product/123/456',media:new Api.MessageMediaWebPage({webpage:new Api.WebPageEmpty({id:returnBigInt('2')})})})});
  assert.equal(seen[1].kind,'text');assert.deepEqual(seen[1].shopeeLinks?.().urls,['https://shopee.com.br/product/123/456']);
 }finally{await adapter.close();}
});
