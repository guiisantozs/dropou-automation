-- Incremental, local until the Dropou project connection is configured.
-- Preserve all existing identities, destinations, data, receipts and cron flags.
begin;
alter table public.affiliate_operations drop constraint affiliate_operations_id_check;
insert into public.affiliate_operations(id,name) values
 ('celulares','Dropou | Celulares & Gadgets'),('tenis','Dropou | Tênis & Sneakers'),('automoto','Dropou | Auto & Moto');
alter table public.affiliate_operations add constraint affiliate_operations_id_check check(id in ('dropou','bruto','moda','celulares','tenis','automoto'));
insert into public.operation_settings(owner_id,brand_id,display_name)
 select distinct s.owner_id,b.id,b.name from public.operation_settings s cross join public.affiliate_operations b
 where b.id in ('celulares','tenis','automoto') on conflict do nothing;
alter table public.operation_settings add column telegram_bot_env text not null default 'TELEGRAM_BOT_TOKEN'
 check(telegram_bot_env in ('TELEGRAM_BOT_TOKEN','TELEGRAM_CELULARES_BOT_TOKEN','TELEGRAM_TENIS_BOT_TOKEN','TELEGRAM_AUTOMOTO_BOT_TOKEN'));
alter table public.operation_settings add column manual_daily_limit integer not null default 200 check(manual_daily_limit between 1 and 1000);
alter table public.operation_settings add column discovery_daily_limit integer not null default 8 check(discovery_daily_limit between 1 and 100);

-- Retain the shared tables and their owner/brand foreign keys.
do $$ declare tab text; c record; begin
 foreach tab in array array['shopee_offers','shopee_saved_products','shopee_observations','product_channel_marks'] loop
  for c in select conname from pg_constraint where conrelid=('public.'||tab)::regclass and contype='c'
   and pg_get_constraintdef(oid) like '%brand_id%' loop
   execute format('alter table public.%I drop constraint %I',tab,c.conname);
  end loop;
  execute format('alter table public.%I add constraint %I check(brand_id in (''dropou'',''celulares'',''tenis'',''automoto''))',tab,tab||'_channels_check');
 end loop;
end $$;
alter table public.shopee_requests drop constraint shopee_requests_kind_check;
alter table public.shopee_requests add constraint shopee_requests_kind_check check(kind in ('search','revalidate','manual'));
create index shopee_requests_purpose_day_idx on public.shopee_requests(day,kind,owner_id,brand_id);

create schema if not exists private;
revoke all on schema private from public,anon;
grant usage on schema private to authenticated,service_role;
create table public.operation_members(
 member_id uuid primary key references auth.users(id),owner_id uuid not null references auth.users(id),
 role text not null check(role in ('admin','operator')),brands text[] not null check(cardinality(brands)>0),
 active boolean not null default true,created_at timestamptz not null default now(),
 check(member_id<>owner_id),check(brands <@ array['dropou','bruto','moda','celulares','tenis','automoto']::text[])
);
create index operation_members_owner_idx on public.operation_members(owner_id);
alter table public.operation_members enable row level security;
revoke all on public.operation_members from public,anon,authenticated;
grant select on public.operation_members to authenticated;
grant all on public.operation_members to service_role;
-- These narrowly scoped helpers read only membership for the verified auth.uid().
create function private.dropou_workspace_owner() returns uuid language sql stable security definer set search_path='' as $$
 select case when m.member_id is null then auth.uid() when m.active then m.owner_id else null end
 from (select auth.uid() actor) a left join public.operation_members m on m.member_id=a.actor
$$;
create function private.dropou_workspace_admin() returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and coalesce((select active and role='admin' from public.operation_members where member_id=auth.uid()),true)
$$;
create function private.dropou_channel_allowed(p_brand text) returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and case when m.member_id is null then true
 else m.active and (m.role='admin' or p_brand=any(m.brands)) end
 from (select auth.uid() actor) a left join public.operation_members m on m.member_id=a.actor
$$;
revoke all on function private.dropou_workspace_owner(),private.dropou_workspace_admin(),private.dropou_channel_allowed(text) from public,anon;
grant execute on function private.dropou_workspace_owner(),private.dropou_workspace_admin(),private.dropou_channel_allowed(text) to authenticated,service_role;
create policy members_read on public.operation_members for select to authenticated
 using(owner_id=private.dropou_workspace_owner() and private.dropou_workspace_admin() or member_id=auth.uid());

