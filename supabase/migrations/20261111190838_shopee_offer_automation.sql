-- Incremental, inactive by default. Reuses operation_settings, products/offers,
-- telegram_jobs, deliveries, channel_events and the single existing pg_cron.
begin;
alter table public.operation_settings add column shopee_config jsonb not null default '{}' check(jsonb_typeof(shopee_config)='object');
create table public.shopee_offers(
 id uuid primary key default gen_random_uuid(),owner_id uuid not null,brand_id text not null default 'dropou',
 shop_id text not null check(shop_id~'^[0-9]+$'),item_id text not null check(item_id~'^[0-9]+$'),
 data jsonb not null,score integer not null check(score between 0 and 100),eligible boolean not null,reasons jsonb not null default '[]',
 decision text not null default 'found' check(decision in ('found','approved','rejected','removed')),
 repeat_until timestamptz,checked_at timestamptz not null,created_at timestamptz not null default now(),
 unique(owner_id,brand_id,shop_id,item_id),foreign key(owner_id,brand_id) references public.operation_settings(owner_id,brand_id),
 check(brand_id='dropou'),check(data->>'itemId'=item_id and data->>'shopId'=shop_id)
);
create index shopee_offers_rank_idx on public.shopee_offers(owner_id,brand_id,score desc,checked_at desc);
create table public.shopee_runs(
 id uuid primary key default gen_random_uuid(),owner_id uuid not null,brand_id text not null default 'dropou',day date not null default (now() at time zone 'America/Bahia')::date,
 state text not null default 'running' check(state in ('running','complete','error')),lease_until timestamptz,preview jsonb not null default '[]',error text,
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 unique(owner_id,brand_id,day),foreign key(owner_id,brand_id) references public.operation_settings(owner_id,brand_id)
);
create table public.shopee_requests(
 id uuid primary key default gen_random_uuid(),owner_id uuid not null,brand_id text not null default 'dropou',day date not null default (now() at time zone 'America/Bahia')::date,
 request_key text not null check(length(request_key) between 1 and 240),kind text not null check(kind in ('search','revalidate')),
 state text not null default 'reserved',blocked_until timestamptz,created_at timestamptz not null default now(),finished_at timestamptz,
 unique(owner_id,brand_id,day,request_key),foreign key(owner_id,brand_id) references public.operation_settings(owner_id,brand_id)
);
create index shopee_requests_budget_idx on public.shopee_requests(day,owner_id,brand_id);
create index shopee_requests_backoff_idx on public.shopee_requests(blocked_until) where blocked_until is not null;
alter table public.telegram_jobs add column shopee_offer_id uuid references public.shopee_offers(id);
alter table public.telegram_jobs add column shopee_slot text;
alter table public.telegram_jobs add column shopee_evidence jsonb;
alter table public.telegram_jobs add column shopee_lease_until timestamptz;
alter table public.telegram_jobs add column shopee_lease_token uuid;
create unique index shopee_slot_once_idx on public.telegram_jobs(owner_id,brand_id,shopee_slot) where shopee_slot is not null;
create index shopee_jobs_offer_idx on public.telegram_jobs(shopee_offer_id) where shopee_offer_id is not null;
alter table public.telegram_jobs drop constraint if exists telegram_jobs_publication_mode_check;
alter table public.telegram_jobs add constraint telegram_jobs_publication_mode_check check(publication_mode in ('verified','safe','official'));
alter table public.deliveries drop constraint if exists deliveries_publication_mode_check;
alter table public.deliveries add constraint deliveries_publication_mode_check check(publication_mode in ('verified','safe','official'));
do $$declare tab text;begin
 foreach tab in array array['shopee_offers','shopee_runs','shopee_requests'] loop
  execute format('alter table public.%I enable row level security',tab);
  execute format('create policy shopee_owner_read on public.%I for select to authenticated using(owner_id=(select auth.uid()) and public.dropou_brand_scope(brand_id))',tab);
  execute format('revoke all on public.%I from public,anon,authenticated',tab);
  execute format('grant select on public.%I to authenticated',tab);
  execute format('grant all on public.%I to service_role',tab);
 end loop;
end $$;

