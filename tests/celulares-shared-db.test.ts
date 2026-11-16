import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import {emptyProduct} from '../src/lib/product-draft';
import {productKey} from '../src/lib/domain';
import {formatCaption} from '../src/lib/ai';
const owner='50000000-0000-4000-8000-000000000001',operator='50000000-0000-4000-8000-000000000002',stranger='50000000-0000-4000-8000-000000000003';
test('shared catalog identity, manual WhatsApp destinations and leased Celulares discovery enforce database permissions',async t=>{
 const db=new PGlite();
 async function one(sql:string,args:any[]=[]){return (await db.query<any>(sql,args)).rows[0];}
 async function role(name='service_role',uid=owner,brand='celulares'){await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[uid]);await db.query("select set_config('request.headers',$1,false)",[JSON.stringify({'x-dropou-brand':brand})]);await db.exec('set role '+name);}
 try{
  await db.exec(`create schema auth;create schema storage;create role authenticated;create role anon;create role service_role bypassrls;create table auth.users(id uuid primary key);insert into auth.users values('${owner}'),('${operator}'),('${stranger}');create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema public,auth to authenticated,anon,service_role;grant execute on function auth.uid() to authenticated,anon,service_role;create table storage.buckets(id text primary key,public boolean,allowed_mime_types text[]);`);
  for(const f of ['schema.sql','whatsapp-flow.sql','ai-economy.sql','telegram-offers.sql'])await db.exec(readFileSync('supabase/'+f,'utf8'));
  for(const f of readdirSync('supabase/migrations').filter(f=>f.endsWith('.sql')).sort()){
   await db.exec(readFileSync('supabase/migrations/'+f,'utf8'));
   if(f.includes('publication_dispatch_and_review')){await db.query('insert into telegram_dispatch_config(id,secret,owner_ids,destination_key) values(true,$1,$2,$3)',['local-only',[owner],'a'.repeat(64)]);await db.exec(readFileSync('supabase/optional-price-publication.sql','utf8'));}
  }
  await role();await db.query("insert into operation_members(member_id,owner_id,role,brands) values($1,$2,'operator',array['celulares'])",[operator,owner]);
  await db.query("update operation_settings set whatsapp_name=display_name,whatsapp_url='https://chat.whatsapp.com/FixtureGroupOnly' where owner_id=$1 and brand_id in ('celulares','dropou')",[owner]);
  await role('authenticated');const p={...emptyProduct(),operation:'celulares' as const,name:'Fone Bluetooth JBL Tune 520BT',store:'Shopee' as const,price:199.9,checkedAt:new Date().toISOString(),inStock:true,affiliateUrl:'https://shopee.com.br/product/123/456'};
  const saved=(await one('select dropou_save_product($1,$2) p',[JSON.stringify(p),productKey(p)])).p,offer=(await one('select dropou_save_offer_version($1,$2,$3,$3,false) o',[saved.id,JSON.stringify(saved),formatCaption(saved,'celulares')])).o;
  const mark=async(brand:string,id=crypto.randomUUID(),actor=owner,expected=offer.snapshot)=>{await role();return (await one('select dropou_shared_whatsapp_mark($1,$2,$3,$4,$5,$6,$7) r',[owner,actor,offer.id,brand,id,JSON.stringify(expected),offer.caption])).r;};
  await t.test('operator cannot forge another destination; no catalog copy or publication is left by a rejected transaction',async()=>{
   await assert.rejects(mark('dropou',crypto.randomUUID(),operator),/sem acesso/);assert.equal((await one('select count(*) n from products')).n,1);assert.equal((await one('select count(*) n from product_channel_marks')).n,0);
   await assert.rejects(mark('automoto'),/Configure o destino WhatsApp/);
   await assert.rejects(mark('dropou',crypto.randomUUID(),owner,{...offer.snapshot,price:1}),/alterada/);
  });
  await t.test('one canonical identity links channel records, keeps snapshots intact and marks only the chosen WhatsApp destination',async()=>{
   const id=crypto.randomUUID(),first=await mark('celulares',id);assert.equal(first.marked,true);const before=(await one("select count(*) n from dropou_confirmed_publications where brand_id='dropou'")).n;assert.equal(before,0);
   await mark('celulares',id);assert.equal((await one('select count(*) n from product_channel_marks')).n,1);
   const result=await mark('dropou');assert.equal(result.marked,true);assert.equal((await one('select count(*) n from catalog_product_identities')).n,1);
   const products=(await db.query<any>('select data,brand_id,identity_id from products order by brand_id')).rows;assert.equal(products.length,2);assert.equal(products[0].identity_id,products[1].identity_id);assert.equal(products[0].data.price,p.price);assert.equal(products[1].data.affiliateUrl,p.affiliateUrl);
   assert.equal((await one('select data from products where id=$1',[saved.id])).data.operation,'celulares');assert.equal((await one("select count(*) n from product_channel_marks where channel='telegram'")).n,0);assert.equal((await one('select count(*) n from telegram_jobs')).n,0);
   assert.equal((await one('select count(*) n from product_channel_marks where actor_id=$1',[owner])).n,2);
  });
  await t.test('RLS reveals only accessible identities and channel records, rejects direct edits and suspended users immediately',async()=>{
   await role('authenticated',operator,'all');assert.equal((await db.query('select * from products')).rows.length,1);assert.equal((await db.query('select * from catalog_product_identities')).rows.length,1);
   await assert.rejects(db.query("update operation_settings set celulares_curation='{}'"),/permission denied/);
   await assert.rejects(db.query("insert into catalog_product_identities(owner_id,canonical_url) values($1,'forged')",[owner]),/permission denied/);
   await assert.rejects(db.query('select dropou_shared_whatsapp_mark($1,$2,$3,$4,$5,$6,$7)',[owner,operator,offer.id,'dropou',crypto.randomUUID(),JSON.stringify(offer.snapshot),offer.caption]),/permission denied/);
   await role('authenticated',stranger,'all');assert.equal((await db.query('select * from catalog_product_identities')).rows.length,0);
   await role();await db.query('update operation_members set active=false where member_id=$1',[operator]);await assert.rejects(mark('celulares',crypto.randomUUID(),operator),/sem acesso/);
   await role('authenticated',operator,'all');assert.equal((await db.query('select * from catalog_product_identities')).rows.length,0);
   await role('anon',stranger);await assert.rejects(db.query('select * from catalog_product_identities'),/permission denied/);
  });
  await t.test('search cursor and cache are server-only, atomic and bound to the current unexpired lease and policy',async()=>{
   await role();const token=(await one("select dropou_shopee_search_claim($1,'celulares') token",[owner])).token,hash='a'.repeat(64);
   const args=[owner,token,5,15,hash],first=(await one('select dropou_celulares_search_window($1,$2,$3,$4,$5) w',args)).w;assert.equal(first.cached,false);assert.equal(first.cursor,0);
   assert.equal((await one("select search_cursor n from shopee_search_leases where brand_id='celulares'")).n,5);
   await one('select dropou_celulares_search_complete($1,$2,$3)',[owner,token,hash]);assert.equal((await one('select dropou_celulares_search_window($1,$2,$3,$4,$5) w',args)).w.cached,true);
   assert.equal((await one('select dropou_celulares_search_window($1,$2,$3,$4,$5) w',[owner,token,5,15,'b'.repeat(64)])).w.cached,false);
   await assert.rejects(db.query('select dropou_celulares_search_window($1,$2,6,15,$3)',[owner,token,hash]),/inválidos/);
   await assert.rejects(db.query('select dropou_celulares_search_window($1,$2,5,15,$3)',[owner,crypto.randomUUID(),hash]),/expirada/);
   await role('authenticated');await assert.rejects(db.query('select dropou_celulares_search_window($1,$2,5,15,$3)',[owner,token,hash]),/permission denied/);
  });
  await t.test('new observations carry variant evidence while older unknown observations are not fabricated',async()=>{
   await role();const token=(await one("select token from shopee_search_leases where brand_id='celulares'")).token,at=new Date().toISOString(),row={shop_id:'11',item_id:'22',checked_at:at,score:80,eligible:true,reasons:[],data:{name:'Smartphone Samsung Galaxy A55',price:1200,priceMax:1200,sales:100,rating:4.8},assessment:{mobile:{variantKey:'galaxy a55:256:8:novo:5g'}}};
   await one('select dropou_celulares_cache($1,$2,$3)',[owner,token,JSON.stringify([row])]);const observation=await one("select variant_key from shopee_observations where brand_id='celulares' and shop_id='11'");assert.equal(observation.variant_key,row.assessment.mobile.variantKey);
   await db.query("update shopee_search_leases set lease_until=now()-interval '1 second' where brand_id='celulares'");await assert.rejects(db.query('select dropou_celulares_cache($1,$2,$3)',[owner,token,JSON.stringify([row])]),/expirada/);
  });
 }finally{await db.close();}
});
