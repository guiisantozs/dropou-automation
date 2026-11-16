-- Prepared locally only. Incremental: no publication jobs or catalog writes.
create table public.mirror_channel_policies(
 owner_id uuid not null,brand_id text not null,
 repeat_hours integer not null default 24 check(repeat_hours between 0 and 8760),
 mirror_daily_limit integer not null default 10 check(mirror_daily_limit between 0 and 1000),
 updated_at timestamptz not null default now(),
 primary key(owner_id,brand_id),foreign key(owner_id,brand_id) references public.operation_settings(owner_id,brand_id)
);
-- Internal ceilings, NOT provider contractual limits. Mirror shares the old
-- background allowance; it never borrows the reserved manual allowance.
create table public.mirror_budget_limits(
 id boolean primary key default true check(id),manual_limit integer not null default 200 check(manual_limit between 1 and 1000),
 background_limit integer not null default 40 check(background_limit between 1 and 1000),
 mirror_limit integer not null default 10 check(mirror_limit between 0 and 1000)
);
insert into public.mirror_budget_limits(id) values(true);
create table public.mirror_offers(
 id uuid primary key default gen_random_uuid(),owner_id uuid not null,brand_id text not null,
 connection_id uuid not null references public.telegram_mtproto_connections(id),
 source_channel_id text not null check(source_channel_id ~ '^[0-9]{1,20}$'),
 message_id bigint not null check(message_id>0),link_index integer not null check(link_index between 0 and 4),
 message_kind text not null check(message_kind in ('text','photo')),message_at timestamptz not null,
 received_at timestamptz not null default clock_timestamp(),
 input_url text not null check(length(input_url)<=2048 and input_url ~ '^https://(shopee\.com\.br|www\.shopee\.com\.br|s\.shopee\.com\.br|shope\.ee|br\.shp\.ee)/[A-Za-z0-9_./%-]+$'),
 destination_chat_id text,shop_id text,item_id text,canonical_url text,
 state text not null default 'received' check(state in ('received','identified','processing','affiliated','pending_review','ready','published','failed','discarded')),
 product_name text,image_url text,price numeric,price_max numeric,checked_at timestamptz,affiliate_url text,
 data_source text check(data_source in ('api','cache')),catalog_product_id uuid references public.products(id),
 duplicate_of uuid references public.mirror_offers(id),attempts integer not null default 0 check(attempts between 0 and 100),
 last_error text check(length(last_error)<=300),lease_token uuid,lease_until timestamptz,
 reviewed_by uuid references auth.users(id),reviewed_at timestamptz,published_at timestamptz,
 updated_at timestamptz not null default clock_timestamp(),version integer not null default 1,
 foreign key(owner_id,brand_id) references public.operation_settings(owner_id,brand_id),
 unique(connection_id,source_channel_id,message_id,link_index,brand_id),
 check((shop_id is null and item_id is null and canonical_url is null) or
 (shop_id is not null and item_id is not null and canonical_url is not null and shop_id ~ '^[1-9][0-9]{0,18}$' and item_id ~ '^[1-9][0-9]{0,18}$' and canonical_url='https://shopee.com.br/product/'||shop_id||'/'||item_id)),
 check(state in ('received','failed','discarded') or (shop_id is not null and item_id is not null)),
 check((state='processing' and lease_token is not null and lease_until is not null) or (state<>'processing' and lease_token is null and lease_until is null)),
 check(state not in ('affiliated','pending_review','ready','published') or
 (product_name is not null and length(product_name) between 3 and 180 and image_url is not null and image_url ~ '^https://' and price is not null and price>0 and price_max is not null and price_max>=price and checked_at is not null and affiliate_url is not null and affiliate_url ~ '^https://' and data_source is not null)),
 check(state<>'ready' or (reviewed_by is not null and reviewed_at is not null)),
 check(state<>'published' or published_at is not null)
);
create index mirror_offer_list on public.mirror_offers(owner_id,brand_id,received_at desc,id);
create index mirror_offer_pending on public.mirror_offers(received_at,id) where state in ('received','identified','processing');
create index mirror_offer_identity on public.mirror_offers(owner_id,brand_id,shop_id,item_id,received_at desc);
create index mirror_offer_connection on public.mirror_offers(connection_id);
create index mirror_offer_catalog on public.mirror_offers(catalog_product_id);
create index mirror_offer_duplicate on public.mirror_offers(duplicate_of);
create index mirror_offer_reviewer on public.mirror_offers(reviewed_by);
create unique index mirror_one_active_product on public.mirror_offers(owner_id,brand_id,shop_id,item_id) where state in ('identified','processing','affiliated','pending_review','ready');
create unique index mirror_one_processing_product on public.mirror_offers(owner_id,shop_id,item_id) where state='processing';
create table public.mirror_offer_events(
 id uuid primary key default gen_random_uuid(),offer_id uuid not null references public.mirror_offers(id),
 owner_id uuid not null,brand_id text not null,from_state text,to_state text not null,
 attempt integer not null,detail text check(length(detail)<=300),actor_id uuid references auth.users(id),
 created_at timestamptz not null default clock_timestamp(),
 foreign key(owner_id,brand_id) references public.operation_settings(owner_id,brand_id)
);
create index mirror_events_offer on public.mirror_offer_events(offer_id,created_at,id);
create index mirror_events_scope on public.mirror_offer_events(owner_id,brand_id,created_at desc);
create index mirror_events_actor on public.mirror_offer_events(actor_id);
alter table public.mirror_offers enable row level security;
alter table public.mirror_offer_events enable row level security;
alter table public.mirror_channel_policies enable row level security;
alter table public.mirror_budget_limits enable row level security;
create policy mirror_offer_read on public.mirror_offers for select to authenticated using(owner_id=(select private.dropou_workspace_owner()) and public.dropou_brand_scope(brand_id));
create policy mirror_event_read on public.mirror_offer_events for select to authenticated using(owner_id=(select private.dropou_workspace_owner()) and public.dropou_brand_scope(brand_id));
create policy mirror_policy_read on public.mirror_channel_policies for select to authenticated using(owner_id=(select private.dropou_workspace_owner()) and public.dropou_brand_scope(brand_id));
-- Supabase grants service_role broad default privileges on new tables.
-- Reset this role too before granting the exact runtime matrix below.
revoke all on public.mirror_offers,public.mirror_offer_events,public.mirror_channel_policies,public.mirror_budget_limits from public,anon,authenticated,service_role;
grant select on public.mirror_offers,public.mirror_offer_events,public.mirror_channel_policies to authenticated;
grant select,insert,update on public.mirror_offers,public.mirror_channel_policies to service_role;
grant select,insert on public.mirror_offer_events to service_role;
grant select on public.mirror_budget_limits to service_role;