-- Adapt existing owner-based invoker functions and policies to the same workspace
-- identity. Ownership is never obtained from browser metadata or a supplied UUID.
do $$ declare f record; p record; definition text; qualifier text; checked text; begin
 for f in select oid from pg_proc where pronamespace='public'::regnamespace and proname like 'dropou_%' and prosrc like '%auth.uid()%' loop
  definition:=replace(pg_get_functiondef(f.oid),'auth.uid()','private.dropou_workspace_owner()');
  definition:=replace(definition,'confirmed_by:=private.dropou_workspace_owner()','confirmed_by:=auth.uid()');
  definition:=replace(definition,'confirmed_by=private.dropou_workspace_owner()','confirmed_by=auth.uid()');
  execute definition;
 end loop;
 for p in select schemaname,tablename,policyname,qual,with_check from pg_policies
 where schemaname='public' and tablename<>'operation_members' and (qual like '%auth.uid()%' or with_check like '%auth.uid()%')
 and exists(select 1 from information_schema.columns c where c.table_schema='public' and c.table_name=tablename and c.column_name='owner_id') loop
  qualifier:=replace(p.qual,'auth.uid()','private.dropou_workspace_owner()');
  checked:=replace(p.with_check,'auth.uid()','private.dropou_workspace_owner()');
  execute format('alter policy %I on public.%I%s%s',p.policyname,p.tablename,
   case when qualifier is null then '' else ' using ('||qualifier||')' end,
   case when checked is null then '' else ' with check ('||checked||')' end);
 end loop;
end $$;
create or replace function public.dropou_brand_scope(p_brand text) returns boolean language sql stable security invoker set search_path='' as $$
 select coalesce(nullif(coalesce(nullif(current_setting('request.headers',true),''),'{}')::jsonb->>'x-dropou-brand',''),'dropou') in (p_brand,'all')
 and (current_user='service_role' or private.dropou_channel_allowed(p_brand))
$$;
-- operation_settings had only an owner policy; add the same channel restriction.
create policy settings_channel_scope on public.operation_settings as restrictive for select to authenticated using(private.dropou_channel_allowed(brand_id));
create function public.dropou_access_context() returns jsonb language sql stable security invoker set search_path='' as $$
 select jsonb_build_object('owner',private.dropou_workspace_owner(),'actor',auth.uid(),'admin',private.dropou_workspace_admin(),
 'brands',coalesce((select jsonb_agg(id order by id) from public.affiliate_operations where private.dropou_channel_allowed(id)),'[]'::jsonb))
$$;
revoke all on function public.dropou_access_context() from public,anon;
grant execute on function public.dropou_access_context() to authenticated;

create table public.operation_audit(
 id uuid primary key default gen_random_uuid(),owner_id uuid not null references auth.users(id),actor_id uuid not null references auth.users(id),
 brand_id text not null references public.affiliate_operations(id),action text not null,resource_id uuid,
 created_at timestamptz not null default now(),detail jsonb not null default '{}'
);
create index operation_audit_owner_brand_actor_idx on public.operation_audit(owner_id,brand_id,actor_id,created_at desc);
create table public.operation_uploaded_images(
 path text primary key,owner_id uuid not null references auth.users(id),brand_id text not null references public.affiliate_operations(id),
 actor_id uuid not null references auth.users(id),created_at timestamptz not null default now()
);
create index operation_uploaded_images_scope_idx on public.operation_uploaded_images(owner_id,brand_id,actor_id);
alter table public.operation_uploaded_images enable row level security;
create policy uploaded_images_read on public.operation_uploaded_images for select to authenticated
 using(owner_id=private.dropou_workspace_owner() and public.dropou_brand_scope(brand_id));
revoke all on public.operation_uploaded_images from public,anon,authenticated;
grant select on public.operation_uploaded_images to authenticated;
grant all on public.operation_uploaded_images to service_role;
alter table public.operation_audit enable row level security;
create policy audit_read on public.operation_audit for select to authenticated
 using(owner_id=private.dropou_workspace_owner() and public.dropou_brand_scope(brand_id) and (private.dropou_workspace_admin() or actor_id=auth.uid()));
revoke all on public.operation_audit from public,anon,authenticated;
grant select on public.operation_audit to authenticated;
grant select,insert on public.operation_audit to service_role;

-- Generalize the existing reviewed implementations; old signatures are retained
-- for legacy callers. New required p_brand prevents ambiguous RPC overloads.
do $$ declare f record; definition text; signature text; begin
 for f in select oid,proname from pg_proc where pronamespace='public'::regnamespace and proname in
 ('dropou_shopee_cache','dropou_shopee_stage','dropou_shopee_saved_claim','dropou_shopee_saved_finish','dropou_shopee_saved_prepare','dropou_curate','dropou_channel_mark') loop
  definition:=pg_get_functiondef(f.oid);
  definition:=replace(definition,'FUNCTION public.'||f.proname||'(','FUNCTION public.'||f.proname||'_channel(p_brand text, ');
  definition:=replace(definition,'''dropou''','p_brand');
  if f.proname='dropou_shopee_saved_claim' then
   definition:=replace(definition,$old$(state='ready' and p_refresh)$old$,$new$(state='ready' and (p_refresh or (data->>'checkedAt')::timestamptz<clock_timestamp()-interval '15 minutes'))$new$);
  end if;
  execute definition;
 end loop;
 for f in select oid::regprocedure signature from pg_proc where pronamespace='public'::regnamespace and proname like 'dropou_%_channel' loop
  execute format('revoke all on function %s from public,anon,authenticated',f.signature);
  execute format('grant execute on function %s to service_role',f.signature);
 end loop;
