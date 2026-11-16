import type {SupabaseClient} from '@supabase/supabase-js';
import type {ConnectionRow,Scope} from './store';
import type {LiveMessage} from './adapter';
import type {ShopeeLinks} from './shopee-links';
import type {AffiliateConverter} from './shopee-affiliate';
import type {MtprotoOfferSink} from './service';
import {resolveMtprotoShopeeLink} from './shopee-resolver';
import {shopeeProductLink} from '../../lib/shopee-saved';
import {mtprotoCatalogLookup} from './shopee-catalog';

// Ingestion is awaited before returning from the live event. Conversion is
// drained from Postgres, not from a process-local closure or Telegram history.
export class PersistentMirrorOffers implements MtprotoOfferSink {
 private controller=new AbortController();private draining=false;
 constructor(private db:SupabaseClient,private holder:string,private active:()=>boolean,private convert:AffiliateConverter,private http:typeof fetch=fetch){}
 async ready(){const r=await this.db.from('mirror_offers').select('id').limit(0);if(r.error)throw new Error('Fila persistente indisponível. A migração incremental precisa ser autorizada e aplicada.');}
 begin(_row:ConnectionRow){}
 clear(_scope:Scope){} // Stopping diagnostics never deletes accepted offers.
 clearAll(){this.controller.abort();this.controller=new AbortController();}
 prune(){} // Durable queue/history deliberately have no one-hour TTL.
 snapshot(_scope:Scope){return {available:true,persistent:true,items:[],expiresAt:null,limitReached:false};}
 async accept(row:ConnectionRow,message:LiveMessage,links:ShopeeLinks){
  if(!this.active()||row.brand_id!=='dropou'||!links.urls.length)return;
  const urls=[...new Set(links.urls.slice(0,5).map(url=>shopeeProductLink(url).canonical))];
  const r=await this.db.rpc('dropou_mirror_ingest',{p_holder:this.holder,p_connection:row.id,p_test:row.test_started_at,p_channel:message.channelId,p_message:message.id,p_at:new Date(message.date*1000).toISOString(),p_kind:message.kind,p_urls:urls});
  if(r.error)throw new Error('Persistência do recebimento não confirmada.');
 }
 async drain(){
  if(this.draining||!this.active())return;this.draining=true;
  const signal=this.controller.signal,valid=()=>this.active()&&!signal.aborted;
  try{
   const received=await this.db.from('mirror_offers').select('id,owner_id,brand_id,input_url').eq('state','received').order('received_at').limit(10);
   if(received.error)throw new Error('queue');
   const resolved=new Map<string,ReturnType<typeof resolveMtprotoShopeeLink>>();
   for(const row of received.data||[]){
    if(!valid())return;
    try{
     const http=(async(input,init)=>{if(!valid())throw new Error('stopped');return this.http(input,{...init,signal:AbortSignal.any([signal,...(init?.signal?[init.signal]:[])])});}) as typeof fetch;
     const resolutionKey=row.owner_id+':'+row.input_url;
     let resolution=resolved.get(resolutionKey);if(!resolution){resolution=resolveMtprotoShopeeLink(row.input_url,http);resolved.set(resolutionKey,resolution);}
     const identity=await resolution;if(!valid())return;
     const catalog=await mtprotoCatalogLookup(this.db)({owner:row.owner_id,brand:row.brand_id},identity);if(!valid())return;
     const result=await this.db.rpc('dropou_mirror_identify',{p_holder:this.holder,p_id:row.id,p_shop:identity.shopId,p_item:identity.itemId,p_catalog:catalog.productId||null});if(result.error)throw new Error('identify');
    }catch{if(valid())await this.db.rpc('dropou_mirror_fail_received',{p_holder:this.holder,p_id:row.id});}
   }
   // One batch is bounded; the persisted remainder is resumed on later ticks.
   for(let i=0;i<5&&valid();i++){
    const claim=await this.db.rpc('dropou_mirror_claim',{p_holder:this.holder});if(claim.error)throw new Error('claim');const row=claim.data;if(!row?.id)return;
    const alive=()=>valid()&&Date.now()<Date.parse(row.lease_until);
    const result=await this.convert({owner:row.owner_id,brand:row.brand_id},{shopId:row.shop_id,itemId:row.item_id},{valid:alive,signal});
    if(!alive())return;
    const done=await this.db.rpc('dropou_mirror_finish',{p_holder:this.holder,p_id:row.id,p_token:row.lease_token,p_result:result});if(done.error||!done.data)throw new Error('finish');
   }
  }finally{this.draining=false;}
 }
}