create function public.dropou_mirror_guard() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if tg_op='UPDATE' then
  if (new.owner_id,new.brand_id,new.connection_id,new.source_channel_id,new.message_id,new.link_index,new.message_at,new.input_url,new.received_at,new.destination_chat_id) is distinct from
     (old.owner_id,old.brand_id,old.connection_id,old.source_channel_id,old.message_id,old.link_index,old.message_at,old.input_url,old.received_at,old.destination_chat_id) then raise exception 'Origem e destino imutáveis';end if;
  if old.shop_id is not null and (new.shop_id,new.item_id,new.canonical_url) is distinct from (old.shop_id,old.item_id,old.canonical_url) then raise exception 'Identidade imutável';end if;
  if new.state<>old.state and not (
   old.state='received' and new.state in ('identified','failed','discarded') or
   old.state='identified' and new.state in ('processing','failed','discarded') or
   old.state='processing' and new.state in ('affiliated','failed') or
   old.state='affiliated' and new.state='pending_review' or
   old.state='pending_review' and new.state in ('ready','discarded') or
   old.state='ready' and new.state in ('pending_review','discarded') or
   old.state='failed' and new.state in ('received','identified','discarded')) then raise exception 'Transição de espelhamento inválida';end if;
  -- Publication is deliberately unavailable. A future receipt-based integration
  -- must explicitly add this transition; no client can invent a published state.
  new.version:=old.version+1;new.updated_at:=clock_timestamp();
 elsif new.state<>'received' then raise exception 'Oferta deve iniciar recebida';end if;
 return new;
