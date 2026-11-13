import {test} from 'node:test';
import assert from 'node:assert/strict';
import type {SupabaseClient} from '@supabase/supabase-js';
import {loadCuratedDiscovery} from '../src/server/shopee/curation';

test('curation reads are owner/brand scoped, cross internal pages, expose failures and perform no mutation',async()=>{
 const reads:{table:string;filters:Record<string,string>;from:number}[]=[];
 const data:Record<string,any[]>={shopee_offers:[],products:Array.from({length:501},(_,i)=>({id:String(i),data:{name:'Produto manual '+i},canonical_url:'manual/'+i,curation_state:'pending',archived_at:null})),dropou_operation_publications:[],shopee_observations:[],operation_settings:[{shopee_config:{}}]};
 let broken=false;
 const db={from(table:string){const filters:Record<string,string>={};let from=0,to=499,single=false;const q={select(){return q;},eq(k:string,v:string){filters[k]=v;return q;},gte(){return q;},order(){return q;},range(a:number,b:number){from=a;to=b;return q;},single(){single=true;return q;},then(resolve:Function,reject:Function){reads.push({table,filters,from});assert.deepEqual(filters,{owner_id:'owner',brand_id:'dropou'});return Promise.resolve({data:single?data[table][0]:data[table].slice(from,to+1),error:broken&&table==='products'?{message:'unavailable'}:null}).then(resolve as any,reject as any);}};return q;}};
 const rows=await loadCuratedDiscovery(db as unknown as SupabaseClient,'owner');assert.equal(rows.length,501);assert.ok(reads.some(r=>r.table==='products'&&r.from===500));
 broken=true;await assert.rejects(loadCuratedDiscovery(db as unknown as SupabaseClient,'owner'),/ler o cache/);
});
