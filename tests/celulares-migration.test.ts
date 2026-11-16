import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import {emptyProduct} from '../src/lib/product-draft';
import {formatCaption} from '../src/lib/ai';
import {productKey} from '../src/lib/domain';
test('catalog identity migration refuses in-flight delivery atomically, then preserves existing published data and per-channel records',async()=>{
 const db=new PGlite(),owner='60000000-0000-4000-8000-000000000001',migration='20261115183010_celulares_curation_shared_products.sql';
 const one=async(sql:string,args:any[]=[])=> (await db.query<any>(sql,args)).rows[0];
 const role=async(name='service_role',brand='celulares')=>{await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[owner]);await db.query("select set_config('request.headers',$1,false)",[JSON.stringify({'x-dropou-brand':brand})]);await db.exec('set role '+name);};
 try{
  await db.exec(`create schema auth;create schema storage;create role authenticated;create role anon;create role service_role bypassrls;create table auth.users(id uuid primary key);insert into auth.users values('${owner}');create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema public,auth to authenticated,anon,service_role;grant execute on function auth.uid() to authenticated,anon,service_role;create table storage.buckets(id text primary key,public boolean,allowed_mime_types text[]);`);
  for(const f of ['schema.sql','whatsapp-flow.sql','ai-economy.sql','telegram-offers.sql'])await db.exec(readFileSync('supabase/'+f,'utf8'));
  for(const f of readdirSync('supabase/migrations').filter(f=>f.endsWith('.sql')&&f!==migration).sort()){
   await db.exec(readFileSync('supabase/migrations/'+f,'utf8'));
   if(f.includes('publication_dispatch_and_review')){await db.query('insert into telegram_dispatch_config(id,secret,owner_ids,destination_key) values(true,$1,$2,$3)',['fixture-only',[owner],'a'.repeat(64)]);await db.exec(readFileSync('supabase/optional-price-publication.sql','utf8'));}
  }
  const offers:any[]=[];for(const brand of ['celulares','dropou'] as const){await role('authenticated',brand);const p={...emptyProduct(),operation:brand,name:'Fone Bluetooth JBL Tune 520BT',store:'Shopee' as const,price:199.9,checkedAt:new Date().toISOString(),inStock:true,affiliateUrl:'https://shopee.com.br/product/123/456'},saved=(await one('select dropou_save_product($1,$2) p',[JSON.stringify(p),productKey(p)])).p;offers.push((await one('select dropou_save_offer_version($1,$2,$3,$3,false) o',[p.id,JSON.stringify(saved),formatCaption(saved,brand)])).o);}
  await role();const target={id:'-1001234',key:'b'.repeat(64),title:'Fixture',mediaMode:'text',photoConfirmed:false};await db.query("update operation_settings set telegram_chat_id=$1 where brand_id='celulares'",[target.id]);
  const queued=(await one("select dropou_publication_queue_actor($1,$1,$2,'telegram',now(),$3,$4,$4,'verified',false) j",[owner,offers[0].id,JSON.stringify(target),offers[0].caption])).j;assert.ok((await one('select dropou_publication_claim_v2($1,$2,false) j',[queued.id,target.key])).j);
  await db.exec('reset role');await assert.rejects(db.exec(readFileSync('supabase/migrations/'+migration,'utf8')),/Envio em andamento/);await db.exec('rollback');assert.equal((await one("select to_regclass('public.catalog_product_identities') x")).x,null);assert.equal((await one('select count(*) n from products')).n,2);
  await one("select dropou_publication_receipt($1,'[\"12345\"]','sent',null)",[queued.id]);
  const before=(await db.query('select to_jsonb(p) p from products p order by id')).rows,receipts=(await db.query('select to_jsonb(d) d from deliveries d order by product_id,channel')).rows,events=(await one('select count(*) n from channel_events')).n;
  await db.exec(readFileSync('supabase/migrations/'+migration,'utf8'));
  assert.deepEqual((await db.query("select to_jsonb(p)-'identity_id' p from products p order by id")).rows,before);assert.deepEqual((await db.query('select to_jsonb(d) d from deliveries d order by product_id,channel')).rows,receipts);assert.equal((await one('select count(*) n from channel_events')).n,events);assert.equal((await one('select count(*) n from catalog_product_identities')).n,1);assert.equal((await one('select count(distinct identity_id) n from products')).n,1);
 }finally{await db.close();}
});
