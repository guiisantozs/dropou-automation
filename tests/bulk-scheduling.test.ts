import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import {shopeeProduct} from '../src/lib/shopee-product';
import {productKey} from '../src/lib/domain';
import {pricedDraftCaption} from '../src/lib/publication-copy';
import {batchPrepareSchema,batchCommitSchema,batchDataIssue,batchRefKey,mergeBatchPage} from '../src/lib/bulk-scheduling';
const owner='61000000-0000-4000-8000-000000000001',member='61000000-0000-4000-8000-000000000002',other='61000000-0000-4000-8000-000000000003';
test('bulk scheduling: immutable review, partial transactions, replay protection, membership, retention and existing executor',async t=>{
 const db=new PGlite(),one=async(sql:string,args:any[]=[])=> (await db.query<any>(sql,args)).rows[0];
 async function role(uid=owner,brand='beleza',name='service_role'){await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[uid]);await db.query("select set_config('request.headers',$1,false)",[JSON.stringify({'x-dropou-brand':brand})]);await db.exec('set role '+name);}
 const target={id:'-10055',title:'Canal fixture',key:'a'.repeat(64)},future=new Date(Date.now()+3600000).toISOString();
 async function product(brand='beleza',stock:boolean|null=null){await role();const data={shopId:'123',itemId:String(Math.floor(Math.random()*1e8)),name:'Produto fixture',price:20,priceMax:20,image:'',offerLink:'https://s.shopee.com.br/fixture',productLink:'https://shopee.com.br/product/123/456',rating:4.8,sales:1200,commission:.1,reportedDiscount:null,checkedAt:new Date().toISOString()};data.productLink='https://shopee.com.br/product/123/'+data.itemId;
  await db.query("insert into shopee_saved_products(owner_id,brand_id,input_url,canonical_url,shop_id,item_id,state,data) values($1,$2,$3,$3,'123',$4,'ready',$5)",[owner,brand,data.productLink,data.itemId,JSON.stringify(data)]);
  const p={...shopeeProduct(data,crypto.randomUUID(),brand as any),inStock:stock};await role(member,brand,'authenticated');const saved=(await one('select dropou_save_product($1,$2) p',[JSON.stringify(p),productKey(p)])).p;await role();return saved;
 }
 const item=(p:any,repost=false)=>({key:'product:'+p.id,productId:p.id,expected:p,name:p.name,caption:pricedDraftCaption(p),repost,presentation:{mediaMode:'text',photoConfirmed:true}});
 async function prepare(items:any[],id=crypto.randomUUID(),actor=member,brand='beleza'){await role();return (await one("select dropou_schedule_batch_prepare($1,$2,$3,$4,$5,'telegram',$6,$7,$8) b",[owner,actor,brand,id,future,id,JSON.stringify(target),JSON.stringify(items)])).b;}
 const commit=async(id:string,actor=member,key=target.key,confirmed=true)=>(await one('select dropou_schedule_batch_commit($1,$2,$3,$4,$5) b',[owner,actor,id,key,confirmed])).b;
 try{
  await db.exec(`create schema auth;create schema storage;create role authenticated;create role anon;create role service_role bypassrls;create table auth.users(id uuid primary key);insert into auth.users values('${owner}'),('${member}'),('${other}');create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema public,auth to authenticated,anon,service_role;grant execute on function auth.uid() to authenticated,anon,service_role;create table storage.buckets(id text primary key,public boolean,allowed_mime_types text[]);`);
  for(const f of ['schema.sql','whatsapp-flow.sql','ai-economy.sql','telegram-offers.sql'])await db.exec(readFileSync('supabase/'+f,'utf8'));
  for(const f of readdirSync('supabase/migrations').filter(f=>f.endsWith('.sql')).sort()){await db.exec(readFileSync('supabase/migrations/'+f,'utf8'));if(f.includes('publication_dispatch_and_review')){await db.query('insert into telegram_dispatch_config(id,secret,owner_ids,destination_key) values(true,$1,$2,$3)',['fixture-only',[owner],'a'.repeat(64)]);await db.exec(readFileSync('supabase/optional-price-publication.sql','utf8'));}}
  await role();await db.query("select dropou_assign_member($1,$1,$2,'operator',array['beleza','casa','natal'],null)",[owner,member]);await db.query("select dropou_assign_member($1,$1,$2,'operator',array['tenis'],null)",[owner,other]);
  await db.query("update operation_settings set telegram_chat_id=$1,telegram_title=$2,telegram_verified_at=now() where brand_id in ('beleza','casa','natal')",[target.id,target.title]);
  await t.test('unreviewed products are listed without approving them; RLS never lists another operation',async()=>{await product();await product('casa');await role(member,'beleza','authenticated');const r=(await one('select dropou_schedule_candidates() r')).r;assert.ok(r.rows.length);assert.ok(r.rows.every((r:any)=>r.brand_id==='beleza'));assert.ok(r.rows.some((r:any)=>!r.reviewed));await role();assert.equal((await one("select count(*) n from products where curation_state='approved'")).n,0);});
  await t.test('one explicit collective review queues valid items and preserves invalid items as individual failures',async()=>{
   const a=await product(),bad=await product('beleza',false),b=await prepare([item(a),item(bad),{key:'missing',name:'Incompleto',error:'Preço ausente'}]);
   await assert.rejects(commit(b.id,member,target.key,false),/Confirme/);await assert.rejects(commit(b.id,other),/responsável|sessão/);await assert.rejects(commit(b.id,member,'wrong'),/destino/);
   const r=await commit(b.id);assert.deepEqual(r.items.map((i:any)=>i.state),['queued','failed','failed'],JSON.stringify(r));assert.ok(r.items[1].error);assert.deepEqual(await commit(b.id),r);assert.equal((await one('select count(*) n from telegram_jobs where schedule_batch_id=$1',[b.id])).n,1);assert.equal((await one('select count(*) n from deliveries')).n,0);assert.equal((await one('select data from products where id=$1',[bad.id])).data.inStock,false);
  });
  await t.test('new snapshots, concurrent schedules and expired retention fail safely without rolling back valid siblings',async()=>{
   const a=await product(),b=await product(),c=await product(),batch=await prepare([item(a),item(b),item(c)]);await db.query("update products set data=data||'{\"price\":25}' where id=$1",[a.id]);await db.query("update products set catalog_entered_at=now()-interval '15 days' where id=$1",[b.id]);const r=await commit(batch.id);assert.deepEqual(r.items.map((i:any)=>i.state),['failed','failed','queued']);
   const duplicate=await prepare([item(c)]);assert.equal((await commit(duplicate.id)).items[0].state,'failed');
  });
  await t.test('membership is rechecked at confirmation, replay IDs cannot change data, client roles cannot write',async()=>{
   const p=await product(),b=await prepare([item(p)]);await db.query('update operation_members set active=false where member_id=$1',[member]);await assert.rejects(commit(b.id),/acesso/);await db.query('update operation_members set active=true where member_id=$1',[member]);
   await assert.rejects(one("select dropou_schedule_batch_prepare($1,$2,'casa',$3,$4,'telegram','changed',$5,$6)",[owner,member,b.id,future,JSON.stringify(target),JSON.stringify([item(p)])]),/outros dados/);
   await role(member,'casa','authenticated');assert.equal((await one('select count(*) n from schedule_batches')).n,0);await assert.rejects(commit(b.id),/permission denied/);await role();
  });
  await t.test('published products require deliberate repost and previous real receipt history remains intact',async()=>{
   const p=await product('casa',true),first=await prepare([item(p)],crypto.randomUUID(),member,'casa'),r=await commit(first.id),job=r.items[0].jobId;assert.ok(job,JSON.stringify(r));await db.query("update telegram_jobs set scheduled_at=now()-interval '1 second' where id=$1",[job]);
   assert.equal((await one('select dropou_publication_claim_v2($1,$2,true) c',[job,target.key])).c.state,'sending');await one("select dropou_publication_receipt($1,'[\"42\"]','sent',null)",[job]);
   const current=(await one('select data from products where id=$1',[p.id])).data,offer=await one("select id,caption from offers where product_id=$1 and status<>'excluido'",[p.id]);const ref={...item(current),offerId:offer.id,caption:offer.caption,publishedAt:(await one('select to_jsonb(max(occurred_at)) at from dropou_confirmed_publications where product_id=$1',[p.id])).at};
   const no=await prepare([ref],crypto.randomUUID(),member,'casa');assert.equal((await commit(no.id)).items[0].state,'failed');
   const changed=await prepare([{...ref,repost:true,publishedAt:'2020-01-01T00:00:00Z'}],crypto.randomUUID(),member,'casa');assert.match((await commit(changed.id)).items[0].error,/histórico/);
   const yes=await prepare([{...ref,repost:true}],crypto.randomUUID(),member,'casa'),result=await commit(yes.id);assert.equal(result.items[0].state,'queued',JSON.stringify(result));assert.deepEqual(await commit(yes.id),result);assert.equal((await one("select count(*) n from channel_events where product_id=$1 and event='sent' and jsonb_array_length(message_ids)>0",[p.id])).n,1);
  });
  await t.test('due batches use the existing sequential executor while automatic discovery stays paused',async()=>{
   const a=await product('natal'),b=await product('natal'),batch=await prepare([item(a),item(b)],crypto.randomUUID(),member,'natal'),r=await commit(batch.id);assert.equal(r.items.filter((i:any)=>i.state==='queued').length,2,JSON.stringify(r));
   await db.exec("update telegram_jobs set scheduled_at=now()+interval '1 day' where schedule_batch_id is distinct from '"+batch.id+"'");await db.query("update telegram_jobs set scheduled_at=now()-interval '1 second' where schedule_batch_id=$1",[batch.id]);
   const due=(await db.query('select * from dropou_due_manual_telegram_jobs()')).rows;assert.equal(Object.values(due[0] as any)[0],r.items[0].jobId);assert.equal((await one('select dropou_publication_claim_v2($1,$2,true) c',[r.items[0].jobId,target.key])).c.state,'sending');assert.equal((await db.query('select * from dropou_due_manual_telegram_jobs()')).rows.length,0);
   await one("select dropou_publication_receipt($1,'[]','uncertain','Fixture only')",[r.items[0].jobId]);assert.equal(Object.values((await db.query('select * from dropou_due_manual_telegram_jobs()')).rows[0] as any)[0],r.items[1].jobId);assert.equal((await one("select count(*) n from operation_settings where brand_id in ('beleza','casa','natal') and automation_enabled")).n,0);
  });
 }finally{await db.close();}
});