end $$;
-- The shared invoker view now covers each channel, with its existing RLS.
do $$ declare definition text; begin
 definition:=pg_get_viewdef('public.dropou_curation_queue'::regclass,true);
 definition:=replace(definition,$literal$s.brand_id = 'dropou'::text$literal$,$literal$s.brand_id IN ('dropou','celulares','tenis','automoto')$literal$);
 definition:=replace(definition,$literal$p.brand_id = 'dropou'::text$literal$,$literal$p.brand_id IN ('dropou','celulares','tenis','automoto')$literal$);
 execute 'create or replace view public.dropou_curation_queue with(security_invoker=true) as '||definition;
end $$;
do $$ declare definition text; begin
 definition:=pg_get_functiondef('public.dropou_publication_identity(jsonb)'::regprocedure);
 definition:=replace(definition,$literal$'dropou','bruto','moda'$literal$,$literal$'dropou','bruto','moda','celulares','tenis','automoto'$literal$);
 execute definition;
end $$;

-- Shared data cache contains facts only; decisions and publication state remain
-- in each channel. Authenticated clients have no direct cache access.
create table public.shopee_import_cache(
 owner_id uuid not null references auth.users(id),shop_id text not null,item_id text not null,data jsonb not null,checked_at timestamptz not null,
 primary key(owner_id,shop_id,item_id)
);
alter table public.shopee_import_cache enable row level security;
revoke all on public.shopee_import_cache from public,anon,authenticated;
grant all on public.shopee_import_cache to service_role;
create table public.shopee_usage_events(
 id uuid primary key default gen_random_uuid(),owner_id uuid not null,brand_id text not null,
 kind text not null check(kind in ('manual_import','cache_hit')),created_at timestamptz not null default now(),
 foreign key(owner_id,brand_id) references public.operation_settings(owner_id,brand_id)
);
create index shopee_usage_owner_day_idx on public.shopee_usage_events(owner_id,created_at desc,brand_id);
alter table public.shopee_usage_events enable row level security;
create policy usage_read on public.shopee_usage_events for select to authenticated using(owner_id=private.dropou_workspace_owner() and public.dropou_brand_scope(brand_id));
revoke all on public.shopee_usage_events from public,anon,authenticated;
grant select on public.shopee_usage_events to authenticated;
grant select,insert on public.shopee_usage_events to service_role;

create function public.dropou_shopee_reserve_v2(p_owner uuid,p_brand text,p_key text,p_kind text,p_global_limit integer) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare d date:=(now() at time zone 'America/Bahia')::date; lim integer; rid uuid; until_at timestamptz;
begin
 if p_kind not in ('manual','search') or p_global_limit not between 1 and 1000 then raise exception 'Limite ou finalidade inválida';end if;
 if not exists(select 1 from public.telegram_dispatch_config where p_owner=any(owner_ids)) then raise exception 'Administrador não autorizado';end if;
 perform pg_advisory_xact_lock(hashtextextended('dropou-shopee-budget-'||d::text,0));
 select case when p_kind='manual' then manual_daily_limit else discovery_daily_limit end into lim from public.operation_settings where owner_id=p_owner and brand_id=p_brand;
 if lim is null then raise exception 'Canal indisponível';end if;
 select max(blocked_until) into until_at from public.shopee_requests where blocked_until>clock_timestamp();
 if until_at is not null then return jsonb_build_object('reason','rate_limit','retryAt',until_at);end if;
 -- Give actively claimed manual imports the next available provider call.
 -- An abandoned claim ceases to hold discovery when its bounded lease expires.
 if p_kind='search' and exists(select 1 from public.shopee_saved_products where state='fetching' and lease_until>clock_timestamp()) then
  return jsonb_build_object('reason','busy','retryAt',clock_timestamp()+interval '3 seconds');end if;
 if exists(select 1 from public.shopee_requests where state='reserved' and created_at>clock_timestamp()-interval '20 seconds') then
  return jsonb_build_object('reason','busy','retryAt',clock_timestamp()+interval '3 seconds');end if;
 if (select count(*) from public.shopee_requests where day=d and kind=p_kind)>=p_global_limit
 or (select count(*) from public.shopee_requests where day=d and kind=p_kind and owner_id=p_owner and brand_id=p_brand)>=lim then
  return jsonb_build_object('reason',case when p_kind='manual' then 'manual_budget' else 'discovery_budget' end);end if;
 insert into public.shopee_requests(owner_id,brand_id,request_key,kind) values(p_owner,p_brand,p_key,p_kind) on conflict do nothing returning id into rid;
 return jsonb_build_object('id',rid,'reason',case when rid is null then 'duplicate' else null end);
