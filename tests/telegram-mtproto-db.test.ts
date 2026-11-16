import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
const owner='10000000-0000-4000-8000-000000000001',other='10000000-0000-4000-8000-000000000002',holder='10000000-0000-4000-8000-000000000003',second='10000000-0000-4000-8000-000000000004';
test('MTProto incremental SQL protects secrets, scopes connections, fences stale workers and bounds live-only diagnostics',async t=>{
 const db=new PGlite();async function one(sql:string,args:unknown[]=[]){return (await db.query<Record<string,any>>(sql,args)).rows[0];}
 try{
  await db.exec(`create schema auth;create table auth.users(id uuid primary key);create role anon;create role authenticated;create role service_role bypassrls;grant usage on schema public to anon,authenticated,service_role;create table affiliate_operations(id text primary key);insert into affiliate_operations values('dropou'),('celulares');insert into auth.users values('${owner}'),('${other}');`);
  await db.exec(readFileSync('supabase/migrations/20261115234052_telegram_mtproto_connections.sql','utf8'));
  await t.test('RLS enabled with no browser grants or callable privileged RPCs',async()=>{
   const tables=(await db.query<{relrowsecurity:boolean}>("select relrowsecurity from pg_class where relname like 'telegram_mtproto_%' and relkind='r'")).rows;assert.equal(tables.length,3);assert.ok(tables.every(t=>t.relrowsecurity));
   for(const role of ['anon','authenticated']){await db.exec('set role '+role);await assert.rejects(db.query('select encrypted_state from telegram_mtproto_connections'),/permission denied/);await assert.rejects(db.query('select dropou_mtproto_lease($1)',[holder]),/permission denied/);await db.exec('reset role');}
  });
  await db.exec('set role service_role');
  const id=(await one("insert into telegram_mtproto_connections(owner_id,brand_id,status,encrypted_state) values($1,'dropou','connected','encrypted-fixture') returning id",[owner])).id;
  const alternate=(await one("insert into telegram_mtproto_connections(owner_id,brand_id) values($1,'celulares'),($2,'dropou') returning id",[owner,other])).id;
  await t.test('single worker lease and immutable owner/brand; stale worker mutations refused',async()=>{
   assert.equal((await one('select dropou_mtproto_lease($1) ok',[holder])).ok,true);assert.equal((await one('select dropou_mtproto_lease($1) ok',[second])).ok,false);
   assert.equal((await one("select dropou_mtproto_update($1,$2,'{\"status\":\"error\"}') r",[second,id])).r,null);
   const r=(await one('select dropou_mtproto_update($1,$2,$3) r',[holder,id,JSON.stringify({owner_id:other,brand_id:'celulares'})])).r;assert.equal(r.owner_id,owner);assert.equal(r.brand_id,'dropou');
   assert.equal((await one('select owner_id from telegram_mtproto_connections where id=$1',[alternate])).owner_id,owner);
  });
  const started=(await one("select date_trunc('second',clock_timestamp()) start")).start;
  await one('select dropou_mtproto_update($1,$2,$3)',[holder,id,JSON.stringify({test_channel_id:'123',test_started_at:started,test_expires_at:new Date(Date.parse(started)+600000).toISOString()})]);
  async function record(message:number,channel='123',at=started,worker=holder){return (await one("select dropou_mtproto_diagnostic($1,$2,$3,$4,$5,$6,'text') ok",[worker,id,started,channel,message,at])).ok;}
  await t.test('only current test, live dates, selected channel and valid worker reach diagnostics; duplicate IDs remain idempotent',async()=>{
   assert.equal(await record(1,'999'),false);assert.equal(await record(1,'123',new Date(Date.parse(started)-1000).toISOString()),false);assert.equal(await record(1,'123',new Date(Date.now()+60000).toISOString()),false);assert.equal(await record(1,'123',started,second),false);
   assert.equal(await record(1),true);assert.equal(await record(1),true);assert.equal((await one('select count(*) n from telegram_mtproto_diagnostics')).n,1);
   for(let i=2;i<=60;i++)await record(i);assert.equal((await one('select count(*) n from telegram_mtproto_diagnostics')).n,50);
   const cols=(await db.query<{column_name:string}>("select column_name from information_schema.columns where table_name='telegram_mtproto_diagnostics'")).rows.map(c=>c.column_name);assert.ok(!cols.some(c=>/text|body|phone|sender|session|caption|content/.test(c)));
  });
  await t.test('stopped tests and expired workers reject updates; a replacement worker can take over',async()=>{
   await one('select dropou_mtproto_update($1,$2,$3)',[holder,id,JSON.stringify({test_channel_id:null,test_started_at:null,test_expires_at:null})]);assert.equal(await record(61),false);
   await db.exec("update telegram_mtproto_worker_lease set expires_at=clock_timestamp()-interval '1 second'");assert.equal((await one("select dropou_mtproto_update($1,$2,'{}') r",[holder,id])).r,null);
   assert.equal((await one('select dropou_mtproto_lease($1) ok',[second])).ok,true);assert.equal(await record(62),false);
   assert.equal((await one('select dropou_mtproto_lease($1,true) ok',[holder])).ok,false);assert.equal((await one('select dropou_mtproto_lease($1,true) ok',[second])).ok,true);
  });
 }finally{await db.close();}
});
