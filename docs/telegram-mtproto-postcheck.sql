-- READ ONLY. Run after authorized application; never invoke account commands here.
select c.relname,c.relrowsecurity,
 has_table_privilege('anon',c.oid,'SELECT') as anon_select,
 has_table_privilege('anon',c.oid,'INSERT') as anon_insert,
 has_table_privilege('anon',c.oid,'UPDATE') as anon_update,
 has_table_privilege('anon',c.oid,'DELETE') as anon_delete,
 has_table_privilege('authenticated',c.oid,'SELECT') as authenticated_select,
 has_table_privilege('authenticated',c.oid,'INSERT') as authenticated_insert,
 has_table_privilege('authenticated',c.oid,'UPDATE') as authenticated_update,
 has_table_privilege('authenticated',c.oid,'DELETE') as authenticated_delete,
 has_table_privilege('service_role',c.oid,'SELECT') as service_select,
 has_table_privilege('service_role',c.oid,'INSERT') as service_insert,
 has_table_privilege('service_role',c.oid,'UPDATE') as service_update,
 has_table_privilege('service_role',c.oid,'DELETE') as service_delete
from pg_class c join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relkind='r' and c.relname in ('telegram_mtproto_connections','telegram_mtproto_diagnostics','telegram_mtproto_worker_lease')
order by c.relname;

select p.proname,p.prosecdef,p.proconfig,
 has_function_privilege('anon',p.oid,'EXECUTE') as anon_execute,
 has_function_privilege('authenticated',p.oid,'EXECUTE') as authenticated_execute,
 has_function_privilege('service_role',p.oid,'EXECUTE') as service_execute
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.proname in ('dropou_mtproto_lease','dropou_mtproto_update','dropou_mtproto_diagnostic') order by p.proname;

select tablename,policyname from pg_policies where schemaname='public' and tablename in ('telegram_mtproto_connections','telegram_mtproto_diagnostics','telegram_mtproto_worker_lease');
select tablename,indexname from pg_indexes where schemaname='public' and tablename in ('telegram_mtproto_connections','telegram_mtproto_diagnostics','telegram_mtproto_worker_lease') order by tablename,indexname;
select conrelid::regclass::text as relation,conname,contype,pg_get_constraintdef(oid) as definition from pg_constraint where conrelid in ('public.telegram_mtproto_connections'::regclass,'public.telegram_mtproto_diagnostics'::regclass,'public.telegram_mtproto_worker_lease'::regclass) order by relation,conname;
select version,name from supabase_migrations.schema_migrations where version='20261115234052' or name='telegram_mtproto_connections';

-- Both must be true. These catalog checks complement the local behavioral tests.
select exists(
 select 1 from pg_constraint where conrelid='public.telegram_mtproto_connections'::regclass and contype='c'
 and position('test_expires_at IS NOT NULL' in pg_get_constraintdef(oid))>0
) as active_test_requires_expiration,
 position('c.test_expires_at is null' in pg_get_functiondef('public.dropou_mtproto_diagnostic(uuid,uuid,timestamptz,text,bigint,timestamptz,text)'::regprocedure))>0 as diagnostic_rejects_null_expiration;