end $$;
create trigger mirror_offer_guard before insert or update on public.mirror_offers for each row execute function public.dropou_mirror_guard();
create function public.dropou_mirror_audit() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if tg_op='INSERT' then
  insert into public.mirror_offer_events(offer_id,owner_id,brand_id,to_state,attempt) values(new.id,new.owner_id,new.brand_id,new.state,new.attempts);
 elsif new.state<>old.state then
  insert into public.mirror_offer_events(offer_id,owner_id,brand_id,from_state,to_state,attempt,detail,actor_id)
  values(new.id,new.owner_id,new.brand_id,old.state,new.state,new.attempts,new.last_error,new.reviewed_by);
 end if;return new;
end $$;
create trigger mirror_offer_audit after insert or update on public.mirror_offers for each row execute function public.dropou_mirror_audit();

create function public.dropou_mirror_ingest(p_holder uuid,p_connection uuid,p_test timestamptz,p_channel text,p_message bigint,p_at timestamptz,p_kind text,p_urls jsonb) returns integer
language plpgsql security invoker set search_path='' as $$
declare c public.telegram_mtproto_connections;s text;n integer:=0;i integer:=0;dest text;
begin
 perform 1 from public.telegram_mtproto_worker_lease where id and holder=p_holder and expires_at>clock_timestamp() for share;if not found then return 0;end if;
 select * into c from public.telegram_mtproto_connections where id=p_connection for share;
 if not found or c.brand_id<>'dropou' or c.status<>'connected' or c.test_channel_id is distinct from p_channel or c.test_started_at is distinct from p_test or c.test_expires_at is null or c.test_expires_at<=clock_timestamp() or p_at<c.test_started_at or p_at>clock_timestamp()+interval '5 seconds' then return 0;end if;
 if not exists(select 1 from public.telegram_dispatch_config where c.owner_id=any(owner_ids)) then return 0;end if;
 if not exists(select 1 from jsonb_array_elements(c.selected) x where x->>'id'=p_channel and x->>'controlled'='true') then return 0;end if;
 if p_urls is null or jsonb_typeof(p_urls)<>'array' or jsonb_array_length(p_urls)>5 or p_kind not in ('text','photo') then raise exception 'Entrada inválida';end if;
 select telegram_chat_id into dest from public.operation_settings where owner_id=c.owner_id and brand_id=c.brand_id;
 for s in select jsonb_array_elements_text(p_urls) loop
  insert into public.mirror_offers(owner_id,brand_id,connection_id,source_channel_id,message_id,link_index,message_at,message_kind,input_url,destination_chat_id)
  values(c.owner_id,c.brand_id,c.id,p_channel,p_message,i,p_at,p_kind,s,dest) on conflict do nothing;
  if found then n:=n+1;end if;i:=i+1;
 end loop;return n;
end $$;

