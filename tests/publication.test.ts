import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import {telegramConfig,resolveTelegramTarget,sendTelegramTo,TelegramFailure} from '../src/server/telegram-core';
import {bahiaInstant,publicationBlock} from '../src/lib/publication';
import {shareWhatsApp,copyImage} from '../src/lib/share';
import {WorkerLifetime} from '../src/lib/image-preparation';
import {formatCaption} from '../src/lib/ai';
import {emptyProduct} from '../src/lib/product-draft';
import {productSchema,productKey} from '../src/lib/domain';
import type {Offer} from '../src/lib/offers';
const env={TELEGRAM_BOT_TOKEN:'mock-private-token',TELEGRAM_CHANNEL_ID:'-100123'},target={id:'-100123',title:'Canal de teste',key:'a'.repeat(64)};
const product=()=>({...emptyProduct(),name:'Controle GameSir',price:160.34,affiliateUrl:'https://meli.la/original?x=~y~',status:'pronto' as const,inStock:true,checkedAt:new Date().toISOString()});
test('Telegram resolves a channel and administrator permissions; rejects conflicting channel variables',async()=>{
 assert.equal(telegramConfig(env).chat,target.id);assert.throws(()=>telegramConfig({...env,TELEGRAM_CHAT_ID:'-100456'}),/diferentes/);
 const methods:string[]=[];const http:typeof fetch=async(url)=>{const method=String(url).split('/').at(-1)!;methods.push(method);return Response.json({ok:true,result:method==='getMe'?{id:42}:method==='getChat'?{id:target.id,type:'channel',title:target.title}:{status:'administrator',can_post_messages:true}});};
 const result=await resolveTelegramTarget(env,http);assert.equal(result.id,target.id);assert.equal(result.title,target.title);assert.equal(result.key.length,64);assert.deepEqual(methods.sort(),['getChat','getChatMember','getMe']);
 await assert.rejects(resolveTelegramTarget(env,async()=>Response.json({ok:false,error_code:403,description:env.TELEGRAM_BOT_TOKEN},{status:403})),e=>e instanceof TelegramFailure&&e.outcome==='failed'&&!e.message.includes(env.TELEGRAM_BOT_TOKEN));
 await assert.rejects(resolveTelegramTarget(env,async(url)=>Response.json({ok:true,result:String(url).endsWith('getMe')?{id:42}:String(url).endsWith('getChat')?{id:target.id,type:'channel',title:'Teste'}:{status:'member'}})),/administrador/);
});
test('Telegram success validates chat and persists photo receipt before full long formatted caption',async()=>{
 const calls:{url:string;body:any}[]=[],receipts:string[][]=[];let persisted=false;
 const text='🎮 *Controle*\n'+('Texto completo '.repeat(100))+'\nhttps://meli.la/original?x=~y~';
 const http:typeof fetch=async(url,init)=>{if(calls.length)assert.equal(persisted,true);calls.push({url:String(url),body:JSON.parse(String(init?.body))});return Response.json({ok:true,result:{message_id:calls.length,chat:{id:target.id}}});};
 const ids=await sendTelegramTo(env,target,text,'https://example.com/photo.jpg',http,async ids=>{receipts.push(ids);persisted=true;});
 assert.deepEqual(ids,['1','2']);assert.deepEqual(receipts,[['1'],['1','2']]);assert.ok(calls[0].url.endsWith('/sendPhoto'));assert.equal(calls[0].body.caption,undefined);assert.ok(calls[1].url.endsWith('/sendMessage'));assert.ok(calls[1].body.text.includes('https://meli.la/original?x=~y~'));assert.ok(calls[1].body.entities.some((e:any)=>e.type==='bold'));assert.equal(calls[1].body.reply_parameters.message_id,1);
});
test('Telegram permission, network, timeout, malformed receipt and partial failure never retry blindly',async()=>{
 for(const http of [async()=>{throw new TypeError('network');},async()=>{throw new DOMException('timeout','TimeoutError');},async()=>Response.json({ok:true,result:{message_id:1,chat:{id:'wrong-channel'}}}),async()=>Response.json({ok:false},{status:502})]){
  let calls=0;await assert.rejects(sendTelegramTo(env,target,'Texto',undefined,async()=>{calls++;return http();}),e=>e instanceof TelegramFailure&&e.outcome==='uncertain');assert.equal(calls,1);
 }
 await assert.rejects(sendTelegramTo(env,target,'Texto',undefined,async()=>Response.json({ok:false,error_code:403},{status:403})),e=>e instanceof TelegramFailure&&e.outcome==='failed');
 let calls=0;await assert.rejects(sendTelegramTo(env,target,'a'.repeat(1500),'https://example.com/image.jpg',async()=>++calls===1?Response.json({ok:true,result:{message_id:7,chat:{id:target.id}}}):Response.json({ok:false,error_code:403},{status:403})),e=>e instanceof TelegramFailure&&e.outcome==='partial'&&e.ids[0]==='7');assert.equal(calls,2);
});
test('pause and expired-price checks stop before each Telegram request, preserving any first receipt',async()=>{
 let calls=0,checks=0;
 const http:typeof fetch=async()=>{calls++;return Response.json({ok:true,result:{message_id:9,chat:{id:target.id}}});};
 await assert.rejects(sendTelegramTo(env,target,'Texto',undefined,http,async()=>{},async()=>{throw new TelegramFailure('Automação pausada','failed');}),e=>e instanceof TelegramFailure&&e.outcome==='failed');assert.equal(calls,0);
 await assert.rejects(sendTelegramTo(env,target,'a'.repeat(1500),'https://example.com/image.jpg',http,async()=>{},async()=>{if(++checks===2)throw new TelegramFailure('Conferência expirou','failed');}),e=>e instanceof TelegramFailure&&e.outcome==='partial'&&e.ids[0]==='9');assert.equal(calls,1);
});
test('publication reasons preserve freshness, saved caption, stock and duplicate protections; Bahia wall clock is explicit',()=>{
 const p=product(),text=formatCaption(p),o={id:crypto.randomUUID(),product_id:p.id,caption:text,snapshot:p,status:'pronto'} as Offer;
 assert.equal(publicationBlock(p,o,text),null);assert.match(publicationBlock(p,undefined,text)!,/Salve/);assert.match(publicationBlock(p,o,text+' edit')!,/Salve a edição/);assert.match(publicationBlock({...p,checkedAt:new Date(Date.now()-16*60000).toISOString()},o,text)!,/expirado|revalid/i);assert.ok(publicationBlock({...p,inStock:false},o,text));assert.match(publicationBlock(p,o,text,true)!,/Aguarde/);assert.match(publicationBlock({...p,status:'publicado'},o,text)!,/publicada/);
 assert.equal(bahiaInstant('2026-11-10T12:30'),'2026-11-10T15:30:00.000Z');assert.throws(()=>bahiaInstant('2026-02-30T12:00'));assert.throws(()=>bahiaInstant('invalid'));
});
test('WhatsApp share selects destination manually, supports cancel and preserves text in fallback; image copy fallback is explicit',async()=>{
 const text='🎮 *Oferta*\nhttps://meli.la/original?x=~y~';let shared='',opened='';
 assert.match(await shareWhatsApp(text,{share:async data=>{shared=data?.text!;}},()=>{throw new Error('Unexpected fallback');}),/manualmente/);assert.equal(shared,text);
 assert.match(await shareWhatsApp(text,{share:async()=>{throw new DOMException('cancel','AbortError');}},()=>{throw new Error('Unexpected fallback');}),/cancelado/);
 await shareWhatsApp(text,{} as Navigator,url=>{opened=url;return {};});assert.equal(new URL(opened).searchParams.get('text'),text);
 await assert.rejects(copyImage(new Blob(['image'],{type:'image/png'}),{} as Clipboard),/Baixar imagem/);
});
test('OCR lifetime terminates active and late-created workers exactly once',async()=>{
 let terminated=0;const life=new WorkerLifetime();await life.attach({terminate:async()=>{terminated++;}});await life.stop();await life.finish();assert.equal(terminated,1);
 await assert.rejects(life.attach({terminate:async()=>{terminated++;}}),/cancelado/);assert.equal(terminated,2);
});
test('shared PostgreSQL queue: authorization, deduplication, pause, expiry, human review, cancel, reschedule, receipts and manual destination',async()=>{
 const db=new PGlite(),owner='10000000-0000-4000-8000-000000000001',other='10000000-0000-4000-8000-000000000002';
 try{
  await db.exec(`create schema auth;create schema storage;create role authenticated;create role anon;create role service_role bypassrls;create table auth.users(id uuid primary key);insert into auth.users values('${owner}'),('${other}');create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema public,auth to authenticated,anon,service_role;grant execute on function auth.uid() to authenticated,anon,service_role;create table storage.buckets(id text primary key,public boolean,allowed_mime_types text[]);`);
  for(const path of ['supabase/schema.sql','supabase/whatsapp-flow.sql','supabase/ai-economy.sql','supabase/telegram-offers.sql','supabase/migrations/20261106132921_offer_editor_and_thumbnails.sql','supabase/migrations/20261106150839_publication_dispatch_and_review.sql'])await db.exec(readFileSync(path,'utf8'));
  await db.query('insert into telegram_dispatch_config(id,secret,owner_ids,destination_key) values(true,$1,$2,$3)',['fixture-secret',[owner],target.key]);
  async function role(name:string,uid=owner){await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[uid]);await db.exec('set role '+name);}
  async function create(){await role('authenticated');const p=product();p.affiliateUrl='https://meli.la/'+p.id;const saved=(await db.query<{p:any}>('select dropou_save_product($1,$2) p',[JSON.stringify(p),productKey(p)])).rows[0].p;return (await db.query<{o:Offer}>('select dropou_save_offer_version($1,$2,$3,$3,false) o',[p.id,JSON.stringify(saved),formatCaption(saved)])).rows[0].o;}
  async function queue(o:Offer,channel='telegram',at=new Date().toISOString()){await role('service_role');return (await db.query<{j:any}>('select dropou_publication_queue($1,$2,$3,$4,$5,$6) j',[owner,o.id,channel,at,JSON.stringify(target),o.caption])).rows[0].j;}
  async function claim(j:any,auto=false){return (await db.query<{j:any}>('select dropou_publication_claim($1,$2,$3) j',[j.id,target.key,auto])).rows[0].j;}
  const o=await create();let j=await queue(o);
  assert.equal(await claim(j,true),null);assert.equal((await db.query<any>('select state from telegram_jobs where id=$1',[j.id])).rows[0].state,'queued');
  const sending=await claim(j);assert.equal(sending.state,'sending');assert.equal(sending.attempts,1);assert.equal(await claim(j),null);await assert.rejects(queue(o),/registrado|incerto/);
  await db.query('select dropou_publication_receipt($1,$2,$3,$4)',[j.id,'["91"]','sending',null]);
  await db.query('select dropou_publication_receipt($1,$2,$3,$4)',[j.id,'["91","92"]','sent',null]);
  assert.equal((await db.query<any>('select data from products where id=$1',[o.product_id])).rows[0].data.status,'publicado');await assert.rejects(queue(o),/registrado|incerto/);
  const future=await create();j=await queue(future,'telegram',new Date(Date.now()+3600000).toISOString());assert.equal(await claim(j),null);await db.query('select dropou_publication_cancel($1,$2)',[owner,future.id]);j=await queue(future);await db.query('update telegram_jobs set authorized_until=now()-interval \'1 second\' where id=$1',[j.id]);assert.equal(await claim(j),null);assert.equal((await db.query<any>('select state from telegram_jobs where id=$1',[j.id])).rows[0].state,'blocked');
  const expected=(await db.query<any>('select data from products where id=$1',[future.product_id])).rows[0].data;
  const refreshed=(await db.query<{o:Offer}>('select dropou_publication_reconfirm($1,$2,$3) o',[owner,future.id,JSON.stringify(expected)])).rows[0].o;assert.equal(refreshed.caption,future.caption);assert.ok(productSchema.safeParse(refreshed.snapshot).success);j=await queue(refreshed);assert.equal((await claim(j)).state,'sending');await db.query('select dropou_publication_receipt($1,$2,$3,$4)',[j.id,'[]','uncertain','Timeout simulado']);assert.equal(await claim(j),null);await assert.rejects(queue(refreshed),/incerto|registrado/);await assert.rejects(db.query('select dropou_publication_cancel($1,$2)',[owner,future.id]),/começou|cancelado/);
  const retry=await create();j=await queue(retry);await claim(j);await db.query('select dropou_publication_receipt($1,$2,$3,$4)',[j.id,'[]','failed','403 simulado']);j=await queue(retry);assert.equal((await claim(j)).attempts,2);await db.query('select dropou_publication_receipt($1,$2,$3,$4)',[j.id,'["93"]','partial','Segunda parte recusada']);await assert.rejects(queue(retry),/incerto|registrado/);
  const wa=await create();j=await queue(wa,'whatsapp');await claim(j);assert.equal((await db.query<any>('select state from telegram_jobs where id=$1',[j.id])).rows[0].state,'ready');assert.equal((await db.query<any>('select count(*) n from publications where offer_id=$1',[wa.id])).rows[0].n,0);
  await role('authenticated');const pub=(await db.query<any>('select dropou_publication_manual($1,$2) p',[wa.id,'Canal Dropou teste'])).rows[0].p;assert.equal(pub.destination,'Canal Dropou teste');assert.ok(pub.published_at);assert.equal((await db.query<any>('select dropou_publication_manual($1,$2) p',[wa.id,'Outro destino'])).rows[0].p.destination,'Canal Dropou teste');
  await assert.rejects(db.query('select dropou_publication_claim($1,$2,false)',[j.id,target.key]),/permission denied/);await assert.rejects(db.exec("update telegram_dispatch_config set automation_enabled=true"),/permission denied/);
  await role('authenticated',other);assert.equal((await db.query('select * from telegram_jobs')).rows.length,0);
 }finally{await db.close();}
});
