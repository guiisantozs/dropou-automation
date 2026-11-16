// Executed with the react-server condition: exercises the server read model locally.
import assert from 'node:assert/strict';
import type {SupabaseClient} from '@supabase/supabase-js';
import {loadGeneralDashboard} from '../src/server/general-dashboard';
import {emptyProduct} from '../src/lib/product-draft';
import {workspaceBrands,type OperationScope} from '../src/lib/workspace-brands';
const now=Date.parse('2026-11-16T16:00:00Z'),owner='fixture-owner';
type Row=Record<string,any>;
const brands=workspaceBrands.filter(b=>b.id!=='all').map(b=>b.id);
const products=brands.flatMap((brand,i)=>Array.from({length:3},(_,n)=>{
 const id='00000000-0000-4000-8000-'+String(i*10+n+1).padStart(12,'0');
 return {id,brand_id:brand,owner_id:owner,curation_state:n===2?'pending':'approved',archived_at:null,data:{...emptyProduct(),id,operation:brand,name:'Produto '+brand+' '+n,price:100,store:'Shopee',originalUrl:'https://shopee.com.br/product/1/2',demo:false}};
}));
const receipts=products.filter((_,i)=>i%3===0).map(p=>({id:'receipt-'+p.id,product_id:p.id,owner_id:owner,brand_id:p.brand_id,source:'telegram_receipt',channel:'telegram',occurred_at:'2026-11-16T15:00:00Z'}));
const jobs=products.filter((_,i)=>i%3===1).map(p=>({id:'job-'+p.id,product_id:p.id,offer_id:p.id,owner_id:owner,brand_id:p.brand_id,state:'queued',channel:'telegram',scheduled_at:'2026-11-17T15:00:00Z',snapshot:p.data}));
const tables:Record<string,Row[]>={products,dropou_confirmed_publications:receipts,telegram_jobs:jobs,offers:[],operation_audit:brands.map(brand=>({id:brand,owner_id:owner,brand_id:brand,action:'Produto aprovado',created_at:'2026-11-16T15:30:00Z'})),operation_settings:brands.map(brand=>({owner_id:owner,brand_id:brand,shopee_config:{},radar:{}}))};
for(const operation of [...brands,'all'] as OperationScope[]){
 const calls:{table:string;filters:[string,unknown][]}[]=[],rpcs:string[]=[];
 let fail=false;
 const visible=(row:Row)=>operation==='all'||row.brand_id===operation;
 const db={from(table:string){
  // Deliberately do not enforce owner/brand in the mock table layer: missing explicit
  // filters would leak the other operation's rows and fail the assertions below.
  const filters:[string,unknown][]=[],predicates:((r:Row)=>boolean)[]=[];let from=0,to=Infinity,single=false;
  const value=(r:Row,k:string)=>k==='data->>demo'?String(r.data.demo):r[k];
  const q:Row={select(){return q;},eq(k:string,v:unknown){filters.push([k,v]);predicates.push(r=>value(r,k)===v);return q;},neq(k:string,v:unknown){predicates.push(r=>value(r,k)!==v);return q;},is(k:string,v:unknown){predicates.push(r=>value(r,k)===v);return q;},in(k:string,v:unknown[]){predicates.push(r=>v.includes(value(r,k)));return q;},gte(){return q;},order(){return q;},range(a:number,b:number){from=a;to=b;return q;},limit(n:number){to=n-1;return q;},single(){single=true;return q;},then(resolve:(v:unknown)=>unknown,reject:(e:unknown)=>unknown){
   calls.push({table,filters});const rows=(tables[table]||[]).filter(r=>predicates.every(p=>p(r))).slice(from,to+1);
   return Promise.resolve({data:single?rows[0]:rows,error:fail&&table==='operation_audit'?{message:'fixture-failure'}:null}).then(resolve,reject);
  }};return q;
 },rpc(name:string,args?:Row){rpcs.push(name);let data:any;
  if(name==='dropou_operational_products'){const rows=products.filter(visible).filter(p=>p.curation_state==='approved'&&!receipts.some(r=>r.product_id===p.id));data={rows,total:rows.length};assert.equal(args?.p_stage,'approved');}
  else if(name==='dropou_publication_records_page')data={entries:receipts.filter(visible)};
  else if(name==='dropou_product_channel_summaries')data=[];
  else if(name==='dropou_operation_summary')data={recent:1,published:1};
  else throw Error('Unexpected RPC '+name);
  return Promise.resolve({data,error:null});
 }};
 const result=await loadGeneralDashboard(db as unknown as SupabaseClient,owner,0,now,operation);
 const all=operation==='all',count=all?brands.length:1;
 assert.equal(result.stats.approved,count);assert.equal(result.stats.publications,count);assert.equal(result.stats.scheduled,count);
 assert.equal(result.distribution.reduce((n,s)=>n+s.value,0),count*3);
 assert.equal(result.weekly.reduce((n,d)=>n+d.telegram+d.whatsapp,0),count);
 assert.equal(result.channels.telegram.publications,count);assert.equal(result.channels.whatsapp.publications,0);
 if(!all){assert.ok(result.products.every(p=>p.operation===operation));assert.ok(result.upcoming.every(j=>j.brand_id===operation));assert.ok(result.activity.every(a=>a.brand===operation));}
 for(const call of calls){assert.ok(call.filters.some(([k,v])=>k==='owner_id'&&v===owner),call.table+' owner');if(!all)assert.ok(call.filters.some(([k,v])=>k==='brand_id'&&v===operation),call.table+' operation');}
 assert.ok(rpcs.every(name=>['dropou_operational_products','dropou_publication_records_page','dropou_product_channel_summaries','dropou_operation_summary'].includes(name)));
 if(result.operationSummary)assert.deepEqual(result.operationSummary,{recent:1,catalog:1});
 fail=true;await assert.rejects(()=>loadGeneralDashboard(db as unknown as SupabaseClient,owner,0,now,operation),/banco recusou/);
 console.log(operation+': scoped read model, exact metrics, independent channels and failure propagation passed');
}