create function public.dropou_mirror_identify(p_holder uuid,p_id uuid,p_shop text,p_item text,p_catalog uuid default null) returns boolean
language plpgsql security invoker set search_path='' as $$
declare r public.mirror_offers;dupe uuid;hours integer;
begin
 perform 1 from public.telegram_mtproto_worker_lease where id and holder=p_holder and expires_at>clock_timestamp() for share;if not found then return false;end if;
 select * into r from public.mirror_offers where id=p_id;if not found then return false;end if;
 perform pg_advisory_xact_lock(hashtextextended('mirror:'||r.owner_id::text||':'||r.brand_id||':'||p_shop||':'||p_item,0));
 select * into r from public.mirror_offers where id=p_id for update;if r.state<>'received' then return false;end if;
 if p_catalog is not null and not exists(select 1 from public.products where id=p_catalog and owner_id=r.owner_id and brand_id=r.brand_id) then raise exception 'Catálogo fora do escopo';end if;
 select coalesce((select repeat_hours from public.mirror_channel_policies where owner_id=r.owner_id and brand_id=r.brand_id),24) into hours;
 select id into dupe from public.mirror_offers where owner_id=r.owner_id and brand_id=r.brand_id and shop_id=p_shop and item_id=p_item and id<>p_id and
 (state in ('identified','processing','affiliated','pending_review','ready') or state='published' and published_at>clock_timestamp()-make_interval(hours=>hours)) order by received_at desc limit 1;
 update public.mirror_offers set shop_id=p_shop,item_id=p_item,canonical_url='https://shopee.com.br/product/'||p_shop||'/'||p_item,catalog_product_id=p_catalog,
 state=case when dupe is null then 'identified' else 'discarded' end,duplicate_of=dupe,last_error=case when dupe is not null then 'Produto já pendente ou dentro do intervalo de repetição neste destino.' end where id=p_id;
 return true;
end $$;

create function public.dropou_mirror_claim(p_holder uuid) returns public.mirror_offers language plpgsql security invoker set search_path='' as $$
declare r public.mirror_offers;
begin
 perform 1 from public.telegram_mtproto_worker_lease where id and holder=p_holder and expires_at>clock_timestamp() for share;if not found then return null;end if;
 -- Unknown provider outcome is retained for explicit review, never retried.
 update public.mirror_offers set state='failed',lease_token=null,lease_until=null,last_error='Processamento interrompido; confira o histórico antes de tentar novamente.' where state='processing' and lease_until<=clock_timestamp();
 select o.* into r from public.mirror_offers o where state='identified' and attempts<100
 and exists(select 1 from public.telegram_dispatch_config where o.owner_id=any(owner_ids))
 and not exists(select 1 from public.mirror_offers busy where busy.owner_id=o.owner_id and busy.shop_id=o.shop_id and busy.item_id=o.item_id and busy.state='processing')
 order by received_at,id for update skip locked limit 1;
 if not found then return null;end if;
 perform pg_advisory_xact_lock(hashtextextended('mirror-process:'||r.owner_id::text||':'||r.shop_id||':'||r.item_id,0));
 if exists(select 1 from public.mirror_offers where owner_id=r.owner_id and shop_id=r.shop_id and item_id=r.item_id and state='processing') then return null;end if;
 update public.mirror_offers set state='processing',attempts=attempts+1,lease_token=gen_random_uuid(),lease_until=clock_timestamp()+interval '2 minutes',last_error=null,reviewed_by=null,reviewed_at=null where id=r.id returning * into r;return r;
end $$;

create function public.dropou_mirror_finish(p_holder uuid,p_id uuid,p_token uuid,p_result jsonb) returns boolean language plpgsql security invoker set search_path='' as $$
declare r public.mirror_offers;p jsonb;link text;
begin
 perform 1 from public.telegram_mtproto_worker_lease where id and holder=p_holder and expires_at>clock_timestamp() for share;if not found then return false;end if;
 select * into r from public.mirror_offers where id=p_id for update;
 if not found or r.state<>'processing' or r.lease_token is distinct from p_token or r.lease_until<=clock_timestamp() then return false;end if;
 if p_result->>'state' is distinct from 'generated' then
  update public.mirror_offers set state='failed',lease_token=null,lease_until=null,last_error=left(coalesce(p_result->>'error','Conversão não concluída.'),300) where id=p_id;return true;
 end if;
 p:=p_result->'product';link:=p_result->>'affiliateUrl';
 if link is null or link=r.canonical_url or link !~ '^https://(s\.shopee\.com\.br|shopee\.com\.br|www\.shopee\.com\.br|shope\.ee|br\.shp\.ee)/[^[:space:]<>]+$'
 or p->>'image' is null or p->>'image' !~ '^https://([a-zA-Z0-9-]+\.)*(susercontent\.com|shopee\.com\.br|shopee\.com|shopeemobile\.com)/[^[:space:]<>]+$' then raise exception 'Dados oficiais inválidos';end if;
 update public.mirror_offers set state='affiliated',lease_token=null,lease_until=null,product_name=p->>'name',image_url=p->>'image',price=(p->>'price')::numeric,price_max=(p->>'priceMax')::numeric,checked_at=(p->>'checkedAt')::timestamptz,affiliate_url=link,data_source=p_result->>'source',last_error=null where id=p_id;
 update public.mirror_offers set state='pending_review' where id=p_id;return true;
