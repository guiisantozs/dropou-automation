import {test} from 'node:test';
import assert from 'node:assert/strict';
import type {SupabaseClient} from '@supabase/supabase-js';
import {shopeeEngine} from '../src/server/shopee/engine';
import {defaultShopeeConfig,bahiaDay,type ShopeeOffer} from '../src/lib/shopee-automation';
// In-memory REST boundary for orchestration. SQL permissions and atomicity are
// independently exercised by shopee-database.test.ts against PostgreSQL.
class MemoryDb{
 tables:Record<string,any[]>={operation_settings:[],shopee_offers:[],shopee_requests:[],shopee_runs:[],shopee_observations:[],channel_events:[],telegram_jobs:[],telegram_dispatch_config:[{id:true,automation_enabled:true}]};
 receipts:unknown[]=[];
 from(table:string){return new Query(this,table);}
 async rpc(name:string,args:any){
  if(name==='dropou_caption_rotate')return {data:args.p_candidates.find((h:string)=>h!==args.p_current),error:null};
  if(name==='dropou_shopee_finish'){const r=this.tables.shopee_requests.find(r=>r.id===args.p_request);if(r?.state==='reserved')Object.assign(r,{state:args.p_state,finished_at:new Date().toISOString(),blocked_until:args.p_state==='ok'?null:new Date(Date.now()+args.p_retry_seconds*1000).toISOString()});return {data:null,error:null};}
  if(name==='dropou_shopee_cache'){for(const row of args.p_rows){const previous=this.tables.shopee_offers.find(r=>r.shop_id===row.shop_id&&r.item_id===row.item_id);if(previous)Object.assign(previous,row);else this.tables.shopee_offers.push({id:crypto.randomUUID(),owner_id:args.p_owner,brand_id:'dropou',decision:'found',...row});}return {data:null,error:null};}
  if(name==='dropou_shopee_run'){if(this.tables.shopee_runs.length)return {data:null,error:null};const r={id:crypto.randomUUID(),owner_id:args.p_owner,brand_id:'dropou',day:bahiaDay(),state:'running'};this.tables.shopee_runs.push(r);return {data:r.id,error:null};}
  if(name==='dropou_shopee_reserve'){const rows=this.tables.shopee_requests;if(rows.some(r=>r.request_key===args.p_key)||rows.length>=8||rows.some(r=>r.blocked_until&&Date.parse(r.blocked_until)>Date.now()))return {data:null,error:null};const r={id:crypto.randomUUID(),owner_id:args.p_owner,brand_id:'dropou',day:bahiaDay(),request_key:args.p_key,kind:args.p_kind,state:'reserved'};rows.push(r);return {data:r.id,error:null};}
  if(name==='dropou_shopee_prepare'){const j=this.tables.telegram_jobs.find(j=>j.id===args.p_job);if(!j||j.state!=='queued'||j.prepared)return {data:null,error:null};j.prepared=true;j.shopee_lease_token=crypto.randomUUID();return {data:structuredClone(j),error:null};}
  if(name==='dropou_shopee_claim'){const j=this.tables.telegram_jobs.find(j=>j.id===args.p_job);if(!j||j.state!=='queued')return {data:null,error:null};j.state='sending';j.caption=args.p_caption;return {data:structuredClone(j),error:null};}
  if(name==='dropou_publication_receipt'){this.receipts.push(args);const j=this.tables.telegram_jobs.find(j=>j.id===args.p_job);j.state=args.p_state;j.message_ids=args.p_ids;return {data:null,error:null};}
  throw new Error('Unexpected RPC '+name);
 }
}
class Query implements PromiseLike<any>{
 filters:((row:any)=>boolean)[]=[];operation='select';payload:any;singleValue=false;maximum=Infinity;sort?:{field:string;ascending:boolean};
 constructor(public db:MemoryDb,public table:string){}
 select(..._args:unknown[]){return this;}eq(key:string,value:unknown){this.filters.push(r=>r[key]===value);return this;}
 gt(key:string,value:any){this.filters.push(r=>r[key]>value);return this;}gte(key:string,value:any){this.filters.push(r=>r[key]>=value);return this;}
 in(key:string,values:unknown[]){this.filters.push(r=>values.includes(r[key]));return this;}not(key:string,_operator:string,value:unknown){this.filters.push(r=>r[key]!==value&&r[key]!==undefined);return this;}
 order(field:string,{ascending=true}={}){this.sort={field,ascending};return this;}limit(n:number){this.maximum=n;return this;}single(){this.singleValue=true;return this;}maybeSingle(){this.singleValue=true;return this;}
 update(payload:unknown){this.operation='update';this.payload=payload;return this;}upsert(payload:unknown,_options?:unknown){this.operation='upsert';this.payload=payload;return this;}
 then<TResult1=any,TResult2=never>(resolve?:((value:any)=>TResult1|PromiseLike<TResult1>)|null,reject?:((reason:any)=>TResult2|PromiseLike<TResult2>)|null):PromiseLike<TResult1|TResult2>{
  let rows=this.db.tables[this.table].filter(r=>this.filters.every(f=>f(r)));
  if(this.operation==='update')rows.forEach(r=>Object.assign(r,this.payload));
  if(this.operation==='upsert'){let found=this.db.tables[this.table].find(r=>r.owner_id===this.payload.owner_id&&r.shop_id===this.payload.shop_id&&r.item_id===this.payload.item_id);if(found)Object.assign(found,this.payload);else {found={id:crypto.randomUUID(),decision:'found',...this.payload};this.db.tables[this.table].push(found);}rows=[found];}
  if(this.sort){const {field,ascending}=this.sort;rows.sort((a,b)=>(a[field]>b[field]?1:-1)*(ascending?1:-1));}rows=rows.slice(0,this.maximum);
  return Promise.resolve({data:structuredClone(this.singleValue?rows[0]||null:rows),error:null}).then(resolve,reject);
 }
}
const owner='10000000-0000-4000-8000-000000000001';
const config=()=>({...defaultShopeeConfig(),requireReview:false,times:['23:59']});
function fixture(extra:Record<string,unknown>={}){
 const db=new MemoryDb();db.tables.operation_settings.push({owner_id:owner,brand_id:'dropou',shopee_config:config(),telegram_chat_id:'-100123',telegram_verified_at:new Date().toISOString(),automation_enabled:true});
 const env={SHOPEE_AFFILIATE_APP_ID:'fixture',SHOPEE_AFFILIATE_SECRET:'fixture-secret',SHOPEE_AFFILIATE_APPROVED:'true',...extra};return {db,env};
}
test('engine performs one daily cached round, preserves rejection, and simulation makes zero Telegram calls or publication rows',async()=>{
 const {db,env}=fixture();let calls=0,targets=0;
 const engine=shopeeEngine({db:db as unknown as SupabaseClient,env,target:async()=>{targets++;throw new Error('Simulation cannot resolve a Telegram destination');},telegramEnv:async()=>{throw new Error('No Telegram in simulation');},http:async url=>{
  assert.equal(String(url),'https://open-api.affiliate.shopee.com.br/graphql');calls++;return Response.json({data:{productOfferV2:{nodes:[{itemId:'9001',shopId:'8001',productName:'Controle PC Xbox Bluetooth',priceMin:'180',priceMax:'180',imageUrl:'https://down-br.img.susercontent.com/file/test',offerLink:'https://s.shopee.com.br/fixture',ratingStar:'4.8',sales:1000,commissionRate:'0.1',priceDiscountRate:70}]}}});
 }});
 await engine.scan(owner);assert.equal(calls,6);assert.equal(db.tables.shopee_offers.length,1);assert.equal(db.tables.shopee_runs[0].state,'complete');assert.equal(db.tables.telegram_jobs.length,0);assert.equal(targets,0);assert.equal(db.tables.shopee_requests.length,6);
 db.tables.shopee_offers[0].decision='rejected';await engine.scan(owner);assert.equal(calls,6);assert.equal(db.tables.shopee_offers[0].decision,'rejected');assert.equal(db.tables.shopee_runs[0].preview.length,0);
});
test('engine without credentials stops before reserving a run, request or provider call',async()=>{
 const {db,env}=fixture({SHOPEE_AFFILIATE_SECRET:undefined});let calls=0;const engine=shopeeEngine({db:db as unknown as SupabaseClient,env,target:async()=>{throw new Error('No target');},telegramEnv:async()=>({}),http:async()=>{calls++;throw new Error('No provider');}});
 await assert.rejects(engine.scan(owner),/credenciais/);assert.equal(calls,0);assert.equal(db.tables.shopee_requests.length,0);assert.equal(db.tables.shopee_runs.length,0);
});
test('approval review uses the same observed history as the displayed score, without consuming provider calls',async()=>{
 const {db,env}=fixture();db.tables.operation_settings[0].shopee_config={...config(),minScore:80};
 const now=new Date(),offer:ShopeeOffer={itemId:'9001',shopId:'8001',name:'Controle PC Xbox Bluetooth',price:100,priceMax:100,image:'https://cf.shopee.com.br/file/fixture',offerLink:'https://s.shopee.com.br/fixture',productLink:'https://shopee.com.br/product/8001/9001',sales:10000,rating:4.8,commission:0.2,reportedDiscount:null,checkedAt:now.toISOString()};
 db.tables.shopee_observations.push({owner_id:owner,brand_id:'dropou',shop_id:'8001',item_id:'9001',observed_at:new Date(now.getTime()-86400000).toISOString(),price:200,price_max:200,sales:9000,rating:4.8});
 const engine=shopeeEngine({db:db as unknown as SupabaseClient,env,http:async()=>{throw new Error('No HTTP for review');},target:async()=>{throw new Error('No target');},telegramEnv:async()=>({})});
 const review=await engine.review(owner,offer);assert.equal(review.eligible,true);assert.equal(review.discountSource,'observed');assert.equal(review.observedDiscount,50);assert.equal(db.tables.shopee_requests.length,0);assert.equal(db.receipts.length,0);
});
test('engine observes a durable rate-limit backoff instead of retrying the same minute',async()=>{
 const {db,env}=fixture();let calls=0;const engine=shopeeEngine({db:db as unknown as SupabaseClient,env,target:async()=>{throw new Error('No target');},telegramEnv:async()=>({}),http:async()=>{calls++;return new Response('not logged',{status:429,headers:{'retry-after':'120'}});}});
 await assert.rejects(engine.scan(owner),/Limite da Shopee/);assert.equal(calls,1);assert.equal(db.tables.shopee_requests[0].state,'rate_limit');assert.ok(Date.parse(db.tables.shopee_requests[0].blocked_until)>Date.now()+100000);assert.equal(db.tables.shopee_runs[0].state,'error');
});
test('managed dispatcher records one sendPhoto receipt and never retries an uncertain external outcome',async()=>{
 for(const uncertain of [false,true]){
  const {db,env}=fixture({SHOPEE_AUTOMATION_LIVE:'true'}),s=db.tables.operation_settings[0];s.shopee_config={...config(),enabled:true,dryRun:false};
  const offer:ShopeeOffer={itemId:'9001',shopId:'8001',name:'Controle PC Xbox Bluetooth',price:180,priceMax:180,image:'https://down-br.img.susercontent.com/file/test',offerLink:'https://s.shopee.com.br/fixture',productLink:'https://shopee.com.br/product/8001/9001',rating:4.8,sales:1000,commission:0.1,reportedDiscount:70,checkedAt:new Date().toISOString()};
  const c={id:crypto.randomUUID(),owner_id:owner,brand_id:'dropou',decision:'approved',eligible:true,data:offer};db.tables.shopee_offers.push(c);
  const j={id:crypto.randomUUID(),owner_id:owner,brand_id:'dropou',product_id:crypto.randomUUID(),state:'queued',scheduled_at:new Date(Date.now()-1000).toISOString(),shopee_offer_id:c.id,publication_round:crypto.randomUUID(),snapshot:{createdAt:new Date().toISOString()}};db.tables.telegram_jobs.push(j);
  let calls=0;const engine=shopeeEngine({db:db as unknown as SupabaseClient,env,target:async()=>({id:s.telegram_chat_id,key:'a'.repeat(64),title:'Fixture'}),telegramEnv:async()=>({TELEGRAM_BOT_TOKEN:'fixture',TELEGRAM_CHAT_ID:s.telegram_chat_id}),http:async(url,init)=>{calls++;assert.match(String(url),/sendPhoto$/);const body=JSON.parse(String(init?.body));assert.ok(body.caption.includes(offer.offerLink));if(uncertain)throw new Error('network outcome unknown');return Response.json({ok:true,result:{message_id:500,chat:{id:s.telegram_chat_id}}});}});
  const result=await engine.dispatch(j.id);assert.equal(result.sent,!uncertain);assert.equal(j.state,uncertain?'uncertain':'sent');await engine.dispatch(j.id);assert.equal(calls,1);assert.equal(db.tables.shopee_requests.length,0);
 }
});
