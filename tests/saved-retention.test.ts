import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import {emptyProduct} from '../src/lib/product-draft';
import {productKey} from '../src/lib/domain';
import {formatCaption} from '../src/lib/ai';
const owner='20000000-0000-4000-8000-000000000001',operator='20000000-0000-4000-8000-000000000002';
test('saved retention: seven days plus fourteen catalog days, deletion, isolation and scheduled/history safeguards',async t=>{
 const db=new PGlite();let seq=100;
 async function one(sql:string,args:any[]=[]){return (await db.query<any>(sql,args)).rows[0];}
 async function role(name='service_role',uid=owner,brand='dropou'){
  await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[uid]);
  await db.query("select set_config('request.headers',$1,false)",[JSON.stringify({'x-dropou-brand':brand})]);await db.exec('set role '+name);
 }
 async function saved(age:number,brand='dropou',product:string|null=null){await role();const url='https://shopee.com.br/product/123/'+(++seq);return (await one("insert into shopee_saved_products(owner_id,brand_id,input_url,canonical_url,created_at,prepared_product_id,state,error) values($1,$2,$3,$3,now()-($4||' days')::interval,$5,'error','Consulta falhou') returning id",[owner,brand,url,String(age),product])).id;}
 async function product(){
  await role('authenticated');const p={...emptyProduct(),operation:'dropou' as const,name:'Controle gamer de teste',price:100,affiliateUrl:'https://shopee.com.br/product/123/'+(++seq),store:'Shopee' as const,checkedAt:new Date().toISOString(),inStock:true};
  const data=(await one('select dropou_save_product($1,$2) p',[JSON.stringify(p),productKey(p)])).p;
  const offer=(await one('select dropou_save_offer_version($1,$2,$3,$3,false) o',[data.id,JSON.stringify(data),formatCaption(data)])).o;await role();return offer;
 }
 try{
  await db.exec(`create schema auth;create schema storage;create role authenticated;create role anon;create role service_role bypassrls;create table auth.users(id uuid primary key);insert into auth.users values('${owner}'),('${operator}');create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema public,auth to authenticated,anon,service_role;grant execute on function auth.uid() to authenticated,anon,service_role;create table storage.buckets(id text primary key,public boolean,allowed_mime_types text[]);`);
  for(const file of ['schema.sql','whatsapp-flow.sql','ai-economy.sql','telegram-offers.sql'])await db.exec(readFileSync('supabase/'+file,'utf8'));
  for(const file of readdirSync('supabase/migrations').filter(f=>f.endsWith('.sql')).sort()){
   await db.exec(readFileSync('supabase/migrations/'+file,'utf8'));
   if(file.includes('publication_dispatch_and_review')){
    await db.query('insert into telegram_dispatch_config(id,secret,owner_ids,destination_key) values(true,$1,$2,$3)',['retention-test',[owner],'a'.repeat(64)]);
    await db.exec(readFileSync('supabase/optional-price-publication.sql','utf8'));
   }
  }
  await t.test('failed and pending links move at seven days and disappear after a total of twenty-one',async()=>{
   const fresh=await saved(6.99),boundary=await saved(7),catalog=await saved(20.99),expired=await saved(21);
   await one('select dropou_saved_retention($1,null)',[owner]);
   assert.equal((await one('select catalog_at from shopee_saved_products where id=$1',[fresh])).catalog_at,null);
   assert.ok((await one('select catalog_at from shopee_saved_products where id=$1',[boundary])).catalog_at);
   assert.ok((await one('select id from shopee_saved_products where id=$1',[catalog])).id);
   assert.equal(await one('select id from shopee_saved_products where id=$1',[expired]),undefined);
   await role('authenticated');const rows=(await one("select dropou_operational_products('catalog') r")).r.rows;
   assert.ok(rows.some((r:any)=>r.id===boundary&&r.kind==='saved'&&r.saved_state==='error'));
   assert.ok(!rows.some((r:any)=>r.id===fresh));
   await role();await one('select dropou_saved_retention($1,null)',[owner]);assert.ok(await one('select id from shopee_saved_products where id=$1',[catalog]));
  });
  await t.test('catalog is scoped by assigned channel; cleanup mutations are server-only',async()=>{
   const other=await saved(8,'tenis');await one('select dropou_saved_retention($1,null)',[owner]);
   await db.query("insert into operation_members(member_id,owner_id,role,brands) values($1,$2,'operator',array['tenis'])",[operator,owner]);
   await role('authenticated',operator,'all');const rows=(await one("select dropou_operational_products('catalog') r")).r.rows;
   assert.deepEqual(rows.map((r:any)=>r.id),[other]);
   await assert.rejects(db.query('select dropou_saved_retention(null,null)'),/permission denied/);
   await assert.rejects(db.query('select dropou_saved_catalog_remove($1,$2,$3,null)',[owner,'tenis',other]),/permission denied/);
   await role();assert.equal((await one('select dropou_saved_catalog_remove($1,$2,$3,null) r',[owner,'dropou',other])).r.removed,false);
   assert.ok(await one('select id from shopee_saved_products where id=$1',[other]));
  });
  await t.test('prepared products enter catalog once; explicit deletion removes every linked saved row and unused product',async()=>{
   const o=await product(),a=await saved(8,'dropou',o.product_id),b=await saved(9,'dropou',o.product_id);
   await one('select dropou_saved_retention($1,null)',[owner]);await role('authenticated');
   const rows=(await one("select dropou_operational_products('catalog') r")).r.rows;
   assert.equal(rows.filter((r:any)=>r.id===o.product_id).length,1);assert.ok(!rows.some((r:any)=>[a,b].includes(r.id)));
   await role();const result=(await one('select dropou_saved_catalog_remove($1,$2,$3,null) r',[owner,'dropou',a])).r;
   assert.equal(result.deleted,true);assert.equal((await one('select count(*) n from shopee_saved_products where id=any($1)',[[a,b]])).n,0);
   assert.equal(await one('select id from products where id=$1',[o.product_id]),undefined);
  });
  await t.test('an active import lease is preserved until the official request finishes',async()=>{
   const id=await saved(22);await db.query("update shopee_saved_products set state='fetching',lease_until=now()+interval '1 minute' where id=$1",[id]);
   await one('select dropou_saved_retention($1,null)',[owner]);assert.ok(await one('select id from shopee_saved_products where id=$1',[id]));
   assert.equal((await one('select dropou_saved_catalog_remove($1,$2,$3,null) r',[owner,'dropou',id])).r.protected,true);
   await db.query("update shopee_saved_products set state='error',lease_until=null where id=$1",[id]);await one('select dropou_saved_retention($1,null)',[owner]);
   assert.equal(await one('select id from shopee_saved_products where id=$1',[id]),undefined);
  });
  await t.test('automatic expiry preserves scheduled products, snapshot and job; manual deletion requires cancellation',async()=>{
   const o=await product(),s=await saved(22,'dropou',o.product_id),target={id:'-1001234',title:'Teste',key:'b'.repeat(64),mediaMode:'text',photoConfirmed:false};
   await db.query("update operation_settings set telegram_chat_id=$1 where owner_id=$2 and brand_id='dropou'",[target.id,owner]);
   const j=(await one('select dropou_publication_queue_v2($1,$2,$3,$4,$5,$6,$7,$8,false) j',[owner,o.id,'telegram',new Date(Date.now()+86400000).toISOString(),JSON.stringify(target),o.caption,o.caption,'verified'])).j;
   const before=await one('select state,snapshot,caption,scheduled_at from telegram_jobs where id=$1',[j.id]);
   const result=(await one('select dropou_saved_retention($1,null) r',[owner])).r;assert.ok(result.protected>=1);
   assert.ok(await one('select id from shopee_saved_products where id=$1',[s]));assert.deepEqual(await one('select state,snapshot,caption,scheduled_at from telegram_jobs where id=$1',[j.id]),before);
   assert.equal((await one('select dropou_saved_catalog_remove($1,$2,$3,null) r',[owner,'dropou',s])).r.protected,true);
   await db.query("update telegram_jobs set state='cancelled' where id=$1",[j.id]);
   await one('select dropou_saved_retention($1,null)',[owner]);assert.equal(await one('select id from shopee_saved_products where id=$1',[s]),undefined);
  });
  await t.test('expiry archives published products and preserves manual marks and historical snapshots',async()=>{
   const o=await product(),s=await saved(22,'dropou',o.product_id),mark=crypto.randomUUID();
   await one("select dropou_channel_mark_channel('dropou',$1,$2,'whatsapp',$3,null,false)",[owner,o.product_id,mark]);
   const before=await one('select snapshot,published_at from product_channel_marks where id=$1',[mark]);
   await one('select dropou_saved_retention($1,null)',[owner]);
   assert.equal(await one('select id from shopee_saved_products where id=$1',[s]),undefined);assert.ok((await one('select archived_at from products where id=$1',[o.product_id])).archived_at);
   assert.deepEqual(await one('select snapshot,published_at from product_channel_marks where id=$1',[mark]),before);
   await role('authenticated');assert.ok(!(await one("select dropou_operational_products('catalog') r")).r.rows.some((r:any)=>r.id===o.product_id));
   assert.ok((await one("select dropou_operational_products('archived') r")).r.rows.some((r:any)=>r.id===o.product_id));
  });
 }finally{await db.close();}
});
