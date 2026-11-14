import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import {emptyProduct} from '../src/lib/product-draft';
import {freshPrice,productKey,productSchema} from '../src/lib/domain';
import {formatCaption} from '../src/lib/ai';
import {safePublicationCaption,confirmedConditions} from '../src/lib/publication-copy';
import {channelClassification} from '../src/lib/channel-profiles';
import {assessShopeeOffer,defaultShopeeConfig,type ShopeeOffer} from '../src/lib/shopee-automation';
import type {OperationId} from '../src/lib/workspace-brands';
const owner='10000000-0000-4000-8000-000000000001',operator='10000000-0000-4000-8000-000000000002',stranger='10000000-0000-4000-8000-000000000003';
test('new channel classification excludes cross-niche products and suspicious listings',()=>{
 for(const [brand,good,bad] of [
  ['celulares','Smartphone Samsung Galaxy A55 128GB','Tênis Nike corrida'],
  ['tenis','Tênis Olympikus corrida feminino','Carregador veicular USB C'],
  ['automoto','Câmera de ré automotiva para carro','Smartphone Motorola Moto G54'],
 ] as const){assert.equal(channelClassification(good,brand)?.relevant,true);assert.equal(channelClassification(bad,brand)?.relevant,false);}
 assert.equal(channelClassification('Tênis Nike réplica primeira linha','tenis')?.relevant,false);
 assert.equal(channelClassification('Pastilha freio universal carro','automoto')?.relevant,false);
 assert.equal(channelClassification('Smartphone Motorola Moto G84 128GB','celulares')?.relevant,true);
 assert.equal(channelClassification('Smartphone Moto G84 128GB','automoto')?.relevant,false);
});
test('saved human approval remains valid tomorrow while absent or future confirmation is rejected',()=>{
 const p={...emptyProduct(),checkedAt:'2026-11-13T10:00:00.000Z',inStock:true};
 assert.equal(freshPrice(p,Date.parse('2026-11-14T11:00:00Z')),true);
 assert.equal(confirmedConditions(p,Date.parse('2026-11-14T11:00:00Z')),true);
 assert.equal(freshPrice({...p,checkedAt:null}),false);
 assert.equal(freshPrice({...p,checkedAt:'2099-01-01T00:00:00Z'}),false);
});
test('incremental channel/team migrations: existing data, RLS, budgets and publication snapshots',async t=>{
 const db=new PGlite();
 async function one(sql:string,args:any[]=[]){return (await db.query<any>(sql,args)).rows[0];}
 async function role(name='service_role',uid=owner,brand='dropou'){await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[uid]);await db.query("select set_config('request.headers',$1,false)",[JSON.stringify({'x-dropou-brand':brand})]);await db.exec('set role '+name);}
 async function product(brand:OperationId,checkedAt=new Date(Date.now()-86400000).toISOString()){
  await role('authenticated',owner,brand);
  const p={...emptyProduct(),operation:brand,name:brand==='tenis'?'Tênis Olympikus corrida':brand==='automoto'?'Carregador veicular USB':'Smartphone Samsung A55',price:200,affiliateUrl:'https://shopee.com.br/fixture/'+crypto.randomUUID(),store:'Shopee' as const,checkedAt,inStock:true};
  const saved=(await one('select dropou_save_product($1,$2) p',[JSON.stringify(p),productKey(p)])).p;
  const o=(await one('select dropou_save_offer_version($1,$2,$3,$3,false) o',[saved.id,JSON.stringify(saved),formatCaption(saved,brand)])).o;
  return o;
 }
 try{
  await db.exec(`create schema auth;create schema storage;create role authenticated;create role anon;create role service_role bypassrls;create table auth.users(id uuid primary key);insert into auth.users values('${owner}'),('${operator}'),('${stranger}');create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema public,auth to authenticated,anon,service_role;grant execute on function auth.uid() to authenticated,anon,service_role;create table storage.buckets(id text primary key,public boolean,allowed_mime_types text[]);`);
  for(const file of ['schema.sql','whatsapp-flow.sql','ai-economy.sql','telegram-offers.sql'])await db.exec(readFileSync('supabase/'+file,'utf8'));
  for(const file of readdirSync('supabase/migrations').filter(f=>f.endsWith('.sql')).sort()){
   await db.exec(readFileSync('supabase/migrations/'+file,'utf8'));
   if(file.includes('publication_dispatch_and_review')){
    await db.query('insert into telegram_dispatch_config(id,secret,owner_ids,destination_key) values(true,$1,$2,$3)',['isolated-test',[owner],'a'.repeat(64)]);
    await db.exec(readFileSync('supabase/optional-price-publication.sql','utf8'));
   }
  }
  await role();
  assert.equal((await one('select count(*) n from operation_settings where owner_id=$1',[owner])).n,6);
  assert.equal((await one('select count(*) n from operation_settings where automation_enabled')).n,0);
  const offers:any[]=[];
  for(const brand of ['celulares','tenis','automoto'] as const)offers.push(await product(brand));
  await t.test('operator reads/writes only assigned channels even with forged all or brand headers',async()=>{
   await role();await db.query("insert into operation_members(member_id,owner_id,role,brands) values($1,$2,'operator',array['tenis'])",[operator,owner]);
   await db.query("insert into operation_uploaded_images(path,owner_id,brand_id,actor_id) values('tenis.jpg',$1,'tenis',$2),('celulares.jpg',$1,'celulares',$1)",[owner,operator]);
   await role('authenticated',operator,'all');assert.equal((await db.query('select * from products')).rows.length,1);
   const context=(await one('select dropou_access_context() c')).c;assert.equal(context.owner,owner);assert.equal(context.admin,false);assert.deepEqual(context.brands,['tenis']);
   assert.equal((await db.query('select * from operation_settings')).rows.length,1);
   assert.deepEqual((await db.query<any>('select path from operation_uploaded_images')).rows.map(r=>r.path),['tenis.jpg']);
   await role('authenticated',operator,'celulares');assert.equal((await db.query('select * from products')).rows.length,0);
   await assert.rejects(db.query("update products set data=data||'{\"name\":\"Intrusão\"}' where id=$1",[offers[0].product_id]).then(r=>{assert.equal(r.affectedRows,0);throw new Error('denied');}),/denied/);
   await assert.rejects(db.query("update operation_members set role='admin'"),/permission denied/);
   await role('authenticated',stranger,'all');assert.equal((await db.query('select * from products')).rows.length,0);
  });
  await t.test('manual import has its own ledger after discovery exhaustion; real provider cooldown is shared',async()=>{
   await role();await db.query("update operation_settings set discovery_daily_limit=1 where brand_id='tenis'");
   const a=(await one("select dropou_shopee_reserve_v2($1,'tenis','search-1','search',1) r",[owner])).r;assert.ok(a.id);
   await one("select dropou_shopee_finish($1,'ok',0)",[a.id]);
   assert.equal((await one("select dropou_shopee_reserve_v2($1,'tenis','search-2','search',1) r",[owner])).r.reason,'discovery_budget');
   const b=(await one("select dropou_shopee_reserve_v2($1,'tenis','import-1','manual',200) r",[owner])).r;assert.ok(b.id);
   await one("select dropou_shopee_finish($1,'rate_limit',120)",[b.id]);
   assert.equal((await one("select dropou_shopee_reserve_v2($1,'celulares','import-2','manual',200) r",[owner])).r.reason,'rate_limit');
   await db.exec('update shopee_requests set blocked_until=null');
   const pending=(await one("insert into shopee_saved_products(owner_id,brand_id,input_url,canonical_url,state,lease_until) values($1,'automoto','https://shopee.com.br/product/4/5','https://shopee.com.br/product/4/5','fetching',now()+interval '1 minute') returning id",[owner])).id;
   assert.equal((await one("select dropou_shopee_reserve_v2($1,'automoto','yield-to-import','search',40) r",[owner])).r.reason,'busy');
   const priority=(await one("select dropou_shopee_reserve_v2($1,'automoto','priority-import','manual',200) r",[owner])).r;assert.ok(priority.id);await one("select dropou_shopee_finish($1,'ok',0)",[priority.id]);
   await db.query('delete from shopee_saved_products where id=$1',[pending]);
  });
  await t.test('each new channel reuses saved-link import, cache, curation and rejection without mixing decisions',async()=>{
   await role();
   for(const [brand,name] of [['celulares','Smartphone Samsung Galaxy A55'],['tenis','Tênis Olympikus corrida feminino'],['automoto','Carregador veicular USB para carro']] as const){
    const o:ShopeeOffer={itemId:'456',shopId:'123',name,price:150,priceMax:150,image:'https://down-br.img.susercontent.com/file/test',offerLink:'https://s.shopee.com.br/fixture',productLink:'https://shopee.com.br/product/123/456',rating:4.8,sales:5000,commission:.1,reportedDiscount:20,checkedAt:new Date().toISOString()};
    const a=assessShopeeOffer(o,defaultShopeeConfig(),[],brand);assert.equal(a.relevant,true);
    await one('select dropou_shopee_cache_channel($1,$2,$3)',[brand,owner,JSON.stringify([{shop_id:o.shopId,item_id:o.itemId,data:o,score:a.score,eligible:a.eligible,reasons:a.reasons,checked_at:o.checkedAt,assessment:a}])]);
    const input=(await one("insert into shopee_saved_products(owner_id,brand_id,input_url,canonical_url,shop_id,item_id) values($1,$2,$3,$3,'123','456') returning id",[owner,brand,o.productLink])).id;
    const claimed=(await db.query<any>('select * from dropou_shopee_saved_claim_channel($1,$2,$3,false)',[brand,owner,[input]])).rows[0];assert.equal(claimed.id,input);
    await one('select dropou_shopee_saved_finish_channel($1,$2,$3,$4,$5,null)',[brand,owner,input,claimed.lease_token,JSON.stringify(o)]);
    await role('authenticated',operator,brand);
    assert.equal((await db.query('select * from shopee_saved_products')).rows.length,brand==='tenis'?1:0);
    await role('authenticated',owner,brand);
    const cache=(await one("select * from dropou_curation_queue where kind='cache'"));assert.ok(cache);assert.equal(cache.brand_id,brand);
    assert.equal((await one('select dropou_safe_publication_caption($1) caption',[JSON.stringify({...emptyProduct(),operation:brand,name,affiliateUrl:o.offerLink})])).caption,safePublicationCaption({...emptyProduct(),operation:brand,name,affiliateUrl:o.offerLink}));
    await role();await one("select dropou_curate_channel($1,$2,'cache',$3,'rejected',null,null)",[brand,owner,cache.id]);
    await role('authenticated',owner,brand);assert.equal((await db.query("select * from dropou_curation_queue where kind='cache'")).rows.length,0);
    await role();
   }
  });
  await t.test('snapshot validated yesterday queues tomorrow and sends without expiry, bound to the correct Telegram',async()=>{
   await role();const o=offers[0],target={id:'-100987',title:'Celulares isolado',key:'b'.repeat(64),mediaMode:'text',photoConfirmed:false};
   await db.query("update operation_settings set telegram_chat_id=$1 where owner_id=$2 and brand_id='celulares'",[target.id,owner]);
   const args=[owner,o.id,'telegram',new Date(Date.now()+86400000).toISOString(),JSON.stringify(target),o.caption,o.caption,'verified'];
   const job=(await one('select dropou_publication_queue_v2($1,$2,$3,$4,$5,$6,$7,$8,false) j',args)).j;assert.equal(job.caption,o.caption);
   assert.equal(job.snapshot.checkedAt,o.snapshot.checkedAt);
   await db.query('update telegram_jobs set scheduled_at=now(),authorized_until=now()-interval \'1 day\' where id=$1',[job.id]);
   const claim=(await one('select dropou_publication_claim_v2($1,$2,false) j',[job.id,target.key])).j;
   assert.equal(claim.state,'sending');assert.equal(claim.caption,o.caption);
   await one("select dropou_publication_receipt($1,'[\"100\"]','sent',null)",[job.id]);
   assert.equal((await one('select count(*) n from publications where product_id=$1',[o.product_id])).n,0);
   assert.equal((await one('select destination_id from deliveries where product_id=$1',[o.product_id])).destination_id,target.id);
   const edited=await product('automoto'),otherTarget={...target,id:'-100988',key:'c'.repeat(64)};await role();
   await db.query("update operation_settings set telegram_chat_id=$1 where owner_id=$2 and brand_id='automoto'",[otherTarget.id,owner]);
   const pending=(await one('select dropou_publication_queue_v2($1,$2,$3,$4,$5,$6,$7,$8,false) j',[owner,edited.id,'telegram',new Date().toISOString(),JSON.stringify(otherTarget),edited.caption,edited.caption,'verified'])).j;
   await db.query("update products set data=data||'{\"name\":\"Produto editado depois do agendamento\"}' where id=$1",[edited.product_id]);
   assert.equal((await one('select dropou_publication_claim_v2($1,$2,false) j',[pending.id,otherTarget.key])).j,null);
  });
  await t.test('manual channel marks remain independent, rejection disappears, and suspended access is immediate',async()=>{
   await role();const id=crypto.randomUUID();await one("select dropou_channel_mark_channel('tenis',$1,$2,'whatsapp',$3,null,false)",[owner,offers[1].product_id,id]);
   assert.equal((await one("select count(*) n from product_channel_marks where product_id=$1 and channel='telegram'",[offers[1].product_id])).n,0);
   await db.query('update operation_members set active=false where member_id=$1',[operator]);
   await role('authenticated',operator,'all');assert.equal((await db.query('select * from products')).rows.length,0);
  });
 }finally{await db.close();}
});
