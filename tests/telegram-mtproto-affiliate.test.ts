import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mtprotoAffiliateConverter} from '../src/server/mtproto/shopee-affiliate';
import {MtprotoShopeeTestQueue} from '../src/server/mtproto/shopee-queue';
import type {ConnectionRow} from '../src/server/mtproto/store';

const scope={owner:'10000000-0000-4000-8000-000000000001',brand:'dropou'},id={shopId:'123',itemId:'456'},canonical='https://shopee.com.br/product/123/456';
const env={SHOPEE_AFFILIATE_APP_ID:'fixture',SHOPEE_AFFILIATE_SECRET:'fixture-private',SHOPEE_AFFILIATE_APPROVED:'true'};
const node=(overrides={})=>({shopId:'123',itemId:'456',productName:'Produto da API oficial',imageUrl:'https://down-br.img.susercontent.com/file/fixture',offerLink:'https://s.shopee.com.br/our-affiliate',productLink:canonical,priceMin:150,priceMax:175,ratingStar:4.8,sales:1000,commissionRate:.1,priceDiscountRate:10,...overrides});
function fixture(options:{cached?:unknown;reason?:string;cacheError?:boolean;saveError?:boolean;raw?:unknown;enabled?:boolean}={}){
 const now=Date.now(),rpcs:{name:string;args:any}[]=[],writes:any[]=[],filters:any[]=[];let calls=0,active=true;
 const db:any={from(table:string){assert.equal(table,'shopee_import_cache','Only the existing fact cache may be written');const q:any={select(){return q;},eq(...args:any[]){filters.push(args);return q;},async maybeSingle(){return {data:options.cached?{data:options.cached}:null,error:options.cacheError?{}:null};},async upsert(row:any){writes.push(row);return {error:options.saveError?{}:null};}};return q;},async rpc(name:string,args:any){rpcs.push({name,args});if(name==='dropou_shopee_reserve_v2')return {data:options.reason?{reason:options.reason}:{id:'request-id'},error:null};assert.equal(name,'dropou_shopee_finish');return {error:null};}};
 const http=(async(_input,init)=>{calls++;assert.equal(init?.method,'POST');assert.equal(init?.redirect,'error');const query=JSON.parse(String(init?.body)).query;assert.match(query,/itemId:456/);assert.match(query,/shopId:123/);assert.ok(!query.includes('affiliate'));assert.ok(!query.includes('Legenda'));return Response.json(options.raw??{data:{p0:{nodes:[node()]}}});}) as typeof fetch;
 const converter=mtprotoAffiliateConverter(db,options.enabled===false?{}:env,http,()=>now);
 const context={valid:()=>active,signal:new AbortController().signal};
 return {converter,context,db,now,rpcs,writes,filters,calls:()=>calls,stop:()=>{active=false;}};
}
function offer(now:number,overrides={}){return {shopId:'123',itemId:'456',name:'Produto em cache',image:'https://down-br.img.susercontent.com/file/cached',offerLink:'https://s.shopee.com.br/cached-own',productLink:canonical,price:120,priceMax:120,rating:4.8,sales:1000,commission:.1,reportedDiscount:10,checkedAt:new Date(now).toISOString(),...overrides};}

