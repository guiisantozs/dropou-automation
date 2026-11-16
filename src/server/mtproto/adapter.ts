import {TelegramClient,Api} from 'telegram';
import {StringSession} from 'telegram/sessions/index.js';
import {NewMessage,NewMessageEvent} from 'telegram/events/index.js';
import {Logger,LogLevel} from 'telegram/extensions/Logger.js';
import {computeCheck} from 'telegram/Password.js';
import {returnBigInt} from 'telegram/Helpers.js';
import type {MtprotoChannel} from '../../lib/telegram-mtproto';
import {MtprotoFailure} from './security';
import {extractShopeeLinks,type ShopeeLinks} from './shopee-links';

export type Peer={id:string;hash:string};
export type LiveMessage={id:number;channelId:string;date:number;kind:'text'|'photo'|'document'|'other';shopeeLinks?:()=>ShopeeLinks};
export interface AccountClient {
 connect():Promise<void>;close():Promise<void>;save():string;
 sendCode(phone:string):Promise<string>;signIn(phone:string,hash:string,code:string):Promise<'connected'|'password'>;
 password(value:string):Promise<void>;authorized():Promise<boolean>;logout():Promise<void>;
 channels(more:boolean):Promise<{channels:MtprotoChannel[];more:boolean}>;
 resolve(id:string):Promise<{channel:MtprotoChannel;peer:Peer}>;
 watch(callback:(message:LiveMessage)=>Promise<void>):void;
}
// GramJS is isolated here: no browser imports, bot transport, history or send/forward APIs.
export class GramAccountClient implements AccountClient {
 private client:TelegramClient;
 private iterator?:AsyncIterator<import('telegram/tl/custom/dialog.js').Dialog>;
 private known=new Map<string,{channel:MtprotoChannel;peer:Peer}>();
 constructor(session:string,apiId:number,apiHash:string,peers:Peer[]=[]){
  this.client=new TelegramClient(new StringSession(session),apiId,apiHash,{baseLogger:new Logger(LogLevel.NONE),connectionRetries:2,requestRetries:2,retryDelay:1000,autoReconnect:true,floodSleepThreshold:0,deviceModel:'Dropou server',appVersion:'1.0.0'});
  this.client._errorHandler=async()=>{};
  for(const peer of peers)this.known.set(peer.id,{peer,channel:{id:peer.id,title:'Canal selecionado',controlled:false}});
 }
 async connect(){await this.client.connect();}
 async close(){await this.client.destroy();}
 save(){return (this.client.session as StringSession).save();}
 async sendCode(phone:string){const result=await this.client.sendCode({apiId:this.client.apiId,apiHash:this.client.apiHash},phone);return result.phoneCodeHash;}
 async signIn(phone:string,hash:string,code:string){
  try{const r=await this.client.invoke(new Api.auth.SignIn({phoneNumber:phone,phoneCodeHash:hash,phoneCode:code}));if(!(r instanceof Api.auth.Authorization))throw new MtprotoFailure('provider');return 'connected' as const;}
  catch(e){if((e as {errorMessage?:string}).errorMessage==='SESSION_PASSWORD_NEEDED')return 'password' as const;throw e;}
 }
 async password(value:string){const params=await this.client.invoke(new Api.account.GetPassword());await this.client.invoke(new Api.auth.CheckPassword({password:await computeCheck(params,value)}));}
 async authorized(){await this.client.invoke(new Api.updates.GetState());return true;}
 async logout(){await this.client.invoke(new Api.auth.LogOut());}
 async channels(more:boolean){
  if(!more||!this.iterator)this.iterator=this.client.iterDialogs({})[Symbol.asyncIterator]();
  const channels:MtprotoChannel[]=[];let ended=false;
  for(let i=0;i<100;i++){const item=await this.iterator.next();if(item.done){ended=true;break;}const c=item.value.entity;
   if(c instanceof Api.Channel&&!c.left&&!c.restricted&&c.accessHash){const channel={id:c.id.toString(),title:c.title.slice(0,160),controlled:!!(c.creator||c.adminRights)};const peer={id:channel.id,hash:c.accessHash.toString()};this.known.set(channel.id,{channel,peer});channels.push(channel);}
  }
  return {channels,more:!ended};
 }
 async resolve(id:string){
  const known=this.known.get(id);if(!known)throw new MtprotoFailure('source');
  const result=await this.client.invoke(new Api.channels.GetChannels({id:[new Api.InputChannel({channelId:returnBigInt(id),accessHash:returnBigInt(known.peer.hash)})]}));
  const c=result.chats[0];if(!(c instanceof Api.Channel)||c.left||c.restricted||!c.accessHash)throw new MtprotoFailure('source');
  return {channel:{id,title:c.title.slice(0,160),controlled:!!(c.creator||c.adminRights)},peer:{id,hash:c.accessHash.toString()}};
 }
 watch(callback:(message:LiveMessage)=>Promise<void>){
  this.client.addEventHandler(async(event:NewMessageEvent)=>{
   const m=event.message;if(!(m.peerId instanceof Api.PeerChannel)||m.noforwards||m.ttlPeriod)return;
   await callback({id:m.id,channelId:m.peerId.channelId.toString(),date:m.date,kind:m.media instanceof Api.MessageMediaPhoto?'photo':m.media instanceof Api.MessageMediaDocument?'document':!m.media||m.media instanceof Api.MessageMediaWebPage?'text':'other',
    shopeeLinks:()=>extractShopeeLinks(m.message||'',(m.entities||[]).filter(e=>e instanceof Api.MessageEntityUrl||e instanceof Api.MessageEntityTextUrl).map(e=>({offset:e.offset,length:e.length,...(e instanceof Api.MessageEntityTextUrl?{url:e.url}:{})}))),
   });
  },new NewMessage({}));
 }
}
