import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import {emptyProduct} from '../src/lib/product-draft';
import {productKey} from '../src/lib/domain';
import {catalogRetention,catalogFiltersSchema,type CatalogPage} from '../src/lib/catalog';
const owner='90000000-0000-4000-8000-000000000001',member='90000000-0000-4000-8000-000000000002',other='90000000-0000-4000-8000-000000000003';
test('retention boundary, pinning and validated catalog filters',()=>{
 const expires='2026-11-16T10:00:00Z',at=Date.parse(expires);
 assert.equal(catalogRetention({pinned:false,expires_at:expires},at-1).label,'Resta 1 dia');assert.equal(catalogRetention({pinned:false,expires_at:expires},at).state,'expired');assert.equal(catalogRetention({pinned:true,expires_at:expires},at+86400000).state,'pinned');
 assert.equal(catalogFiltersSchema.parse({q:' model ',pinned:'true',status:'missing'}).q,'model');assert.throws(()=>catalogFiltersSchema.parse({page:-1}));assert.throws(()=>catalogFiltersSchema.parse({operation:'foreign'}));
});
test('catalog SQL: visual expiration, fixed entry clock, destination proof and RLS',async t=>{
 const db=new PGlite();let seq=100;
 const one=async(sql:string,args:any[]=[])=> (await db.query<any>(sql,args)).rows[0];
 async function role(uid=owner,brand='dropou',r='authenticated'){await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[uid]);await db.query("select set_config('request.headers',$1,false)",[JSON.stringify({'x-dropou-brand':brand})]);await db.exec('set role '+r);}
 async function product(brand='dropou',name='Fixture catalog product'){
  await role(owner,brand);const p={...emptyProduct(),operation:brand as any,name:name+' '+(++seq),niche:'Headsets',price:100,affiliateUrl:'https://shopee.com.br/product/1/'+seq,store:'Shopee' as const,checkedAt:new Date().toISOString(),inStock:true};return (await one('select dropou_save_product($1,$2) p',[JSON.stringify(p),productKey(p)])).p;
 }
 async function list(filters:any={}):Promise<CatalogPage>{return (await one('select dropou_catalog_page($1) r',[JSON.stringify(filters)])).r;}
 try{
  await db.exec(`create schema auth;create schema storage;create role authenticated;create role anon;create role service_role bypassrls;create table auth.users(id uuid primary key);insert into auth.users values('${owner}'),('${member}'),('${other}');create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema public,auth to authenticated,anon,service_role;grant execute on function auth.uid() to authenticated,anon,service_role;create table storage.buckets(id text primary key,public boolean,allowed_mime_types text[]);`);
  for(const f of ['schema.sql','whatsapp-flow.sql','ai-economy.sql','telegram-offers.sql'])await db.exec(readFileSync('supabase/'+f,'utf8'));
  let old:any;
  for(const f of readdirSync('supabase/migrations').filter(f=>f.endsWith('.sql')).sort()){
   if(f.includes('catalog_visual_retention')){old=await product();await role(owner,'dropou','service_role');await db.query("update products set created_at=now()-interval '14 days' where id=$1",[old.id]);await db.exec('reset role');}
   await db.exec(readFileSync('supabase/migrations/'+f,'utf8'));
   if(f.includes('publication_dispatch_and_review')){await db.query('insert into telegram_dispatch_config(id,secret,owner_ids,destination_key) values(true,$1,$2,$3)',['fixture-only',[owner],'a'.repeat(64)]);await db.exec(readFileSync('supabase/optional-price-publication.sql','utf8'));}
  }
  await t.test('expired products hidden, not deleted or archived; pins survive expired clock',async()=>{
   await role();assert.equal((await list()).total,0);const expired=await list({retention:'expired'});assert.equal(expired.rows[0].id,old.id);const entered=expired.rows[0].entered_at;
   await role(owner,'dropou','service_role');await one('select dropou_catalog_pin($1,$2,$1,$3,$4,true)',[owner,'dropou',old.id,'product']);await role();assert.equal((await list()).rows[0].pinned,true);
   await role(owner,'dropou','service_role');await one('select dropou_catalog_pin($1,$2,$1,$3,$4,false)',[owner,'dropou',old.id,'product']);await role();assert.equal((await list()).total,0);assert.equal((await list({retention:'expired'})).rows[0].entered_at,entered);assert.equal((await one('select archived_at from products where id=$1',[old.id])).archived_at,null);
   await assert.rejects(db.query("update products set catalog_entered_at=now() where id=$1",[old.id]),/não pode ser renovada/);
   await role(owner,'dropou','service_role');const plan=(await one("select dropou_catalog_cleanup_plan($1,'dropou',100) p",[owner])).p;assert.equal(plan.dryRun,true);assert.equal(plan.reviewed,1);assert.equal(plan.deletions,0);
  });
  const fresh=await product('dropou','Headset XYZ'),otherBrand=await product('tenis','Sneaker');
  await t.test('catalog pagination/search/status are server filtered, stable and capped at 24',async()=>{
   await role();assert.equal((await list({q:'Headset XYZ'})).total,1);assert.equal((await list({store:'Mercado Livre'})).total,0);assert.equal((await list({category:'Headsets'})).total,1);assert.equal((await list({status:'published'})).total,0);
   for(let i=0;i<26;i++)await product();await role();const a=await list(),b=await list({page:1});assert.equal(a.rows.length,24);assert.equal(b.rows.length,3);assert.equal(new Set([...a.rows,...b.rows].map(r=>r.id)).size,27);
  });
  await t.test('configured destinations and confirmed WhatsApp are independent; changed target is missing',async()=>{
   await role(owner,'dropou','service_role');await db.query("update operation_settings set telegram_chat_id='-100fixture',telegram_title='Telegram fixture',whatsapp_name='WhatsApp fixture' where owner_id=$1 and brand_id='dropou'",[owner]);
   await role();let r=(await list({q:'Headset XYZ'})).rows[0];assert.equal(r.destinations.length,2);assert.ok(r.destinations.every(d=>!d.publishedAt));
   await role(owner,'dropou','service_role');await one("select dropou_publication_mark_actor($1,'dropou',$2,$1,'whatsapp',$3,null,false,false)",[owner,fresh.id,crypto.randomUUID()]);
   await role();r=(await list({q:'Headset XYZ'})).rows[0];assert.ok(r.destinations.find(d=>d.channel==='whatsapp')!.publishedAt);assert.equal(r.destinations.find(d=>d.channel==='telegram')!.publishedAt,null);assert.equal((await list({q:'Headset XYZ',status:'missing'})).total,1);assert.equal((await list({q:'Headset XYZ',status:'unpublished'})).total,0);assert.equal((await list({q:'Headset XYZ',channel:'whatsapp'})).total,1);assert.equal((await list({q:'Headset XYZ',channel:'telegram'})).total,0);
   await role(owner,'dropou','service_role');await db.query("update operation_settings set whatsapp_name='Novo destino' where owner_id=$1 and brand_id='dropou'",[owner]);await role();r=(await list({q:'Headset XYZ'})).rows[0];assert.equal(r.destinations.find(d=>d.channel==='whatsapp')!.publishedAt,null);assert.ok(r.published_at);assert.equal((await one('select count(*) n from dropou_confirmed_publications where product_id=$1',[fresh.id])).n,1);
  });
  await t.test('forged operation and product IDs cannot bypass membership, owner or service RPC grants',async()=>{
   await role(owner,'all','service_role');await db.query("insert into operation_members(member_id,owner_id,role,brands) values($1,$2,'operator',array['tenis'])",[member,owner]);
   await role(member,'all');assert.equal((await list()).total,1);assert.equal((await list()).rows[0].id,otherBrand.id);assert.equal((await list({operation:'dropou'})).total,0);assert.equal((await db.query('select * from dropou_catalog_destinations($1)',[[fresh.id]])).rows.length,0);await assert.rejects(db.query('select dropou_catalog_pin($1,$2,$3,$4,$5,true)',[owner,'dropou',member,fresh.id,'product']));
   await role(owner,'all','service_role');await assert.rejects(db.query('select dropou_catalog_pin($1,$2,$3,$4,$5,true)',[owner,'dropou',member,fresh.id,'product']),/sem acesso/);
   await role(other,'all');assert.equal((await list()).total,0);await role(owner,'all','anon');await assert.rejects(list());
  });
  await t.test('maintenance is bounded promotion only; saved pin and original date transfer on preparation',async()=>{
   await role(owner,'dropou','service_role');const saved=(await one("insert into shopee_saved_products(owner_id,brand_id,input_url,canonical_url,created_at,state,catalog_pinned) values($1,'dropou','https://shopee.com.br/product/1/999','https://shopee.com.br/product/1/999',now()-interval '24 days','error',true) returning id",[owner])).id;
   const before=await one('select count(*) n from products'),r=(await one('select dropou_saved_retention($1,null) r',[owner])).r;assert.equal(r.removed,0);assert.equal(r.visualOnly,true);assert.equal((await one('select count(*) n from products')).n,before.n);
   await role();assert.ok((await list({pinned:true})).rows.some(r=>r.id===saved));const p=await product('dropou','Prepared saved');await role(owner,'dropou','service_role');await db.query('update shopee_saved_products set prepared_product_id=$1 where id=$2',[p.id,saved]);await role();const item=(await list({q:'Prepared saved'})).rows[0];assert.equal(item.pinned,true);assert.ok(Date.parse(item.expires_at)<Date.now());assert.equal((await list({q:'Prepared saved'})).total,1);
  });
 }finally{await db.close();}
});
