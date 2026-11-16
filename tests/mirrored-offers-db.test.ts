import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import {PersistentMirrorOffers} from '../src/server/mtproto/persistent-offers';
const owner='60000000-0000-4000-8000-000000000001',operator='60000000-0000-4000-8000-000000000002',other='60000000-0000-4000-8000-000000000003',holder='60000000-0000-4000-8000-000000000004',replacement='60000000-0000-4000-8000-000000000005';
for(const creator of ['postgres','supabase_admin'])test(`persistent mirror SQL under ${creator} Supabase defaults: scope, transitions, restart, deduplication and protected budgets`,async t=>{
 let db=new PGlite();
 async function one(sql:string,args:unknown[]=[]){return (await db.query<any>(sql,args)).rows[0];}
 async function role(name='service_role',actor=owner,brand='dropou'){await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[actor]);await db.query("select set_config('request.headers',$1,false)",[JSON.stringify({'x-dropou-brand':brand})]);await db.exec('set role '+name);}
 try{
  await db.exec(`create schema auth;create schema storage;create role authenticated;create role anon;create role service_role bypassrls;create table auth.users(id uuid primary key);insert into auth.users values('${owner}'),('${operator}'),('${other}');create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema public,auth to authenticated,anon,service_role;grant execute on function auth.uid() to authenticated,anon,service_role;create table storage.buckets(id text primary key,public boolean,allowed_mime_types text[]);`);
  for(const f of ['schema.sql','whatsapp-flow.sql','ai-economy.sql','telegram-offers.sql'])await db.exec(readFileSync('supabase/'+f,'utf8'));
  for(const f of readdirSync('supabase/migrations').filter(f=>f.endsWith('.sql')).sort()){
   if(f==='20261116025405_mtproto_persistent_mirror_queue.sql'){
    await db.exec(readFileSync('tests/fixtures/supabase-default-acls.sql','utf8'));
    const defaults=async()=> (await db.query('select defaclrole,defaclnamespace,defaclobjtype,defaclacl::text from pg_default_acl order by oid')).rows;
    const earlierAcls=async()=> (await db.query("select oid,relacl::text from pg_class where relnamespace='public'::regnamespace and relname not like 'mirror_%' order by oid")).rows;
    const beforeDefaults=await defaults(),beforeAcls=await earlierAcls();
    await db.exec('set role '+creator);await db.exec(readFileSync('supabase/migrations/'+f,'utf8'));await db.exec('reset role');
    assert.deepEqual(await defaults(),beforeDefaults,'migration must not change default privileges');
    assert.deepEqual(await earlierAcls(),beforeAcls,'migration must not change existing table privileges');
    continue;
   }
   await db.exec(readFileSync('supabase/migrations/'+f,'utf8'));
   if(f.includes('publication_dispatch_and_review')){await db.query('insert into telegram_dispatch_config(id,secret,owner_ids,destination_key) values(true,$1,$2,$3)',['fixture-only',[owner],'a'.repeat(64)]);await db.exec(readFileSync('supabase/optional-price-publication.sql','utf8'));}
  }
  await t.test('exact service ACLs remove every inherited excess, preserve invoker RPCs and require no sequences',async()=>{
   const expected:Record<string,string[]>={mirror_offers:['INSERT','SELECT','UPDATE'],mirror_offer_events:['INSERT','SELECT'],mirror_channel_policies:['INSERT','SELECT','UPDATE'],mirror_budget_limits:['SELECT']};
   for(const [table,privileges] of Object.entries(expected)){
    const row=await one('select pg_get_userbyid(relowner) owner,relrowsecurity rls from pg_class where oid=$1::regclass',['public.'+table]);assert.equal(row.owner,creator);assert.equal(row.rls,true);
    const grants=(await db.query<any>("select a.privilege_type,a.is_grantable from pg_class c cross join lateral aclexplode(c.relacl) a where c.oid=$1::regclass and a.grantee='service_role'::regrole order by a.privilege_type",['public.'+table])).rows;
    assert.deepEqual(grants.map(g=>g.privilege_type),privileges);assert.ok(grants.every(g=>!g.is_grantable));
    for(const permission of ['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER'])assert.equal((await one('select has_table_privilege(\'service_role\',$1,$2) allowed',['public.'+table,permission])).allowed,privileges.includes(permission));
    for(const browser of ['anon','authenticated'])for(const permission of ['INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER'])assert.equal((await one('select has_table_privilege($1,$2,$3) allowed',[browser,'public.'+table,permission])).allowed,false);
   }
   assert.equal((await one("select count(*) n from pg_class c where c.relkind='S' and (c.relname like 'mirror_%' or exists(select 1 from pg_depend d join pg_class t on t.oid=d.refobjid where d.objid=c.oid and t.relname like 'mirror_%'))")).n,0);
   const functions=(await db.query<any>("select p.prosecdef,p.proconfig,has_function_privilege('service_role',p.oid,'EXECUTE') server_execute,has_function_privilege('anon',p.oid,'EXECUTE') anon_execute,has_function_privilege('authenticated',p.oid,'EXECUTE') member_execute from pg_proc p where p.pronamespace='public'::regnamespace and (p.proname like 'dropou_mirror_%' or p.proname in ('dropou_shopee_reserve','dropou_shopee_reserve_v2'))")).rows;
   assert.equal(functions.length,11);assert.ok(functions.every(f=>!f.prosecdef&&f.server_execute&&!f.anon_execute&&!f.member_execute&&f.proconfig.includes('search_path=""')));
  });
  await t.test('service cannot delete, truncate, reference or create triggers, rewrite audit, or change global budgets',async()=>{
   await db.exec('create schema mirror_acl_probe;grant usage,create on schema mirror_acl_probe to service_role');await role();
   for(const table of ['mirror_offers','mirror_offer_events','mirror_channel_policies','mirror_budget_limits']){
    await db.exec('select * from public.'+table);
    await assert.rejects(db.exec('delete from public.'+table),/permission denied/);
    await assert.rejects(db.exec('truncate public.'+table),/permission denied/);
    await assert.rejects(db.exec('create trigger forbidden before insert on public.'+table+' for each row execute function public.dropou_mirror_guard()'),/permission denied/);
    const fields=table==='mirror_channel_policies'?'owner_id uuid,brand_id text,foreign key(owner_id,brand_id) references public.'+table+'(owner_id,brand_id)':'fk '+(table==='mirror_budget_limits'?'boolean':'uuid')+' references public.'+table+'(id)';
    await assert.rejects(db.exec('create table mirror_acl_probe.forbidden('+fields+')'),/permission denied/);
   }
   await assert.rejects(db.exec("update mirror_offer_events set detail='forbidden'"),/permission denied/);
   await assert.rejects(db.exec('insert into mirror_budget_limits(id) values(true)'),/permission denied/);
   await assert.rejects(db.exec('update mirror_budget_limits set manual_limit=999'),/permission denied/);
   assert.deepEqual(await one('select manual_limit,background_limit,mirror_limit from mirror_budget_limits'),{manual_limit:200,background_limit:40,mirror_limit:10});
   await db.exec('reset role');await db.exec('drop schema mirror_acl_probe');
  });
  await t.test('read-only postcheck accepts the exact matrix and rejects a reintroduced inherited grant',async()=>{
   await db.exec("create schema supabase_migrations;create table supabase_migrations.schema_migrations(version text primary key,name text);insert into supabase_migrations.schema_migrations values('20261116025405','mtproto_persistent_mirror_queue')");
   const sql=readFileSync('docs/telegram-mirror-postcheck.sql','utf8');
   const results=await db.exec(sql),matrix=results[1].rows as {table_name:string;service_matrix_ok:boolean;anon_access:boolean;member_write:boolean}[];
   assert.equal(matrix.length,4);assert.ok(matrix.every(r=>r.service_matrix_ok&&!r.anon_access&&!r.member_write));assert.equal(results[2].rows.length,0);
   await db.exec('begin');try{
    await db.exec('grant delete on mirror_offer_events to service_role');
    const changed=(await db.exec(sql))[1].rows as typeof matrix;
    assert.equal(changed.find(r=>r.table_name==='mirror_offer_events')?.service_matrix_ok,false);
   }finally{await db.exec('rollback');}
  });
  await role();await db.query("insert into operation_members(member_id,owner_id,role,brands) values($1,$2,'operator',array['dropou'])",[operator,owner]);
  await db.query("update operation_settings set telegram_chat_id='-100999',telegram_verified_at=now() where owner_id=$1 and brand_id='dropou'",[owner]);
  const start=(await one("select date_trunc('second',clock_timestamp()) start")).start;
  const connection=(await one("insert into telegram_mtproto_connections(owner_id,brand_id,status,encrypted_state,selected,test_channel_id,test_started_at,test_expires_at) values($1,'dropou','connected','encrypted-fixture','[{\"id\":\"123\",\"controlled\":true,\"title\":\"Fixture\"}]','123',$2,$2::timestamptz+interval '10 minutes') returning id",[owner,start])).id;
  await one('select dropou_mtproto_lease($1)',[holder]);
  async function ingest(message:number,url='https://shopee.com.br/product/11/22',worker=holder,source='123'){
   return (await one("select dropou_mirror_ingest($1,$2,$3,$4,$5,$3,'text',$6) n",[worker,connection,start,source,message,JSON.stringify([url])])).n;
  }
  async function entry(message:number){return await one('select * from mirror_offers where message_id=$1',[message]);}
  async function identify(message:number,item='22'){return (await one('select dropou_mirror_identify($1,$2,$3,$4,null) ok',[holder,(await entry(message)).id,'11',item])).ok;}
  async function claim(worker=holder){return (await one('select to_jsonb(dropou_mirror_claim($1)) r',[worker])).r;}
  const result={state:'generated',affiliateUrl:'https://s.shopee.com.br/fixture-own',source:'api',product:{name:'Produto Shopee oficial',image:'https://down-br.img.susercontent.com/file/fixture',price:120,priceMax:130,checkedAt:new Date().toISOString()}};
  await t.test('only live authorized source is admitted; event replay is idempotent and raw conversations have no columns',async()=>{
   assert.equal(await ingest(1,undefined,replacement),0);assert.equal(await ingest(1,undefined,holder,'456'),0);
   assert.equal(await ingest(1),1);assert.equal(await ingest(1),0);assert.equal((await one('select count(*) n from mirror_offers')).n,1);
   await assert.rejects(ingest(2,'https://evil.invalid/product'),/check constraint/);
   const columns=(await db.query<any>("select column_name from information_schema.columns where table_name='mirror_offers'")).rows.map(r=>r.column_name);assert.ok(!columns.some(x=>['caption','body','sender','phone','session','media'].includes(x)));
   assert.equal((await entry(1)).destination_chat_id,'-100999');
  });
  let first:any;
  await t.test('parallel identity and claims produce one active product, record duplicates, fence stale completions and enforce review',async()=>{
   await ingest(2);await Promise.all([identify(1),identify(2)]);const rows=(await db.query<any>('select state from mirror_offers')).rows;assert.equal(rows.filter(r=>r.state==='identified').length,1);assert.equal(rows.filter(r=>r.state==='discarded').length,1);
   const claims=await Promise.all([claim(),claim()]);assert.equal(claims.filter(r=>r?.id).length,1);first=claims.find(r=>r?.id);
   assert.equal((await one('select dropou_mirror_finish($1,$2,$3,$4) ok',[replacement,first.id,first.lease_token,JSON.stringify(result)])).ok,false);
   assert.equal((await one('select dropou_mirror_finish($1,$2,$3,$4) ok',[holder,first.id,crypto.randomUUID(),JSON.stringify(result)])).ok,false);
   assert.equal((await one('select dropou_mirror_finish($1,$2,$3,$4) ok',[holder,first.id,first.lease_token,JSON.stringify(result)])).ok,true);
   assert.equal((await one('select state from mirror_offers where id=$1',[first.id])).state,'pending_review');
   assert.equal((await one('select dropou_mirror_finish($1,$2,$3,$4) ok',[holder,first.id,first.lease_token,JSON.stringify(result)])).ok,false);
   const states=(await db.query<any>('select to_state from mirror_offer_events where offer_id=$1 order by created_at',[first.id])).rows.map(r=>r.to_state);assert.deepEqual(states,['received','identified','processing','affiliated','pending_review']);
   await assert.rejects(db.query("update mirror_offers set state='published',published_at=now() where id=$1",[first.id]),/Transição/);
   await assert.rejects(db.query("update mirror_offers set brand_id='celulares' where id=$1",[first.id]),/imutáveis/);
  });
  await t.test('RLS scopes operator reads; no browser can claim, change policy or forge audit; review checks actor and version',async()=>{
   await role('authenticated',operator);assert.equal((await one('select count(*) n from mirror_offers')).n,2);
   await assert.rejects(db.query('select dropou_mirror_claim($1)',[holder]),/permission denied/);await assert.rejects(db.exec("update mirror_offers set state='ready'"),/permission denied/);await assert.rejects(db.exec('delete from mirror_offer_events'),/permission denied/);
   await role('authenticated',operator,'celulares');assert.equal((await one('select count(*) n from mirror_offers')).n,0);
   await role('authenticated',other);assert.equal((await one('select count(*) n from mirror_offers')).n,0);await role('anon');await assert.rejects(db.exec('select * from mirror_offers'),/permission denied/);await role();
   const row=await one('select * from mirror_offers where id=$1',[first.id]);
   await assert.rejects(db.query("select dropou_mirror_review($1,$2,'dropou',$3,$4,'ready')",[owner,other,row.id,row.version]),/sem acesso/);
   await assert.rejects(db.query("select dropou_mirror_review($1,null,'dropou',$2,$3,'ready')",[owner,row.id,row.version]),/sem acesso/);
   await assert.rejects(db.query("select dropou_mirror_review($1,$2,'dropou',$3,null,'ready')",[owner,operator,row.id]),/alterada/);
   await assert.rejects(db.query("select dropou_mirror_policy($1,$2,'dropou',24,10)",[owner,operator]),/administradores/);
   await one("select dropou_mirror_review($1,$2,'dropou',$3,$4,'ready')",[owner,operator,row.id,row.version]);
   await assert.rejects(db.query("select dropou_mirror_review($1,$2,'dropou',$3,$4,'pending')",[owner,operator,row.id,row.version]),/alterada/);
   assert.equal((await one('select state from mirror_offers where id=$1',[row.id])).state,'ready');
  });
  await t.test('serialized database survives restart; completed offers and full history remain, stale processing requires explicit retry',async()=>{
   await ingest(3,'https://shopee.com.br/product/11/33');await identify(3,'33');const interrupted=await claim();assert.ok(interrupted.id);
   const count=(await one('select count(*) n from mirror_offer_events')).n;
   const dump=await db.dumpDataDir();await db.close();db=new PGlite({loadDataDir:dump});await db.waitReady;await role();
   assert.equal((await one('select count(*) n from mirror_offer_events')).n,count);assert.equal((await one('select state from mirror_offers where id=$1',[first.id])).state,'ready');
   await db.exec("update telegram_mtproto_worker_lease set expires_at=clock_timestamp()-interval '1 second'");await one('select dropou_mtproto_lease($1)',[replacement]);
   await db.query("update mirror_offers set lease_until=clock_timestamp()-interval '1 second' where id=$1",[interrupted.id]);
   assert.equal(await claim(replacement),null);const failed=await one('select * from mirror_offers where id=$1',[interrupted.id]);assert.equal(failed.state,'failed');assert.equal(failed.attempts,1);
   await one("select dropou_mirror_review($1,$2,'dropou',$3,$4,'retry')",[owner,operator,failed.id,failed.version]);assert.equal((await claim(replacement)).attempts,2);
   assert.equal((await one('select dropou_mirror_finish($1,$2,$3,$4) ok',[holder,interrupted.id,interrupted.lease_token,JSON.stringify(result)])).ok,false);
  });
  await t.test('NULL official fields fail constraints; every failed attempt remains audited',async()=>{
   const r=await one("select * from mirror_offers where state='processing' limit 1");await assert.rejects(db.query('select dropou_mirror_finish($1,$2,$3,$4)',[replacement,r.id,r.lease_token,JSON.stringify({...result,product:{...result.product,price:null}})]),/check constraint/);
   await one('select dropou_mirror_finish($1,$2,$3,$4)',[replacement,r.id,r.lease_token,JSON.stringify({state:'error',error:'Falha simulada da API'})]);const last=await one('select * from mirror_offers where id=$1',[r.id]);assert.equal(last.state,'failed');assert.equal(last.attempts,2);assert.equal(last.affiliate_url,null);
   assert.ok((await one("select count(*) n from mirror_offer_events where offer_id=$1 and to_state='failed'",[r.id])).n>=2);
   await assert.rejects(db.exec('delete from mirror_offer_events'),/permission denied/);
  });
  await t.test('mirror has its own quota and cannot exhaust manual imports or the previous background ceiling',async()=>{
   async function reserve(key:string,kind:string,limit=200){return (await one("select dropou_shopee_reserve_v2($1,'dropou',$2,$3,$4) r",[owner,key,kind,limit])).r;}
   const m=await reserve('mirror-first','mirror',10);assert.ok(m.id);assert.equal((await reserve('manual-busy','manual')).reason,'busy');await one("select dropou_shopee_finish($1,'ok',0)",[m.id]);
   await one("select dropou_mirror_policy($1,$1,'dropou',24,1)",[owner]);assert.equal((await reserve('mirror-limited','mirror',10)).reason,'mirror_budget');
   const manual=await reserve('manual-free','manual');assert.ok(manual.id);await one("select dropou_shopee_finish($1,'ok',0)",[manual.id]);
   await db.exec('reset role');await db.exec('update mirror_budget_limits set background_limit=1');await role();assert.equal((await reserve('curation-background','search',40)).reason,'discovery_budget');
   const second=await reserve('manual-protected','manual');assert.ok(second.id);await one("select dropou_shopee_finish($1,'ok',0)",[second.id]);
   assert.equal((await one("select count(*) n from shopee_requests where kind='manual'")).n,2);assert.equal((await one("select count(*) n from shopee_requests where kind='mirror'")).n,1);
   await db.exec('reset role');await db.exec('update mirror_budget_limits set background_limit=40');await role();
   const search=await reserve('curation-allowed','search',40);assert.ok(search.id);await one("select dropou_shopee_finish($1,'ok',0)",[search.id]);
   const revalidation=(await one("select dropou_shopee_reserve($1,'curation-revalidate','revalidate',100) id",[owner])).id;assert.ok(revalidation);await one("select dropou_shopee_finish($1,'ok',0)",[revalidation]);
  });
  await t.test('destination records stay separate and policies remain per channel; no jobs, catalog products or messages are created',async()=>{
   await one("select dropou_mirror_policy($1,$1,'celulares',48,0)",[owner]);assert.equal((await one("select repeat_hours from mirror_channel_policies where brand_id='celulares'")).repeat_hours,48);assert.equal((await one("select repeat_hours from mirror_channel_policies where brand_id='dropou'")).repeat_hours,24);
   assert.equal((await one('select count(*) n from products')).n,0);assert.equal((await one('select count(*) n from offers')).n,0);assert.equal((await one('select count(*) n from telegram_jobs')).n,0);
  });
  await t.test('real worker adapter persists before conversion and a new worker instance drains the same SQL queue without replay',async()=>{
   await one('select dropou_mtproto_lease($1)',[replacement]);
   let conversions=0;
   const client:any={from(table:string){let state:string|null=null,limit=10;const q:any={select(){return q;},eq(key:string,value:string){if(key==='state')state=value;return q;},or(){return q;},order(){return q;},limit(n:number){limit=n;return q;},async maybeSingle(){assert.equal(table,'products');return {data:null,error:null};},then(resolve:any,reject:any){assert.equal(table,'mirror_offers');return db.query('select * from mirror_offers where ($1::text is null or state=$1) order by received_at limit $2',[state,limit]).then(r=>resolve({data:r.rows,error:null}),reject);}};return q;},async rpc(name:string,args:Record<string,unknown>){assert.match(name,/^dropou_mirror_(ingest|identify|claim|finish|fail_received)$/);const pairs=Object.entries(args);const sql='select to_jsonb('+name+'('+pairs.map(([key],i)=>key+'=> $'+(i+1)).join(',')+')) r';try{return {data:(await one(sql,pairs.map(([,v])=>v&&typeof v==='object'?JSON.stringify(v):v))).r,error:null};}catch(error){return {data:null,error};}}};
   const convert=async()=>{conversions++;return {...result,state:'generated' as const,source:'api' as const,error:null,product:{...result.product}};};
   const intake=new PersistentMirrorOffers(client,replacement,()=>true,convert);
   const row=await one('select * from telegram_mtproto_connections where id=$1',[connection]);
   await intake.ready();await intake.accept(row,{id:4,channelId:'123',date:Math.floor(Date.now()/1000),kind:'text'},{urls:['https://shopee.com.br/product/11/44'],invalid:0,limited:false});
   assert.equal((await entry(4)).state,'received');assert.equal(conversions,0);
   intake.clearAll();const resumed=new PersistentMirrorOffers(client,replacement,()=>true,convert);await resumed.drain();
   assert.equal((await entry(4)).state,'pending_review');assert.equal(conversions,1);
   resumed.clear({owner,brand:'dropou'});resumed.clearAll();const restartedAgain=new PersistentMirrorOffers(client,replacement,()=>true,convert);await restartedAgain.drain();assert.equal(conversions,1);assert.equal((await entry(4)).state,'pending_review');
   assert.equal((await one('select count(*) n from mirror_offer_events where offer_id=$1',[(await entry(4)).id])).n,5);
  });
  await t.test('repeat window blocks the same destination but allows an expired window and independent destinations',async()=>{
   // Future published-state fixture only; production has no publishing transition.
   await db.exec('reset role');await db.exec('begin');
   try{
    await db.exec('alter table mirror_offers disable trigger mirror_offer_guard');
    await db.query("update mirror_offers set state='published',published_at=clock_timestamp()-interval '1 hour' where id=$1",[first.id]);
    await db.exec('alter table mirror_offers enable trigger mirror_offer_guard');await role();
    await ingest(10,undefined,replacement);
    await one("select dropou_mirror_identify($1,$2,'11','22',null)",[replacement,(await entry(10)).id]);
    assert.equal((await entry(10)).state,'discarded');assert.equal((await entry(10)).duplicate_of,first.id);
    const secondConnection=(await one("insert into telegram_mtproto_connections(owner_id,brand_id) values($1,'celulares') returning id",[owner])).id;
    const separate=(await one("insert into mirror_offers(owner_id,brand_id,connection_id,source_channel_id,message_id,link_index,message_at,message_kind,input_url,destination_chat_id) values($1,'celulares',$2,'123',11,0,clock_timestamp(),'text','https://shopee.com.br/product/11/22','-100888') returning id",[owner,secondConnection])).id;
    await one("select dropou_mirror_identify($1,$2,'11','22',null)",[replacement,separate]);
    assert.equal((await one('select state from mirror_offers where id=$1',[separate])).state,'identified');
    await one("select dropou_mirror_policy($1,$1,'dropou',0,1)",[owner]);await ingest(12,undefined,replacement);
    await one("select dropou_mirror_identify($1,$2,'11','22',null)",[replacement,(await entry(12)).id]);
    assert.equal((await entry(12)).state,'identified');
   }finally{await db.exec('rollback');await role();}
  });
 }finally{await db.close();}
});
