import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import {kesiaOperations,operationSchema,isLocalOperation,isShopeeOperation} from '../src/lib/workspace-brands';
import {accessibleScope} from '../src/lib/dashboard-access';
import {memberClassification} from '../src/lib/member-curation';
import {channelShopeeConfig} from '../src/lib/channel-shopee-config';
import {assessShopeeOffer,type ShopeeOffer} from '../src/lib/shopee-automation';
import {operationSupports,telegramBotAllowed} from '../src/lib/operation-capabilities';
import {shopeeProduct} from '../src/lib/shopee-product';
import {formatCaption} from '../src/lib/ai';
import {productKey} from '../src/lib/domain';
import {memberCurationView,memberViewSchema} from '../src/lib/member-curation-view';

const offer=(name='Jogo de panelas cozinha',extra:Partial<ShopeeOffer>={}):ShopeeOffer=>({shopId:'123',itemId:'456',name,price:99.9,priceMax:99.9,image:'https://down-br.img.susercontent.com/file/fixture',offerLink:'https://s.shopee.com.br/admin-fixture',productLink:'https://shopee.com.br/product/123/456',rating:4.8,sales:1200,commission:.1,reportedDiscount:null,checkedAt:new Date().toISOString(),...extra});

test('Kesia shares the complete member workflow while access and Telegram identities stay scoped',()=>{
 assert.equal(accessibleScope('dropou',kesiaOperations,false),'kess');
 assert.equal(accessibleScope('all',kesiaOperations,false),'kess');
 for(const brand of kesiaOperations){
  assert.equal(operationSchema.parse(brand),brand);assert.equal(isLocalOperation(brand),true);assert.equal(isShopeeOperation(brand),true);
  assert.equal(operationSupports(brand,'telegramManual'),true);assert.equal(operationSupports(brand,'telegramSchedule'),true);
  for(const cap of ['automaticPublishing','mtproto','whatsappDestination'] as const)assert.equal(operationSupports(brand,cap),false);
  assert.equal(telegramBotAllowed(brand,'TELEGRAM_BOT_TOKEN'),false);
  assert.equal(telegramBotAllowed(brand,brand==='kess'?'TELEGRAM_KESS_BOT_TOKEN':'TELEGRAM_PRIMEIRO_LAR_BOT_TOKEN'),true);
  assert.match(formatCaption(shopeeProduct(offer(),crypto.randomUUID(),brand),brand),brand==='kess'?/Achadinhos da Kess/:/Nosso Primeiro Lar/);
 }
});

test('curation selects useful general finds and first-home essentials using actual evidence',()=>{
 const accepted={kess:['Potes herméticos cozinha','Suporte celular mesa','Capa para iPhone','Fone Bluetooth','Carteira masculina','Organizador gaveta','Garrafa térmica','Luminária de mesa'],'primeiro-lar':['Jogo de panelas','Jogo talheres inox','Jogo pratos e copos','Potes herméticos','Air fryer 4 litros','Jogo de cama casal','Edredom casal','Travesseiros','Jogo toalhas banho','Kit banheiro','Cesto roupa','Varal de chão','Balde mop','Kit enxoval casa nova']};
 for(const brand of kesiaOperations){const config=channelShopeeConfig({},brand);
  for(const name of accepted[brand]){assert.equal(memberClassification(name,brand)?.relevant,true,name);assert.equal(assessShopeeOffer(offer(name),config,[],brand).recommended,true,name);}
  for(const name of ['Peça automotiva veicular','Medicamento hospitalar','Réplica falsificado','Produto aleatório viral'])assert.equal(memberClassification(name,brand)?.relevant,false,name);
  assert.equal(assessShopeeOffer(offer(accepted[brand][0],{rating:null,sales:null}),config,[],brand).recommended,false);
  assert.equal(assessShopeeOffer(offer(accepted[brand][0],{rating:2,sales:1}),config,[],brand).recommended,false);
  assert.equal(assessShopeeOffer(offer(accepted[brand][0],{priceMax:250}),config,[],brand).recommended,false);
 }
 for(const name of ['Vaso decorativo','Quadro decoração sala','Enxoval bebê maternidade','Toalha hospitalar','Capa para iPhone','Perfume feminino'])assert.equal(memberClassification(name,'primeiro-lar')?.relevant,false,name);
 assert.equal(memberClassification('Jogo de panelas','casa')?.relevant,false,'existing home decor scope preserved');
});

