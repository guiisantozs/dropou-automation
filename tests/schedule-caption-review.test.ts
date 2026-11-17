import {test} from 'node:test';import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';import {PGlite} from '@electric-sql/pglite';
import {emptyProduct} from '../src/lib/product-draft';import {productKey,type Product} from '../src/lib/domain';
import {formatCaption} from '../src/lib/ai';import {captionError} from '../src/lib/caption-editor';
import {publicationCaptionError,savedCaptionError,confirmedConditions} from '../src/lib/publication-copy';
import {captionCorrection} from '../src/lib/caption-repair';import {productScheduleState} from '../src/lib/schedule-state';
import {batchDataIssue} from '../src/lib/bulk-scheduling';import {priceCurrent,type ShopeeOffer} from '../src/lib/shopee-automation';
const product=():Product=>({...emptyProduct(),operation:'celulares',store:'Shopee',name:'Carregador Turbo 67W',price:29.51,inStock:true,checkedAt:new Date().toISOString(),affiliateUrl:'https://shopee.com.br/product/123/456'});
test('valid discount, absent discount and previous price share the save/schedule/executor decision',()=>{
 for(const previousVerified of [true,false])for(const previousPrice of [null,59.02]){const p={...product(),previousVerified,previousPrice},text=formatCaption(p,'celulares');assert.equal(captionError(text,p),null);assert.equal(savedCaptionError(text,p),null);assert.equal(publicationCaptionError(text,p,'verified'),null);assert.equal(batchDataIssue(p,text),null);if(!previousVerified||!previousPrice)assert.doesNotMatch(text,/desconto|economiz|%|De:/i);}
});
test('unproved words, wrong percentage and stale monetary copy are rejected before saving or batching; repair is only a proposal',()=>{
 const p=product(),good=formatCaption(p,'celulares');
 for(const text of [good+'\nEconomize!',good+'\nCom desconto!',good+'\n50% OFF',good+'\nR$ 99,00']){assert.ok(captionError(text,p));assert.equal(savedCaptionError(text,p),publicationCaptionError(text,p,'verified'));assert.ok(batchDataIssue(p,text));const proposal=captionCorrection(text,p)!;assert.equal(proposal.before,text);assert.equal(captionError(proposal.after,p),null);assert.equal(p.previousPrice,null);assert.equal(p.price,29.51);}
 const old={...p,previousPrice:59.02,previousVerified:true};assert.equal(captionError(formatCaption(old,'celulares')+'\n50% de desconto',old),null);assert.ok(captionError(formatCaption(old,'celulares')+'\n80% de desconto',old));
});
test('automatic copy never transfers an unproved discount from a supplied headline or title',()=>{
 const p={...product(),name:'Carregador com 90% de desconto',shortName:'Carregador desconto',features:['Economize 90%'],featuresVerified:true};const text=formatCaption(p,'celulares','DESCONTO EXCLUSIVO DE 90%!');assert.equal(captionError(text,p),null);assert.doesNotMatch(text,/90%|economiz|desconto/i);assert.match(text,/29,51/);
});
test('tomorrow retains explicit manual approval; automated Shopee observation expiry remains separate',()=>{
 const p=product(),tomorrow=Date.now()+86400000;assert.equal(confirmedConditions(p,tomorrow),true);assert.equal(confirmedConditions({...p,checkedAt:null},tomorrow),false);assert.equal(priceCurrent({checkedAt:new Date(Date.now()-86400000).toISOString()} as ShopeeOffer),false);
});
test('curation is independent of real future/late queue, validation failure, sending and uncertain delivery',()=>{
 const now=Date.now(),p=product(),base={product:p,curationState:'pending'};
 for(const [state,label]of [['queued','Agendado'],['blocked','Precisa de revisão'],['failed','Falhou'],['sending','Publicando'],['uncertain','Entrega incerta'],['partial','Envio parcial']] as const){const s=productScheduleState({...base,jobs:[{id:'fixture',channel:'telegram',state,scheduled_at:new Date(now+86400000).toISOString(),destination_title:'Celulares',attempts:0,message_ids:[]}]},now)!;assert.equal(s.label,label);assert.match(s.detail,/Telegram/);assert.equal(base.curationState,'pending');}
 assert.equal(productScheduleState({...base,jobs:[{id:'fixture',channel:'telegram',state:'queued',scheduled_at:new Date(now-1000).toISOString(),destination_title:'Celulares',attempts:0,message_ids:[]}]},now)?.label,'Atrasado');assert.equal(productScheduleState(base),null);
});
test('transactional caption repair keeps history, refuses uncertainty and stale data, and queues exactly once without delivery',async t=>{
 const db=new PGlite(),owner='72000000-0000-4000-8000-000000000001',other='72000000-0000-4000-8000-000000000002';
 const one=async(sql:string,args:any[]=[]) =>(await db.query<any>(sql,args)).rows[0];
 async function role(name='service_role',uid=owner){await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[uid]);await db.query("select set_config('request.headers',$1,false)",[JSON.stringify({'x-dropou-brand':'celulares'})]);await db.exec('set role '+name);}
 try{
  await db.exec(`create schema auth;create schema storage;create role authenticated;create role anon;create role service_role bypassrls;create table auth.users(id uuid primary key);insert into auth.users values('${owner}'),('${other}');create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema public,auth to authenticated,anon,service_role;grant execute on function auth.uid() to authenticated,anon,service_role;create table storage.buckets(id text primary key,public boolean,allowed_mime_types text[]);`);
  for(const f of ['schema.sql','whatsapp-flow.sql','ai-economy.sql','telegram-offers.sql'])await db.exec(readFileSync('supabase/'+f,'utf8'));
  for(const f of readdirSync('supabase/migrations').filter(f=>f.endsWith('.sql')).sort()){await db.exec(readFileSync('supabase/migrations/'+f,'utf8'));if(f.includes('publication_dispatch_and_review')){await db.query('insert into telegram_dispatch_config(id,secret,owner_ids,destination_key) values(true,$1,$2,$3)',['fixture-only',[owner],'a'.repeat(64)]);await db.exec(readFileSync('supabase/optional-price-publication.sql','utf8'));}}
  await assert.rejects(db.exec(readFileSync('supabase/migrations/20261117170847_schedule_caption_review_consistency.sql','utf8')),/already exists/);await db.exec('rollback');
  await role('authenticated');let p=(await one('select dropou_save_product($1,$2) p',[JSON.stringify(product()),productKey(product())])).p;
  const caption=formatCaption(p,'celulares'),o=(await one('select dropou_save_offer_version($1,$2,$3,$3,false) o',[p.id,JSON.stringify(p),caption])).o;await role();const future=new Date(Date.now()+86400000).toISOString(),target={id:'-10055',title:'Fixture',key:'a'.repeat(64),mediaMode:'text',photoConfirmed:false};
  await db.query("update operation_settings set telegram_chat_id=$1 where owner_id=$2 and brand_id='celulares'",[target.id,owner]);
  const job=(await one("select dropou_publication_queue_actor($1,$1,$2,'telegram',$3,$4,$5,$5,'verified',false) j",[owner,o.id,future,JSON.stringify(target),caption])).j;
  p=(await one('select data from products where id=$1',[p.id])).data;
  // Emulate a historical blocked copy produced before the new save validation.
  const bad=caption+'\nEconomize!',error='O desconto não está comprovado nos dados da oferta.';
  await db.query("update telegram_jobs set state='blocked',error=$2,caption=$3 where id=$1",[job.id,error,bad]);
  const repair=(actor=owner,expected=p,at=future,confirmed=true,before=bad)=>one('select dropou_schedule_review($1,$2,$3,$4,$5,$6,$7,$8,$9) r',[owner,actor,job.id,JSON.stringify(expected),before,caption,at,target.key,confirmed]);
  await t.test('confirmation, membership, expected snapshot and future date are mandatory',async()=>{await assert.rejects(repair(owner,p,future,false),/Confirme/);await assert.rejects(repair(other),/Operador/);await assert.rejects(repair(owner,{...p,price:99}),/alterada/);await assert.rejects(repair(owner,p,new Date(Date.now()-1000).toISOString()),/futura/);await db.query('update offers set caption=$2 where id=$1',[o.id,caption+'\nOutra revisao']);await assert.rejects(repair(),/alterada/);await db.query('update offers set caption=$2 where id=$1',[o.id,caption]);});
  await t.test('plain reschedule of an invalid caption is refused before entering the queue',async()=>{await assert.rejects(one("select dropou_schedule_change($1,$2,$1,'reschedule',$3)",[owner,job.id,future]),/legenda/);});
  await t.test('uncertain/partial/sending/sent states cannot be repaired or retried',async()=>{for(const state of ['uncertain','partial','sending','sent']){await db.exec('begin');await db.query('update telegram_jobs set state=$2 where id=$1',[job.id,state]);await assert.rejects(repair(),/incerto|repetido/);await db.exec('rollback');}await db.query("update telegram_jobs set state='blocked',error=$2 where id=$1",[job.id,error]);});
  await t.test('explicit repair changes one existing job, preserves the old error and never creates receipts',async()=>{await repair();const after=await one('select * from telegram_jobs where id=$1',[job.id]);assert.equal(after.state,'queued');assert.equal(after.caption,caption);assert.equal(after.allow_safe,false);assert.equal((await one('select count(*) n from telegram_jobs')).n,1);assert.equal((await one('select count(*) n from deliveries')).n,0);assert.equal((await one("select count(*) n from channel_events where job_id=$1 and event='reviewed_before_reschedule' and error=$2 and caption=$3",[job.id,error,bad])).n,1);await assert.rejects(repair(),/alterada/);});
  await t.test('client roles cannot invoke repair; another owner sees no rows under RLS',async()=>{await role('authenticated',other);assert.equal((await one('select count(*) n from telegram_jobs')).n,0);await assert.rejects(repair(),/permission denied/);await role('anon');await assert.rejects(repair(),/permission denied/);});
 }finally{await db.close();}
});
