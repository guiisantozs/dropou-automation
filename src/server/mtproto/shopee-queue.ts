import type {MtprotoCatalogMatch,MtprotoShopeeCandidate,MtprotoShopeeQueue} from '../../lib/telegram-mtproto-shopee';
import {shopeeProductLink} from '../../lib/shopee-saved';
import {resolveMtprotoShopeeLink} from './shopee-resolver';
import type {Scope,ConnectionRow} from './store';
import type {ShopeeLinks} from './shopee-links';
import type {AffiliateConverter} from './shopee-affiliate';
import type {MtprotoShopeeConversion} from '../../lib/telegram-mtproto-shopee';

type Identity={shopId:string;itemId:string;canonical:string};
type Window={connection:string;start:string;end:number;expires:number;scope:Scope;items:MtprotoShopeeCandidate[];seen:Set<number>;limited:boolean;shorts:number;controller:AbortController;chain:Promise<void>;resolved:Map<string,Promise<Identity>>;catalog:Map<string,Promise<MtprotoCatalogMatch>>;conversions:Map<string,Promise<MtprotoShopeeConversion>>};
export class MtprotoShopeeTestQueue {
 private windows=new Map<string,Window>();
 constructor(private lookup:(scope:Scope,id:Identity)=>Promise<MtprotoCatalogMatch>,private active:()=>boolean,private now=()=>Date.now(),private http:typeof fetch=fetch,private convert?:AffiliateConverter){}
 private key(scope:Scope){return scope.owner+':'+scope.brand;}
 prune(){for(const [key,w] of this.windows)if(this.now()>=w.expires){w.controller.abort();this.windows.delete(key);}}
 clear(scope:Scope){const key=this.key(scope);this.windows.get(key)?.controller.abort();this.windows.delete(key);}
 clearAll(){for(const w of this.windows.values())w.controller.abort();this.windows.clear();}
 begin(row:ConnectionRow){
  this.prune();if(row.brand_id!=='dropou'||!row.test_started_at||!row.test_expires_at)return;
  const scope={owner:row.owner_id,brand:row.brand_id},key=this.key(scope),old=this.windows.get(key);
  if(old?.connection===row.id&&old.start===row.test_started_at)return;
  this.clear(scope);
  if(this.windows.size>=200)return;
  this.windows.set(key,{connection:row.id,start:row.test_started_at,end:Date.parse(row.test_expires_at),expires:this.now()+3600000,scope,items:[],seen:new Set(),limited:false,shorts:0,controller:new AbortController(),chain:Promise.resolve(),resolved:new Map(),catalog:new Map(),conversions:new Map()});
 }
 private valid(w:Window){return this.active()&&!w.controller.signal.aborted&&this.windows.get(this.key(w.scope))===w&&this.now()<w.end;}
 snapshot(scope:Scope):MtprotoShopeeQueue{
  this.prune();const w=this.windows.get(this.key(scope));
  return {available:true,items:w?w.items.map((e,index)=>({...e,...(e.state==='resolving'&&this.now()>=w.end?{state:'error' as const,error:'A janela terminou antes de concluir a identificação.'}:{}),...(e.conversion?{conversion:{...e.conversion,product:e.conversion.product?{...e.conversion.product}:null,...(['waiting','converting'].includes(e.conversion.state)&&!this.valid(w)?{state:'error' as const,error:'A janela terminou antes de concluir a conversão.'}:{})}}:{}),catalog:e.catalog?{...e.catalog}:null,repeatedInTest:!!e.canonicalUrl&&w.items.slice(0,index).some(p=>p.canonicalUrl===e.canonicalUrl)})):[],expiresAt:w?new Date(w.expires).toISOString():null,limitReached:w?.limited||false};
 }
 async settled(scope:Scope){await this.windows.get(this.key(scope))?.chain;}
 accept(row:ConnectionRow,message:{id:number;channelId:string;date:number;kind:string},links:ShopeeLinks){
  this.prune();const w=this.windows.get(this.key({owner:row.owner_id,brand:row.brand_id}));
  if(!w||!this.valid(w)||w.connection!==row.id||w.start!==row.test_started_at||message.channelId!==row.test_channel_id||message.date*1000<Date.parse(w.start)||message.date*1000>this.now()+5000||!['text','photo'].includes(message.kind)||w.seen.has(message.id))return;
  if(w.seen.size>=200){w.limited=true;return;}w.seen.add(message.id);w.limited||=links.limited;
  const urls=links.urls.slice(0,5),inputs:(string|null)[]=[...urls,...(links.invalid?[null]:[])];
  for(const [index,url] of inputs.entries()){
   if(w.items.length>=50){w.limited=true;break;}
   const item:MtprotoShopeeCandidate={id:message.id+':'+index,messageId:message.id,kind:message.kind as 'text'|'photo',messageAt:new Date(message.date*1000).toISOString(),receivedAt:new Date(this.now()).toISOString(),state:'resolving',canonicalUrl:null,shopId:null,itemId:null,catalog:null,error:null,repeatedInTest:false};
   w.items.push(item);
   w.chain=w.chain.then(()=>this.identify(w,item,url)).catch(()=>{if(this.valid(w)){item.state='error';item.error='Não foi possível concluir a identificação.';}});
  }
 }
 private async identify(w:Window,item:MtprotoShopeeCandidate,url:string|null){
  if(!this.valid(w))return;
  if(!url){item.state='error';item.error='Link Shopee não suportado: use um link de produto ou compartilhamento.';return;}
  try{
   let resolved=w.resolved.get(url);
   if(!resolved){
    const parsed=shopeeProductLink(url);
    if(!parsed.shopId){if(w.shorts>=10){w.limited=true;throw new Error('limit');}w.shorts++;}
    const http=(async(input,init)=>{if(!this.valid(w))throw new Error('expired');return this.http(input,{...init,signal:AbortSignal.any([w.controller.signal,...(init?.signal?[init.signal]:[])])});}) as typeof fetch;
    resolved=resolveMtprotoShopeeLink(url,http);w.resolved.set(url,resolved);
   }
   const identity=await resolved;if(!this.valid(w))return;
   // Two URL forms in one message must not create two candidates for the same product.
   if(w.items.some(e=>e!==item&&e.messageId===item.messageId&&e.canonicalUrl===identity.canonical)){w.items=w.items.filter(e=>e!==item);return;}
   item.canonicalUrl=identity.canonical;item.shopId=identity.shopId;item.itemId=identity.itemId;
   let match=w.catalog.get(identity.canonical);
   if(!match){match=this.lookup(w.scope,identity);w.catalog.set(identity.canonical,match);}
   try{const catalog=await match;if(!this.valid(w))return;item.catalog=catalog;}
   catch{if(!this.valid(w))return;item.catalog={status:'error'};item.error='Produto identificado, mas a consulta ao catálogo falhou.';}
   item.state='identified';
   if(!this.convert)return;
   item.conversion={state:'identified',affiliateUrl:null,product:null,error:null,source:null};
   if(item.catalog?.status==='error'){item.conversion={...item.conversion,state:'error',error:'A consulta ao catálogo falhou. A conversão não foi solicitada.'};return;}
   item.conversion.state='waiting';
   let conversion=w.conversions.get(identity.canonical);
   if(!conversion){
    conversion=Promise.resolve().then(()=>{if(!this.valid(w))return {...item.conversion!,state:'error' as const,error:'A janela terminou antes da conversão.'};item.conversion!.state='converting';return this.convert!(w.scope,identity,{valid:()=>this.valid(w),signal:w.controller.signal});});
    w.conversions.set(identity.canonical,conversion);
   }
   try{const result=await conversion;if(this.valid(w))item.conversion={...result,product:result.product?{...result.product}:null};}
   catch{if(this.valid(w))item.conversion={state:'error',affiliateUrl:null,product:null,source:null,error:'Falha segura na conversão. Nenhuma tentativa automática será feita.'};}
  }catch(error){if(this.valid(w)){item.state='error';item.error=error instanceof Error&&error.message==='limit'?'Limite de resolução desta janela atingido.':'Não foi possível resolver o link curto por redirecionamentos permitidos. Use o link completo do produto.';}}
 }
}