test('curation filters apply before pagination and keep missing ratings and popularity unknown',()=>{
 const rows=[{id:'a',data:offer('Jogo de panelas',{price:100,rating:4.8,sales:100})},{id:'b',data:offer('Jogo de cama casal',{price:80,rating:null,sales:null})},{id:'c',data:offer('Jogo de panelas',{price:50,rating:4.5,sales:1000})}];
 assert.deepEqual(memberCurationView(rows,'primeiro-lar',memberViewSchema.parse({category:'Cozinha',minRating:4.6})).map(r=>r.id),['a']);
 assert.deepEqual(memberCurationView(rows,'primeiro-lar',memberViewSchema.parse({maxPrice:90,minSales:50})).map(r=>r.id),['c']);
 assert.deepEqual(memberCurationView(rows,'primeiro-lar',memberViewSchema.parse({sort:'sales'})).map(r=>r.id),['c','a','b']);
 assert.deepEqual(memberCurationView(rows,'primeiro-lar',memberViewSchema.parse({sort:'price'})).map(r=>r.id),['c','b','a']);
 assert.equal(memberViewSchema.safeParse({minPrice:100,maxPrice:20}).success,false);
});

test('incremental Kesia migration preserves existing workspaces and enforces RLS, official affiliates and manual scheduling',async t=>{
 const db=new PGlite(),owner='20000000-0000-4000-8000-000000000001',kesia='20000000-0000-4000-8000-000000000002',karen='20000000-0000-4000-8000-000000000003',stranger='20000000-0000-4000-8000-000000000004';
 const one=async(sql:string,args:unknown[]=[])=> (await db.query<any>(sql,args)).rows[0];
 async function role(actor=owner,brand='all',name='authenticated'){await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[actor]);await db.query("select set_config('request.headers',$1,false)",[JSON.stringify({'x-dropou-brand':brand})]);await db.exec('set role '+name);}
 try{
  await db.exec(`create schema auth;create schema storage;create role authenticated;create role anon;create role service_role bypassrls;create table auth.users(id uuid primary key);insert into auth.users values('${owner}'),('${kesia}'),('${karen}'),('${stranger}');create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema public,auth to authenticated,anon,service_role;grant execute on function auth.uid() to authenticated,anon,service_role;create table storage.buckets(id text primary key,public boolean,allowed_mime_types text[]);`);
  for(const f of ['schema.sql','whatsapp-flow.sql','ai-economy.sql','telegram-offers.sql'])await db.exec(readFileSync('supabase/'+f,'utf8'));
  let previous:unknown;let migration='';
  for(const f of readdirSync('supabase/migrations').filter(f=>f.endsWith('.sql')).sort()){
   if(f.includes('kesia_dashboards')){previous=(await db.query("select * from operation_settings where brand_id not in ('kess','primeiro-lar') order by owner_id,brand_id")).rows;migration=readFileSync('supabase/migrations/'+f,'utf8');}
   await db.exec(readFileSync('supabase/migrations/'+f,'utf8'));
   if(f.includes('publication_dispatch_and_review')){await db.query('insert into telegram_dispatch_config(id,secret,owner_ids,destination_key) values(true,$1,$2,$3)',['fixture-only',[owner],'a'.repeat(64)]);await db.exec(readFileSync('supabase/optional-price-publication.sql','utf8'));}
  }
  await db.query("select dropou_assign_member($1,$1,$2,'operator',array['kess','primeiro-lar'],'Fixture member')",[owner,kesia]);
  await db.query("select dropou_assign_member($1,$1,$2,'operator',array['beleza','casa','natal'],'Existing fixture')",[owner,karen]);
  await t.test('migration is replay-safe and all existing operation settings are unchanged',async()=>{
   await db.exec(migration);assert.deepEqual((await db.query("select * from operation_settings where brand_id not in ('kess','primeiro-lar') order by owner_id,brand_id")).rows,previous);
   const settings=(await db.query("select * from operation_settings where brand_id in ('kess','primeiro-lar')")).rows as any[];assert.equal(settings.length,2);
   assert.ok(settings.every(s=>!s.automation_enabled&&!s.telegram_chat_id&&!s.telegram_verified_at));
   await assert.rejects(db.query("update operation_settings set automation_enabled=true where brand_id='kess'"));
   await assert.rejects(db.query("update operation_settings set telegram_bot_env='TELEGRAM_BOT_TOKEN' where brand_id='primeiro-lar'"));
  });
  await t.test('membership remains non-admin, grants no global dashboards and cannot be self-expanded',async()=>{
   await role(kesia);const access=(await one('select dropou_access_context() a')).a;assert.equal(access.admin,false);assert.deepEqual(access.brands,['kess','primeiro-lar']);
   await assert.rejects(db.query("select dropou_assign_member($1,$1,$1,'admin',array['dropou'])",[kesia]));
   await assert.rejects(db.query("update operation_members set brands=array['dropou'] where member_id=$1",[kesia]));
   await role(karen);assert.deepEqual((await one('select dropou_access_context() a')).a.brands,['beleza','casa','natal']);
  });
  const products:Record<string,string>={};
  await t.test('same Shopee product has independent saved links, catalogs, offers and curation decisions',async()=>{
   await role(owner,'all','service_role');
   for(const brand of kesiaOperations){
    await db.query("insert into shopee_saved_products(owner_id,brand_id,input_url,canonical_url,shop_id,item_id,state,data) values($1,$2,$3,$3,'123','456','ready',$4)",[owner,brand,offer().productLink,JSON.stringify(offer())]);
    await role(kesia,brand);const p=shopeeProduct(offer(),crypto.randomUUID(),brand);
    const saved=(await one('select dropou_save_product($1,$2) p',[JSON.stringify(p),productKey(p)])).p;products[brand]=saved.id;
    assert.equal((await db.query('select * from products')).rows.length,1);
    assert.equal((await db.query('select * from shopee_saved_products')).rows.length,1);
    await one('select dropou_save_offer_version($1,$2,$3,$3,false)',[saved.id,JSON.stringify(saved),formatCaption(saved,brand)]);
    assert.equal((await db.query('select * from offers')).rows.length,1);
    await role(owner,'all','service_role');
   }
   assert.notEqual(products.kess,products['primeiro-lar']);
   await db.query("update products set curation_state='rejected' where id=$1",[products.kess]);
   assert.equal((await one('select curation_state from products where id=$1',[products['primeiro-lar']])).curation_state,'pending');
  });
  await t.test('forged brands and other accounts cannot read or mutate another catalog or evidence',async()=>{
   for(const [actor,brand] of [[kesia,'dropou'],[karen,'kess'],[stranger,'all']] as const){await role(actor,brand);for(const table of ['products','offers','shopee_saved_products'])assert.equal((await db.query('select * from '+table)).rows.length,0);}
   await role(kesia,'kess');assert.equal((await db.query('select * from products where id=$1',[products['primeiro-lar']])).rows.length,0);
   await assert.rejects(db.query("update products set brand_id='primeiro-lar' where id=$1",[products.kess]));
  });
  await t.test('unconverted or foreign affiliate links block offer saving on both operations',async()=>{
   for(const brand of kesiaOperations){await role(kesia,brand);const row=await one('select data from products where id=$1',[products[brand]]);
    for(const affiliateUrl of [offer().productLink,'https://s.shopee.com.br/foreign-account']){const forged={...row.data,affiliateUrl,status:'pronto'};
     const draft=(await one('select dropou_save_product($1,$2) p',[JSON.stringify(forged),productKey(forged)])).p;
     await assert.rejects(db.query('select dropou_save_offer_version($1,$2,$3,$3,false)',[products[brand],JSON.stringify(draft),formatCaption(draft,brand)]),/afiliado/);}
   }
  });
  await t.test('search leases accept new operations, and write RPCs remain server-only',async()=>{
   for(const brand of kesiaOperations){await role(owner,'all','service_role');const token=(await one('select dropou_shopee_search_claim($1,$2) token',[owner,brand])).token;
    const window=(await one('select dropou_member_search_window($1,$2,$3,$4,3) w',[owner,brand,token,'b'.repeat(64)])).w;assert.equal(window.cached,false);
    await db.query('select dropou_member_search_complete($1,$2,$3,$4)',[owner,brand,token,'b'.repeat(64)]);
    await role(kesia,brand);await assert.rejects(db.query('select dropou_member_search_complete($1,$2,$3,$4)',[owner,brand,token,'b'.repeat(64)]));
   }
   await role(owner,'all','service_role');assert.equal((await one('select count(*) n from telegram_jobs')).n,0);assert.equal((await one('select count(*) n from deliveries')).n,0);
  });
 }finally{await db.close();}
});
