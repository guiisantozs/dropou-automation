import {test} from 'node:test';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import {dedicatedTelegramBots,legacyTelegramBots,operationSupports,telegramBotAllowed} from '../src/lib/operation-capabilities';
import {operationIntegrationUnavailable,workspaceAdminRequired} from '../src/lib/operator-access';
import {telegramOperationConfig,bindTelegramTarget} from '../src/server/telegram-operation-config';
import {resolveTelegramTarget,sendTelegramTo} from '../src/server/telegram-core';
import {telegramConnectionSchema} from '../src/lib/telegram-connection';
import {operationSettingsSchema} from '../src/lib/operation-settings';
import {shopeeProduct} from '../src/lib/shopee-product';
import {productKey} from '../src/lib/domain';
import {formatCaption} from '../src/lib/ai';
import type {ShopeeOffer} from '../src/lib/shopee-automation';
const owner='60000000-0000-4000-8000-000000000001',member='60000000-0000-4000-8000-000000000002',other='60000000-0000-4000-8000-000000000003';
const brands=['beleza','casa','natal','kess','primeiro-lar'] as const;

test('dedicated bot resolution never falls back or accepts another operation; legacy choices stay compatible',async()=>{
 for(const [i,brand] of brands.entries()){
  const tokenEnv=dedicatedTelegramBots[brand],settings={brand_id:brand,telegram_bot_env:tokenEnv,telegram_chat_id:'-100'+(i+1),display_name:'Marca fixture',routine_slots:['09:00'],radar:{}},env={TELEGRAM_BOT_TOKEN:'fixture-main',[tokenEnv]:'fixture-'+brand};
  assert.equal(operationSettingsSchema.safeParse(settings).success,true);
  assert.equal(operationSettingsSchema.safeParse({...settings,telegram_bot_env:'TELEGRAM_BOT_TOKEN'}).success,false);
  assert.equal(telegramOperationConfig(settings,brand,env).TELEGRAM_BOT_TOKEN,'fixture-'+brand);
  assert.throws(()=>telegramOperationConfig(settings,brand,{TELEGRAM_BOT_TOKEN:'fixture-main'}),new RegExp(tokenEnv));
  assert.throws(()=>telegramOperationConfig({...settings,telegram_bot_env:dedicatedTelegramBots[brands[(i+1)%brands.length]]},brand,env),/exclusivo/);
  const target={id:settings.telegram_chat_id,title:'Fixture',key:'a'.repeat(64)},bound=bindTelegramTarget(target,owner,brand,telegramOperationConfig(settings,brand,env));
  assert.notEqual(bound.key,target.key);assert.notEqual(bound.key,bindTelegramTarget(target,other,brand,telegramOperationConfig(settings,brand,env)).key);
  assert.notEqual(bound.key,bindTelegramTarget(target,owner,brand,telegramOperationConfig(settings,brand,{...env,[tokenEnv]:'fixture-rotated'})).key);
  assert.doesNotMatch(JSON.stringify(bound),/fixture-main|fixture-rotated/);
  assert.equal(operationSupports(brand,'telegramSchedule'),true);assert.equal(operationSupports(brand,'automaticPublishing'),false);assert.equal(operationSupports(brand,'mtproto'),false);
  for(const path of ['/api/integrations/shopee','/api/telegram/connections','/api/discovery','/api/mirrored-offers','/api/publication-config'])assert.equal(operationIntegrationUnavailable(brand,path,'POST'),true);
  for(const suffix of ['telegram','schedule'])assert.equal(operationIntegrationUnavailable(brand,'/api/offers/00000000-0000-4000-8000-000000000001/'+suffix,'POST'),false);
 }
 for(const brand of ['dropou','bruto','moda','celulares','tenis','automoto'])for(const bot of legacyTelegramBots){assert.equal(telegramBotAllowed(brand,bot),true);assert.equal(telegramOperationConfig({telegram_bot_env:bot,telegram_chat_id:'-10099'},brand,{[bot]:'fixture-legacy'}).TELEGRAM_BOT_TOKEN,'fixture-legacy');}
 assert.equal(workspaceAdminRequired('/api/operations','POST'),true);assert.equal(workspaceAdminRequired('/api/operations','PATCH'),true);
});

