// Preparation only: reads the reviewed migration and writes SQL artifacts locally.
// This module never invokes a CLI, opens a network connection or applies SQL.
import {readFileSync,mkdirSync,writeFileSync,rmSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';

export const mtprotoReview={
 project:'wqpdyfipjsnyzxktacqh',version:'20261115234052',name:'telegram_mtproto_connections',
 path:'supabase/migrations/20261115234052_telegram_mtproto_connections.sql',
 sha256:'52f6c3a2679bdccfc65755f189a7184ae90085495c7aa53ea2f256f0a6c872b8',
};
export function reviewedMtprotoSql(){
 const bytes=readFileSync(mtprotoReview.path);
 if(createHash('sha256').update(bytes).digest('hex')!==mtprotoReview.sha256)throw new Error('O SQL mudou desde a revisão. Revisar novamente antes de preparar.');
 return bytes.toString('utf8');
}
export function mtprotoApplicationSql(){
 const sql=reviewedMtprotoSql(),tag='$dropou_mtproto_reviewed_source$';
 if(sql.includes(tag))throw new Error('Delimitador inesperado no SQL revisado.');
 return `-- DEFINITIVE REVIEWED MIGRATION, NOT APPLIED. Execution still requires explicit authorization.
-- Target project ${mtprotoReview.project}. Includes this migration only.
-- Canonical migration SHA256 ${mtprotoReview.sha256}.
begin;
set local lock_timeout='5s';
set local statement_timeout='60s';
select pg_advisory_xact_lock(hashtext('dropou:telegram_mtproto_connections'));
do $preflight$
begin
 if to_regclass('auth.users') is null or to_regclass('public.affiliate_operations') is null
 or to_regprocedure('pg_catalog.gen_random_uuid()') is null then
  raise exception 'Pré-requisitos do Dropou ausentes; nenhuma alteração será confirmada';
 end if;
 if to_regclass('supabase_migrations.schema_migrations') is null then
  raise exception 'Histórico oficial de migrações ausente; revisar antes de aplicar';
 end if;
 if (select count(*) from pg_roles where rolname in ('anon','authenticated','service_role'))<>3
 or not exists(select 1 from pg_roles where rolname='service_role' and rolbypassrls) then
  raise exception 'Roles Supabase incompatíveis; revisar antes de aplicar';
 end if;
 if exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname ~ '^telegram_mtproto_')
 or exists(select 1 from pg_type t join pg_namespace n on n.oid=t.typnamespace where n.nspname='public' and t.typname ~ '^telegram_mtproto_')
 or exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname ~ '^dropou_mtproto_') then
  raise exception 'Objetos MTProto existentes; não reaplicar nem substituir automaticamente';
 end if;
 if exists(select 1 from supabase_migrations.schema_migrations where version='${mtprotoReview.version}' or name='${mtprotoReview.name}') then
  raise exception 'Migração MTProto já registrada; interrompido sem reaplicação';
 end if;
end $preflight$;

${sql}

insert into supabase_migrations.schema_migrations(version,name,statements)
 values('${mtprotoReview.version}','${mtprotoReview.name}',array[${tag}${sql}${tag}]);
notify pgrst, 'reload schema';
commit;
`;
}
export function mtprotoLeaseSmokeSql(){return `-- Run only after authorized application, with the normal worker stopped.
-- Does not create accounts, connections, diagnostics or Telegram sessions.
begin;
set local lock_timeout='5s';
set local statement_timeout='15s';
set local role service_role;
select public.dropou_mtproto_lease('10000000-0000-4000-8000-000000000003'::uuid) as first_claim;
select public.dropou_mtproto_lease('10000000-0000-4000-8000-000000000004'::uuid) as second_claim_must_be_false;
select public.dropou_mtproto_lease('10000000-0000-4000-8000-000000000003'::uuid,true) as release_first;
rollback;
`;}

if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 try{
  const directory='outputs/telegram-mtproto/migration-review';
  const application=mtprotoApplicationSql();mkdirSync(directory,{recursive:true});
  writeFileSync(directory+'/apply-definitive.sql',application);
  writeFileSync(directory+'/lease-rollback.sql',mtprotoLeaseSmokeSql());
  rmSync(directory+'/apply-reviewed.sql',{force:true});
  rmSync(directory+'/apply-proposed.sql',{force:true});
  console.info('Preparação local concluída. Nenhum SQL foi executado.');
  console.info('Projeto alvo: '+mtprotoReview.project);
  console.info('Migração original corrigida e conferida pelo hash. Execução remota ainda não autorizada.');
  console.info('SQL definitivo: '+mtprotoReview.path);
  console.info('Aplicação futura: '+directory+'/apply-definitive.sql');
  console.info('Teste futuro com rollback: '+directory+'/lease-rollback.sql');
 }catch{console.error('Não foi possível preparar os arquivos. Confira o hash e o SQL revisado.');process.exitCode=1;}
}
