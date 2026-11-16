-- SOMENTE LEITURA. Usar DEPOIS da aplicação autorizada, não antes.
select version,name from supabase_migrations.schema_migrations where version='20261116025405';
-- Exactly four rows, service_matrix_ok=true for each. No grant options or
-- additional privileges (including MAINTAIN on versions supporting it).
with expected(table_name,privileges) as (values
 ('mirror_offers',array['INSERT','SELECT','UPDATE']),
 ('mirror_offer_events',array['INSERT','SELECT']),
 ('mirror_channel_policies',array['INSERT','SELECT','UPDATE']),
 ('mirror_budget_limits',array['SELECT'])
), actual as (
 select e.table_name,e.privileges as expected_privileges,c.oid,c.relrowsecurity,
 array(select privilege from unnest(array['DELETE','INSERT','REFERENCES','SELECT','TRIGGER','TRUNCATE','UPDATE']) privilege
       where has_table_privilege('service_role',c.oid,privilege)) as service_privileges,
 exists(select 1 from aclexplode(c.relacl) a where a.grantee in (0,'service_role'::regrole::oid)
       and (a.is_grantable or not(a.privilege_type=any(e.privileges)))) as service_extra_grants
 from expected e left join pg_class c on c.relnamespace='public'::regnamespace and c.relname=e.table_name and c.relkind='r'
)
select table_name,relrowsecurity,expected_privileges,service_privileges,service_extra_grants,
 (oid is not null and service_privileges=expected_privileges and not service_extra_grants) as service_matrix_ok,
 has_table_privilege('anon',oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') as anon_access,
 has_table_privilege('authenticated',oid,'SELECT') as member_read,
 has_table_privilege('authenticated',oid,'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') as member_write
from actual order by table_name;
-- UUID defaults and composite/boolean keys require no sequences: zero rows expected.
select c.relname as unexpected_sequence from pg_class c
where c.relnamespace='public'::regnamespace and c.relkind='S' and
 (c.relname like 'mirror_%' or exists(select 1 from pg_depend d join pg_class t on t.oid=d.refobjid
   where d.objid=c.oid and t.relnamespace='public'::regnamespace and t.relname like 'mirror_%'));
select tablename,policyname,roles,cmd,qual from pg_policies where schemaname='public' and tablename like 'mirror_%' order by tablename;
select p.proname,p.prosecdef,p.proconfig,
 has_function_privilege('anon',p.oid,'EXECUTE') as anon_execute,
 has_function_privilege('authenticated',p.oid,'EXECUTE') as member_execute,
 has_function_privilege('service_role',p.oid,'EXECUTE') as server_execute
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and (p.proname like 'dropou_mirror_%' or p.proname in ('dropou_shopee_reserve','dropou_shopee_reserve_v2')) order by p.proname;
select indexname,indexdef from pg_indexes where schemaname='public' and tablename like 'mirror_%' order by indexname;
select * from public.mirror_budget_limits;
select count(*) as offers, count(*) filter(where state='processing') as processing from public.mirror_offers;
select count(*) as events from public.mirror_offer_events;