test('selection survives pagination, scope and explicit confirmation are required; invalid data stays invalid',()=>{
 const a={id:crypto.randomUUID(),kind:'saved' as const,operation:'beleza' as const,repost:false},b={...a,id:crypto.randomUUID()};assert.equal(mergeBatchPage([a],[b],true).length,2);assert.deepEqual(mergeBatchPage([a,b],[b],false),[a]);assert.equal(batchRefKey(a),batchRefKey(a));
 const canonical={...a,kind:'product' as const,productId:a.id},alias={...b,productId:a.id};assert.deepEqual(mergeBatchPage([canonical],[alias],true),[canonical]);assert.deepEqual(mergeBatchPage([canonical],[alias],false),[]);
 const payload={action:'prepare',id:crypto.randomUUID(),operation:'beleza',channel:'telegram',scheduledAt:new Date(Date.now()+3600000).toISOString(),items:[a]};assert.equal(batchPrepareSchema.safeParse(payload).success,true);assert.equal(batchPrepareSchema.safeParse({...payload,items:[a,a]}).success,false);assert.equal(batchPrepareSchema.safeParse({...payload,items:[{...a,operation:'casa'}]}).success,false);assert.equal(batchCommitSchema.safeParse({action:'confirm',id:payload.id}).success,false);
 const p={...shopeeProduct({shopId:'1',itemId:'2',name:'Fixture',price:20,priceMax:20,image:'',offerLink:'https://s.shopee.com.br/fixture',productLink:'https://shopee.com.br/product/1/2',rating:null,sales:null,commission:null,reportedDiscount:null,checkedAt:new Date().toISOString()}),inStock:false};assert.match(batchDataIssue(p,pricedDraftCaption(p))!,/indisponível/);assert.match(batchDataIssue({...p,inStock:null},pricedDraftCaption(p),{price:20,priceMax:30})!,/variação/);
});