test('verification only reads Telegram; invalid channels and missing posting permission fail before any message',async()=>{
 for(const brand of brands){const calls:string[]=[],env=telegramOperationConfig({telegram_bot_env:dedicatedTelegramBots[brand],telegram_chat_id:'@fixture_channel'},brand,{[dedicatedTelegramBots[brand]]:'fixture-'+brand});
  const http=(type='channel',canPost=true):typeof fetch=>async(url,init)=>{assert.ok(String(url).includes('botfixture-'+brand+'/'));const method=String(url).split('/').at(-1)!;calls.push(method);const body=JSON.parse(String(init?.body));return Response.json({ok:true,result:method==='getMe'?{id:123,username:'fixture_bot'}:method==='getChat'?{id:-10055,type,title:'Fixture'}:method==='getChatMember'?{status:'administrator',can_post_messages:canPost}:{message_id:1,chat:{id:body.chat_id}}});};
  const target=await resolveTelegramTarget(env,http());assert.deepEqual(calls.sort(),['getChat','getChatMember','getMe'].sort());
  await assert.rejects(resolveTelegramTarget(env,http('group')),/canal.*válido/);await assert.rejects(resolveTelegramTarget(env,http('channel',false)),/administrador/);
  assert.ok(!calls.some(v=>v.startsWith('send')));
  assert.equal(telegramConnectionSchema.safeParse({brand,action:'test'}).success,false);
  assert.equal(telegramConnectionSchema.safeParse({brand,action:'test',confirmation:'ENVIAR TESTE',requestId:crypto.randomUUID()}).success,false);
  const confirmed=telegramConnectionSchema.parse({brand,action:'test',confirmation:'ENVIAR TESTE',requestId:crypto.randomUUID(),targetKey:target.key});assert.equal(confirmed.action,'test');
  assert.deepEqual(await sendTelegramTo(env,target,'Teste simulado',undefined,http()),['1']);assert.equal(calls.filter(v=>v==='sendMessage').length,1);
 }
});

