import {test} from 'node:test';
import assert from 'node:assert/strict';
import type {SupabaseClient} from '@supabase/supabase-js';
import {searchChannel} from '../src/server/shopee/on-demand';
const env={SHOPEE_AFFILIATE_APP_ID:'fixture',SHOPEE_AFFILIATE_SECRET:'fixture-only',SHOPEE_AFFILIATE_APPROVED:'true'};
function mock(cached=false,budget=false){const events:{name:string;args:any}[]=[],writes:any[]=[];
 const db={rpc:async(name:string,args:any)=>{events.push({name,args});if(name==='dropou_shopee_search_claim')return {data:'lease'};if(name==='dropou_celulares_search_window')return {data:{cached,cursor:0,retryAt:new Date(Date.now()+900000).toISOString()}};if(name==='dropou_shopee_reserve_v2')return {data:budget?{reason:'discovery_budget'}:{id:'request-'+events.length}};return {data:true};},from(table:string){const q={select(){return q;},eq(){return q;},single:async()=>({data:{radar:{},shopee_config:{},celulares_curation:{}}}),update(value:unknown){writes.push({table,value});return q;},then(resolve:Function){return Promise.resolve({data:null,error:null}).then(resolve as any);}};return q;}} as unknown as SupabaseClient;return {db,events,writes};
}
test('Celulares cache hit consumes no Shopee request or financial budget, still releases the lease',async()=>{
 const f=mock(true);let calls=0;const result=await searchChannel(f.db,'owner','celulares',env,async()=>{calls++;throw new Error('No request');});assert.equal(result.cached,true);assert.equal(result.calls,0);assert.equal(calls,0);assert.equal(f.events.some(e=>e.name==='dropou_shopee_reserve_v2'),false);assert.equal(f.writes.length,1);
});
test('Celulares explicit search uses up to five distinct weighted terms under the existing budget and caches only complete rounds',async()=>{
 const f=mock(),queries:string[]=[];const result=await searchChannel(f.db,'owner','celulares',env,async(_url,init)=>{queries.push(JSON.parse(String(init?.body)).query);return Response.json({data:{productOfferV2:{nodes:[]}}});});
 assert.equal(result.status,'complete');assert.equal(result.calls,5);assert.equal(queries.length,5);assert.equal(new Set(queries).size,5);assert.match(queries[0],/smartphone samsung galaxy a/);assert.equal(f.events.filter(e=>e.name==='dropou_shopee_finish').length,5);assert.equal(f.events.filter(e=>e.name==='dropou_celulares_cache').length,5);assert.equal(f.events.filter(e=>e.name==='dropou_celulares_search_complete').length,1);assert.ok(!f.events.some(e=>e.name.includes('queue')||e.name.includes('curate')));
});
test('Celulares never exceeds the existing budget and does not treat a failed round as a fresh cache',async()=>{
 const f=mock(false,true);let calls=0;const result=await searchChannel(f.db,'owner','celulares',env,async()=>{calls++;throw new Error('No request');});assert.equal(result.status,'failed');assert.equal(calls,0);assert.equal(result.calls,0);assert.ok(!f.events.some(e=>e.name==='dropou_celulares_search_complete'));
 const g=mock();const failed=await searchChannel(g.db,'owner','celulares',env,async()=>Response.json({errors:[{message:'System Error',extensions:{code:10000}}]}));assert.equal(failed.calls,1);assert.equal(failed.status,'failed');assert.ok(!g.events.some(e=>e.name==='dropou_celulares_search_complete'));
});
