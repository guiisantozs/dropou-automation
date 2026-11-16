import type {MtprotoCommand} from '../../lib/telegram-mtproto';
import type {AccountClient,Peer,LiveMessage} from './adapter';
import type {ConnectionRow,MtprotoStore,Scope} from './store';
import {decryptState,encryptState,MtprotoFailure,providerFailure} from './security';
import type {ShopeeLinks} from './shopee-links';
import type {MtprotoShopeeQueue} from '../../lib/telegram-mtproto-shopee';
export interface MtprotoOfferSink {
 begin(row:ConnectionRow):void;clear(scope:Scope):void;clearAll():void;
 snapshot(scope:Scope):MtprotoShopeeQueue|Promise<MtprotoShopeeQueue>;
 accept(row:ConnectionRow,message:LiveMessage,links:ShopeeLinks):void|Promise<void>;
}

type SecretState={session:string;phone?:string;hash?:string;peers:Peer[]};
const noTest={test_channel_id:null,test_started_at:null,test_expires_at:null};
export class MtprotoService {
 private clients=new Map<string,AccountClient>();
 private busy=new Set<string>();
 private tests=new Map<string,ConnectionRow>();
 constructor(private store:MtprotoStore,private key:Buffer,private factory:(session:string,peers:Peer[])=>AccountClient,private active:()=>boolean,private now=()=>Date.now(),private offers?:MtprotoOfferSink){}
 private scope(row:ConnectionRow){return row.owner_id+':'+row.brand_id;}
 private secret(row:ConnectionRow){if(!row.encrypted_state)throw new MtprotoFailure('expired');return decryptState<SecretState>(row.encrypted_state,this.key,this.scope(row));}
 private async close(id:string){this.tests.delete(id);const c=this.clients.get(id);this.clients.delete(id);if(c)await c.close().catch(()=>{});}
 async closeAll(){this.tests.clear();this.offers?.clearAll();await Promise.all([...this.clients.keys()].map(id=>this.close(id)));}
 private async bounded<T>(c:AccountClient,task:()=>Promise<T>):Promise<T>{
  let timer:ReturnType<typeof setTimeout>|undefined;
  try{return await Promise.race([task(),new Promise<never>((_,reject)=>{timer=setTimeout(()=>{void c.close().catch(()=>{});reject(new MtprotoFailure('unavailable'));},20000);})]);}finally{clearTimeout(timer);}
 }
 private async client(row:ConnectionRow){
  const cached=this.clients.get(row.id);if(cached)return cached;
  const state=this.secret(row),client=this.factory(state.session,state.peers);
  try{await this.bounded(client,()=>client.connect());if(!this.active())throw new MtprotoFailure('unavailable');this.clients.set(row.id,client);client.watch(m=>this.receive(row.id,m));return client;}catch(e){await client.close().catch(()=>{});throw e;}
 }
 private async receive(id:string,message:LiveMessage){
  const row=this.tests.get(id),now=this.now();
  if(!this.active()||!row||row.test_channel_id!==message.channelId||!row.test_started_at||!row.test_expires_at||now>=Date.parse(row.test_expires_at)||message.date*1000<Date.parse(row.test_started_at)||message.date*1000>now+5000)return;
  try{
   const accepted=await this.store.record(row,message);
   if(accepted!==false&&this.offers&&['text','photo'].includes(message.kind)){
    const links=message.shopeeLinks?.();if(links)await this.offers.accept(row,message,links);
   }
  }catch{this.tests.delete(id);}
 }
 async command(scope:Scope,command:MtprotoCommand){
  if(!this.active())throw new MtprotoFailure('unavailable');
  if(command.action==='offers')return this.offers?.snapshot(scope)||{available:false,items:[],expiresAt:null,limitReached:false,error:'Reinicie o worker atualizado para identificar links.'};
  const key=scope.owner+':'+scope.brand;if(this.busy.has(key))throw new MtprotoFailure('busy');this.busy.add(key);
  let row:ConnectionRow|undefined;
  try{
   row=await this.store.load(scope);
   if(command.action==='disconnect'){
    this.offers?.clear(scope);
    this.tests.delete(row.id);let revoked=!row.encrypted_state;
    try{if(row.encrypted_state){const c=await this.client(row);await this.bounded(c,()=>c.logout());revoked=true;}}catch{/* Local removal must succeed even if Telegram cannot confirm logout. */}
    await this.close(row.id);
    await this.store.update(row,{status:'disconnected',encrypted_state:null,auth_expires_at:null,selected:[],error_code:revoked?null:'logout',heartbeat_at:null,...noTest});
    await this.store.clearDiagnostics(row);return {ok:true,revocationConfirmed:revoked};
   }
   if(command.action==='stop'){
    this.offers?.clear(scope);
    this.tests.delete(row.id);await this.store.update(row,noTest);await this.store.clearDiagnostics(row);return {ok:true};
   }
   if(command.action==='login'){
    if(row.status==='connected')throw new MtprotoFailure('busy');
    if(row.encrypted_state)throw new MtprotoFailure('reconnect');
    if(Date.parse(row.next_attempt_at)>this.now())throw new MtprotoFailure('flood',Math.ceil((Date.parse(row.next_attempt_at)-this.now())/1000));
    await this.close(row.id);
    row=await this.store.update(row,{status:'disconnected',encrypted_state:null,selected:[],auth_expires_at:null,error_code:null,attempts:0,next_attempt_at:new Date(this.now()+60000).toISOString(),...noTest});
    const c=this.factory('',[]);this.clients.set(row.id,c);
    try{
     await this.bounded(c,()=>c.connect());const hash=await this.bounded(c,()=>c.sendCode(command.phone));
     await this.store.update(row,{status:'code',auth_expires_at:new Date(this.now()+300000).toISOString(),encrypted_state:encryptState({session:c.save(),phone:command.phone,hash,peers:[]},this.key,this.scope(row))});
     c.watch(m=>this.receive(row!.id,m));return {ok:true,step:'code'};
    }catch(e){await this.close(row.id);throw e;}
   }
   if(command.action==='code'||command.action==='password'){
    if(row.status!==command.action||!row.auth_expires_at||Date.parse(row.auth_expires_at)<=this.now())throw new MtprotoFailure('expired');
    if(row.attempts>=8)throw new MtprotoFailure('attempts',60);
    if(Date.parse(row.next_attempt_at)>this.now()&&row.attempts>0)throw new MtprotoFailure('flood',Math.ceil((Date.parse(row.next_attempt_at)-this.now())/1000));
    row=await this.store.update(row,{attempts:row.attempts+1,next_attempt_at:new Date(this.now()+2000).toISOString()});
    const c=await this.client(row),state=this.secret(row);
    const step=command.action==='code'?await this.bounded(c,()=>c.signIn(state.phone!,state.hash!,command.code)):await this.bounded(c,async()=>{await c.password(command.password);return 'connected' as const;});
    if(step==='password'){await this.store.update(row,{status:'password',encrypted_state:encryptState({...state,session:c.save()},this.key,this.scope(row)),error_code:null});return {ok:true,step:'password'};}
    if(!await this.bounded(c,()=>c.authorized()))throw new MtprotoFailure('revoked');
    await this.store.update(row,{status:'connected',auth_expires_at:null,encrypted_state:encryptState({session:c.save(),peers:[]},this.key,this.scope(row)),error_code:null,heartbeat_at:new Date(this.now()).toISOString()});
    return {ok:true,step:null};
   }
   if(row.status!=='connected')throw new MtprotoFailure('revoked');
   const c=await this.client(row);
   if(command.action==='channels')return await this.bounded(c,()=>c.channels(!!command.more));
   if(command.action==='select'){
    this.offers?.clear(scope);
    this.tests.delete(row.id);
    const resolved=[];for(const id of new Set(command.ids))resolved.push(await this.bounded(c,()=>c.resolve(id)));
    await this.store.update(row,{selected:resolved.map(r=>r.channel),encrypted_state:encryptState({session:c.save(),peers:resolved.map(r=>r.peer)},this.key,this.scope(row)),error_code:null,...noTest});
    await this.store.clearDiagnostics(row);return {ok:true};
   }
   if(command.action==='test'){
    if(!row.selected.some(s=>s.id===command.channelId))throw new MtprotoFailure('source');
    const source=await this.bounded(c,()=>c.resolve(command.channelId));if(!source.channel.controlled)throw new MtprotoFailure('source');
    this.tests.delete(row.id);await this.store.clearDiagnostics(row);
    // Start at the next second so queued same-second updates cannot become historical evidence.
    const start=Math.ceil(this.now()/1000)*1000;
    row=await this.store.update(row,{test_channel_id:source.channel.id,test_started_at:new Date(start).toISOString(),test_expires_at:new Date(start+600000).toISOString(),error_code:null});
    this.tests.set(row.id,row);this.offers?.begin(row);return {ok:true};
   }
   throw new MtprotoFailure('provider');
  }catch(error){
   const failure=providerFailure(error);
   if(row){
    const terminal=['revoked','expired','attempts'].includes(failure.code),transport=['unavailable','provider','vault'].includes(failure.code);
    if(terminal||transport){this.tests.delete(row.id);await this.close(row.id);}
    await this.store.update(row,{error_code:failure.code,...(terminal?{status:'error',encrypted_state:null,auth_expires_at:null,...noTest}:transport?{status:'error',...noTest}:{}),...(failure.retryAfter?{next_attempt_at:new Date(this.now()+failure.retryAfter*1000).toISOString()}:{} )}).catch(()=>{});
   }
   throw failure;
  }finally{this.busy.delete(key);}
 }
 async maintain(row:ConnectionRow){
  const scope={owner:row.owner_id,brand:row.brand_id},key=this.scope(row);if(this.busy.has(key)||!this.active())return;
  this.busy.add(key);
  try{
   if(row.auth_expires_at&&Date.parse(row.auth_expires_at)<=this.now()){
    // A provider success followed by a DB failure can leave an authorized pending key.
    // Attempt logout before erasing it; never keep an expired login challenge available.
    if(row.encrypted_state){try{const c=await this.client(row);await this.bounded(c,()=>c.logout());}catch{/* Expiration still clears the local challenge. */}}
    await this.close(row.id);await this.store.update(row,{status:'disconnected',encrypted_state:null,auth_expires_at:null,error_code:'expired',...noTest});return;
   }
   if(row.test_expires_at&&Date.parse(row.test_expires_at)<=this.now()){
    this.tests.delete(row.id);row=await this.store.update(row,noTest);
   }
   if(row.status==='connected'){
    // Revalidate owner authorization and session after restarts. No replay/backfill is performed.
    await this.store.load(scope);
    const c=await this.client(row);if(!await this.bounded(c,()=>c.authorized()))throw new MtprotoFailure('revoked');
    await this.store.update(row,{heartbeat_at:new Date(this.now()).toISOString()});
    if(row.test_channel_id&&row.test_expires_at&&Date.parse(row.test_expires_at)>this.now()){
     const channelId=row.test_channel_id;
     const source=await this.bounded(c,()=>c.resolve(channelId));if(!source.channel.controlled)throw new MtprotoFailure('source');
     // A restart opens a fresh live boundary; messages from the outage are ignored.
     if(!this.tests.has(row.id)){row=await this.store.update(row,{test_started_at:new Date(Math.ceil(this.now()/1000)*1000).toISOString()});this.tests.set(row.id,row);this.offers?.begin(row);}
    }
   }
  }catch(error){const e=providerFailure(error);await this.close(row.id);await this.store.update(row,{status:'error',error_code:e.code,...noTest,...(e.code==='revoked'?{encrypted_state:null,auth_expires_at:null}:{})}).catch(()=>{});}
  finally{this.busy.delete(key);}
 }
}
