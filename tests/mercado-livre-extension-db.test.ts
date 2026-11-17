import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import {reviewedExtensionProduct,type ExtensionInbox} from '../src/lib/mercado-livre-extension';
import {productKey} from '../src/lib/domain';
import {inboxFixture} from './fixtures/ml-extension';
const owner='90000000-0000-4000-8000-000000000001',member='90000000-0000-4000-8000-000000000002',other='90000000-0000-4000-8000-000000000003';
test('extension inbox SQL: idempotent review, real product identity, grants, RLS and no delivery side effects',async t=>{
 const db=new PGlite(),one=async(sql:string,args:unknown[]=[])=> (await db.query<any>(sql,args)).rows[0];
 async function role(actor=owner,brand='dropou',role='authenticated'){await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[actor]);await db.query("select set_config('request.headers',$1,false)",[JSON.stringify({'x-dropou-brand':brand})]);await db.exec('set role '+role);}
 async function add(row:ExtensionInbox,brand='dropou'){
  await role(owner,brand,'service_role');const draft={...row.draft,operation:brand};
  await db.query('insert into ml_extension_inbox(id,owner_id,actor_id,brand_id,request_id,original_url,candidate_url,identity_key,draft,message,existing) values($1,$2,$2,$3,$4,$5,$6,$7,$8,$9,$10)',[row.id,owner,brand,row.request_id,row.original_url,row.candidate_url,row.identity_key,JSON.stringify(draft),row.message,row.existing]);return {...row,draft} as ExtensionInbox;
 }
 const prepare=async(row:ExtensionInbox,actor=owner,brand='dropou',product=reviewedExtensionProduct(row,{id:row.id,confirmed:true,inStock:true}))=>(await one('select dropou_ml_extension_prepare($1,$2,$3,$4,$5,$6) r',[owner,actor,brand,row.id,JSON.stringify(product),productKey(product)])).r;
 try{
  await db.exec(`create schema auth;create schema storage;create role authenticated;create role anon;create role service_role bypassrls;create table auth.users(id uuid primary key);insert into auth.users values('${owner}'),('${member}'),('${other}');create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema public,auth to authenticated,anon,service_role;grant execute on function auth.uid() to authenticated,anon,service_role;create table storage.buckets(id text primary key,public boolean,allowed_mime_types text[]);`);
  await db.exec(readFileSync('tests/fixtures/supabase-default-acls.sql','utf8'));
  for(const f of ['schema.sql','whatsapp-flow.sql','ai-economy.sql','telegram-offers.sql'])await db.exec(readFileSync('supabase/'+f,'utf8'));
  for(const f of readdirSync('supabase/migrations').filter(f=>f.endsWith('.sql')).sort()){
   await db.exec(readFileSync('supabase/migrations/'+f,'utf8'));
   if(f.includes('publication_dispatch_and_review')){await db.query('insert into telegram_dispatch_config(id,secret,owner_ids,destination_key) values(true,$1,$2,$3)',['fixture-only',[owner],'a'.repeat(64)]);await db.exec(readFileSync('supabase/optional-price-publication.sql','utf8'));}
  }
  const row=await add(inboxFixture());let id:string;
  await t.test('receipt survives reconnection; repeated confirmation and a second request reuse one product without changing user edits',async()=>{
   await role();assert.equal((await one('select count(*) n from ml_extension_inbox')).n,1);
   await role(owner,'dropou','service_role');const first=await prepare(row);id=first.product.id;assert.equal(first.existing,false);const again=await prepare(row);assert.equal(again.product.id,id);
   const duplicate=await add(inboxFixture());const saved=await prepare(duplicate);assert.equal(saved.product.id,id);assert.equal(saved.existing,true);assert.equal((await one('select count(*) n from products')).n,1);
   await db.query("update products set data=jsonb_set(data,'{name}','\"Edição preservada\"') where id=$1",[id]);assert.equal((await prepare(row)).product.name,'Edição preservada');
   assert.equal((await one('select count(*) n from telegram_jobs')).n,0);assert.equal((await one('select count(*) n from deliveries')).n,0);assert.equal((await one('select count(*) n from publications')).n,0);
  });
  await t.test('owner, operation and association are enforced under default Supabase ACLs',async()=>{
   await role(owner,'all','service_role');await db.query("insert into operation_members(member_id,owner_id,role,brands) values($1,$2,'operator',array['tenis'])",[member,owner]);
   await role(member,'tenis');assert.equal((await one('select count(*) n from ml_extension_inbox')).n,0);await assert.rejects(prepare(row));await assert.rejects(db.query("insert into ml_extension_inbox select * from ml_extension_inbox"));
   await role(other);assert.equal((await one('select count(*) n from ml_extension_inbox')).n,0);await role(owner,'moda');assert.equal((await one('select count(*) n from ml_extension_inbox')).n,0);
   await role(owner,'dropou','anon');await assert.rejects(db.query('select * from ml_extension_inbox'));await assert.rejects(prepare(row));
   await role(owner,'dropou','service_role');await assert.rejects(prepare(row,member),/sem acesso/);await assert.rejects(prepare(row,owner,'moda'),/indisponível/);
  });
  await t.test('forged candidate, price and product scope fail transactionally; archive is never restored by resending',async()=>{
   const fresh=await add(inboxFixture()),valid=reviewedExtensionProduct(fresh,{id:fresh.id,confirmed:true,inStock:true});
   for(const product of [{...valid,affiliateUrl:'https://meli.la/different'},{...valid,operation:'moda'},{...valid,price:0},{...valid,mercadoLivreImport:{...valid.mercadoLivreImport,affiliateConfirmed:false}}])await assert.rejects(prepare(fresh,owner,'dropou',product as any));
   assert.equal((await one('select state from ml_extension_inbox where id=$1',[fresh.id])).state,'pending');
   await db.query('update products set archived_at=now() where id=$1',[id]);await assert.rejects(prepare(fresh),/arquivado/);
   assert.equal((await one('select count(*) n from products')).n,1);
  });
  await t.test('explicit duplicate review fills only a missing affiliate link and preserves the edited existing product',async()=>{
   const source=inboxFixture(),url=source.original_url.replace('1234567890','1234567891');source.original_url=url;source.identity_key='item:MLB1234567891';source.existing=true;source.draft={...source.draft,originalUrl:url,name:'Nome editado antes da extensão',affiliateUrl:'',mercadoLivreImport:{...source.draft.mercadoLivreImport!,inputUrl:url,resolvedUrl:url,itemId:'MLB1234567891'}};
   await role();const old=(await one('select dropou_save_product($1,$2) p',[JSON.stringify(source.draft),productKey(source.draft)])).p;
   const row=await add({...source,draft:old});const saved=await prepare(row);assert.equal(saved.existing,true);assert.equal(saved.product.id,old.id);assert.equal(saved.product.name,old.name);assert.equal(saved.product.price,old.price);assert.equal(saved.product.checkedAt,old.checkedAt);assert.equal(saved.product.affiliateUrl,row.candidate_url);assert.equal(saved.product.mercadoLivreImport.affiliateConfirmed,true);
  });
 }finally{await db.close();}
});