end $$;

create function public.dropou_mirror_fail_received(p_holder uuid,p_id uuid) returns boolean language plpgsql security invoker set search_path='' as $$
begin
 perform 1 from public.telegram_mtproto_worker_lease where id and holder=p_holder and expires_at>clock_timestamp() for share;if not found then return false;end if;
 update public.mirror_offers set state='failed',attempts=least(100,attempts+1),last_error='Não foi possível identificar o produto ou consultar seu catálogo.' where id=p_id and state='received';return found;
end $$;

create function public.dropou_mirror_review(p_owner uuid,p_actor uuid,p_brand text,p_id uuid,p_version integer,p_action text) returns boolean language plpgsql security invoker set search_path='' as $$
declare r public.mirror_offers;dupe uuid;
begin
 if p_actor is null or not exists(select 1 from public.telegram_dispatch_config where p_owner=any(owner_ids)) or not (p_actor=p_owner or exists(select 1 from public.operation_members where member_id=p_actor and owner_id=p_owner and active and (role='admin' or p_brand=any(brands)))) then raise exception 'Operador sem acesso';end if;
 select * into r from public.mirror_offers where id=p_id and owner_id=p_owner and brand_id=p_brand;
 if not found then raise exception 'Oferta indisponível';end if;
 if r.shop_id is not null then perform pg_advisory_xact_lock(hashtextextended('mirror:'||r.owner_id::text||':'||r.brand_id||':'||r.shop_id||':'||r.item_id,0));end if;
 select * into r from public.mirror_offers where id=p_id and owner_id=p_owner and brand_id=p_brand for update;
 if not found or r.version is distinct from p_version then raise exception 'Oferta alterada. Atualize o painel.';end if;
 if p_action='ready' and r.state='pending_review' then
  if r.checked_at<clock_timestamp()-interval '15 minutes' or r.checked_at>clock_timestamp()+interval '5 seconds' then raise exception 'Consulta de preço antiga. Descarte ou mantenha pendente para revisão futura.';end if;
  if r.destination_chat_id is null or not exists(select 1 from public.operation_settings where owner_id=p_owner and brand_id=p_brand and telegram_chat_id=r.destination_chat_id and telegram_verified_at is not null) then raise exception 'Destino indisponível ou alterado';end if;
  update public.mirror_offers set state='ready',reviewed_by=p_actor,reviewed_at=clock_timestamp(),last_error=null where id=p_id;
 elsif p_action='discard' and r.state in ('received','identified','pending_review','ready','failed') then
  update public.mirror_offers set state='discarded',reviewed_by=p_actor,reviewed_at=clock_timestamp(),last_error='Descartada na revisão.' where id=p_id;
 elsif p_action='pending' and r.state='ready' then
  update public.mirror_offers set state='pending_review',reviewed_by=p_actor,reviewed_at=clock_timestamp(),last_error=null where id=p_id;
 elsif p_action='retry' and r.state='failed' and r.attempts<100 then
  if r.shop_id is not null and exists(select 1 from public.mirror_offers where owner_id=p_owner and brand_id=p_brand and shop_id=r.shop_id and item_id=r.item_id and state in ('identified','processing','affiliated','pending_review','ready')) then raise exception 'Produto já pendente neste destino';end if;
  update public.mirror_offers set state=case when shop_id is null then 'received' else 'identified' end,reviewed_by=p_actor,reviewed_at=clock_timestamp(),last_error=null where id=p_id;
 else raise exception 'Ação indisponível para este estado';end if;return true;
