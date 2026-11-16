-- Incremental and replay-safe. Never creates Auth accounts or enables integrations.
begin;
alter table public.affiliate_operations drop constraint if exists affiliate_operations_id_check;
insert into public.affiliate_operations(id,name) values
 ('beleza','Toque de Beleza'),('casa','Cantinho & Charme'),('natal','Clima de Natal') on conflict(id) do nothing;
-- The PK/FKs are the registry: future operations no longer need a static CHECK list.
alter table public.operation_members add column if not exists display_name text check(display_name is null or length(btrim(display_name)) between 1 and 80);
do $$ declare c record;begin
 for c in select conname from pg_constraint where conrelid='public.operation_members'::regclass and contype='c' and pg_get_constraintdef(oid) like '%brands%<@%' loop
  execute format('alter table public.operation_members drop constraint %I',c.conname);
 end loop;
end $$;
create or replace function private.dropou_member_brands_guard() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if cardinality(new.brands)=0 or exists(select 1 from unnest(new.brands) b where b is null or not exists(select 1 from public.affiliate_operations a where a.id=b)) then raise exception 'Dashboard inválido para o integrante';end if;
 return new;
end $$;
revoke all on function private.dropou_member_brands_guard() from public,anon,authenticated;
drop trigger if exists operation_member_brands on public.operation_members;
create trigger operation_member_brands before insert or update on public.operation_members for each row execute function private.dropou_member_brands_guard();

insert into public.operation_settings(owner_id,brand_id,display_name)
 select distinct s.owner_id,b.id,b.name from public.operation_settings s cross join public.affiliate_operations b
 where b.id in ('beleza','casa','natal') on conflict do nothing;
-- A stale client or direct RPC must not enable integrations for these brands.
do $$ begin
 if not exists(select 1 from pg_constraint where conrelid='public.operation_settings'::regclass and conname='local_brands_integrations_off') then
  alter table public.operation_settings add constraint local_brands_integrations_off check(brand_id not in ('beleza','casa','natal') or
   (not automation_enabled and automatic_not_before is null and telegram_chat_id is null and telegram_title is null and telegram_verified_at is null and whatsapp_name='' and whatsapp_url='' and shopee_config='{}'::jsonb));
 end if;
 if not exists(select 1 from pg_constraint where conrelid='public.telegram_jobs'::regclass and conname='local_brands_no_jobs') then
  alter table public.telegram_jobs add constraint local_brands_no_jobs check(brand_id not in ('beleza','casa','natal'));
 end if;
end $$;

create or replace function public.dropou_access_context() returns jsonb language sql stable security invoker set search_path='' as $$
 select jsonb_build_object('owner',private.dropou_workspace_owner(),'actor',auth.uid(),'admin',private.dropou_workspace_admin(),
 'displayName',(select display_name from public.operation_members where member_id=auth.uid()),
 'brands',coalesce((select jsonb_agg(id order by id) from public.affiliate_operations where private.dropou_channel_allowed(id)),'[]'::jsonb))
$$;
revoke all on function public.dropou_access_context() from public,anon;
grant execute on function public.dropou_access_context() to authenticated;

-- Atomic membership changes; only an authenticated administrator's server route calls it.
create or replace function public.dropou_assign_member(p_owner uuid,p_actor uuid,p_member uuid,p_role text,p_brands text[],p_name text default null)
returns void language plpgsql security invoker set search_path='' as $$
begin
 if p_actor is distinct from p_owner and not exists(select 1 from public.operation_members where member_id=p_actor and owner_id=p_owner and active and role='admin') then raise exception 'Administrador indisponível';end if;
 if p_member=p_owner or p_role not in ('admin','operator') then raise exception 'Perfil inválido';end if;
 if exists(select 1 from public.operation_members where owner_id=p_member) then raise exception 'A conta administra outra equipe';end if;
 insert into public.operation_members(member_id,owner_id,role,brands,display_name,active)
 values(p_member,p_owner,p_role,p_brands,p_name,true)
 on conflict(member_id) do update set role=excluded.role,brands=excluded.brands,display_name=coalesce(excluded.display_name,operation_members.display_name),active=true
 where operation_members.owner_id=p_owner;
 if not found then raise exception 'Esta conta pertence a outra equipe';end if;
end $$;
revoke all on function public.dropou_assign_member(uuid,uuid,uuid,text,text[],text) from public,anon,authenticated;
grant execute on function public.dropou_assign_member(uuid,uuid,uuid,text,text[],text) to service_role;

-- Read-only manual catalog, reusing products/offers/history and their existing RLS.
create or replace function public.dropou_local_products(p_stage text default 'catalog',p_page integer default 0,p_q text default '',p_store text default null,p_channel text default null,p_from timestamptz default null,p_to timestamptz default null)
returns jsonb language sql stable security invoker set search_path='' as $$
with visible as(
 select p.*,(select max(e.published_at) from public.dropou_operation_publications e where e.owner_id=p.owner_id and e.product_id=p.id) published_at,
 exists(select 1 from public.dropou_operation_publications e where e.owner_id=p.owner_id and e.product_id=p.id and (p_channel is null or e.channel=p_channel) and (p_from is null or e.published_at>=p_from) and (p_to is null or e.published_at<p_to)) published
 from public.products p where p.owner_id=(select private.dropou_workspace_owner()) and p.brand_id in ('beleza','casa','natal') and public.dropou_brand_scope(p.brand_id) and coalesce((p.data->>'demo')::boolean,false)=false
), rows as(
 select id,data,'product'::text kind,created_at from visible where
 case when p_stage='archived' then archived_at is not null when p_stage='rejected' then archived_at is null and curation_state='rejected'
 when p_stage='curation' then archived_at is null and curation_state='pending' when p_stage='approved' then archived_at is null and curation_state='approved' and not published
 when p_stage='published' then archived_at is null and published else archived_at is null and curation_state<>'rejected' end
 and (p_q='' or data->>'name' ilike '%'||replace(replace(p_q,'%',''),'_','')||'%') and (p_store is null or data->>'store'=p_store)
 and ((p_channel is null and p_from is null and p_to is null) or published)
)
select jsonb_build_object('total',(select count(*) from rows),'rows',coalesce((select jsonb_agg(to_jsonb(r)) from(select * from rows order by created_at desc,id limit 24 offset least(greatest(p_page,0),10000)*24) r),'[]'::jsonb),
 'summary',jsonb_build_object('pending',(select count(*) from visible where archived_at is null and curation_state='pending'),'approved',(select count(*) from visible where archived_at is null and curation_state='approved' and not published),'published',(select count(*) from visible where published),'recent',(select count(*) from visible where published_at>=((now() at time zone 'America/Bahia')::date-1)::timestamp at time zone 'America/Bahia'),'archived',(select count(*) from visible where archived_at is not null)),
 'recent',coalesce((select jsonb_agg(to_jsonb(r)) from(select id,data,'product'::text kind,published_at from visible where published_at>=((now() at time zone 'America/Bahia')::date-1)::timestamp at time zone 'America/Bahia' order by published_at desc,id limit 24)r),'[]'::jsonb),
 'channels','{}'::jsonb,'recentTotal',(select count(*) from visible where published_at>=((now() at time zone 'America/Bahia')::date-1)::timestamp at time zone 'America/Bahia'))
$$;
revoke all on function public.dropou_local_products(text,integer,text,text,text,timestamptz,timestamptz) from public,anon;
grant execute on function public.dropou_local_products(text,integer,text,text,text,timestamptz,timestamptz) to authenticated;
commit;