end $$;
revoke all on function public.dropou_shopee_reserve_v2(uuid,text,text,text,integer) from public,anon,authenticated;
grant execute on function public.dropou_shopee_reserve_v2(uuid,text,text,text,integer) to service_role;

create table public.shopee_search_leases(owner_id uuid not null,brand_id text not null,token uuid not null,lease_until timestamptz not null,last_finished_at timestamptz,
 primary key(owner_id,brand_id),foreign key(owner_id,brand_id) references public.operation_settings(owner_id,brand_id));
alter table public.shopee_search_leases enable row level security;
revoke all on public.shopee_search_leases from public,anon,authenticated;
grant all on public.shopee_search_leases to service_role;
create function public.dropou_shopee_search_claim(p_owner uuid,p_brand text) returns uuid language plpgsql security invoker set search_path='' as $$
declare result uuid;begin
 insert into public.shopee_search_leases(owner_id,brand_id,token,lease_until) values(p_owner,p_brand,gen_random_uuid(),clock_timestamp()+interval '55 seconds')
 on conflict(owner_id,brand_id) do update set token=excluded.token,lease_until=excluded.lease_until
 where public.shopee_search_leases.lease_until<clock_timestamp() and (public.shopee_search_leases.last_finished_at is null or public.shopee_search_leases.last_finished_at<clock_timestamp()-interval '60 seconds') returning token into result;
 return result;
end $$;
revoke all on function public.dropou_shopee_search_claim(uuid,text) from public,anon,authenticated;
grant execute on function public.dropou_shopee_search_claim(uuid,text) to service_role;
create or replace function public.dropou_shopee_import_cache_guard() returns trigger language plpgsql security invoker set search_path='' as $$
begin if tg_op='UPDATE' and new.checked_at<old.checked_at then return old;end if;return new;end $$;
revoke all on function public.dropou_shopee_import_cache_guard() from public,anon,authenticated;
grant execute on function public.dropou_shopee_import_cache_guard() to service_role;
create trigger shopee_import_cache_freshest before update on public.shopee_import_cache for each row execute function public.dropou_shopee_import_cache_guard();
insert into public.shopee_import_cache(owner_id,shop_id,item_id,data,checked_at)
 select distinct on(owner_id,shop_id,item_id) owner_id,shop_id,item_id,data,checked_at from public.shopee_offers
 order by owner_id,shop_id,item_id,checked_at desc;
create or replace function public.dropou_safe_publication_caption(p jsonb) returns text language sql immutable security invoker set search_path='' as $$
 select headline||E'\n\n⚡ *'||case when coalesce(p->>'name','') ~* 'https?://|www\.|R\$|[$€%]|pix|frete|cupom|desconto|economiz|estoque|dispon[ií]vel|gr[aá]tis|promo[cç]|parcel|sem juros|menor pre[cç]o|garant|reais|por\s+[0-9]|[uú]ltim|vendid|imperd[ií]vel|barat[ií]ssim'
 then generic else translate(p->>'name',chr(13)||chr(10)||'*_~<>[]',repeat(' ',9)) end||E'*\n\n🛒 Veja o preço e a disponibilidade atualizados na loja 👇\n'||(p->>'affiliateUrl')||E'\n\nAs condições podem ter mudado.\n\n'||closing
 from(values
 ('dropou','🎮🔥 CONFIRA ESSE ACHADO GAMER! #publi','Seleção de games e tecnologia','💙 Dropou o preço? A gente te avisa!'),
 ('bruto','🛠️ CONFIRA ESSE ACHADO PARA SUA OFICINA! #publi','Seleção de ferramentas e utilidades','🛠️ Bruto & Barato — ferramenta certa para o seu dia!'),
 ('moda','👔 CONFIRA ESSE ACHADO DE ESTILO! #publi','Seleção de moda masculina','🖤 Estilo e custo-benefício para o seu dia.'),
 ('celulares','📱 UM ACHADO PARA O SEU DIA! #publi','Seleção de celulares e gadgets','📱 #publi | Dropou Celulares & Gadgets'),
 ('tenis','👟 SEU PRÓXIMO PASSO ESTÁ AQUI! #publi','Seleção de tênis e sneakers','👟 #publi | Dropou Tênis & Sneakers'),
 ('automoto','🚗 UM ACHADO PARA O SEU VEÍCULO! #publi','Seleção de acessórios para carro e moto','🚗 #publi | Dropou Auto & Moto')
 ) as copy(brand,headline,generic,closing) where brand=coalesce(p->>'operation','dropou')
$$;
commit;
