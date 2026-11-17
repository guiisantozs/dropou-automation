// Actual GET handler; synthetic Auth/REST, all other network blocked.
import assert from 'node:assert/strict';
import {GET} from '../../src/app/api/shopee/saved-products/route';
import {emptyProduct} from '../../src/lib/product-draft';
process.env.NEXT_PUBLIC_SUPABASE_URL='https://schedule-fixture.supabase.co';process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY='fixture-public';process.env.SUPABASE_SECRET_KEY='fixture-server';
const owner='73000000-0000-4000-8000-000000000001',p={...emptyProduct(),operation:'celulares',store:'Shopee',name:'Carregador fixture',price:29.51,affiliateUrl:'https://shopee.com.br/product/123/456',checkedAt:new Date().toISOString(),inStock:true},at=new Date(Date.now()+86400000).toISOString();
let summaryCalls=0;
globalThis.fetch=async(input,init={})=>{
 const url=new URL(String(input)),h=new Headers(init.headers),reply=(data:unknown)=>Response.json(data);
 assert.equal(url.origin,'https://schedule-fixture.supabase.co');
 if(url.pathname==='/auth/v1/user')return reply({id:owner,aud:'authenticated',role:'authenticated'});
 if(url.pathname.endsWith('/rpc/dropou_access_context'))return reply({owner,actor:owner,admin:true,brands:['celulares']});
 if(url.pathname.endsWith('/telegram_dispatch_config'))return reply({owner_ids:[owner],automation_enabled:true});
 if(url.pathname.endsWith('/rpc/dropou_saved_retention'))return reply({cleanup:[]});
 if(url.pathname.endsWith('/rpc/dropou_product_channel_summaries')){assert.equal(h.get('authorization'),'Bearer fixture-owner');assert.equal(h.get('x-dropou-brand'),'celulares');summaryCalls++;return reply([{product_id:p.id,telegram:{published:false,publishedAt:null,state:'queued',scheduledAt:at},whatsapp:{published:false,publishedAt:null,state:null,scheduledAt:null}}]);}
 if(url.pathname.endsWith('/shopee_saved_products'))return new Response(JSON.stringify([{id:crypto.randomUUID(),state:'ready',prepared_product_id:p.id,data:null}]),{headers:{'Content-Type':'application/json','Content-Range':'0-0/1'}});
 if(url.pathname.endsWith('/operation_settings'))return reply({manual_daily_limit:200,shopee_config:{},automation_enabled:false});
 if(url.pathname.endsWith('/shopee_requests'))return new Response(null,{headers:{'Content-Range':'*/0'}});
 if(url.pathname.endsWith('/products'))return reply([{id:p.id,data:p,curation_state:'pending',archived_at:null}]);
 if(url.pathname.endsWith('/offers')||url.pathname.endsWith('/deliveries'))return reply([]);
 if(url.pathname.endsWith('/telegram_jobs'))return reply([{id:crypto.randomUUID(),product_id:p.id,channel:'telegram',state:'queued',scheduled_at:at,destination_title:'Celulares',attempts:0,message_ids:[]}]);
 throw Error('Unexpected fixture request '+url.pathname);
};
const r=await GET(new Request('https://dropou.test/api/shopee/saved-products',{headers:{Authorization:'Bearer fixture-owner','x-dropou-brand':'celulares'}}));assert.equal(r.status,200,await r.clone().text());const data=await r.json();assert.equal(summaryCalls,1);assert.equal(data.publications[p.id].channels.telegram.state,'queued');assert.equal(data.publications[p.id].curationState,'pending');assert.equal(data.executorPaused,true);console.log('authenticated library summary passed');
