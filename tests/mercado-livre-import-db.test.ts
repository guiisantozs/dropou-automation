import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import {importMercadoLivreData} from '../src/server/mercado-livre/import-core';
import {productKey} from '../src/lib/domain';
import {formatCaption} from '../src/lib/ai';
const owner='10000000-0000-4000-8000-000000000001',other='10000000-0000-4000-8000-000000000002';
test('Mercado Livre cache leases, cooldowns, drafts and existing publication records',async t=>{
 const db=new PGlite();const one=async(sql:string,args:any[]=[]) => (await db.query<any>(sql,args)).rows[0];
 async function role(name='service_role',uid=owner,brand='celulares'){await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[uid]);await db.query("select set_config('request.headers',$1,false)",[JSON.stringify({'x-dropou-brand':brand})]);await db.exec('set role '+name);}
 try{
  await db.exec(`create schema auth;create schema storage;create role authenticated;create role anon;create role service_role bypassrls;create table auth.users(id uuid primary key);insert into auth.users values('${owner}'),('${other}');create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema public,auth to authenticated,anon,service_role;grant execute on function auth.uid() to authenticated,anon,service_role;create table storage.buckets(id text primary key,public boolean,allowed_mime_types text[]);`);
  for(const f of ['schema.sql','whatsapp-flow.sql','ai-economy.sql','telegram-offers.sql'])await db.exec(readFileSync('supabase/'+f,'utf8'));
  for(const f of readdirSync('supabase/migrations').filter(f=>f.endsWith('.sql')).sort()){
   await db.exec(readFileSync('supabase/migrations/'+f,'utf8'));
   if(f.includes('publication_dispatch_and_review')){await db.query('insert into telegram_dispatch_config(id,secret,owner_ids,destination_key) values(true,$1,$2,$3)',['isolated-fixture',[owner],'a'.repeat(64)]);await db.exec(readFileSync('supabase/optional-price-publication.sql','utf8'));}
  }
  await role();
  const path='/items/MLB3574638387',lease=crypto.randomUUID(),claim=(p=path,o=owner,l=lease,r='item')=>one('select dropou_ml_import_claim($1,$2,$3,$4) r',[o,p,r,l]).then(v=>v.r);
  const finish=(l=lease,check:any={resource:'item',state:'available'},data:any={id:'MLB3574638387'},seconds=900)=>one('select dropou_ml_import_finish($1,$2,$3,$4,$5,$6) r',[owner,path,l,JSON.stringify(data),JSON.stringify(check),seconds]).then(v=>v.r);
  await t.test('one lease per listing, cached metadata and owner isolation',async()=>{
   assert.equal((await claim()).mode,'claimed');assert.equal((await claim(path,owner,crypto.randomUUID())).mode,'pending');
   assert.equal(await finish(crypto.randomUUID()),false);assert.equal(await finish(),true);
   const cached=await claim();assert.equal(cached.mode,'cached');assert.equal(cached.data.id,'MLB3574638387');assert.equal(cached.check.cached,true);
   assert.equal((await claim(path,other,crypto.randomUUID())).mode,'claimed');
  });
  await t.test('a denial stops repeats of that item without inventing a denial of other resources',async()=>{
   await db.exec("update mercado_livre_import_cache set expires_at=now()-interval '1 minute'");
   assert.equal((await claim()).mode,'claimed');await finish(lease,{resource:'item',state:'denied',httpStatus:403},null,3600);
   assert.equal((await claim()).mode,'cached');
   assert.equal((await claim('/items/MLB9999999999',owner,crypto.randomUUID())).mode,'claimed');
   assert.equal((await claim('/products/search?status=active&site_id=MLB&q=controle&limit=5',owner,crypto.randomUUID(),'catalog')).mode,'claimed');
   await db.exec('delete from mercado_livre_import_cache;delete from mercado_livre_import_cooldowns');
  });
  await t.test('global rate limit preserves retry deadline and credentials are inaccessible to clients',async()=>{
   await claim();await finish(lease,{resource:'item',state:'rate_limit',httpStatus:429},null,120);
   const blocked=await claim('/products/MLB12345678',owner,crypto.randomUUID(),'catalog');assert.equal(blocked.mode,'blocked');assert.ok(Date.parse(blocked.check.retryAt)>Date.now()+100000);
   for(const name of ['anon','authenticated']){await role(name);await assert.rejects(db.query('select * from mercado_livre_import_cache'),/permission denied/);await assert.rejects(claim(),/permission denied/);}
   await role();await db.exec('delete from mercado_livre_import_cache;delete from mercado_livre_import_cooldowns');
  });
  await t.test('owner concurrency is bounded and an expired lease cannot overwrite its replacement',async()=>{
   for(const n of [1,2,3])assert.equal((await claim('/items/MLB1234567'+n,owner,crypto.randomUUID())).mode,'claimed');
   assert.equal((await claim('/items/MLB12345674',owner,crypto.randomUUID())).mode,'pending');
   await db.exec("update mercado_livre_import_cache set lease_until=now()-interval '1 second'");
   assert.equal((await claim('/items/MLB12345674',owner,crypto.randomUUID())).mode,'claimed');
   await db.exec('delete from mercado_livre_import_cache');
  });
  const original='https://produto.mercadolivre.com.br/MLB-3574638387-capa-_JM';
  let product=(await importMercadoLivreData({inputUrl:original,resolvedUrl:original,operation:'celulares'},async(path,resource)=>({data:null,check:{resource,state:'denied',httpStatus:403}}))).product;
  product={...product,name:'Capa de celular do teste automatizado',price:49.9};let offer:any;
  await t.test('partial imported product persists as a draft with no affiliate URL',async()=>{
   await role('authenticated');product=(await one('select dropou_save_product($1,$2) p',[JSON.stringify(product),productKey(product)])).p;
   const caption=formatCaption(product,'celulares');offer=(await one('select dropou_save_offer_version($1,$2,$3,$3,false) o',[product.id,JSON.stringify(product),caption])).o;
   assert.equal(offer.status,'rascunho');assert.equal(offer.snapshot.affiliateUrl,'');assert.equal(offer.snapshot.mercadoLivreImport.itemId,'MLB3574638387');
  });
  await t.test('manual official link and confirmed data reuse the same product and publication pipeline',async()=>{
   product={...product,affiliateUrl:'https://meli.la/automated-fixture',checkedAt:new Date(Date.now()-86400000).toISOString(),inStock:true,mercadoLivreImport:{...product.mercadoLivreImport!,affiliateState:'informed',affiliateConfirmed:true}};
   product=(await one('select dropou_save_product($1,$2) p',[JSON.stringify(product),productKey(product)])).p;
   const caption=formatCaption(product,'celulares');offer=(await one('select dropou_save_offer_version($1,$2,$3,$3,false) o',[product.id,JSON.stringify(product),caption])).o;
   assert.equal(offer.status,'pronto');assert.ok(offer.caption.includes(product.affiliateUrl));assert.equal((await one('select count(*) n from products where id=$1',[product.id])).n,1);
   await role('authenticated',owner,'dropou');assert.equal((await db.query('select * from products where id=$1',[product.id])).rows.length,0);
   await role();const target={id:'-100999',title:'Isolated automated fixture',key:'d'.repeat(64),mediaMode:'text',photoConfirmed:false};
   await db.query("update operation_settings set telegram_chat_id=$1 where owner_id=$2 and brand_id='celulares'",[target.id,owner]);
   const job=(await one("select dropou_publication_queue_v2($1,$2,'telegram',now(),$3,$4,$4,'verified',false) j",[owner,offer.id,JSON.stringify(target),offer.caption])).j;
   assert.equal((await one('select dropou_publication_claim_v2($1,$2,false) j',[job.id,target.key])).j.state,'sending');
   // Database receipt fixture only. No Telegram API request is made by this test.
   await one("select dropou_publication_receipt($1,'[\"100\"]','sent',null)",[job.id]);
   assert.equal((await one('select count(*) n from dropou_confirmed_publications where product_id=$1 and channel=$2',[product.id,'telegram'])).n,1);
   assert.equal((await one('select count(*) n from publications where product_id=$1',[product.id])).n,0);
  });
  await t.test('the Mercado Livre snapshot can be shared to another authorized channel with independent history',async()=>{
   const target={brand:'dropou',id:'-100998',title:'Second isolated fixture',key:'e'.repeat(64),mediaMode:'text',photoConfirmed:false};
   await db.query("update operation_settings set telegram_chat_id=$1 where owner_id=$2 and brand_id='dropou'",[target.id,owner]);
   const current=(await one('select snapshot from offers where id=$1',[offer.id])).snapshot;
   const result=(await one('select dropou_multichannel_queue($1,$1,$2,$3,$4,$5,$6,now(),$7) b',[owner,offer.id,crypto.randomUUID(),JSON.stringify(current),offer.caption,JSON.stringify([target]),JSON.stringify({only:'dropou'})])).b;
   assert.equal(result.jobs.length,1);const job=(await one('select * from telegram_jobs where id=$1',[result.jobs[0].id]));
   assert.notEqual(job.product_id,product.id);assert.equal(job.snapshot.mercadoLivreImport.itemId,'MLB3574638387');assert.equal(job.snapshot.affiliateUrl,product.affiliateUrl);assert.equal(job.caption,offer.caption);
   assert.equal((await one('select count(*) n from dropou_confirmed_publications where product_id=$1',[job.product_id])).n,0);
   assert.equal((await one('select count(*) n from dropou_confirmed_publications where product_id=$1',[product.id])).n,1);
  });
 }finally{await db.close();}
});