create function public.dropou_shopee_cache(p_owner uuid,p_rows jsonb) returns void language plpgsql security invoker set search_path='' as $$
begin
 if not exists(select 1 from public.telegram_dispatch_config where p_owner=any(owner_ids)) then raise exception 'Administrador não autorizado';end if;
 if jsonb_typeof(p_rows)<>'array' or jsonb_array_length(p_rows)>50 then raise exception 'Lote inválido';end if;
 insert into public.shopee_offers(owner_id,brand_id,shop_id,item_id,data,score,eligible,reasons,checked_at)
 select p_owner,'dropou',r.shop_id,r.item_id,r.data,r.score,r.eligible,r.reasons,r.checked_at from jsonb_to_recordset(p_rows) as r(shop_id text,item_id text,data jsonb,score integer,eligible boolean,reasons jsonb,checked_at timestamptz) order by r.shop_id,r.item_id
 on conflict(owner_id,brand_id,shop_id,item_id) do update set data=excluded.data,score=excluded.score,eligible=excluded.eligible,reasons=excluded.reasons,checked_at=excluded.checked_at where public.shopee_offers.checked_at<=excluded.checked_at;
 -- Deliberately exclude decision/repeat_until: a concurrent curator always wins.
end $$;
create function public.dropou_shopee_reserve(p_owner uuid,p_key text,p_kind text,p_global_limit integer) returns uuid language plpgsql security invoker set search_path='' as $$
declare d date:=(now() at time zone 'America/Bahia')::date;lim integer;r uuid;
begin
 if not exists(select 1 from public.telegram_dispatch_config where p_owner=any(owner_ids)) then raise exception 'Administrador não autorizado';end if;
 -- This single transaction lock covers manual calls, scheduler runs and every owner.
 perform pg_advisory_xact_lock(hashtextextended('dropou-shopee-budget-'||d::text,0));
 select coalesce((shopee_config->>'dailyLimit')::integer,8) into lim from public.operation_settings where owner_id=p_owner and brand_id='dropou';
 if lim is null or p_global_limit not between 1 and 1000 or exists(select 1 from public.shopee_requests where blocked_until>now()) then return null;end if;
 if (select count(*) from public.shopee_requests where day=d)>=p_global_limit or (select count(*) from public.shopee_requests where day=d and owner_id=p_owner and brand_id='dropou')>=lim then return null;end if;
 insert into public.shopee_requests(owner_id,request_key,kind) values(p_owner,p_key,p_kind) on conflict do nothing returning id into r;return r;
end $$;
create function public.dropou_shopee_run(p_owner uuid) returns uuid language plpgsql security invoker set search_path='' as $$
declare r uuid;
begin
 if not exists(select 1 from public.telegram_dispatch_config where p_owner=any(owner_ids)) then raise exception 'Administrador não autorizado';end if;
 insert into public.shopee_runs(owner_id,lease_until) values(p_owner,now()+interval '90 seconds')
 on conflict(owner_id,brand_id,day) do update set state='running',lease_until=excluded.lease_until,updated_at=now()
 where public.shopee_runs.state<>'complete' and (public.shopee_runs.lease_until is null or public.shopee_runs.lease_until<now()) returning id into r;return r;
end $$;

