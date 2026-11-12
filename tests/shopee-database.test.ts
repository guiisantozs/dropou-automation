import {shopeeProduct} from '../src/lib/shopee-product';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import {assessShopeeOffer,defaultShopeeConfig,bahiaTime,bahiaDay,shopeeCaption,type ShopeeOffer} from '../src/lib/shopee-automation';
import {emptyProduct} from '../src/lib/product-draft';
import {safePublicationCaption,pricedDraftCaption} from '../src/lib/publication-copy';
import {productSchema} from '../src/lib/domain';
const owner='10000000-0000-4000-8000-000000000001',other='10000000-0000-4000-8000-000000000002',target={id:'-100111',key:'a'.repeat(64),title:'Canal de teste isolado'};
test('Shopee migration and shared queue: atomic budgets, leases, RLS, real evidence and channel independence',async t=>{
 const db=new PGlite();
 async function one(sql:string,args:unknown[]=[]){return (await db.query<any>(sql,args)).rows[0];}
 async function role(name='service_role',uid=owner,brand='dropou'){await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[uid]);await db.query("select set_config('request.headers',$1,false)",[JSON.stringify({'x-dropou-brand':brand})]);await db.exec('set role '+name);}
 let counter=9000;
 async function cache(options:{decision?:string;item?:string;name?:string;eligible?:boolean}={}){
  const o:ShopeeOffer={itemId:options.item||String(++counter),shopId:'8001',name:options.name||'Controle PC Xbox Bluetooth',price:180,priceMax:180,image:'https://down-br.img.susercontent.com/file/fixture',offerLink:'https://s.shopee.com.br/test-'+counter,productLink:'',rating:4.8,sales:1000,commission:0.08,reportedDiscount:70,checkedAt:new Date().toISOString()};o.productLink=`https://shopee.com.br/product/${o.shopId}/${o.itemId}`;
  const r=await one('insert into shopee_offers(owner_id,shop_id,item_id,data,score,eligible,decision,checked_at) values($1,$2,$3,$4,80,$5,$6,now()) returning *',[owner,o.shopId,o.itemId,JSON.stringify(o),options.eligible??true,options.decision||'approved']);return {...r,data:o};
 }
 let configuredSlot='';
 const at=()=>{if(configuredSlot)return configuredSlot;const d=new Date(Date.now()+300000);d.setUTCSeconds(0,0);return d.toISOString();};
 async function configure(extra:Record<string,unknown>={}){configuredSlot='';configuredSlot=at();const config={...defaultShopeeConfig(),enabled:true,dryRun:false,times:[bahiaTime(new Date(at()))],...extra};await db.query("update operation_settings set shopee_config=$1,telegram_chat_id=$2,telegram_verified_at=now(),automation_enabled=true where owner_id=$3 and brand_id='dropou'",[JSON.stringify(config),target.id,owner]);await db.exec('update telegram_dispatch_config set automation_enabled=true');return config;}
 function product(o:ShopeeOffer){return {...emptyProduct(),operation:'dropou',id:crypto.randomUUID(),name:o.name,store:'Shopee',price:o.price,affiliateUrl:o.offerLink,originalUrl:o.productLink,image:o.image,inStock:null,checkedAt:o.checkedAt,dataOrigin:'official',source:{provider:'shopee',itemId:o.shopId+':'+o.itemId,verifiedAt:o.checkedAt,priceEndpoint:'https://open-api.affiliate.shopee.com.br/graphql',referenceAmount:null,previousEvidence:'none'}};}
 async function enqueue(c:any){return (await one('select dropou_shopee_enqueue($1,$2,$3,$4,$5) j',[owner,c.id,at(),JSON.stringify(target),JSON.stringify(product(c.data))])).j;}
 async function due(j:any){await db.query("update telegram_jobs set scheduled_at=now() where id=$1",[j.id]);return (await one('select dropou_shopee_prepare($1) j',[j.id])).j;}
 async function claim(prepared:any,c:any,caption=shopeeCaption(c.data)){return (await one('select dropou_shopee_claim($1,$2,$3,$4,$5,$6) j',[prepared.id,prepared.shopee_lease_token,target.key,JSON.stringify({...product(c.data),id:prepared.product_id}),caption,JSON.stringify(c.data)])).j;}
 try{
  await db.exec(`create schema auth;create schema storage;create role authenticated;create role anon;create role service_role bypassrls;create table auth.users(id uuid primary key);insert into auth.users values('${owner}'),('${other}');create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema public,auth to authenticated,anon,service_role;grant execute on function auth.uid() to authenticated,anon,service_role;create table storage.buckets(id text primary key,public boolean,allowed_mime_types text[]);`);
  for(const path of ['schema.sql','whatsapp-flow.sql','ai-economy.sql','telegram-offers.sql','migrations/20261106132921_offer_editor_and_thumbnails.sql','migrations/20261106150839_publication_dispatch_and_review.sql','optional-price-publication.sql','migrations/20261106193213_channel_funnels_product_lifecycle.sql','migrations/20261106203815_fix_catalog_delete_and_schedule_resume.sql','migrations/20261110131227_publication_history_destinations.sql','migrations/20261110133427_publication_history_republication_proof.sql'])await db.exec(readFileSync('supabase/'+path,'utf8'));
  await db.query('insert into telegram_dispatch_config(id,secret,owner_ids,destination_key) values(true,$1,$2,$3)',['fixture-no-secret',[owner],target.key]);
  await db.exec(readFileSync('supabase/migrations/20261110142534_multibrand_automation_foundation.sql','utf8'));
  const before=await one('select (select count(*) from products) products,(select count(*) from publications) whatsapp,(select automation_enabled from telegram_dispatch_config where id=true) enabled');
  await db.exec(readFileSync('supabase/migrations/20261111190838_shopee_offer_automation.sql','utf8'));
  await db.exec(readFileSync('supabase/migrations/20261111201601_shopee_request_completion_clock.sql','utf8'));
  await db.exec(readFileSync('supabase/migrations/20261112112950_shopee_gamer_quality_history.sql','utf8'));
  await db.exec(readFileSync('supabase/migrations/20261112122158_shopee_next_posts.sql','utf8'));
  await db.exec(readFileSync('supabase/migrations/20261112125940_shopee_priced_drafts.sql','utf8'));
  // Match the existing hosted service-role grants, verified before the live test.
  await db.exec('grant select,insert on public.runs to service_role');
  assert.deepEqual(await one('select (select count(*) from products) products,(select count(*) from publications) whatsapp,(select automation_enabled from telegram_dispatch_config where id=true) enabled'),before);
  await role();
  await t.test('initial config does not enable any niche or publication',async()=>{const rows=(await db.query<any>('select brand_id,shopee_config,automation_enabled from operation_settings')).rows;assert.equal(rows.length,3);assert.ok(rows.every(r=>!r.automation_enabled&&!r.shopee_config.enabled));const c=await cache();await assert.rejects(enqueue(c),/pausada|simula/);});
  await t.test('manual and scheduled API reservations share a strict atomic cap; unknown requests remain charged',async()=>{
   await configure();const reservations=await Promise.all(Array.from({length:20},(_,i)=>one('select dropou_shopee_reserve($1,$2,$3,10) id',[owner,'parallel-'+i,i%2?'search':'revalidate'])));assert.equal(reservations.filter(r=>r.id).length,8);assert.equal((await one('select count(*) n from shopee_requests')).n,8);assert.equal((await one("select dropou_shopee_reserve($1,'parallel-0','search',10) id",[owner])).id,null);await db.exec('delete from shopee_requests');
   const a=await one("select dropou_shopee_reserve($1,'backoff','search',10) id",[owner]);await db.query("update shopee_requests set state='rate_limit',blocked_until=now()+interval '2 minutes' where id=$1",[a.id]);assert.equal((await one("select dropou_shopee_reserve($1,'another','search',10) id",[owner])).id,null);await db.exec('delete from shopee_requests');
   const daily=(await one("select dropou_shopee_reserve($1,'first','search',1) id",[owner])).id;assert.ok(daily);assert.equal((await one("select dropou_shopee_reserve($1,'second','search',1) id",[owner])).id,null);await db.exec('delete from shopee_requests');
  });
  await t.test('daily search is leased once; complete runs reuse cache without a second principal round',async()=>{const first=(await one('select dropou_shopee_run($1) id',[owner])).id;assert.ok(first);assert.equal((await one('select dropou_shopee_run($1) id',[owner])).id,null);await db.query("update shopee_runs set state='complete',lease_until=null where id=$1",[first]);assert.equal((await one('select dropou_shopee_run($1) id',[owner])).id,null);});
  await t.test('request completion uses database time, retains its charge and cannot be rewritten by a repeated completion',async()=>{const {id}=await one("select dropou_shopee_reserve($1,'clock-test','search',10) id",[owner]);assert.ok(id);await one("select dropou_shopee_finish($1,'provider',120)",[id]);const row=await one("select *,extract(epoch from blocked_until-now()) remaining from shopee_requests where id=$1",[id]);assert.equal(row.state,'provider');assert.ok(Number(row.remaining)>115&&Number(row.remaining)<=121);await one("select dropou_shopee_finish($1,'ok',0)",[id]);assert.equal((await one('select state from shopee_requests where id=$1',[id])).state,'provider');await db.exec('delete from shopee_requests');});
  await t.test('batch cache updates preserve moderator decisions and ignore older observations',async()=>{const c=await cache({decision:'rejected'}),newer={...c.data,price:170,priceMax:170,checkedAt:new Date(Date.now()+1).toISOString()},row={shop_id:c.shop_id,item_id:c.item_id,data:newer,score:85,eligible:true,reasons:[],checked_at:newer.checkedAt};await one('select dropou_shopee_cache($1,$2)',[owner,JSON.stringify([row])]);assert.equal((await one('select decision from shopee_offers where id=$1',[c.id])).decision,'rejected');await one('select dropou_shopee_cache($1,$2)',[owner,JSON.stringify([{...row,data:c.data,checked_at:new Date(Date.now()-86400000).toISOString()}])]);assert.equal((await one('select data from shopee_offers where id=$1',[c.id])).data.price,170);});
  await t.test('observations survive cache updates; reassessment and repeated observations cannot invent growth',async()=>{
   const c=await cache(),n=await one('select count(*) n from shopee_observations where item_id=$1',[c.item_id]);assert.equal(n.n,1);
   const newer={...c.data,sales:1500,checkedAt:new Date(Date.now()+1000).toISOString()},a={shop_id:c.shop_id,item_id:c.item_id,data:newer,score:75,eligible:true,reasons:[],assessment:{version:2,confidence:95},checked_at:newer.checkedAt};
   await one('select dropou_shopee_cache($1,$2)',[owner,JSON.stringify([a])]);await one('select dropou_shopee_cache($1,$2)',[owner,JSON.stringify([a])]);
   assert.equal((await one('select count(*) n from shopee_observations where item_id=$1',[c.item_id])).n,2);assert.equal((await one('select assessment from shopee_offers where id=$1',[c.id])).assessment.confidence,95);
   await role('authenticated',other);assert.equal((await one('select count(*) n from shopee_observations')).n,0);await role('authenticated',owner,'bruto');assert.equal((await one('select count(*) n from shopee_observations')).n,0);await role('authenticated',owner);await assert.rejects(db.exec('delete from shopee_observations'),/permission denied/);await role('anon');await assert.rejects(db.exec('select * from shopee_observations'),/permission denied/);await role();
  });
  await t.test('owner reads and brand scope are enforced; clients cannot write cache, budget, configuration or claims',async()=>{
   await role('authenticated',other);assert.equal((await one('select count(*) n from shopee_offers')).n,0);await assert.rejects(db.query("select dropou_shopee_reserve($1,'bad','search',10)",[owner]),/permission denied/);await role('authenticated',owner,'bruto');assert.equal((await one('select count(*) n from shopee_offers')).n,0);await assert.rejects(db.exec("update operation_settings set shopee_config='{}'"),/permission denied/);await assert.rejects(db.exec("update shopee_offers set decision='approved'"),/permission denied/);await role('anon');await assert.rejects(db.exec('select * from shopee_requests'),/permission denied/);await role();
  });
  let completed:any,cached:any;
  await t.test('approved offers join the existing queue once per slot; prepare/claim and receipts cannot duplicate a send',async()=>{
   await configure();cached=await cache();completed=await enqueue(cached);assert.ok(completed.id);assert.equal(await enqueue(cached),null);assert.equal((await db.query('select * from dropou_due_operation_jobs()')).rows.length,0);
   const prep=await due(completed);assert.ok(prep.shopee_lease_token);assert.equal((await one('select dropou_shopee_prepare($1) j',[completed.id])).j,null);
   assert.equal((await one('select dropou_shopee_claim($1,$2,$3,$4,$5,$6) j',[prep.id,crypto.randomUUID(),target.key,JSON.stringify({...product(cached.data),id:prep.product_id}),shopeeCaption(cached.data),JSON.stringify(cached.data)])).j,null);
   const claimed=await claim(prep,cached);assert.equal(claimed.state,'sending');assert.equal(claimed.publication_mode,'official');assert.equal(claimed.snapshot.inStock,null);assert.match(claimed.caption,/Por R\$/);assert.equal(await claim(prep,cached),null);
   await one("select dropou_publication_receipt($1,'[\"901\"]','sending',null)",[completed.id]);await one("select dropou_publication_receipt($1,'[\"901\"]','sent',null)",[completed.id]);assert.equal((await one('select state from telegram_jobs where id=$1',[completed.id])).state,'sent');assert.equal((await one('select count(*) n from publications')).n,0);assert.equal((await one("select count(*) n from channel_events where job_id=$1 and event='sent'",[completed.id])).n,1);
  });
  await t.test('30-day cooldown survives cache refresh; one manual release retains previous proof in existing republication history',async()=>{
   const previous=await one('select message_ids,caption from deliveries where product_id=$1',[completed.product_id]);
   await db.query("update telegram_jobs set shopee_slot=$2 where id=$1",[completed.id,bahiaDay()+'T00:00']);
   assert.equal(await enqueue(cached),null);await db.query("update shopee_offers set repeat_until=now()+interval '10 minutes' where id=$1",[cached.id]);
   const again=await enqueue(cached);assert.equal(again.id,completed.id);assert.equal((await one('select count(*) n from republication_intents where used_at is not null')).n,1);const proof=await one('select previous_receipt from republication_intents where product_id=$1',[completed.product_id]);assert.deepEqual(proof.previous_receipt.message_ids,previous.message_ids);assert.equal(proof.previous_receipt.caption,previous.caption);assert.equal((await one('select repeat_until from shopee_offers where id=$1',[cached.id])).repeat_until,null);
   await db.query("update telegram_jobs set state='cancelled',shopee_slot=null where id=$1",[again.id]);
  });
  await t.test('rejected offers and wrong destinations cannot queue; stale price skips or is explicitly omitted',async()=>{
   await configure();const rejected=await cache({decision:'rejected'});await assert.rejects(enqueue(rejected),/aprovada/);
   const fresh=await cache();await assert.rejects(one('select dropou_shopee_enqueue($1,$2,$3,$4,$5)',[owner,fresh.id,at(),JSON.stringify({...target,id:'-100999'}),JSON.stringify(product(fresh.data))]),/canal/);
   const j=await enqueue(fresh),prep=await due(j);fresh.data.checkedAt=new Date(Date.now()-3600000).toISOString();await db.query("update shopee_offers set checked_at=now()-interval '1 hour',data=$2 where id=$1",[fresh.id,JSON.stringify(fresh.data)]);assert.equal(await claim(prep,fresh),null);assert.equal((await one('select state from telegram_jobs where id=$1',[j.id])).state,'blocked');await db.query('update telegram_jobs set shopee_slot=null where id=$1',[j.id]);
   await configure({stalePolicy:'omit'});const omit=await cache(),j2=await enqueue(omit),prep2=await due(j2);omit.data.checkedAt=new Date(Date.now()-3600000).toISOString();await db.query("update shopee_offers set checked_at=now()-interval '1 hour',data=$2 where id=$1",[omit.id,JSON.stringify(omit.data)]);const result=await claim(prep2,omit);assert.equal(result.state,'sending');assert.doesNotMatch(result.caption,/R\$|%/);await one("select dropou_publication_receipt($1,'[]','uncertain','simulated timeout')",[j2.id]);assert.equal((await one('select dropou_shopee_prepare($1) j',[j2.id])).j,null);
  });
  await t.test('an explicitly authorized single manual Shopee photo retains the ordinary receipt while all automation is paused',async()=>{
   await db.query("update operation_settings set automation_enabled=false,shopee_config='{}' where owner_id=$1",[owner]);await db.exec('update telegram_dispatch_config set automation_enabled=false');
   await one("insert into runs(owner_id,slot) values($1,'single-manual-test') returning slot",[owner]);await assert.rejects(db.query("insert into runs(owner_id,slot) values($1,'single-manual-test')",[owner]),/duplicate/);
   const c=await cache({decision:'found'}),p=productSchema.parse(product(c.data)),safe=safePublicationCaption(p),caption='🧪 TESTE DROPOU\n\n'+shopeeCaption(c.data);
   await db.query('insert into products(id,owner_id,brand_id,canonical_url,data) values($1,$2,$3,$4,$5)',[p.id,owner,'dropou','shopee.com.br/product/'+c.data.shopId+'/'+c.data.itemId,JSON.stringify(p)]);
   const o=await one("insert into offers(owner_id,brand_id,product_id,caption,snapshot,status) values($1,'dropou',$2,$3,$4,'rascunho') returning id",[owner,p.id,safe,JSON.stringify(p)]);
   const j=(await one("select dropou_publication_queue_v2($1,$2,'telegram',now(),$3,$4,$4,'safe',false) j",[owner,o.id,JSON.stringify({...target,mediaMode:'photo',photoConfirmed:true}),safe])).j;
   assert.equal((await one('select dropou_publication_claim_v2($1,$2,true) j',[j.id,target.key])).j,null);
   assert.equal((await one('select dropou_publication_claim_v2($1,$2,false) j',[j.id,target.key])).j.state,'sending');
   await db.query("update telegram_jobs set publication_mode='official',caption=$2,shopee_offer_id=$3,shopee_evidence=$4 where id=$1",[j.id,caption,c.id,JSON.stringify(c.data)]);
   await db.query("update deliveries set publication_mode='official',caption=$2 where product_id=$1 and channel='telegram'",[p.id,caption]);
   await one("select dropou_publication_receipt($1,'[\"999\"]','sending',null)",[j.id]);await one("select dropou_publication_receipt($1,'[\"999\"]','sent',null)",[j.id]);
   assert.equal((await one('select count(*) n from channel_events where job_id=$1 and event=\'sent\' and caption=$2',[j.id,caption])).n,1);
   assert.equal((await one('select data from products where id=$1',[p.id])).data.inStock,null);assert.equal((await one('select automation_enabled from telegram_dispatch_config where id=true')).automation_enabled,false);
   assert.equal((await one('select count(*) n from operation_settings where automation_enabled')).n,0);assert.equal((await one('select count(*) n from publications')).n,0);
   assert.equal((await one('select dropou_publication_claim_v2($1,$2,false) j',[j.id,target.key])).j,null);
  });
  await t.test('approval stages one draft atomically; repeated preparation retains edits and never schedules or sends',async()=>{
   await role();const c=await cache({decision:'found'}),p=shopeeProduct(c.data,c.id),before=await one('select (select count(*) from telegram_jobs) jobs,(select count(*) from deliveries) receipts,(select count(*) from shopee_requests) requests');
   const stage=(uid=owner,data=p)=>one('select dropou_shopee_stage($1,$2,$3,$4) id',[uid,c.id,JSON.stringify(data),JSON.stringify(assessShopeeOffer(c.data,defaultShopeeConfig()))]);
   await assert.rejects(stage(other),/indispon/);await assert.rejects(stage(owner,{...p,price:1}),/diverg/);
   await db.query('update shopee_offers set eligible=false where id=$1',[c.id]);assert.equal((await stage()).id,p.id);assert.equal((await one('select eligible from shopee_offers where id=$1',[c.id])).eligible,true);assert.equal((await one('select decision,prepared_product_id from shopee_offers where id=$1',[c.id])).decision,'approved');
   const saved=await one('select data from products where id=$1',[p.id]);assert.equal(saved.data.inStock,null);const offer=await one('select id,caption from offers where product_id=$1',[p.id]);assert.equal(offer.caption,pricedDraftCaption(saved.data));assert.match(offer.caption,/R\$/);
   await db.query('update offers set caption=$2,manually_edited=true where id=$1',[offer.id,'User preserved caption']);await stage();assert.equal((await one('select caption from offers where id=$1',[offer.id])).caption,'User preserved caption');assert.equal((await one('select count(*) n from offers where product_id=$1',[p.id])).n,1);
   assert.deepEqual(await one('select (select count(*) from telegram_jobs) jobs,(select count(*) from deliveries) receipts,(select count(*) from shopee_requests) requests'),before);
   await role('authenticated');await assert.rejects(stage(),/permission/);await role();await db.query('update products set archived_at=now() where id=$1',[p.id]);await assert.rejects(stage(),/arquivado/);
  });
  await t.test('priced draft matches the client; an expired priced schedule is held without removing its value',async()=>{
   await role();const c=await cache({decision:'found'}),p=shopeeProduct(c.data,c.id),a=assessShopeeOffer(c.data,defaultShopeeConfig());
   const pid=(await one('select dropou_shopee_stage($1,$2,$3,$4) id',[owner,c.id,JSON.stringify(p),JSON.stringify(a)])).id;
   let o=await one('select * from offers where product_id=$1',[pid]);const stored=(await one('select data from products where id=$1',[pid])).data;assert.equal(o.caption,pricedDraftCaption(stored));
   for(const price of [0.01,199.9,1234.56,1000000])assert.equal((await one('select dropou_priced_draft_caption($1) caption',[JSON.stringify({...stored,price})])).caption,pricedDraftCaption({...stored,price}));
   o=(await one('select dropou_publication_reconfirm($1,$2,$3) o',[owner,o.id,JSON.stringify(stored)])).o;
   const j=(await one("select dropou_publication_queue_v2($1,$2,'telegram',$3,$4,$5,$5,'verified',false) j",[owner,o.id,new Date(Date.now()+60000).toISOString(),JSON.stringify({...target,mediaMode:'photo',photoConfirmed:true}),o.caption])).j;
   await db.query("update telegram_jobs set scheduled_at=now(),authorized_until=now()-interval '1 minute' where id=$1",[j.id]);
   assert.equal((await one('select dropou_publication_claim_v2($1,$2,false) j',[j.id,target.key])).j,null);const held=await one('select state,caption,publication_mode,error from telegram_jobs where id=$1',[j.id]);assert.equal(held.state,'blocked');assert.equal(held.publication_mode,'verified');assert.equal(held.caption,o.caption);assert.match(held.error,/Revalide o pre/);
  });
  await t.test('Shopee operations never touch paid AI or mark WhatsApp as published',async()=>{assert.equal((await one('select count(*) n from ai_requests')).n,0);assert.equal((await one('select count(*) n from publications')).n,0);assert.equal((await one("select count(*) n from operation_settings where brand_id<>'dropou' and (automation_enabled or shopee_config<>'{}')")).n,0);});
 }finally{await db.close();}
});
