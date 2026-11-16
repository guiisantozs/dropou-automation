import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
import {mtprotoReview,mtprotoApplicationSql,mtprotoLeaseSmokeSql,reviewedMtprotoSql} from '../scripts/prepare-telegram-mtproto-migration.mjs';

const owner='10000000-0000-4000-8000-000000000001';
async function minimal(db:PGlite){
 await db.exec(`create schema auth;create table auth.users(id uuid primary key);create role anon;create role authenticated;create role service_role bypassrls;grant usage on schema public to anon,authenticated,service_role;create table affiliate_operations(id text primary key);create schema supabase_migrations;create table supabase_migrations.schema_migrations(version text primary key,name text,statements text[]);`);
}
test('definitive MTProto bundle creates canonical schema and migration history atomically, rejects reapplication and allows rollback-only lease smoke',async()=>{
 const db=new PGlite();try{
  await minimal(db);assert.equal(createHash('sha256').update(readFileSync(mtprotoReview.path)).digest('hex'),mtprotoReview.sha256);
  await db.exec(mtprotoApplicationSql());
  const history=(await db.query<{version:string;name:string;statements:string[]}>('select version,name,statements from supabase_migrations.schema_migrations')).rows;
  assert.equal(history.length,1);assert.equal(history[0].version,mtprotoReview.version);assert.equal(history[0].name,mtprotoReview.name);assert.equal(history[0].statements[0],reviewedMtprotoSql());
  const tables=(await db.query<{relname:string}>('select relname from pg_class where relkind=\'r\' and relname like \'telegram_mtproto_%\'')).rows;assert.equal(tables.length,3);
  await db.exec(readFileSync('docs/telegram-mtproto-postcheck.sql','utf8'));
  const policy=(await db.query('select * from pg_policies where tablename like \'telegram_mtproto_%\'')).rows;assert.equal(policy.length,0);
  await db.exec(mtprotoLeaseSmokeSql());assert.equal((await db.query<{n:number}>('select count(*) n from telegram_mtproto_worker_lease')).rows[0].n,0);
  await assert.rejects(db.exec(mtprotoApplicationSql()),/existentes|registrada/);await db.exec('rollback');
  assert.equal((await db.query<{n:number}>('select count(*) n from supabase_migrations.schema_migrations')).rows[0].n,1);
 }finally{await db.close();}
});
test('canonical migration rejects active tests with NULL or invalid windows on insert, update and worker RPC while allowing stopped tests',async()=>{
 const db=new PGlite();try{
  await minimal(db);await db.exec(reviewedMtprotoSql());
  await db.query('insert into auth.users values($1)',[owner]);await db.exec("insert into affiliate_operations values('dropou')");
  await assert.rejects(db.query("insert into telegram_mtproto_connections(owner_id,brand_id,status,encrypted_state,test_channel_id,test_started_at,test_expires_at) values($1,'dropou','connected','synthetic-encrypted-fixture','123',clock_timestamp()-interval '1 hour',null)",[owner]),/check constraint/);
  const id=(await db.query<{id:string}>("insert into telegram_mtproto_connections(owner_id,brand_id) values($1,'dropou') returning id",[owner])).rows[0].id;
  await db.exec('set role service_role');
  // Exactly ten minutes is valid; absent test timestamps remain allowed when stopped.
  await db.query("update telegram_mtproto_connections set status='connected',encrypted_state='synthetic-encrypted-fixture',test_channel_id='123',test_started_at=statement_timestamp(),test_expires_at=statement_timestamp()+interval '10 minutes' where id=$1",[id]);
  const valid=(await db.query('select test_started_at,test_expires_at from telegram_mtproto_connections where id=$1',[id])).rows[0];
  for(const patch of [
   'test_expires_at=null','test_started_at=null','test_started_at=null,test_expires_at=null',
   'test_expires_at=test_started_at',"test_expires_at=test_started_at-interval '1 second'",
   "test_expires_at=test_started_at+interval '10 minutes 1 second'","status='disconnected'",
  ]){
   await assert.rejects(db.query('update telegram_mtproto_connections set '+patch+' where id=$1',[id]),/check constraint/);
   assert.deepEqual((await db.query('select test_started_at,test_expires_at from telegram_mtproto_connections where id=$1',[id])).rows[0],valid);
  }
  const holder='10000000-0000-4000-8000-000000000003';await db.query('select dropou_mtproto_lease($1)',[holder]);
  await assert.rejects(db.query('select dropou_mtproto_update($1,$2,$3)',[holder,id,JSON.stringify({test_expires_at:null})]),/check constraint/);
  assert.deepEqual((await db.query('select test_started_at,test_expires_at from telegram_mtproto_connections where id=$1',[id])).rows[0],valid);
  await db.query('select dropou_mtproto_update($1,$2,$3)',[holder,id,JSON.stringify({test_channel_id:null,test_started_at:null,test_expires_at:null})]);
  assert.deepEqual((await db.query('select test_started_at,test_expires_at from telegram_mtproto_connections where id=$1',[id])).rows[0],{test_started_at:null,test_expires_at:null});
 }finally{await db.close();}
});
test('diagnostic RPC independently refuses NULL expiration without recording metadata even for malformed legacy state',async()=>{
 const db=new PGlite();try{
  await minimal(db);await db.exec(reviewedMtprotoSql());
  await db.query('insert into auth.users values($1)',[owner]);await db.exec("insert into affiliate_operations values('dropou')");
  // Remove only this disposable fixture's window CHECK to exercise the independent RPC guard.
  const constraint=(await db.query<{conname:string}>("select conname from pg_constraint where conrelid='telegram_mtproto_connections'::regclass and contype='c' and pg_get_constraintdef(oid) like '%test_expires_at%' ")).rows[0].conname;
  await db.exec('alter table telegram_mtproto_connections drop constraint "'+constraint.replaceAll('"','""')+'"');
  await db.exec('set role service_role');
  const row=(await db.query<{id:string;test_started_at:string}>("insert into telegram_mtproto_connections(owner_id,brand_id,status,encrypted_state,test_channel_id,test_started_at,test_expires_at) values($1,'dropou','connected','synthetic-encrypted-fixture','123',clock_timestamp()-interval '1 hour',null) returning id,test_started_at",[owner])).rows[0];
  const holder='10000000-0000-4000-8000-000000000003';await db.query('select dropou_mtproto_lease($1)',[holder]);
  const accepted=(await db.query<{accepted:boolean}>("select dropou_mtproto_diagnostic($1,$2,$3,'123',1,clock_timestamp(),'text') accepted",[holder,row.id,row.test_started_at])).rows[0].accepted;
  assert.equal(accepted,false);
  assert.equal((await db.query<{n:number}>('select count(*) n from telegram_mtproto_diagnostics')).rows[0].n,0);
 }finally{await db.close();}
});
test('reviewed MTProto bundle refuses partial schemas and history collisions before creating anything',async()=>{
 for(const collision of ['relation','history']){
  const db=new PGlite();try{
   await minimal(db);
   if(collision==='relation')await db.exec('create type telegram_mtproto_fixture as enum (\'reserved\')');
   else await db.query('insert into supabase_migrations.schema_migrations(version,name) values($1,$2)',[mtprotoReview.version,'other_migration']);
   await assert.rejects(db.exec(mtprotoApplicationSql()),/existentes|registrada/);await db.exec('rollback');
   assert.equal((await db.query<{found:boolean}>('select to_regclass(\'public.telegram_mtproto_connections\') is not null found')).rows[0].found,false);
  }finally{await db.close();}
 }
});
test('an error after MTProto DDL rolls back both new objects and migration history',async()=>{
 const db=new PGlite();try{
  await minimal(db);
  const failing=mtprotoApplicationSql().replace(/commit;\s*$/,"select 1/0;\ncommit;");
  await assert.rejects(db.exec(failing),/division by zero/);await db.exec('rollback');
  assert.equal((await db.query<{n:number}>('select count(*) n from supabase_migrations.schema_migrations')).rows[0].n,0);
  assert.equal((await db.query<{found:boolean}>('select to_regclass(\'public.telegram_mtproto_connections\') is not null found')).rows[0].found,false);
 }finally{await db.close();}
});
test('MTProto application after every earlier migration preserves all pre-existing public table data and functions',async()=>{
 const db=new PGlite();try{
  await db.exec(`create schema auth;create schema storage;create role authenticated;create role anon;create role service_role bypassrls;create table auth.users(id uuid primary key);insert into auth.users values('${owner}');create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema public,auth to authenticated,anon,service_role;grant execute on function auth.uid() to authenticated,anon,service_role;create table storage.buckets(id text primary key,public boolean,allowed_mime_types text[]);create schema supabase_migrations;create table supabase_migrations.schema_migrations(version text primary key,name text,statements text[]);`);
  for(const f of ['schema.sql','whatsapp-flow.sql','ai-economy.sql','telegram-offers.sql'])await db.exec(readFileSync('supabase/'+f,'utf8'));
  for(const f of readdirSync('supabase/migrations').filter(f=>f.endsWith('.sql')&&f.slice(0,14)<mtprotoReview.version).sort()){
   await db.exec(readFileSync('supabase/migrations/'+f,'utf8'));
   if(f.includes('publication_dispatch_and_review')){await db.query('insert into telegram_dispatch_config(id,secret,owner_ids,destination_key) values(true,$1,$2,$3)',['fixture-only',[owner],'a'.repeat(64)]);await db.exec(readFileSync('supabase/optional-price-publication.sql','utf8'));}
  }
  const tables=(await db.query<{relname:string}>("select c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' order by c.relname")).rows.map(r=>r.relname);
  const snapshot=async()=>{
   const rows=[];for(const table of tables)rows.push((await db.query('select to_jsonb(t) as row from public."'+table.replaceAll('"','""')+'" t order by to_jsonb(t)::text')).rows);
   const functions=(await db.query("select p.oid,pg_get_functiondef(p.oid) definition from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname !~ '^dropou_mtproto_' order by p.oid")).rows;
   return createHash('sha256').update(JSON.stringify({rows,functions})).digest('hex');
  };
  const before=await snapshot();await db.exec(mtprotoApplicationSql());assert.equal(await snapshot(),before);
  const empty=(await db.query<{connections:number;diagnostics:number;leases:number}>("select (select count(*) from telegram_mtproto_connections) connections,(select count(*) from telegram_mtproto_diagnostics) diagnostics,(select count(*) from telegram_mtproto_worker_lease) leases")).rows[0];assert.deepEqual(empty,{connections:0,diagnostics:0,leases:0});
 }finally{await db.close();}
});