create function public.dropou_shopee_enqueue(p_owner uuid,p_cache uuid,p_at timestamptz,p_target jsonb,p_product jsonb) returns jsonb language plpgsql security invoker set search_path='' as $$
declare c public.shopee_offers;s public.operation_settings;pid uuid;oid uuid;p jsonb;j jsonb;previous public.deliveries;intent uuid;safe text;slot text;existing public.telegram_jobs;
begin
 select * into s from public.operation_settings where owner_id=p_owner and brand_id='dropou' for share;
 if not coalesce((s.shopee_config->>'enabled')::boolean,false) or coalesce((s.shopee_config->>'dryRun')::boolean,true) then raise exception 'Shopee pausada ou em simulação';end if;
 if not s.automation_enabled or not exists(select 1 from public.telegram_dispatch_config where id=true and automation_enabled and p_owner=any(owner_ids)) then raise exception 'Ative somente horários futuros em Agendamento';end if;
 if s.telegram_chat_id is null or s.telegram_verified_at is null or p_target->>'id' is distinct from s.telegram_chat_id then raise exception 'Verifique o canal desta operação';end if;
 select * into c from public.shopee_offers where id=p_cache and owner_id=p_owner and brand_id='dropou';
 if c.id is null then raise exception 'Oferta não encontrada';end if;
 perform pg_advisory_xact_lock(hashtextextended('dropou-shopee-product-'||p_owner::text||c.shop_id||':'||c.item_id,0));
 -- Match claim/receipt lock order: product before cache/job. A per-identity lock
 -- also serializes the first insertion, when no product row exists yet.
 select id into pid from public.products where owner_id=p_owner and brand_id='dropou' and canonical_url='shopee.com.br/product/'||c.shop_id||'/'||c.item_id for update;
 select * into c from public.shopee_offers where id=p_cache and owner_id=p_owner and brand_id='dropou' for update;
 if c.id is null or not c.eligible or c.decision in ('rejected','removed') or (coalesce((s.shopee_config->>'requireReview')::boolean,true) and c.decision<>'approved') then raise exception 'Oferta não aprovada';end if;
 if c.checked_at<now()-make_interval(hours=>coalesce((s.shopee_config->>'cacheHours')::integer,24)) then raise exception 'Cache vencido';end if;
 slot:=to_char(p_at at time zone 'America/Bahia','YYYY-MM-DD"T"HH24:MI');
 perform pg_advisory_xact_lock(hashtextextended('dropou-shopee-slot-'||p_owner::text||slot,0));
 if (p_at at time zone 'America/Bahia')::date<>(now() at time zone 'America/Bahia')::date or p_at<=now() or not coalesce((s.shopee_config->'times') ? to_char(p_at at time zone 'America/Bahia','HH24:MI'),false) then raise exception 'Use um horário futuro configurado para hoje';end if;
 if exists(select 1 from public.telegram_jobs where owner_id=p_owner and brand_id='dropou' and shopee_slot=slot) then return null;end if;
 if exists(select 1 from public.channel_events where owner_id=p_owner and brand_id='dropou' and channel='telegram' and destination_id=s.telegram_chat_id and snapshot->'source'->>'provider'='shopee' and snapshot->'source'->>'itemId'=c.shop_id||':'||c.item_id and event in ('sent','legacy_telegram_verified') and (effective_at is null or effective_at>now()-interval '30 days')) and not coalesce(c.repeat_until>now(),false) then return null;end if;
 if p_product->>'affiliateUrl' is distinct from c.data->>'offerLink' or p_product->>'name' is distinct from c.data->>'name' or p_product->>'image' is distinct from c.data->>'image' or p_product->'source'->>'itemId' is distinct from c.shop_id||':'||c.item_id or p_product->>'operation'<>'dropou' or p_product->>'store'<>'Shopee' then raise exception 'Dados da oferta não correspondem ao cache';end if;
 if pid is not null and exists(select 1 from public.products where id=pid and (archived_at is not null or data->'source'->>'itemId' is distinct from c.shop_id||':'||c.item_id)) then return null;end if;
 if pid is not null then
  select * into existing from public.telegram_jobs where product_id=pid and channel='telegram' for update;
  if existing.state in ('queued','sending','uncertain','partial') then return null;end if;
  select * into previous from public.deliveries where product_id=pid and channel='telegram' for update;
  if previous.state in ('sending','uncertain','partial') then return null;end if;
 end if;
 pid:=coalesce(pid,(p_product->>'id')::uuid);p:=p_product||jsonb_build_object('id',pid,'status','encontrado','scheduledAt',null);
 insert into public.products(id,owner_id,brand_id,canonical_url,data) values(pid,p_owner,'dropou','shopee.com.br/product/'||c.shop_id||'/'||c.item_id,p) on conflict(id) do update set data=excluded.data;
 safe:=public.dropou_safe_publication_caption(p);
 insert into public.offers(owner_id,brand_id,product_id,caption,snapshot,status) values(p_owner,'dropou',pid,safe,p,'rascunho')
 on conflict(product_id) where status<>'excluido' do update set caption=excluded.caption,snapshot=excluded.snapshot,status='rascunho',updated_at=now() returning id into oid;
 if previous.state='sent' then
  intent:=gen_random_uuid();
  insert into public.republication_intents(id,owner_id,brand_id,product_id,offer_id,channel,previous_receipt) values(intent,p_owner,'dropou',pid,oid,'telegram',to_jsonb(previous));
  p_target:=p_target||jsonb_build_object('republicationKey',intent);
 end if;
 j:=public.dropou_publication_queue_v2(p_owner,oid,'telegram',p_at,p_target||'{"mediaMode":"photo","photoConfirmed":true}'::jsonb,safe,safe,'safe',false);
 update public.telegram_jobs set shopee_offer_id=c.id,shopee_slot=slot,shopee_evidence=c.data where id=(j->>'id')::uuid;
 update public.shopee_offers set repeat_until=null where id=c.id;
 return j;
end $$;

create function public.dropou_shopee_prepare(p_job uuid) returns jsonb language plpgsql security invoker set search_path='' as $$
declare j public.telegram_jobs;begin
 select * into j from public.telegram_jobs where id=p_job for update skip locked;
 if j.id is null or j.shopee_offer_id is null or j.state<>'queued' or j.scheduled_at>now() or j.shopee_lease_until>now() then return null;end if;
 update public.telegram_jobs set shopee_lease_until=now()+interval '90 seconds',shopee_lease_token=gen_random_uuid() where id=j.id returning * into j;return to_jsonb(j);
