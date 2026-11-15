import {test} from 'node:test';
import assert from 'node:assert/strict';
import type {SupabaseClient} from '@supabase/supabase-js';
import {searchChannel} from '../src/server/shopee/on-demand';
import {onDemandKeywords} from '../src/lib/shopee-search';
import {defaultShopeeConfig} from '../src/lib/shopee-automation';
import {shopeeSearchFeedback} from '../src/lib/shopee-search-feedback';
const env={SHOPEE_AFFILIATE_APP_ID:'fixture',SHOPEE_AFFILIATE_SECRET:'fixture-only',SHOPEE_AFFILIATE_APPROVED:'true'};
function database(reason?:string){const events:{name:string;args:any}[]=[],writes:any[]=[];let reservations=0;
 const db={rpc:async(name:string,args:any)=>{events.push({name,args});if(name==='dropou_shopee_search_claim')return {data:'lease-fixture'};if(name==='dropou_shopee_reserve_v2')return {data:reason?{reason}:{id:'request-'+(++reservations)}};return {data:true};},from(table:string){const q={select(){return q;},eq(k:string,v:string){if(k==='owner_id')assert.equal(v,'owner');if(k==='brand_id')assert.equal(v,'dropou');return q;},single:async()=>({data:{radar:{},shopee_config:{}}}),update(value:any){writes.push({table,value});return q;},then(resolve:Function){return Promise.resolve({data:null,error:null}).then(resolve as any);}};return q;}} as unknown as SupabaseClient;
 return {db,events,writes};
}
test('default Tech searches start with the verified gamer shape; custom terms and other channels stay scoped',()=>{
 const config=defaultShopeeConfig();for(const day of ['2026-11-14','2026-11-15','2026-11-16'])assert.equal(onDemandKeywords('dropou',config,{}, {},day)[0],'gamer');
 const custom=onDemandKeywords('dropou',config,{keywords:['  controle pc ','controle pc','teclado']},{},'2026-11-15');assert.deepEqual([...custom].sort(),['controle pc','teclado']);
 assert.ok(!onDemandKeywords('celulares',config,{}, {},'2026-11-15').includes('gamer'));
});
test('GraphQL system failure is counted once, exposes safe diagnostics and does not pretend zero search results',async()=>{
 const f=database();let calls=0;const result=await searchChannel(f.db,'owner','dropou',env,async(_url,init)=>{calls++;assert.match(JSON.parse(String(init?.body)).query,/listType:2.*sortType:2|sortType:2.*listType:2/);assert.match(JSON.parse(String(init?.body)).query,/keyword:"gamer"/);return Response.json({errors:[{message:'System Error fixture private body',extensions:{code:10000}}]});});
 assert.equal(calls,1);assert.equal(result.calls,1);assert.equal(result.status,'failed');assert.doesNotMatch(result.message,/0 produto|0 resultado/);assert.deepEqual(result.diagnostics,[{code:'provider',httpStatus:200,providerCode:'10000',keyword:'gamer'}]);assert.ok(result.retryAt);assert.equal(f.events.filter(e=>e.name==='dropou_shopee_finish').length,1);assert.equal(f.events.filter(e=>e.name==='dropou_shopee_cache_channel').length,0);assert.equal(f.writes.length,1);
 const feedback=shopeeSearchFeedback(result);assert.equal(feedback.failed,true);assert.match(feedback.message,/preservados.*HTTP 200.*10000.*Aguarde/);assert.doesNotMatch(feedback.message,/private body|fixture-only/);
});
test('budget refusal never calls Shopee or counts an unreserved request',async()=>{
 const f=database('discovery_budget');let calls=0;const result=await searchChannel(f.db,'owner','dropou',env,async()=>{calls++;throw new Error('Forbidden');});assert.equal(calls,0);assert.equal(result.calls,0);assert.equal(result.status,'failed');assert.match(result.errors![0],/Limite diário de descoberta/);assert.equal(f.events.some(e=>e.name==='dropou_shopee_finish'),false);
});
test('partial discovery retains the first saved results and stops immediately after HTTP failure',async()=>{
 const f=database();let calls=0;const result=await searchChannel(f.db,'owner','dropou',env,async()=>{if(++calls===2)return new Response('private',{status:503});return Response.json({data:{productOfferV2:{nodes:[{shopId:'1',itemId:'2',productName:'Teclado mecânico gamer RGB',priceMin:100,priceMax:100,imageUrl:'https://down-br.img.susercontent.com/file/fixture',offerLink:'https://shope.ee/fixture',productLink:'https://shopee.com.br/product/1/2',ratingStar:4.9,sales:1000,commissionRate:.1,priceDiscountRate:20}]}}});});
 assert.equal(calls,2);assert.equal(result.status,'partial');assert.equal(result.found,1);assert.equal(result.received,1);assert.equal(f.events.filter(e=>e.name==='dropou_shopee_cache_channel').length,1);assert.match(shopeeSearchFeedback(result).message,/Busca parcial.*HTTP 503/);
});
