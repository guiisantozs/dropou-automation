import {test} from 'node:test';
import assert from 'node:assert/strict';
import {searchChannel} from '../src/server/shopee/on-demand';
import {shopeeEngine} from '../src/server/shopee/engine';
import type {SupabaseClient} from '@supabase/supabase-js';
import {channelClassification} from '../src/lib/channel-profiles';
import {shopeeLimit} from '../src/lib/shopee-limits';
import {defaultShopeeConfig} from '../src/lib/shopee-automation';
import {workspaceAdminRequired} from '../src/lib/operator-access';
test('operators retain channel work but cannot reconfigure integrations, change budgets or send to a separate test destination',()=>{
 for(const [path,method]of [['/api/operations','PATCH'],['/api/team','POST'],['/api/ai/usage','PATCH'],['/api/ai/visual/diagnostic','POST'],['/api/publication-config','POST'],['/api/shopee/automation','PATCH'],['/api/shopee/test-telegram','POST']])assert.equal(workspaceAdminRequired(path,method),true);
 for(const [path,method]of [['/api/shopee/automation','POST'],['/api/shopee/saved-products','POST'],['/api/product-operations','POST'],['/api/offers/fixture/telegram','POST'],['/api/team','GET']])assert.equal(workspaceAdminRequired(path,method),false);
});
test('purpose-specific Shopee limits never use the former shared daily cap',()=>{
 assert.equal(shopeeLimit({SHOPEE_DAILY_REQUEST_LIMIT:'1'},'manual'),200);
 assert.equal(shopeeLimit({SHOPEE_DAILY_REQUEST_LIMIT:'1'},'search'),40);
 assert.equal(shopeeLimit({SHOPEE_MANUAL_DAILY_REQUEST_LIMIT:'300'},'manual'),300);
 assert.equal(shopeeLimit({SHOPEE_MANUAL_DAILY_REQUEST_LIMIT:'NaN'},'manual'),200);
});
test('on-demand searches use bounded calls and the correct channel filters; a duplicate click uses its lease',async()=>{
 for(const brand of ['celulares','tenis','automoto'] as const){
  const rows:any[]=[],reserved:any[]=[],settled:any[]=[];let claimed=false,calls=0;
  const db={from(){const q:any={select(){return q;},eq(){return q;},single(){return q;},update(){return q;},then(resolve:any){return Promise.resolve({data:{radar:{},shopee_config:{}},error:null}).then(resolve);}};return q;},async rpc(name:string,args:any){
   if(name==='dropou_shopee_search_claim'){const token=claimed?null:'lease';claimed=true;return {data:token,error:null};}
   if(name==='dropou_shopee_reserve_v2'){reserved.push(args);return {data:{id:crypto.randomUUID()},error:null};}
   if(name==='dropou_shopee_finish'){settled.push(args);return {data:null,error:null};}
   if(name==='dropou_shopee_cache_channel'){assert.equal(args.p_brand,brand);rows.push(...args.p_rows);return {data:null,error:null};}
   throw new Error('Unexpected RPC '+name);
  }} as unknown as SupabaseClient;
  const http=(async()=>{calls++;return Response.json({data:{productOfferV2:{nodes:['Smartphone Samsung Galaxy A55','Tênis Olympikus corrida feminino','Carregador veicular USB para carro','Panela cozinha'].map((name,i)=>({itemId:String(i+1),shopId:'123',productName:name,imageUrl:'https://down-br.img.susercontent.com/file/test',offerLink:'https://s.shopee.com.br/test',priceMin:150,priceMax:150,ratingStar:4.8,sales:5000,commissionRate:.1,priceDiscountRate:20}))}}});}) as typeof fetch;
  const result=await searchChannel(db,'owner',brand,{SHOPEE_AFFILIATE_APP_ID:'fixture',SHOPEE_AFFILIATE_SECRET:'fixture',SHOPEE_AFFILIATE_APPROVED:'true'},http);
  assert.equal(result.calls,3);assert.equal(calls,3);assert.ok(rows.length);assert.ok(rows.every(row=>channelClassification(row.data.name,brand)?.relevant));
  assert.ok(reserved.every(r=>r.p_kind==='search'&&r.p_brand===brand));assert.equal(settled.length,3);
  assert.equal((await searchChannel(db,'owner',brand,{SHOPEE_AFFILIATE_APP_ID:'fixture',SHOPEE_AFFILIATE_SECRET:'fixture',SHOPEE_AFFILIATE_APPROVED:'true'},http)).busy,true);assert.equal(calls,3);
 }
});
test('existing cron tick and automatic scan never start discovery or schedule approved candidates implicitly',async()=>{
 let httpCalls=0,rpcs=0;
 const db={from(table:string){const q:any={select(){return q;},eq(){return q;},not(){return q;},lte(){return q;},order(){return q;},limit(){return q;},single(){return q;},then(resolve:any){return Promise.resolve({data:table==='operation_settings'?[{owner_id:'owner',brand_id:'dropou',automation_enabled:true,shopee_config:{enabled:true}}]:[],error:null}).then(resolve);}};return q;},async rpc(){rpcs++;throw new Error('No search or planning RPC may run in the idle cron');}} as unknown as SupabaseClient;
 const engine=shopeeEngine({db,env:{},http:async()=>{httpCalls++;throw new Error('No provider call');},target:async()=>{throw new Error('No destination call');},telegramEnv:async()=>({})});
 await engine.tick();assert.equal(httpCalls,0);assert.equal(rpcs,0);
});