end $$;
create function public.dropou_mirror_policy(p_owner uuid,p_actor uuid,p_brand text,p_hours integer,p_limit integer) returns boolean language plpgsql security invoker set search_path='' as $$
begin
 if p_actor is null or not exists(select 1 from public.telegram_dispatch_config where p_owner=any(owner_ids)) or not (p_actor=p_owner or exists(select 1 from public.operation_members where member_id=p_actor and owner_id=p_owner and active and role='admin')) then raise exception 'Somente administradores';end if;
 insert into public.mirror_channel_policies(owner_id,brand_id,repeat_hours,mirror_daily_limit) values(p_owner,p_brand,p_hours,p_limit)
 on conflict(owner_id,brand_id) do update set repeat_hours=excluded.repeat_hours,mirror_daily_limit=excluded.mirror_daily_limit,updated_at=clock_timestamp();return true;
end $$;

alter table public.shopee_requests drop constraint shopee_requests_kind_check;
alter table public.shopee_requests add constraint shopee_requests_kind_check check(kind in ('search','revalidate','manual','mirror'));
create or replace function public.dropou_shopee_reserve_v2(p_owner uuid,p_brand text,p_key text,p_kind text,p_global_limit integer) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare d date:=(now() at time zone 'America/Bahia')::date;lim integer;rid uuid;until_at timestamptz;caps public.mirror_budget_limits;
begin
 if p_kind is null or p_kind not in ('manual','search','mirror') or p_global_limit is null or p_global_limit not between 1 and 1000 then raise exception 'Limite ou finalidade inválida';end if;
 if not exists(select 1 from public.telegram_dispatch_config where p_owner=any(owner_ids)) then raise exception 'Administrador não autorizado';end if;
 perform pg_advisory_xact_lock(hashtextextended('dropou-shopee-budget-'||d::text,0));
 select * into strict caps from public.mirror_budget_limits where id;
 select case when p_kind='manual' then manual_daily_limit when p_kind='mirror' then coalesce((select mirror_daily_limit from public.mirror_channel_policies where owner_id=p_owner and brand_id=p_brand),10) else discovery_daily_limit end into lim from public.operation_settings where owner_id=p_owner and brand_id=p_brand;
 if lim is null then raise exception 'Canal indisponível';end if;
 select max(blocked_until) into until_at from public.shopee_requests where blocked_until>clock_timestamp();
 if until_at is not null then return jsonb_build_object('reason','rate_limit','retryAt',until_at);end if;
 if p_kind<>'manual' and exists(select 1 from public.shopee_saved_products where state='fetching' and lease_until>clock_timestamp()) then return jsonb_build_object('reason','busy','retryAt',clock_timestamp()+interval '3 seconds');end if;
 if exists(select 1 from public.shopee_requests where state='reserved' and created_at>clock_timestamp()-interval '20 seconds') then return jsonb_build_object('reason','busy','retryAt',clock_timestamp()+interval '3 seconds');end if;
 if p_kind<>'manual' and (select count(*) from public.shopee_requests where day=d and kind in ('mirror','search','revalidate'))>=caps.background_limit then return jsonb_build_object('reason','discovery_budget');end if;
 if (select count(*) from public.shopee_requests where day=d and kind=p_kind)>=least(p_global_limit,case p_kind when 'manual' then caps.manual_limit when 'mirror' then caps.mirror_limit else caps.background_limit end)
 or (select count(*) from public.shopee_requests where day=d and kind=p_kind and owner_id=p_owner and brand_id=p_brand)>=lim then return jsonb_build_object('reason',case p_kind when 'manual' then 'manual_budget' when 'mirror' then 'mirror_budget' else 'discovery_budget' end);end if;
 insert into public.shopee_requests(owner_id,brand_id,request_key,kind) values(p_owner,p_brand,p_key,p_kind) on conflict do nothing returning id into rid;
 return jsonb_build_object('id',rid,'reason',case when rid is null then 'duplicate' else null end);