test('MTProto conversion reuses official batch client, exact identity, mirror reservation and finish, writing only existing cache',async()=>{
 const f=fixture(),result=await f.converter(scope,id,f.context);
 assert.equal(result.state,'generated');assert.equal(result.source,'api');assert.equal(result.affiliateUrl,'https://s.shopee.com.br/our-affiliate');assert.equal(result.product?.price,150);assert.equal(result.product?.priceMax,175);assert.equal(f.calls(),1);
 assert.equal(f.rpcs.length,2);assert.equal(f.rpcs[0].name,'dropou_shopee_reserve_v2');assert.equal(f.rpcs[0].args.p_kind,'mirror');assert.equal(f.rpcs[0].args.p_brand,'dropou');assert.equal(f.rpcs[0].args.p_global_limit,10);assert.ok(f.rpcs[0].args.p_key.includes(scope.owner+':dropou:123:456:'));assert.equal(f.rpcs[1].args.p_state,'ok');
 assert.equal(f.writes.length,1);assert.equal(f.writes[0].owner_id,scope.owner);assert.equal(f.writes[0].data.itemId,'456');assert.ok(!JSON.stringify(result).includes(env.SHOPEE_AFFILIATE_SECRET));
 assert.ok(f.filters.some(([k,v])=>k==='owner_id'&&v===scope.owner));
});
test('fresh validated owner cache avoids API and budget while stale or wrong product facts never become generated output',async()=>{
 const cached=fixture({cached:offer(Date.now())});const result=await cached.converter(scope,id,cached.context);assert.equal(result.source,'cache');assert.equal(result.affiliateUrl,'https://s.shopee.com.br/cached-own');assert.equal(cached.calls(),0);assert.equal(cached.rpcs.length,0);assert.equal(cached.writes.length,0);
 for(const data of [offer(Date.now()-900001),offer(Date.now(),{itemId:'999'}),offer(Date.now(),{offerLink:'https://evil.invalid/affiliate'})]){const f=fixture({cached:data});const r=await f.converter(scope,id,f.context);assert.equal(r.source,'api');assert.equal(f.calls(),1);assert.equal(r.affiliateUrl,'https://s.shopee.com.br/our-affiliate');}
});
test('missing credentials, unauthorized brand, inactive window and cache errors never spend a Shopee call',async()=>{
 const credentials=fixture({enabled:false});assert.equal((await credentials.converter(scope,id,credentials.context)).state,'error');assert.equal(credentials.calls(),0);assert.equal(credentials.rpcs.length,0);
 const other=fixture();assert.equal((await other.converter({...scope,brand:'celulares'},id,other.context)).state,'error');other.stop();assert.equal((await other.converter(scope,id,other.context)).state,'error');assert.equal(other.calls(),0);
 const broken=fixture({cacheError:true});assert.equal((await broken.converter(scope,id,broken.context)).state,'error');assert.equal(broken.calls(),0);assert.equal(broken.rpcs.length,0);
});
test('budget, duplicates, backoff and GraphQL auth/provider failures are explicit failures with zero retries and no affiliate fallback',async()=>{
 for(const reason of ['manual_budget','duplicate','busy','rate_limit']){const f=fixture({reason}),r=await f.converter(scope,id,f.context);assert.equal(r.state,'error');assert.equal(r.affiliateUrl,null);assert.equal(r.product,null);assert.equal(f.calls(),0);assert.equal(f.writes.length,0);}
 for(const message of ['System Error','Invalid signature']){const f=fixture({raw:{errors:[{message}]}}),r=await f.converter(scope,id,f.context);assert.equal(r.state,'error');assert.equal(r.affiliateUrl,null);assert.equal(f.calls(),1);assert.equal(f.writes.length,0);assert.equal(f.rpcs.length,2);assert.equal(f.rpcs[1].args.p_state,message==='System Error'?'provider':'auth');}
});
test('wrong identity, missing data, untrusted URLs or plain canonical links cannot report affiliate success',async()=>{
 for(const n of [node({itemId:'999'}),node({productLink:'https://shopee.com.br/product/123/999'}),node({offerLink:'https://evil.invalid/x'}),node({offerLink:canonical}),node({imageUrl:''}),node({priceMin:0})]){const f=fixture({raw:{data:{p0:{nodes:[n]}}}}),r=await f.converter(scope,id,f.context);assert.equal(r.state,'error');assert.equal(r.affiliateUrl,null);assert.equal(f.writes.length,0);assert.equal(f.calls(),1);}
 const lost=fixture({saveError:true});assert.equal((await lost.converter(scope,id,lost.context)).state,'error');assert.equal(lost.calls(),1);
});
test('text plus photo/caption and duplicate event share one official conversion and preserve each Telegram identity',async()=>{
 const f=fixture();let time=f.now;
 const q=new MtprotoShopeeTestQueue(async()=>({status:'found',productId:'local'}),()=>true,()=>time,fetch,f.converter);
 const row={id:'connection',owner_id:scope.owner,brand_id:'dropou',test_channel_id:'789',test_started_at:new Date(time).toISOString(),test_expires_at:new Date(time+600000).toISOString()} as ConnectionRow;
 q.begin(row);
 for(const [messageId,kind] of [[1,'text'],[1,'text'],[2,'photo']] as const)q.accept(row,{id:messageId,channelId:'789',date:Math.ceil(time/1000),kind},{urls:[canonical],invalid:0,limited:false});
 await q.settled(scope);const list=q.snapshot(scope).items;assert.equal(list.length,2);assert.equal(f.calls(),1);assert.equal(list[1].repeatedInTest,true);assert.ok(list.every(e=>e.conversion?.state==='generated'&&e.itemId==='456'&&e.conversion.affiliateUrl==='https://s.shopee.com.br/our-affiliate'));assert.deepEqual(list.map(e=>e.messageId),[1,2]);
 list[0].conversion!.product!.name='client mutation';assert.notEqual(q.snapshot(scope).items[0].conversion!.product!.name,'client mutation');
 q.clear(scope);assert.equal(q.snapshot(scope).items.length,0);
});
test('stop or lost lease during official request cannot repopulate queue or save results',async()=>{
 let release!:()=>void,entered!:()=>void;const wait=new Promise<void>(r=>{release=r;}),started=new Promise<void>(r=>{entered=r;});const f=fixture();
 const converter=mtprotoAffiliateConverter(f.db,env,(async()=>{entered();await wait;return Response.json({data:{p0:{nodes:[node()]}}});}) as typeof fetch);
 const pending=converter(scope,id,f.context);await started;f.stop();release();assert.equal((await pending).state,'error');assert.equal(f.writes.length,0);
});