end $$;
create function public.dropou_shopee_claim(p_job uuid,p_token uuid,p_target text,p_product jsonb,p_caption text,p_evidence jsonb) returns jsonb language plpgsql security invoker set search_path='' as $$
declare j public.telegram_jobs;s public.operation_settings;c public.shopee_offers;claimed jsonb;safe text;
begin
 -- Lock the product before the job, matching the existing publisher's lock order.
 perform 1 from public.products where id=(select product_id from public.telegram_jobs where id=p_job) for update skip locked;if not found then return null;end if;
 select * into j from public.telegram_jobs where id=p_job for update skip locked;
 if j.id is null or j.shopee_offer_id is null or j.state<>'queued' or j.scheduled_at>now() or j.shopee_lease_token is distinct from p_token or j.shopee_lease_until<now() then return null;end if;
 select * into s from public.operation_settings where owner_id=j.owner_id and brand_id=j.brand_id for share;
 select * into c from public.shopee_offers where id=j.shopee_offer_id and owner_id=j.owner_id for share;
 if not coalesce((s.shopee_config->>'enabled')::boolean,false) or coalesce((s.shopee_config->>'dryRun')::boolean,true) or not c.eligible or c.decision in ('rejected','removed') or (coalesce((s.shopee_config->>'requireReview')::boolean,true) and c.decision<>'approved') then return null;end if;
 if now()-j.scheduled_at>interval '10 minutes' then update public.telegram_jobs set state='blocked',error='Horário perdido; não recuperar publicações vencidas' where id=j.id;return null;end if;
 if c.data is distinct from p_evidence or p_product->>'id'<>j.product_id::text or p_product->>'affiliateUrl' is distinct from c.data->>'offerLink' or p_product->>'name' is distinct from c.data->>'name' or p_product->>'image' is distinct from c.data->>'image' or length(p_caption)>1024 then raise exception 'Oferta mudou ou legenda excedeu a foto';end if;
 if c.checked_at>now()+interval '1 second' or c.checked_at<now()-interval '15 minutes' then
  if coalesce(s.shopee_config->>'stalePolicy','skip')<>'omit' or p_caption~'R\$|[0-9]+%' then update public.telegram_jobs set state='blocked',error='Preço desatualizado; horário pulado' where id=j.id;return null;end if;
 end if;
 safe:=public.dropou_safe_publication_caption(p_product);
 update public.products set data=p_product where id=j.product_id;
 update public.offers set snapshot=p_product,caption=safe where id=j.offer_id;
 update public.telegram_jobs set snapshot=p_product,caption=safe,source_caption=safe,publication_mode='safe' where id=j.id;
 claimed:=public.dropou_publication_claim_v2(p_job,p_target,true);if claimed is null then return null;end if;
 update public.telegram_jobs set publication_mode='official',caption=p_caption,shopee_evidence=p_evidence where id=j.id returning to_jsonb(telegram_jobs.*) into claimed;
 update public.deliveries set publication_mode='official',caption=p_caption,snapshot=p_product where product_id=j.product_id and channel='telegram' and state='sending';
 return claimed;
end $$;

-- Exclude managed jobs from the ordinary queue query; their worker applies official
-- price evidence, budget, niche and release checks before using the same receipts.
create or replace function public.dropou_due_operation_jobs() returns setof uuid language sql stable security invoker set search_path='' as $$
 select j.id from public.telegram_jobs j join public.operation_settings s on s.owner_id=j.owner_id and s.brand_id=j.brand_id where s.automation_enabled and j.state='queued' and j.scheduled_at<=now() and j.shopee_offer_id is null order by j.scheduled_at,j.id limit 1
$$;
revoke all on function public.dropou_shopee_cache(uuid,jsonb),public.dropou_shopee_reserve(uuid,text,text,integer),public.dropou_shopee_run(uuid),public.dropou_shopee_enqueue(uuid,uuid,timestamptz,jsonb,jsonb),public.dropou_shopee_prepare(uuid),public.dropou_shopee_claim(uuid,uuid,text,jsonb,text,jsonb) from public,anon,authenticated;
grant execute on function public.dropou_shopee_cache(uuid,jsonb),public.dropou_shopee_reserve(uuid,text,text,integer),public.dropou_shopee_run(uuid),public.dropou_shopee_enqueue(uuid,uuid,timestamptz,jsonb,jsonb),public.dropou_shopee_prepare(uuid),public.dropou_shopee_claim(uuid,uuid,text,jsonb,text,jsonb) to service_role;
commit;