end $$;
-- Legacy reservations retain their stricter total cap and daily channel cap;
-- additionally respect the protected background allowance and concurrency.
create or replace function public.dropou_shopee_reserve(p_owner uuid,p_key text,p_kind text,p_global_limit integer) returns uuid
language plpgsql security invoker set search_path='' as $$
declare d date:=(now() at time zone 'America/Bahia')::date;lim integer;r uuid;cap integer;
begin
 if not exists(select 1 from public.telegram_dispatch_config where p_owner=any(owner_ids)) then raise exception 'Administrador não autorizado';end if;
 if p_kind is null or p_kind not in ('search','revalidate') then return null;end if;
 perform pg_advisory_xact_lock(hashtextextended('dropou-shopee-budget-'||d::text,0));
 select coalesce((shopee_config->>'dailyLimit')::integer,8) into lim from public.operation_settings where owner_id=p_owner and brand_id='dropou';
 select background_limit into strict cap from public.mirror_budget_limits where id;
 if lim is null or p_global_limit is null or p_global_limit not between 1 and 1000 or exists(select 1 from public.shopee_requests where blocked_until>clock_timestamp() or state='reserved' and created_at>clock_timestamp()-interval '20 seconds') then return null;end if;
 if exists(select 1 from public.shopee_saved_products where state='fetching' and lease_until>clock_timestamp()) then return null;end if;
 if (select count(*) from public.shopee_requests where day=d)>=p_global_limit or (select count(*) from public.shopee_requests where day=d and owner_id=p_owner and brand_id='dropou')>=lim or (select count(*) from public.shopee_requests where day=d and kind in ('search','mirror','revalidate'))>=cap then return null;end if;
 insert into public.shopee_requests(owner_id,request_key,kind) values(p_owner,p_key,p_kind) on conflict do nothing returning id into r;return r;
end $$;

-- Explicit function ACLs: no browser may claim, complete or forge review actors.
revoke all on function public.dropou_mirror_guard(),public.dropou_mirror_audit(),public.dropou_mirror_ingest(uuid,uuid,timestamptz,text,bigint,timestamptz,text,jsonb),public.dropou_mirror_identify(uuid,uuid,text,text,uuid),public.dropou_mirror_claim(uuid),public.dropou_mirror_finish(uuid,uuid,uuid,jsonb),public.dropou_mirror_fail_received(uuid,uuid),public.dropou_mirror_review(uuid,uuid,text,uuid,integer,text),public.dropou_mirror_policy(uuid,uuid,text,integer,integer) from public,anon,authenticated;
grant execute on function public.dropou_mirror_guard(),public.dropou_mirror_audit(),public.dropou_mirror_ingest(uuid,uuid,timestamptz,text,bigint,timestamptz,text,jsonb),public.dropou_mirror_identify(uuid,uuid,text,text,uuid),public.dropou_mirror_claim(uuid),public.dropou_mirror_finish(uuid,uuid,uuid,jsonb),public.dropou_mirror_fail_received(uuid,uuid),public.dropou_mirror_review(uuid,uuid,text,uuid,integer,text),public.dropou_mirror_policy(uuid,uuid,text,integer,integer) to service_role;
revoke all on function public.dropou_shopee_reserve_v2(uuid,text,text,text,integer),public.dropou_shopee_reserve(uuid,text,text,integer) from public,anon,authenticated;
grant execute on function public.dropou_shopee_reserve_v2(uuid,text,text,text,integer),public.dropou_shopee_reserve(uuid,text,text,integer) to service_role;
