-- SOMENTE LEITURA. Destino esperado: wqpdyfipjsnyzxktacqh.
-- Inspecionar antes de autorizar/aplicar; nenhuma linha abaixo executa DDL/DML.
select jsonb_build_object(
 'migration_applied',exists(select 1 from supabase_migrations.schema_migrations where version='20261116025405' or name='mtproto_persistent_mirror_queue'),
 'mtproto_applied',exists(select 1 from supabase_migrations.schema_migrations where version='20261115234052'),
 'relation_conflicts',(select coalesce(jsonb_agg(c.relname),'[]'::jsonb) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname like 'mirror_%'),
 'function_conflicts',(select coalesce(jsonb_agg(p.proname),'[]'::jsonb) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname like 'dropou_mirror_%'),
 'kind_constraint',(select pg_get_constraintdef(oid) from pg_constraint where conrelid='public.shopee_requests'::regclass and conname='shopee_requests_kind_check'),
 'budget_functions',(select jsonb_agg(jsonb_build_object('name',p.proname,'args',pg_get_function_identity_arguments(p.oid),'hash',md5(pg_get_functiondef(p.oid)))) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('dropou_shopee_reserve','dropou_shopee_reserve_v2')),
 'connection_count',(select count(*) from public.telegram_mtproto_connections),
 'active_test_count',(select count(*) from public.telegram_mtproto_connections where test_expires_at>clock_timestamp()),
 'lease_active',exists(select 1 from public.telegram_mtproto_worker_lease where expires_at>clock_timestamp()),
 'today_requests',(select coalesce(jsonb_agg(jsonb_build_object('kind',kind,'state',state,'count',n)),'[]'::jsonb) from (select kind,state,count(*) n from public.shopee_requests where day=(clock_timestamp() at time zone 'America/Bahia')::date group by kind,state) r)
) as preflight;
