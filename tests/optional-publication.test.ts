import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import {formatCaption} from '../src/lib/ai';
import {emptyProduct} from '../src/lib/product-draft';
import {productKey,productSchema,Product} from '../src/lib/domain';
import {publicationBlock,bahiaInstant} from '../src/lib/publication';
import {safePublicationCaption,publicationPlan,publicationCaptionError,confirmedConditions,clockNow,serverClock} from '../src/lib/publication-copy';
import {acceptOfferUpdate,confirmedOfferUpdate} from '../src/lib/offer-view-state';
import {sendTelegramTo} from '../src/server/telegram-core';
import type {Offer} from '../src/lib/offers';
const product=():Product=>({...emptyProduct(),name:'EA Sports FC 27 — PS5',price:418.41,previousPrice:449.9,previousVerified:true,affiliateUrl:'https://meli.la/'+crypto.randomUUID()+'?tracking=original',inStock:null,status:'encontrado'});
const offer=(p=product()):Offer=>({id:crypto.randomUUID(),product_id:p.id,caption:formatCaption(p),snapshot:p,status:'rascunho',created_at:p.createdAt,updated_at:p.createdAt});
test('unconfirmed publication is local, deterministic and omits all historical commercial claims, including hostile names',()=>{
 const p=product(),o=offer(p),plan=publicationPlan(p,o.caption);
 assert.equal(plan.mode,'safe');assert.equal(plan.error,null);assert.equal(publicationBlock(p,o,o.caption),null);assert.match(plan.text,/#publi/);assert.ok(plan.text.includes(p.affiliateUrl));assert.ok(!plan.text.includes('418,41'));assert.doesNotMatch(plan.text,/R\$|449,90|ECONOMIZE|sem juros|no Pix|em estoque|garanta/i);assert.match(plan.text,/condições podem ter mudado/);
 for(const name of ['Produto R$ 99,00','PS5 50% desconto','Console frete grátis','Últimas unidades em estoque','Nome\nhttps://example.com','Console pix garantido']){const caption=safePublicationCaption({...p,name});assert.match(caption,/Seleção de games/);assert.ok(!caption.includes(name));}
 assert.equal(publicationCaptionError(plan.text+'\nR$ 418,41',p,'safe')?.includes('Sem conferência'),true);assert.equal(publicationCaptionError(o.caption,p,'verified')?.includes('conferência'),true);
 for(const affiliateUrl of ['', 'http://meli.la/test','https://fake.example/meli.la','https://user:password@meli.la/test','https://meli.la/test name'])assert.ok(publicationBlock({...p,affiliateUrl},o,o.caption));
});

test('price-required previews always retain the recorded value and block until confirmation, preserving approval over time',()=>{
 const p=product(),o=offer(p),now=Date.now(),plan=publicationPlan(p,o.caption,'priced',now);
 assert.equal(plan.mode,'verified');assert.match(plan.text,/418,41/);assert.ok(plan.error);assert.match(publicationBlock(p,o,o.caption,false,undefined,'priced',now)!,/Confira o preço/);
 const confirmed={...p,inStock:true,checkedAt:new Date(now).toISOString(),status:'pronto' as const};assert.equal(publicationPlan(confirmed,o.caption,'priced',now).error,null);
 const expired=publicationPlan(confirmed,o.caption,'priced',now+16*60000);assert.equal(expired.mode,'verified');assert.equal(expired.text,o.caption);assert.equal(expired.error,null);
 const legacy=publicationPlan(p,safePublicationCaption(p),'priced',now);assert.match(legacy.text,/418,41/);assert.ok(legacy.error);
});
test('confirmed conditions keep full copy after time passes; explicit safe choice never upgrades itself',()=>{
 const p={...product(),inStock:true,checkedAt:new Date().toISOString()},text=formatCaption(p),o={...offer(p),caption:text};
 assert.equal(confirmedConditions(p),true);assert.equal(publicationPlan(p,text).mode,'verified');assert.equal(publicationBlock(p,o,text),null);assert.equal(publicationPlan(p,text,'safe').mode,'safe');
 assert.equal(publicationPlan(p,text,'auto',Date.parse(p.checkedAt)+15*60000+1).mode,'verified');
 for(const changes of [{inStock:false},{dataOrigin:'screenshot' as const,screenshotConfirmed:false},{paymentMethod:'pix' as const,pixVerified:false}])assert.equal(publicationPlan({...p,...changes},text).mode,'safe');
 assert.ok(publicationCaptionError(text+'\nCupom e frete grátis',p,'verified'));
});
test('offer confirmation updates one authoritative snapshot, rejects stale responses and cannot affect a different offer',()=>{
 const p=product(),o=offer(p),fresh={...o,status:'pronto' as const,updated_at:new Date(Date.now()+1000).toISOString(),snapshot:{...p,inStock:true,checkedAt:new Date().toISOString(),status:'pronto' as const}};
 const current=confirmedOfferUpdate({product:p,offer:o},fresh);assert.equal(current.product.checkedAt,fresh.snapshot.checkedAt);assert.equal(current.offer?.status,'pronto');assert.equal(acceptOfferUpdate(current,{product:p,offer:o}),current);assert.equal(publicationBlock(current.product,current.offer,current.offer!.caption),null);
 assert.throws(()=>confirmedOfferUpdate(current,offer()),/outra oferta/);
});
test('server clock uses monotonic elapsed time rather than device timezone or a wrong browser wall clock',()=>{
 const server='2026-11-06T16:00:00.000Z',anchor=serverClock(server);assert.ok(Math.abs(clockNow(anchor)-Date.parse(server))<1000);assert.equal(bahiaInstant('2026-11-06T13:00'),server);
 const p={...product(),checkedAt:server,inStock:true};assert.equal(confirmedConditions(p,clockNow(anchor)),true);
});
test('authorized Telegram safe copy uses official method, the expected chat and no paid generation',async()=>{
 const p=product(),caption=safePublicationCaption(p);let calls=0;
 const ids=await sendTelegramTo({TELEGRAM_BOT_TOKEN:'fixture',TELEGRAM_CHAT_ID:'-100123'},{id:'-100123',title:'Teste',key:'a'.repeat(64)},caption,undefined,async(url,init)=>{
  calls++;assert.match(String(url),/api\.telegram\.org.*sendMessage$/);const body=JSON.parse(String(init?.body));assert.equal(body.chat_id,'-100123');assert.ok(body.text.includes(p.affiliateUrl));assert.doesNotMatch(body.text,/R\$|ECONOMIZE/);return Response.json({ok:true,result:{message_id:73,chat:{id:'-100123'}}});
 });assert.deepEqual(ids,['73']);assert.equal(calls,1);
});
test('isolated PostgreSQL proposal: optional modes, exact copy, clock persistence, schedule fallback and retained guards',async()=>{
 const db=new PGlite(),owner='10000000-0000-4000-8000-000000000001',other='10000000-0000-4000-8000-000000000002',target={id:'-100123',key:'a'.repeat(64),title:'Canal certo'};
 try{
  await db.exec(`create schema auth;create schema storage;create role authenticated;create role anon;create role service_role bypassrls;create table auth.users(id uuid primary key);insert into auth.users values('${owner}'),('${other}');create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema public,auth to authenticated,anon,service_role;grant execute on function auth.uid() to authenticated,anon,service_role;create table storage.buckets(id text primary key,public boolean,allowed_mime_types text[]);`);
  for(const path of ['supabase/schema.sql','supabase/whatsapp-flow.sql','supabase/ai-economy.sql','supabase/telegram-offers.sql','supabase/migrations/20261106132921_offer_editor_and_thumbnails.sql','supabase/migrations/20261106150839_publication_dispatch_and_review.sql','supabase/optional-price-publication.sql'])await db.exec(readFileSync(path,'utf8'));
  await db.query('insert into telegram_dispatch_config(id,secret,owner_ids,destination_key) values(true,$1,$2,$3)',['fixture-secret',[owner],target.key]);
  async function role(name:string,uid=owner){await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[uid]);await db.exec('set role '+name);}
  async function create(){await role('authenticated');const p=product(),saved=(await db.query<any>('select dropou_save_product($1,$2) p',[JSON.stringify(p),productKey(p)])).rows[0].p;return (await db.query<{o:Offer}>('select dropou_save_offer_version($1,$2,$3,$3,false) o',[p.id,JSON.stringify(saved),formatCaption(saved)])).rows[0].o;}
  async function queue(o:Offer,mode='safe',channel='telegram',allowSafe=true,at=new Date().toISOString()){
   await role('service_role');return (await db.query<any>('select dropou_publication_queue_v2($1,$2,$3,$4,$5,$6,$7,$8,$9) j',[owner,o.id,channel,at,JSON.stringify(target),mode==='safe'?safePublicationCaption(o.snapshot):o.caption,o.caption,mode,allowSafe])).rows[0].j;
  }
  async function claim(j:any,automatic=false,key=target.key){return (await db.query<any>('select dropou_publication_claim_v2($1,$2,$3) j',[j.id,key,automatic])).rows[0].j;}
  const safe=await create();assert.equal(safe.status,'rascunho');let job=await queue(safe);assert.equal(await claim(job,true),null);let sending=await claim(job);assert.equal(sending.publication_mode,'safe');assert.equal(sending.caption,safePublicationCaption(safe.snapshot));assert.equal(await claim(job),null);await assert.rejects(queue(safe),/registrado|incerto/);
  await db.query('select dropou_publication_receipt($1,$2,$3,null)',[job.id,'["301"]','sent']);assert.equal((await db.query<any>('select caption from deliveries where offer_id=$1',[safe.id])).rows[0].caption,sending.caption);assert.equal((await db.query<any>('select caption from offers where id=$1',[safe.id])).rows[0].caption,safe.caption);
  const fresh=await create();await role('service_role');await db.exec("set time zone 'America/Bahia'");const updated=(await db.query<{o:Offer}>('select dropou_publication_reconfirm($1,$2,$3) o',[owner,fresh.id,JSON.stringify(fresh.snapshot)])).rows[0].o;assert.equal(productSchema.safeParse(updated.snapshot).success,true);assert.equal(confirmedConditions(updated.snapshot),true);assert.equal(publicationBlock(updated.snapshot,updated,updated.caption),null);
  const reloaded=(await db.query<any>('select snapshot from offers where id=$1',[fresh.id])).rows[0].snapshot;assert.equal(reloaded.checkedAt,updated.snapshot.checkedAt);
  job=await queue(updated,'verified');await db.query("update telegram_jobs set authorized_until=now()-interval '1 second' where id=$1",[job.id]);sending=await claim(job);assert.equal(sending.publication_mode,'safe');assert.doesNotMatch(sending.caption,/R\$|ECONOMIZE/);assert.equal(sending.snapshot.checkedAt,updated.snapshot.checkedAt);await db.query('select dropou_publication_receipt($1,$2,$3,$4)',[job.id,'[]','uncertain','Timeout simulado']);await assert.rejects(queue(updated),/registrado|incerto/);
  const future=await create();job=await queue(future,'safe','telegram',true,new Date(Date.now()+3600000).toISOString());assert.equal(await claim(job),null);await db.query('select dropou_publication_cancel($1,$2)',[owner,future.id]);job=await queue(future);assert.equal(await claim(job,false,'b'.repeat(64)),null);assert.equal((await db.query<any>('select state from telegram_jobs where id=$1',[job.id])).rows[0].state,'blocked');
  const late=await create();await role('service_role');const latest=(await db.query<{o:Offer}>('select dropou_publication_reconfirm($1,$2,$3) o',[owner,late.id,JSON.stringify(late.snapshot)])).rows[0].o;job=await queue(latest,'verified');await claim(job);
  const downgraded=(await db.query<any>('select dropou_publication_downgrade($1) j',[job.id])).rows[0].j;assert.equal(downgraded.publication_mode,'safe');assert.equal(downgraded.caption,safePublicationCaption(latest.snapshot));assert.equal(downgraded.snapshot.checkedAt,latest.snapshot.checkedAt);
  await db.query('select dropou_publication_receipt($1,$2,$3,null)',[job.id,'["302"]','sending']);await assert.rejects(db.query('select dropou_publication_downgrade($1)',[job.id]),/Não é possível/);await db.query('select dropou_publication_receipt($1,$2,$3,null)',[job.id,'["302"]','sent']);
  const wa=await create();job=await queue(wa,'safe','whatsapp');await claim(job);assert.equal((await db.query<any>('select state from telegram_jobs where id=$1',[job.id])).rows[0].state,'ready');assert.equal((await db.query<any>('select count(*) n from publications where offer_id=$1',[wa.id])).rows[0].n,0);
  await role('authenticated');await assert.rejects(db.query('select dropou_publication_manual_v2($1,$2,$3,$4,$5)',[wa.id,'Canal teste',safePublicationCaption(wa.snapshot)+'\nOferta por R$ 9,99','safe',wa.caption]),/modo|condições/);
  const publication=(await db.query<any>('select dropou_publication_manual_v2($1,$2,$3,$4,$5) p',[wa.id,'Canal teste',safePublicationCaption(wa.snapshot),'safe',wa.caption])).rows[0].p;assert.equal(publication.publication_mode,'safe');assert.equal(publication.caption,safePublicationCaption(wa.snapshot));assert.equal(publication.destination,'Canal teste');assert.ok(publication.published_at);
  await assert.rejects(db.query('select dropou_publication_claim_v2($1,$2,false)',[job.id,target.key]),/permission denied/);await role('authenticated',other);assert.equal((await db.query('select * from telegram_jobs')).rows.length,0);
  await role('service_role');for(const name of ['PS5 🎮','PS5 R$ 99,00','Nome\n*especial*','Power 500GB']){const p={...product(),name};const rendered=(await db.query<any>('select dropou_safe_publication_caption($1) c',[JSON.stringify(p)])).rows[0].c;assert.equal(rendered,safePublicationCaption(p));}
  assert.equal((await db.query<any>('select count(*) n from ai_requests')).rows[0].n,0);
 }finally{await db.close();}
});
