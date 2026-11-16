-- READ ONLY. Target: Dropou wqpdyfipjsnyzxktacqh. No secrets or user rows.
select jsonb_build_object(
 'dependencies',jsonb_build_object(
  'auth_users',to_regclass('auth.users') is not null,
  'affiliate_operations',to_regclass('public.affiliate_operations') is not null,
  'uuid_generator',to_regprocedure('pg_catalog.gen_random_uuid()') is not null,
  'migration_history',to_regclass('supabase_migrations.schema_migrations') is not null),
 'relation_conflicts',coalesce((select jsonb_agg(c.relname) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname ~ '^telegram_mtproto_'),'[]'::jsonb),
 'type_conflicts',coalesce((select jsonb_agg(t.typname) from pg_type t join pg_namespace n on n.oid=t.typnamespace where n.nspname='public' and t.typname ~ '^telegram_mtproto_'),'[]'::jsonb),
 'function_conflicts',coalesce((select jsonb_agg(p.proname) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname ~ '^dropou_mtproto_'),'[]'::jsonb),
 'history_conflicts',coalesce((select jsonb_agg(jsonb_build_object('version',version,'name',name)) from supabase_migrations.schema_migrations where version='20261115234052' or name='telegram_mtproto_connections'),'[]'::jsonb),
 'parent_columns',(select jsonb_agg(jsonb_build_object('schema',n.nspname,'table',c.relname,'column',a.attname,'type',format_type(a.atttypid,a.atttypmod))) from pg_attribute a join pg_class c on c.oid=a.attrelid join pg_namespace n on n.oid=c.relnamespace where a.attnum>0 and not a.attisdropped and a.attname='id' and (n.nspname,c.relname) in (('auth','users'),('public','affiliate_operations'))),
 'roles',(select jsonb_agg(jsonb_build_object('name',rolname,'bypass_rls',rolbypassrls)) from pg_roles where rolname in ('anon','authenticated','service_role'))
) as preflight;
