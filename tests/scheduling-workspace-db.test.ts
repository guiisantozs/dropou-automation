import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import {emptyProduct} from '../src/lib/product-draft';
import {productKey} from '../src/lib/domain';
import {formatCaption} from '../src/lib/ai';
import {schedulingStatus,publicationRange,publicationDay} from '../src/lib/publication-workspace';
const owner='30000000-0000-4000-8000-000000000001',operator='30000000-0000-4000-8000-000000000002',other='30000000-0000-4000-8000-000000000003';
test('publication date filters respect Bahia midnight, leap day and inclusive seven-day windows',()=>{
 assert.equal(publicationDay(Date.parse('2026-11-14T02:59:59Z')),'2026-11-13');
 assert.deepEqual(publicationRange('week',Date.parse('2026-11-14T03:00:00Z')),{from:'2026-11-08',to:'2026-11-14'});
 assert.deepEqual(publicationRange('yesterday',Date.parse('2028-03-01T12:00:00Z')),{from:'2028-02-29',to:'2028-02-29'});
 assert.deepEqual(publicationRange('month',Date.parse('2026-11-14T12:00:00Z')),{from:'2026-11-01',to:'2026-11-14'});
});
test('scheduling/history database: independent platforms, receipt proof, corrections and permissions',async t=>{
 const db=new PGlite();let seq=1000;
 async function one(sql:string,args:any[]=[]){return (await db.query<any>(sql,args)).rows[0];}
 async function role(name='service_role',uid=owner,brand='dropou'){await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[uid]);await db.query("select set_config('request.headers',$1,false)",[JSON.stringify({'x-dropou-brand':brand})]);await db.exec('set role '+name);}
 async function offer(brand='dropou'){
  await role('authenticated',owner,brand);const p={...emptyProduct(),operation:brand,name:'Produto de teste '+(++seq),price:150,affiliateUrl:'https://shopee.com.br/product/123/'+seq,store:'Shopee',checkedAt:new Date().toISOString(),inStock:true};
  const saved=(await one('select dropou_save_product($1,$2) p',[JSON.stringify(p),productKey(p as any)])).p;
  const o=(await one('select dropou_save_offer_version($1,$2,$3,$3,false) o',[saved.id,JSON.stringify(saved),formatCaption(saved,brand as any)])).o;await role();return o;
 }
 const target={id:'-1004567',title:'Canal de teste',key:'b'.repeat(64),mediaMode:'text',photoConfirmed:false};
 async function queue(o:any,channel='telegram',actor=owner){await role();return (await one('select dropou_publication_queue_actor($1,$2,$3,$4,$5,$6,$7,$7,$8,false) j',[actor,owner,o.id,channel,new Date(Date.now()+3600000).toISOString(),JSON.stringify(channel==='telegram'?target:{title:'WhatsApp de teste'}),o.caption,'verified'])).j;}
 async function claim(j:any){await db.query('update telegram_jobs set scheduled_at=now() where id=$1',[j.id]);return (await one('select dropou_publication_claim_v2($1,$2,false) j',[j.id,target.key])).j;}
 async function page(brand='dropou'){await role('authenticated',owner,brand);return (await one('select dropou_schedule_page(0) p')).p;}
 try{
  await db.exec(`create schema auth;create schema storage;create role authenticated;create role anon;create role service_role bypassrls;create table auth.users(id uuid primary key);insert into auth.users values('${owner}'),('${operator}'),('${other}');create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema public,auth to authenticated,anon,service_role;grant execute on function auth.uid() to authenticated,anon,service_role;create table storage.buckets(id text primary key,public boolean,allowed_mime_types text[]);`);
  for(const f of ['schema.sql','whatsapp-flow.sql','ai-economy.sql','telegram-offers.sql'])await db.exec(readFileSync('supabase/'+f,'utf8'));
  for(const f of readdirSync('supabase/migrations').filter(f=>f.endsWith('.sql')).sort()){
   await db.exec(readFileSync('supabase/migrations/'+f,'utf8'));
   if(f.includes('publication_dispatch_and_review')){await db.query('insert into telegram_dispatch_config(id,secret,owner_ids,destination_key) values(true,$1,$2,$3)',['local-scheduling-test',[owner],'a'.repeat(64)]);await db.exec(readFileSync('supabase/optional-price-publication.sql','utf8'));}
  }
  await role();await db.query("update operation_settings set telegram_chat_id=$1,whatsapp_name='WhatsApp de teste' where owner_id=$2",[target.id,owner]);
  await t.test('Telegram cannot be marked as sent without an API receipt',async()=>{
   const o=await offer();await assert.rejects(db.query("select dropou_publication_mark_actor($1,'dropou',$2,$1,'telegram',$3,null,false,false)",[owner,o.product_id,crypto.randomUUID()]),/confirmação da API/);
   assert.equal((await one('select count(*) n from dropou_confirmed_publications where product_id=$1',[o.product_id])).n,0);
  });
  await t.test('manual WhatsApp completion cancels only its pending destination, is idempotent and keeps Telegram queued',async()=>{
   const o=await offer(),tg=await queue(o),wa=await queue(o,'whatsapp'),mark=crypto.randomUUID();
   await assert.rejects(db.query("select dropou_publication_mark_actor($1,'dropou',$2,$1,'whatsapp',$3,null,false,false)",[owner,o.product_id,mark]),/Confirme/);
   await one("select dropou_publication_mark_actor($1,'dropou',$2,$1,'whatsapp',$3,null,false,true)",[owner,o.product_id,mark]);
   await one("select dropou_publication_mark_actor($1,'dropou',$2,$1,'whatsapp',$3,null,false,true)",[owner,o.product_id,mark]);
   assert.equal((await one('select state from telegram_jobs where id=$1',[tg.id])).state,'queued');assert.equal((await one('select state from telegram_jobs where id=$1',[wa.id])).state,'cancelled');
   assert.equal((await one('select count(*) n from product_channel_marks where id=$1',[mark])).n,1);assert.equal((await one('select count(*) n from operation_audit where resource_id=$1',[mark])).n,1);
   assert.ok((await page()).jobs.some((j:any)=>j.id===tg.id));await role();
   assert.ok(await claim(tg));await one("select dropou_publication_receipt($1,'[\"901\"]','sent',null)",[tg.id]);await one("select dropou_publication_receipt($1,'[\"901\"]','sent',null)",[tg.id]);
   assert.ok(!(await page()).jobs.some((j:any)=>[tg.id,wa.id].includes(j.id)));
   const status=(await one('select * from dropou_product_channel_summaries($1)',[[o.product_id]]));assert.equal(status.telegram.published,true);assert.equal(status.whatsapp.published,true);
   const records=(await one('select dropou_publication_records_page() p')).p.entries.filter((e:any)=>e.product_id===o.product_id);assert.equal(records.length,2);assert.equal(records.find((e:any)=>e.channel==='telegram').actor_id,owner);
   await role();await assert.rejects(queue(o),/registrado|enviada|publica|autorize|repet/i);
   await one("select dropou_publication_undo($1,'dropou',$2,'manual_mark',$1)",[owner,mark]);
   await role('authenticated');const after=await one('select * from dropou_product_channel_summaries($1)',[[o.product_id]]);assert.equal(after.whatsapp.published,false);assert.equal(after.telegram.published,true);
   await role();assert.ok((await one('select revoked_at from product_channel_marks where id=$1',[mark])).revoked_at);assert.equal((await one('select state from telegram_jobs where id=$1',[wa.id])).state,'cancelled');
  });
  await t.test('reschedule keeps the approved snapshot and destination; cancelled rows disappear without erasing evidence',async()=>{
   const o=await offer(),j=await queue(o),before=await one('select snapshot,caption,destination_id from telegram_jobs where id=$1',[j.id]),at=new Date(Date.now()+86400000).toISOString();
   await one("select dropou_schedule_change($1,$2,$1,'reschedule',$3)",[owner,j.id,at]);assert.deepEqual(await one('select snapshot,caption,destination_id from telegram_jobs where id=$1',[j.id]),before);
   await one("select dropou_schedule_change($1,$2,$1,'cancel',null)",[owner,j.id]);await one("select dropou_schedule_change($1,$2,$1,'cancel',null)",[owner,j.id]);
   assert.ok(!(await page()).jobs.some((r:any)=>r.id===j.id));await role();assert.equal((await one('select state from telegram_jobs where id=$1',[j.id])).state,'cancelled');
  });
  await t.test('failures and partial/uncertain receipts never count as published and cannot be blindly retried',async()=>{
   for(const state of ['failed','partial','uncertain']){
    const o=await offer(),j=await queue(o);assert.ok(await claim(j));await one('select dropou_publication_receipt($1,$2,$3,$4)',[j.id,state==='partial'?'["902"]':'[]',state,'Synthetic provider failure']);
    assert.ok((await page()).jobs.some((r:any)=>r.id===j.id));assert.equal((await one('select dropou_publication_records_page() p')).p.entries.some((r:any)=>r.product_id===o.product_id),false);
    await role();if(state!=='failed'){assert.equal((await one('select dropou_publication_claim_v2($1,$2,false) j',[j.id,target.key])).j,null);await assert.rejects(db.query("select dropou_schedule_change($1,$2,$1,'reschedule',now()+interval '1 day')",[owner,j.id]),/incerto/);}
    assert.notEqual(schedulingStatus({...j,state,scheduled_at:new Date(Date.now()-60000).toISOString()}),'Publicado');
   }
  });
  await t.test('legacy manual publication flow finishes only WhatsApp atomically and revocation is auditable',async()=>{
   const o=await offer(),tg=await queue(o),wa=await queue(o,'whatsapp');await role('authenticated');
   const w=(await one("select dropou_publication_manual_v2($1,'WhatsApp de teste',$2,'verified',$2) r",[o.id,o.caption])).r;assert.equal(w.confirmed_by,owner);
   await role();assert.equal((await one('select state from telegram_jobs where id=$1',[wa.id])).state,'sent');assert.equal((await one('select state from telegram_jobs where id=$1',[tg.id])).state,'queued');
   await one("select dropou_publication_undo($1,'dropou',$2,'whatsapp_manual',$1)",[owner,w.id]);assert.ok((await one('select revoked_at from publications where id=$1',[w.id])).revoked_at);
   await role('authenticated');assert.equal((await one('select * from dropou_product_channel_summaries($1)',[[o.product_id]])).whatsapp.published,false);
  });
  await t.test('history survives weeks, date filtering is real, and RLS protects every channel and realtime notification',async()=>{
   const o=await offer('tenis');await db.query("insert into operation_members(member_id,owner_id,role,brands) values($1,$2,'operator',array['tenis'])",[operator,owner]);
   const j=await queue(o,'telegram',operator);assert.ok(await claim(j));await one("select dropou_publication_receipt($1,'[\"903\"]','sent',null)",[j.id]);
   await db.query("update channel_events set effective_at=now()-interval '20 days' where product_id=$1 and event='sent'",[o.product_id]);
   await role('authenticated',operator,'all');assert.equal((await one('select dropou_publication_records_page(0,null,null,null,null) p')).p.total,1);
   assert.equal((await one("select dropou_publication_records_page(0,now()-interval '1 day',now(),null,null) p")).p.total,0);
   assert.equal((await one('select dropou_publication_records_page(0,null,null,null,$1) p',[owner])).p.total,0);
   assert.deepEqual((await db.query<any>('select brand_id from publication_updates')).rows.map(r=>r.brand_id),['tenis']);
   await assert.rejects(db.query("select dropou_schedule_change($1,$2,$3,'cancel',null)",[owner,j.id,operator]),/permission denied/);
   await role();await assert.rejects(db.query("select dropou_schedule_change($1,$2,$3,'cancel',null)",[owner,j.id,other]),/sem acesso/);
   await role('authenticated',other,'all');assert.equal((await one('select dropou_publication_records_page() p')).p.total,0);assert.equal((await db.query('select * from publication_updates')).rows.length,0);
   await role();await db.query('update operation_members set active=false where member_id=$1',[operator]);await role('authenticated',operator,'all');assert.equal((await one('select dropou_publication_records_page() p')).p.total,0);
  });
  await t.test('multi-channel queue isolates destinations, preserves the source, rolls back invalid batches and never reserves twice',async()=>{
   const source=await offer();const cell={...target,id:'-1005678',key:'c'.repeat(64),brand:'celulares'};
   await db.query("update operation_settings set telegram_chat_id=$1 where owner_id=$2 and brand_id='celulares'",[cell.id,owner]);
   const request=crypto.randomUUID(),payload={caption:source.caption,brands:['dropou','celulares']};
   async function batch(r=request,targets:any[]=[{...target,brand:'dropou'},cell],actor=owner){return (await one('select dropou_multichannel_queue($1,$2,$3,$4,$5,$6,$7,now(),$8) b',[owner,actor,source.id,r,JSON.stringify(source.snapshot),source.caption,JSON.stringify(targets),JSON.stringify(payload)])).b;}
   const count=(await one('select count(*) n from products')).n;
   await assert.rejects(batch(crypto.randomUUID(),[{...target,brand:'dropou'},{...cell,id:target.id}]),/distintos/);assert.equal((await one('select count(*) n from products')).n,count);
   await assert.rejects(batch(crypto.randomUUID(),[{...target,brand:'dropou'},cell],operator),/sem acesso/);
   const result=await batch();assert.equal(result.jobs.length,2);assert.equal(result.alreadyReserved,false);
   const rows=(await db.query<any>('select * from telegram_jobs where id=any($1)',[result.jobs.map((j:any)=>j.id)])).rows;
   assert.deepEqual(new Set(rows.map(j=>j.brand_id)),new Set(['dropou','celulares']));assert.equal(rows.find(j=>j.brand_id==='celulares').destination_id,cell.id);assert.equal(rows.find(j=>j.brand_id==='dropou').destination_id,target.id);
   assert.equal(rows.find(j=>j.brand_id==='dropou').product_id,source.product_id);assert.ok(rows.find(j=>j.brand_id==='celulares').product_id!==source.product_id);
   assert.ok(rows.every(j=>j.caption===source.caption&&j.snapshot.price===source.snapshot.price&&j.queued_by===owner));
   assert.equal((await batch()).alreadyReserved,true);assert.equal((await one('select count(*) n from telegram_jobs where id=any($1)',[result.jobs.map((j:any)=>j.id)])).n,2);
   await assert.rejects(batch(crypto.randomUUID()),/não será repetido/);
   const tg=rows.find(j=>j.brand_id==='dropou'),cg=rows.find(j=>j.brand_id==='celulares');assert.ok(await claim(tg));await one("select dropou_publication_receipt($1,'[\"910\"]','sent',null)",[tg.id]);
   await db.query('update telegram_jobs set scheduled_at=now() where id=$1',[cg.id]);assert.ok((await one('select dropou_publication_claim_v2($1,$2,false) j',[cg.id,cell.key])).j);
   await one("select dropou_publication_receipt($1,'[]','uncertain','Resposta desconhecida')",[cg.id]);assert.equal((await batch()).alreadyReserved,true);
   assert.equal((await one('select state from telegram_jobs where id=$1',[tg.id])).state,'sent');assert.equal((await one('select state from telegram_jobs where id=$1',[cg.id])).state,'uncertain');
   const published=await offer(),first=await queue(published);assert.ok(await claim(first));await one("select dropou_publication_receipt($1,'[\"911\"]','sent',null)",[first.id]);
   const current=(await one('select snapshot from offers where id=$1',[published.id])).snapshot;
   const onlyCell=(await one('select dropou_multichannel_queue($1,$1,$2,$3,$4,$5,$6,now(),$7) b',[owner,published.id,crypto.randomUUID(),JSON.stringify(current),published.caption,JSON.stringify([cell]),JSON.stringify({only:'celulares'})])).b;
   assert.equal(onlyCell.jobs.length,1);assert.equal(onlyCell.jobs[0].brand,'celulares');assert.equal((await one('select state from telegram_jobs where id=$1',[first.id])).state,'sent');
   await role('authenticated');await assert.rejects(db.query('select * from publication_batches'),/permission denied/);
  });
 }finally{await db.close();}
});