test('incremental migration permits only actor-authorized Telegram while all automations remain paused',async t=>{
 const db=new PGlite();
 const one=async(sql:string,args:any[]=[])=> (await db.query<any>(sql,args)).rows[0];
 async function role(uid=owner,brand='all',name='service_role'){await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[uid]);await db.query("select set_config('request.headers',$1,false)",[JSON.stringify({'x-dropou-brand':brand})]);await db.exec('set role '+name);}
 const target=(brand:string)=>({id:'-100'+(brands.indexOf(brand as any)+1),title:'Fixture '+brand,key:createHash('sha256').update(brand).digest('hex'),mediaMode:'text',photoConfirmed:false});
 async function create(brand:typeof brands[number]){
  await role();const itemId=String(Math.floor(Math.random()*1e8)),data:ShopeeOffer={shopId:'123',itemId,name:'Produto fixture '+brand,price:20,priceMax:20,image:'',offerLink:'https://s.shopee.com.br/fixture'+itemId,productLink:'https://shopee.com.br/product/123/'+itemId,rating:4.8,sales:1200,commission:.1,reportedDiscount:null,checkedAt:new Date().toISOString()};
  await db.query("insert into shopee_saved_products(owner_id,brand_id,input_url,canonical_url,shop_id,item_id,state,data) values($1,$2,$3,$3,'123',$5,'ready',$4)",[owner,brand,data.productLink,JSON.stringify(data),itemId]);
  await role(member,brand,'authenticated');const p=shopeeProduct(data,crypto.randomUUID(),brand);const saved=(await one('select dropou_save_product($1,$2) p',[JSON.stringify({...p,inStock:true}),productKey(p)])).p;
  const caption=formatCaption(saved,brand);const offer=(await one('select dropou_save_offer_version($1,$2,$3,$3,true) o',[saved.id,JSON.stringify(saved),caption])).o;
  await role();return offer;
 }
 async function queue(o:any,actor=member,dest=target(o.brand_id),at=new Date().toISOString()) {await role();return (await one("select dropou_publication_queue_actor($1,$2,$3,'telegram',$4,$5,$6,$6,'verified',false) j",[actor,owner,o.id,at,JSON.stringify(dest),o.caption])).j;}
 const claim=async(j:any,key:string)=> (await one('select dropou_publication_claim_v2($1,$2,true) c',[j.id,key])).c;
 try{
  await db.exec(`create schema auth;create schema storage;create role authenticated;create role anon;create role service_role bypassrls;create table auth.users(id uuid primary key);insert into auth.users values('${owner}'),('${member}'),('${other}');create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema public,auth to authenticated,anon,service_role;grant execute on function auth.uid() to authenticated,anon,service_role;create table storage.buckets(id text primary key,public boolean,allowed_mime_types text[]);`);
  for(const f of ['schema.sql','whatsapp-flow.sql','ai-economy.sql','telegram-offers.sql'])await db.exec(readFileSync('supabase/'+f,'utf8'));
  let legacy:any;
  for(const f of readdirSync('supabase/migrations').filter(f=>f.endsWith('.sql')).sort()){
   if(f.includes('karen_manual_telegram_bots'))legacy=(await db.query("select * from operation_settings where brand_id not in ('beleza','casa','natal') order by brand_id")).rows;
   await db.exec(readFileSync('supabase/migrations/'+f,'utf8'));
   if(f.includes('publication_dispatch_and_review')){await db.query('insert into telegram_dispatch_config(id,secret,owner_ids,destination_key) values(true,$1,$2,$3)',['fixture-only',[owner],'a'.repeat(64)]);await db.exec(readFileSync('supabase/optional-price-publication.sql','utf8'));}
  }
  assert.deepEqual((await db.query("select * from operation_settings where brand_id not in ('beleza','casa','natal','kess','primeiro-lar') order by brand_id")).rows,legacy);
  await role();await db.query("select dropou_assign_member($1,$1,$2,'operator',array['beleza','casa','natal','kess','primeiro-lar'],null)",[owner,member]);await db.query("select dropou_assign_member($1,$1,$2,'operator',array['tenis'],null)",[owner,other]);
  for(const b of brands)await db.query('update operation_settings set telegram_chat_id=$1,telegram_title=$2,telegram_verified_at=now() where owner_id=$3 and brand_id=$4',[target(b).id,target(b).title,owner,b]);
  await t.test('member operations use independent destinations and real-receipt path with no WhatsApp evidence',async()=>{
   for(const b of brands){const o=await create(b);await assert.rejects(queue(o,member,target(brands[(brands.indexOf(b)+1)%brands.length])),/Destino/);await assert.rejects(queue(o,other),/acesso/);
    const j=await queue(o);assert.equal((await claim(j,target(b).key)).state,'sending');await one("select dropou_publication_receipt($1,'[\"7\"]','sent',null)",[j.id]);assert.equal((await one('select state,attempts from telegram_jobs where id=$1',[j.id])).attempts,1);assert.equal(await claim(j,target(b).key),null);
    await role(member,b,'authenticated');assert.equal((await one("select count(*) n from deliveries where channel='telegram'")).n,1);assert.equal((await one('select count(*) n from publications')).n,0);
    await role();
   }
  });
  await t.test('authorized future jobs dispatch when due with both automation flags false',async()=>{for(const brand of ['kess','primeiro-lar'] as const){const o=await create(brand),j=await queue(o,member,target(brand),new Date(Date.now()+3600000).toISOString());assert.equal(await claim(j,target(brand).key),null);await db.query("update telegram_jobs set scheduled_at=now()-interval '1 second' where id=$1",[j.id]);assert.ok((await db.query('select * from dropou_due_manual_telegram_jobs()')).rows.length);assert.equal((await claim(j,target(brand).key)).state,'sending');await one("select dropou_publication_receipt($1,'[]','uncertain','Fixture')",[j.id]);assert.equal(await claim(j,target(brand).key),null);}});
  await t.test('changed bot binding, destination, actor access and missing authorization never dispatch',async()=>{
   for(const mode of ['key','destination','actor','missing']){const o=await create('casa'),j=await queue(o);if(mode==='destination')await db.exec("update operation_settings set telegram_chat_id='-100999' where brand_id='casa'");if(mode==='actor')await db.query('update operation_members set active=false where member_id=$1',[member]);if(mode==='missing')await db.query('update telegram_jobs set queued_by=null where id=$1',[j.id]);assert.equal(await claim(j,mode==='key'?'x'.repeat(64):target('casa').key),null);assert.equal((await one('select state from telegram_jobs where id=$1',[j.id])).state,'blocked');await db.query('update operation_members set active=true where member_id=$1',[member]);await db.exec("update operation_settings set telegram_chat_id='-1002' where brand_id='casa'");}
  });
  await t.test('forged settings, automation, WhatsApp and server-only calls remain forbidden',async()=>{
   const o=await create('natal');
   await assert.rejects(one("select dropou_publication_queue_actor($1,$2,$3,'whatsapp',now(),$4,$5,$5,'verified',false)",[member,owner,o.id,JSON.stringify(target('natal')),o.caption]),/WhatsApp/);
   await assert.rejects(one("select dropou_publication_queue_actor($1,$2,$3,'telegram',now(),$4,$5,$5,'verified',true)",[member,owner,o.id,JSON.stringify(target('natal')),o.caption]),/local_brands_no_jobs/);
   for(const sql of ["update operation_settings set automation_enabled=true where brand_id='beleza'","update operation_settings set shopee_config='{\"enabled\":true}' where brand_id='casa'","update operation_settings set whatsapp_name='Fixture' where brand_id='natal'","update operation_settings set telegram_bot_env='TELEGRAM_CASA_BOT_TOKEN' where brand_id='beleza'"])await assert.rejects(db.exec(sql));
   assert.equal((await one('select automation_enabled from telegram_dispatch_config')).automation_enabled,false);assert.equal((await one("select count(*) n from operation_settings where brand_id in ('beleza','casa','natal') and automation_enabled")).n,0);
   for(const signature of ['dropou_publication_claim_v2(uuid,text,boolean)','dropou_due_manual_telegram_jobs()'])assert.equal((await one("select has_function_privilege('authenticated',$1,'EXECUTE') allowed",[signature])).allowed,false);
   const policies=(await db.query("select relname,relrowsecurity from pg_class where oid in ('public.telegram_jobs'::regclass,'public.operation_settings'::regclass,'public.deliveries'::regclass)")).rows;assert.ok(policies.every((r:any)=>r.relrowsecurity));
   await role(member,'beleza','authenticated');await assert.rejects(db.exec("update operation_settings set telegram_chat_id='-100999'"));await assert.rejects(db.exec('select dropou_due_manual_telegram_jobs()'));
   await role(other,'casa','authenticated');assert.equal((await db.query('select * from telegram_jobs')).rows.length,0);await role(owner,'all','anon');await assert.rejects(db.exec('select * from telegram_jobs'));
  });
 }finally{await db.close();}
});
