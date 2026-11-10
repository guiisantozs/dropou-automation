-- LOCAL ONLY. Requires explicit approval before applying to a hosted project.
begin;
do $$ begin perform 1 from public.telegram_dispatch_config where id=true for update;if exists(select 1 from public.telegram_jobs where state='sending') then raise exception 'Aguarde os envios em andamento antes da migração';end if;update public.telegram_dispatch_config set automation_enabled=false,updated_at=clock_timestamp() where id=true;end $$;
create or replace function public.dropou_economy_product_guard() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if exists(select 1 from public.deliveries where product_id=old.id and channel='telegram' and state='sending') then raise exception 'Envio em andamento; aguarde antes de editar ou excluir';end if;
 if (new.data-'operation') is distinct from (old.data-'operation') and exists(select 1 from public.deliveries where product_id=old.id and channel='telegram' and state in ('uncertain','partial')) then raise exception 'Entrega incerta; confira o canal antes de editar';end if;
 return new;
end $$;
create table public.affiliate_operations(id text primary key check(id in ('dropou','bruto','moda')),name text not null);
insert into public.affiliate_operations values('dropou','Dropou'),('bruto','Bruto & Barato'),('moda','Moda Masculina');
alter table public.affiliate_operations enable row level security;
create policy operations_read on public.affiliate_operations for select to authenticated using(true);
revoke all on public.affiliate_operations from public,anon,authenticated;
grant select on public.affiliate_operations to authenticated;grant all on public.affiliate_operations to service_role;
create table public.operation_settings(
 owner_id uuid not null references auth.users(id),brand_id text not null references public.affiliate_operations(id),display_name text not null check(length(display_name) between 2 and 80),
 telegram_chat_id text,telegram_title text,telegram_verified_at timestamptz,
 whatsapp_name text not null default '',whatsapp_url text not null default '',
 automation_enabled boolean not null default false,automatic_not_before timestamptz,
 daily_goal integer not null default 10 check(daily_goal in (10,15)),
 routine_slots jsonb not null default '["08:00","09:00","10:00","11:00","12:00","14:00","16:00","18:00","20:00","21:00"]' check(jsonb_typeof(routine_slots)='array' and jsonb_array_length(routine_slots) between 1 and 45),
 radar jsonb not null default '{}' check(jsonb_typeof(radar)='object'),updated_at timestamptz not null default now(),primary key(owner_id,brand_id)
);
alter table public.operation_settings enable row level security;
create policy operation_settings_read on public.operation_settings for select to authenticated using(owner_id=(select auth.uid()));
revoke all on public.operation_settings from public,anon,authenticated;grant select on public.operation_settings to authenticated;grant all on public.operation_settings to service_role;
insert into public.operation_settings(owner_id,brand_id,display_name,telegram_chat_id,telegram_title)
 select u.owner_id,b.id,b.name,case when b.id='dropou' then d.destination_id end,case when b.id='dropou' then d.destination_title end
 from (select owner_id from public.products union select unnest(owner_ids) from public.telegram_dispatch_config) u cross join public.affiliate_operations b
 left join lateral(select destination_id,destination_title from public.deliveries where owner_id=u.owner_id and channel='telegram' and state='sent' and destination_id is not null order by sent_at desc nulls last limit 1)d on true;

create or replace function public.dropou_brand_scope(p_brand text) returns boolean language sql stable security invoker set search_path='' as $$
 select coalesce(nullif(coalesce(nullif(current_setting('request.headers',true),''),'{}')::jsonb->>'x-dropou-brand',''),'dropou') in (p_brand,'all')
$$;
revoke all on function public.dropou_brand_scope(text) from public,anon;grant execute on function public.dropou_brand_scope(text) to authenticated,service_role;

-- Existing records and snapshots belong to Dropou. Text, receipts, prices and dates are retained.
alter table public.products add column brand_id text not null default 'dropou' references public.affiliate_operations(id);
update public.products set data=data||'{"operation":"dropou"}'::jsonb;
alter table public.products drop constraint if exists products_owner_id_canonical_url_key;
alter table public.products add constraint products_owner_brand_url_key unique(owner_id,brand_id,canonical_url);
alter table public.products add constraint products_owner_id_brand_key unique(owner_id,id,brand_id);
create index products_owner_brand_date_idx on public.products(owner_id,brand_id,created_at desc) where archived_at is null;
do $$ declare tab text;begin
 foreach tab in array array['offers','publications','telegram_jobs','deliveries','channel_events','price_records','republication_intents','ai_caption_cache'] loop
  execute format('alter table public.%I add column brand_id text references public.affiliate_operations(id)',tab);
  execute format('update public.%I set brand_id=''dropou''',tab);
  execute format('alter table public.%I alter column brand_id set not null',tab);
  if exists(select 1 from information_schema.columns where table_schema='public' and table_name=tab and column_name='snapshot') then execute format('update public.%I set snapshot=snapshot||''{"operation":"dropou"}''::jsonb where jsonb_typeof(snapshot)=''object''',tab);end if;
  execute format('alter table public.%I add constraint %I foreign key(owner_id,product_id,brand_id) references public.products(owner_id,id,brand_id) on delete %s',tab,tab||'_product_brand_fkey',case when tab='channel_events' then 'set null (product_id)' else 'no action' end);
  execute format('create index %I on public.%I(owner_id,brand_id)',tab||'_owner_brand_idx',tab);
 end loop;
 if to_regclass('public.ai_drafts') is not null then
  alter table public.ai_drafts add column brand_id text not null default 'dropou' references public.affiliate_operations(id);
 end if;
end $$;
alter table public.logs add column brand_id text not null default 'dropou' references public.affiliate_operations(id);
create index logs_owner_brand_date_idx on public.logs(owner_id,brand_id,created_at desc);
create or replace function public.dropou_product_brand_guard() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if tg_op='UPDATE' and new.brand_id is distinct from old.brand_id then raise exception 'A marca do produto não pode ser alterada; crie um cadastro na operação correta';end if;
 if tg_op='INSERT' then new.brand_id:=coalesce(new.data->>'operation',new.brand_id,'dropou');end if;
 if new.data->>'operation' is distinct from new.brand_id then
  if new.data ? 'operation' then raise exception 'Marca do cadastro não corresponde à operação';end if;
  new.data:=new.data||jsonb_build_object('operation',new.brand_id);
 end if;return new;
end $$;
create trigger aa_product_brand before insert or update on public.products for each row execute function public.dropou_product_brand_guard();
create or replace function public.dropou_child_brand_guard() returns trigger language plpgsql security invoker set search_path='' as $$
declare b text;begin
 if new.product_id is null then
  if tg_op='UPDATE' then new.brand_id:=old.brand_id;end if;return new;
 end if;
 select brand_id into b from public.products where id=new.product_id and owner_id=new.owner_id;
 if b is null then raise exception 'Produto não encontrado nesta operação';end if;
 if new.brand_id is not null and new.brand_id<>b then raise exception 'Vínculo entre operações diferentes recusado';end if;
 if tg_op='UPDATE' and old.brand_id<>b then raise exception 'Marca histórica imutável';end if;
 new.brand_id:=b;
 if to_jsonb(new) ? 'snapshot' and jsonb_typeof(to_jsonb(new)->'snapshot')='object' then
  if (to_jsonb(new)->'snapshot') ? 'operation' and to_jsonb(new)->'snapshot'->>'operation' is distinct from b then raise exception 'Snapshot pertence a outra operação';end if;
  new:=jsonb_populate_record(new,jsonb_build_object('snapshot',(to_jsonb(new)->'snapshot')||jsonb_build_object('operation',b)));
 end if;
 return new;
end $$;
do $$ declare tab text;begin
 foreach tab in array array['offers','publications','telegram_jobs','deliveries','channel_events','price_records','republication_intents','ai_caption_cache'] loop
  execute format('create trigger aa_child_brand before insert or update on public.%I for each row execute function public.dropou_child_brand_guard()',tab);
 end loop;
 foreach tab in array array['products','offers','publications','telegram_jobs','deliveries','channel_events','price_records','republication_intents','logs'] loop
  execute format('create policy operation_scope on public.%I as restrictive for all to authenticated using(public.dropou_brand_scope(brand_id)) with check(public.dropou_brand_scope(brand_id))',tab);
 end loop;
end $$;
create or replace function public.dropou_log_brand_guard() returns trigger language plpgsql security invoker set search_path='' as $$
declare b text;begin
 if new.detail ~* '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}' then select brand_id into b from public.products where id=substring(new.detail,1,36)::uuid and owner_id=new.owner_id;end if;
 new.brand_id:=coalesce(b,case when public.dropou_brand_scope('bruto') and not public.dropou_brand_scope('dropou') then 'bruto' when public.dropou_brand_scope('moda') and not public.dropou_brand_scope('dropou') then 'moda' else new.brand_id end,'dropou');return new;
end $$;
create trigger aa_log_brand before insert on public.logs for each row execute function public.dropou_log_brand_guard();

create table public.operation_link_inbox(id uuid primary key default gen_random_uuid(),owner_id uuid not null references auth.users(id),brand_id text not null references public.affiliate_operations(id),url text not null,marketplace text not null check(marketplace in ('Mercado Livre','Shopee')),created_at timestamptz not null default now(),unique(owner_id,brand_id,url));
alter table public.operation_link_inbox enable row level security;
create policy inbox_owner on public.operation_link_inbox for all to authenticated using(owner_id=(select auth.uid()) and public.dropou_brand_scope(brand_id)) with check(owner_id=(select auth.uid()) and public.dropou_brand_scope(brand_id));
revoke all on public.operation_link_inbox from public,anon,authenticated;grant select,insert,delete on public.operation_link_inbox to authenticated;grant all on public.operation_link_inbox to service_role;
create index inbox_owner_brand_date_idx on public.operation_link_inbox(owner_id,brand_id,created_at desc);

-- Deployment starts paused. Existing queued items require a fresh authorization, not a catch-up send.
update public.telegram_dispatch_config set automation_enabled=false,updated_at=now();
update public.telegram_jobs set state='blocked',error='Etapa multimarcas: revise o destino e autorize novamente' where state in ('queued','ready');

alter function public.dropou_publication_queue_v2(uuid,uuid,text,timestamptz,jsonb,text,text,text,boolean) rename to dropou_singlebrand_queue;
create or replace function public.dropou_publication_queue_v2(p_owner uuid,p_offer uuid,p_channel text,p_at timestamptz,p_target jsonb,p_caption text,p_source text,p_mode text,p_allow_safe boolean) returns jsonb language plpgsql security invoker set search_path='' as $$
declare b text;s public.operation_settings;begin
 select brand_id into b from public.offers where id=p_offer and owner_id=p_owner;
 if b is null then raise exception 'Oferta não encontrada';end if;
 select * into s from public.operation_settings where owner_id=p_owner and brand_id=b for share;
 if p_channel='telegram' then
  if s.telegram_chat_id is not null and s.telegram_chat_id is distinct from p_target->>'id' then raise exception 'Destino pertence a outra operação ou foi alterado';end if;
  if s.telegram_chat_id is null and b<>'dropou' then raise exception 'Configure o Telegram desta marca';end if;
 elsif p_channel='whatsapp' and coalesce(s.whatsapp_name,'')='' then raise exception 'Configure o destino WhatsApp desta marca';end if;
 return public.dropou_singlebrand_queue(p_owner,p_offer,p_channel,p_at,p_target,p_caption,p_source,p_mode,p_allow_safe);
end $$;
revoke all on function public.dropou_publication_queue_v2(uuid,uuid,text,timestamptz,jsonb,text,text,text,boolean) from public,anon,authenticated;
grant execute on function public.dropou_publication_queue_v2(uuid,uuid,text,timestamptz,jsonb,text,text,text,boolean) to service_role;

alter function public.dropou_publication_claim_v2(uuid,text,boolean) rename to dropou_singlebrand_claim;
create or replace function public.dropou_publication_claim_v2(p_job uuid,p_target text,p_automatic boolean) returns jsonb language plpgsql security invoker set search_path='' as $$
declare j public.telegram_jobs;s public.operation_settings;begin
 select * into j from public.telegram_jobs where id=p_job;
 select * into s from public.operation_settings where owner_id=j.owner_id and brand_id=j.brand_id for share;
 if p_automatic and not coalesce(s.automation_enabled,false) then return null;end if;
 if j.channel='telegram' and ((s.telegram_chat_id is not null and s.telegram_chat_id is distinct from j.destination_id) or (s.telegram_chat_id is null and j.brand_id<>'dropou')) then
  update public.telegram_jobs set state='blocked',error='Destino da marca alterado ou não configurado; autorize novamente' where id=j.id and state='queued';return null;
 end if;
 if j.channel='whatsapp' and (coalesce(s.whatsapp_name,'')='' or s.whatsapp_name is distinct from j.destination_title) then
  update public.telegram_jobs set state='blocked',error='Destino WhatsApp desta marca mudou; revise o preparo manual' where id=j.id and state='queued';return null;
 end if;
 if p_automatic and s.automatic_not_before is not null and j.scheduled_at<=s.automatic_not_before then
  update public.telegram_jobs set state='blocked',error='Horário anterior à retomada desta marca; revise antes de reagendar' where id=j.id and state='queued';return null;
 end if;
 return public.dropou_singlebrand_claim(p_job,p_target,p_automatic);
end $$;
revoke all on function public.dropou_publication_claim_v2(uuid,text,boolean) from public,anon,authenticated;
grant execute on function public.dropou_publication_claim_v2(uuid,text,boolean) to service_role;

create or replace function public.dropou_manual_brand_destination() returns trigger language plpgsql security invoker set search_path='' as $$
declare target text;begin
 select whatsapp_name into target from public.operation_settings where owner_id=new.owner_id and brand_id=new.brand_id;
 if coalesce(target,'')='' or target is distinct from new.destination then raise exception 'Confirme o destino WhatsApp configurado para esta marca';end if;return new;
end $$;
create trigger ab_manual_brand_destination before insert on public.publications for each row execute function public.dropou_manual_brand_destination();

create or replace function public.dropou_set_operation_automation(p_owner uuid,p_brand text,p_enabled boolean) returns jsonb language plpgsql security invoker set search_path='' as $$
declare s public.operation_settings;held integer:=0;cutoff timestamptz:=clock_timestamp();begin
 perform 1 from public.telegram_dispatch_config where id=true and p_owner=any(owner_ids) for update;if not found then raise exception 'Administrador não autorizado';end if;
 select * into s from public.operation_settings where owner_id=p_owner and brand_id=p_brand for update;
 if s.owner_id is null or p_enabled is null then raise exception 'Operação não configurada';end if;
 if p_enabled and not s.automation_enabled then
  update public.telegram_jobs set state='blocked',error='Horário vencido durante a pausa desta marca; confira e reagende' where owner_id=p_owner and brand_id=p_brand and state='queued' and scheduled_at<=cutoff;get diagnostics held=row_count;
  update public.operation_settings set automation_enabled=true,automatic_not_before=cutoff,updated_at=cutoff where owner_id=p_owner and brand_id=p_brand;
 elsif not p_enabled then update public.operation_settings set automation_enabled=false,updated_at=cutoff where owner_id=p_owner and brand_id=p_brand;end if;
 update public.telegram_dispatch_config set automation_enabled=exists(select 1 from public.operation_settings where automation_enabled),updated_at=cutoff where id=true;
 insert into public.logs(owner_id,brand_id,event,detail) values(p_owner,p_brand,case when p_enabled then 'Automação da marca ativada' else 'Automação da marca pausada' end,'Somente horários futuros · America/Bahia');
 return jsonb_build_object('enabled',p_enabled,'held',held,'brand',p_brand);
end $$;
revoke all on function public.dropou_set_operation_automation(uuid,text,boolean) from public,anon,authenticated;grant execute on function public.dropou_set_operation_automation(uuid,text,boolean) to service_role;
revoke execute on function public.dropou_set_automation(uuid,boolean) from service_role;
create or replace function public.dropou_due_operation_jobs() returns setof uuid language sql stable security invoker set search_path='' as $$
 select j.id from public.telegram_jobs j join public.operation_settings s on s.owner_id=j.owner_id and s.brand_id=j.brand_id where s.automation_enabled and j.state='queued' and j.scheduled_at<=now() order by j.scheduled_at,j.id limit 1
$$;
revoke all on function public.dropou_due_operation_jobs() from public,anon,authenticated;grant execute on function public.dropou_due_operation_jobs() to service_role;

create or replace function public.dropou_channel_metrics() returns jsonb language sql stable security invoker set search_path='' as $$
 with catalog as(select p.id,p.data,o.id offer_id from public.products p left join public.offers o on o.product_id=p.id and o.status<>'excluido' where p.owner_id=(select auth.uid()) and p.archived_at is null and coalesce((p.data->>'demo')::boolean,false)=false),
 tg as(select * from public.deliveries where owner_id=(select auth.uid()) and channel='telegram'),
 wa as(select * from public.publications where owner_id=(select auth.uid()) and channel='whatsapp')
 select jsonb_build_object('telegram',jsonb_build_object(
  'published',(select count(distinct publication_round) from public.channel_events where owner_id=(select auth.uid()) and channel='telegram' and event in ('sent','legacy_telegram_verified') and jsonb_array_length(message_ids)>0),
  'scheduled',(select count(*) from public.telegram_jobs where owner_id=(select auth.uid()) and channel='telegram' and state='queued'),
  'pending',(select count(*) from catalog c where not exists(select 1 from tg where product_id=c.id and state='sent') and not exists(select 1 from public.telegram_jobs where product_id=c.id and channel='telegram' and state in ('queued','failed','uncertain','partial'))),
  'failed',(select count(*) from public.telegram_jobs where owner_id=(select auth.uid()) and channel='telegram' and state in ('failed','uncertain','partial'))),
 'whatsapp',jsonb_build_object(
  'published',(select count(*) from wa where not review_required and confirmation_source in ('manual','audit_manual') and confirmed_by is not null),
  'ready',(select count(*) from catalog c where c.offer_id is not null and public.dropou_publication_identity(c.data) and not exists(select 1 from wa where product_id=c.id) and not exists(select 1 from public.telegram_jobs where product_id=c.id and channel='whatsapp' and state='queued')),
  'scheduled',(select count(*) from public.telegram_jobs where owner_id=(select auth.uid()) and channel='whatsapp' and state='queued'),
  'pending',(select count(*) from catalog c where (c.offer_id is null or not public.dropou_publication_identity(c.data)) and not exists(select 1 from wa where product_id=c.id)),
  'review',(select count(*) from wa where review_required)))
$$;

create or replace function public.dropou_workspace_metrics() returns jsonb language sql stable security invoker set search_path='' as $$
 select jsonb_build_object('products',(select count(*) from public.products where owner_id=(select auth.uid()) and archived_at is null and coalesce((data->>'demo')::boolean,false)=false),
 'published',(select count(distinct product_id) from (select product_id from public.channel_events where owner_id=(select auth.uid()) and channel='telegram' and event in ('sent','legacy_telegram_verified') and jsonb_array_length(message_ids)>0 union all select product_id from public.publications where owner_id=(select auth.uid()) and not review_required and confirmed_by is not null) sent),
 'scheduled',(select count(*) from public.telegram_jobs where owner_id=(select auth.uid()) and state='queued'),
 'waiting',(select count(*) from public.products where owner_id=(select auth.uid()) and archived_at is null and not public.dropou_publishable(data)))
$$;

create or replace function public.dropou_publication_history_v2(p_product uuid default null,p_channel text default null,p_from timestamptz default null,p_to timestamptz default null,p_page integer default 0,p_attempts boolean default false,p_marketplace text default null,p_status text default null)
returns setof jsonb language sql stable security invoker set search_path='' as $$
 with telegram_completed as (
  select distinct on (coalesce(e.publication_round,e.id))
   e.id,e.product_id,e.product_name,'telegram'::text channel,'sent'::text status,e.effective_at occurred_at,e.created_at recorded_at,e.scheduled_at,e.destination,e.destination_id,e.message_ids,
   null::uuid confirmed_by,(e.republication_key is not null or exists(select 1 from public.channel_events proof where proof.owner_id=e.owner_id and proof.product_id=e.product_id and proof.channel=e.channel and proof.publication_round=e.publication_round and proof.republication_key is not null)) is_republication,e.publication_round,e.error,false review_required,e.brand_id,e.snapshot->>'store' marketplace
  from public.channel_events e where e.owner_id=(select auth.uid()) and e.channel='telegram' and e.event in ('sent','legacy_telegram_verified') and jsonb_array_length(e.message_ids)>0
   and (p_product is null or e.product_id=p_product) and (p_channel is null or p_channel='telegram')
  order by coalesce(e.publication_round,e.id),e.effective_at desc nulls last,e.created_at desc,e.id
 ), rows as (
  select * from telegram_completed
  union all
  select e.id,e.product_id,e.product_name,e.channel,e.event,null::timestamptz,e.created_at,e.scheduled_at,e.destination,e.destination_id,e.message_ids,
   null::uuid,(e.republication_key is not null or exists(select 1 from public.channel_events proof where proof.owner_id=e.owner_id and proof.product_id=e.product_id and proof.channel=e.channel and proof.publication_round=e.publication_round and proof.republication_key is not null)),e.publication_round,e.error,false,e.brand_id,e.snapshot->>'store'
  from public.channel_events e where p_attempts and e.owner_id=(select auth.uid()) and e.event not in ('sent','legacy_telegram_verified','legacy_global_status_corrected')
   and (p_product is null or e.product_id=p_product) and (p_channel is null or p_channel=e.channel)
  union all
  select w.id,w.product_id,coalesce(w.snapshot->>'name','Oferta histórica'),'whatsapp',
   case when not w.review_required and w.confirmed_by is not null and w.confirmation_source in ('manual','audit_manual') then 'manual_confirmed' else 'review' end,
   case when not w.review_required and w.confirmed_by is not null then w.confirmed_at end,w.published_at,null::timestamptz,w.destination,null::text,'[]'::jsonb,
   w.confirmed_by,w.republication_key is not null,w.publication_round,null::text,w.review_required,w.brand_id,w.snapshot->>'store'
  from public.publications w where w.owner_id=(select auth.uid()) and w.channel='whatsapp' and (p_attempts or (not w.review_required and w.confirmed_by is not null and w.confirmation_source in ('manual','audit_manual')))
   and (p_product is null or w.product_id=p_product) and (p_channel is null or p_channel='whatsapp')
 )
 select to_jsonb(r)||jsonb_build_object('next_scheduled_at',(select j.scheduled_at from public.telegram_jobs j where j.owner_id=(select auth.uid()) and j.product_id=r.product_id and j.brand_id=r.brand_id and j.channel=r.channel and j.state='queued' and j.scheduled_at>now() order by j.scheduled_at limit 1)) from rows r
 where (p_marketplace is null or r.marketplace=p_marketplace) and (p_status is null or r.status=p_status) and (p_from is null or coalesce(r.occurred_at,case when r.status not in ('sent','manual_confirmed') then r.recorded_at end)>=p_from)
  and (p_to is null or coalesce(r.occurred_at,case when r.status not in ('sent','manual_confirmed') then r.recorded_at end)<p_to)
 order by coalesce(r.occurred_at,r.recorded_at) desc,r.recorded_at desc,r.channel,r.id
 limit 21 offset least(greatest(coalesce(p_page,0),0),10000)*20
$$;
revoke all on function public.dropou_publication_history_v2(uuid,text,timestamptz,timestamptz,integer,boolean,text,text) from public,anon;grant execute on function public.dropou_publication_history_v2(uuid,text,timestamptz,timestamptz,integer,boolean,text,text) to authenticated,service_role;

create or replace function public.dropou_safe_publication_caption(p jsonb) returns text language sql immutable security invoker set search_path='' as $$
 select case p->>'operation' when 'bruto' then '🛠️ CONFIRA ESSE ACHADO PARA SUA OFICINA! #publi' when 'moda' then '👔 CONFIRA ESSE ACHADO DE ESTILO! #publi' else '🎮🔥 CONFIRA ESSE ACHADO GAMER! #publi' end||E'\n\n⚡ *'||case when coalesce(p->>'name','') ~* 'https?://|www\.|R\$|[$€%]|pix|frete|cupom|desconto|economiz|estoque|dispon[ií]vel|gr[aá]tis|promo[cç]|parcel|sem juros|menor pre[cç]o|garant|reais|por\s+[0-9]|[uú]ltim|vendid|imperd[ií]vel|barat[ií]ssim' then case p->>'operation' when 'bruto' then 'Seleção de ferramentas e utilidades' when 'moda' then 'Seleção de moda masculina' else 'Seleção de games e tecnologia' end else translate(p->>'name',chr(13)||chr(10)||'*_~<>[]',repeat(' ',9)) end||E'*\n\n🛒 Veja o preço e a disponibilidade atualizados na loja 👇\n'||(p->>'affiliateUrl')||E'\n\nAs condições podem ter mudado.\n\n'||case p->>'operation' when 'bruto' then '🛠️ Bruto & Barato — ferramenta certa para o seu dia!' when 'moda' then '🖤 Estilo e custo-benefício para o seu dia.' else '💙 Dropou o preço? A gente te avisa!' end
$$;
create or replace function public.dropou_publication_identity(p jsonb) returns boolean language sql stable security invoker set search_path='' as $$
 select coalesce((p->>'demo')::boolean=false and length(p->>'name')>=3 and p->>'affiliateUrl' !~ '[[:space:]<>]' and strpos(p->>'affiliateUrl',chr(160))=0 and strpos(p->>'affiliateUrl',chr(8239))=0 and
 ((p->>'store'='Mercado Livre' and p->>'affiliateUrl' ~* '^https://([a-zA-Z0-9-]+\.)*(meli\.la|mercadolivre\.com\.br|mercadolivre\.com|mercadolibre\.com)(:443)?([/?#]|$)') or
 (p->>'store'='Shopee' and p->>'affiliateUrl' ~* '^https://([a-zA-Z0-9-]+\.)*(shopee\.com\.br|shope\.ee)(:443)?([/?#]|$)')),false)
$$;
create index channel_events_owner_brand_time_idx on public.channel_events(owner_id,brand_id,effective_at desc,created_at desc);
create index publications_owner_brand_time_idx on public.publications(owner_id,brand_id,confirmed_at desc);
create index telegram_jobs_owner_brand_pending_idx on public.telegram_jobs(owner_id,brand_id,scheduled_at) where state='queued';
create or replace function public.dropou_save_product(p_data jsonb,p_key text) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare uid uuid:=auth.uid(); pid uuid:=(p_data->>'id')::uuid; old_data jsonb; saved jsonb;
begin
 if uid is null or coalesce((p_data->>'demo')::boolean,true) then raise exception 'Cadastro real exige autenticação e dados reais'; end if;
 if (p_data->>'price')::numeric<=0 or length(p_key)=0 then raise exception 'Preço ou link inválido'; end if;
 select data into old_data from public.products where id=pid and owner_id=uid for update;
 if exists(select 1 from public.products where id=pid and archived_at is not null) then raise exception 'Restaure o produto arquivado antes de editar';end if;
 saved:=p_data || jsonb_build_object('status',case when length(p_data->>'affiliateUrl')>0 then 'encontrado' else 'aguardando link' end,'scheduledAt',null);
 insert into public.products(id,owner_id,canonical_url,data) values(pid,uid,p_key,saved)
 on conflict(id) do update set data=excluded.data,canonical_url=excluded.canonical_url where products.owner_id=uid;
 if not found then raise exception 'Produto não encontrado'; end if;
 if old_data is distinct from saved then
   insert into public.price_records(owner_id,product_id,price,previous_price,payment_method,checked_at,snapshot)
   values(uid,pid,(saved->>'price')::numeric,(saved->>'previousPrice')::numeric,coalesce(saved->>'paymentMethod','nao_informado'),(saved->>'checkedAt')::timestamptz,saved);
   update public.offers set status='rascunho',updated_at=now() where product_id=pid and status<>'excluido';
 end if;
 insert into public.logs(owner_id,brand_id,event,detail) values(uid,coalesce(saved->>'operation','dropou'),'Produto salvo',saved->>'name');
 return saved;
end $$;
create or replace function public.dropou_save_offer(p_product uuid,p_expected jsonb,p_caption text) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare uid uuid:=auth.uid(); p jsonb; result public.offers;
begin
 select data into p from public.products where id=p_product and owner_id=uid for update;
 if p is null then raise exception 'Produto não encontrado'; end if;
 if exists(select 1 from public.products where id=p_product and archived_at is not null) then raise exception 'Produto arquivado';end if;
 if p is distinct from p_expected then raise exception 'Produto alterado; gere a legenda novamente'; end if;
 if (p->>'demo')::boolean is distinct from false then raise exception 'Demonstração não pode virar oferta real'; end if;
 insert into public.offers(owner_id,product_id,caption,snapshot,status)
 values(uid,p_product,p_caption,p,case when public.dropou_publishable(p) then 'pronto' else 'rascunho' end)
 on conflict(product_id) where status<>'excluido' do update
 set caption=excluded.caption,snapshot=excluded.snapshot,status=excluded.status,updated_at=now()
 returning * into result;
 -- Snapshot acompanha o estado resultante do produto para comparação na publicação.
 if result.status='pronto' then
   p:=p || jsonb_build_object('status','pronto','scheduledAt',null);
   update public.products set data=p where id=p_product and owner_id=uid;
   update public.offers set snapshot=p where id=result.id returning * into result;
 end if;
 insert into public.logs(owner_id,brand_id,event,detail) values(uid,coalesce(p->>'operation','dropou'),'Oferta salva',p->>'name');
 return to_jsonb(result);
end $$;
create or replace function public.dropou_product_lifecycle(p_owner uuid,p_product uuid,p_action text,p_confirm boolean,p_cancel boolean) returns jsonb language plpgsql security invoker set search_path='' as $$
declare p public.products; history boolean; pending integer; sending boolean; images jsonb;
begin
 select * into p from public.products where id=p_product and owner_id=p_owner for update;
 if p.id is null then raise exception 'Produto não encontrado';end if;
 history:=exists(select 1 from public.republication_intents where product_id=p.id) or p.data->>'status'='publicado' or exists(select 1 from public.publications where product_id=p.id) or exists(select 1 from public.deliveries where product_id=p.id and state in ('sent','sending','uncertain','partial')) or exists(select 1 from public.channel_events where product_id=p.id and (event in ('sent','uncertain','partial') or jsonb_array_length(message_ids)>0));
 select count(*),coalesce(bool_or(state='sending'),false) into pending,sending from public.telegram_jobs where product_id=p.id and state in ('queued','blocked','ready','sending');
 if p_action='inspect' then return jsonb_build_object('hasHistory',history,'pendingJobs',pending,'sending',sending,'archived',p.archived_at is not null);end if;
 if not p_confirm then raise exception 'Confirme a exclusão ou restauração';end if;
 if sending then raise exception 'Envio em andamento. Aguarde antes de excluir ou arquivar';end if;
 if p_action='restore' then
  update public.products set archived_at=null where id=p.id;
  insert into public.logs(owner_id,brand_id,event,detail) values(p_owner,p.brand_id,'Produto restaurado',p.id::text||' · '||(p.data->>'name'));
  return jsonb_build_object('restored',true,'images','[]'::jsonb);
 end if;
 if p_action not in ('delete','archive') then raise exception 'Ação inválida';end if;
 if pending>0 and not p_cancel then raise exception 'Autorize cancelar os agendamentos vinculados';end if;
 update public.telegram_jobs set state='cancelled',error='Produto removido do catálogo' where product_id=p.id and state in ('queued','blocked','ready','failed');
 if history or p_action='archive' then
  update public.products set archived_at=now() where id=p.id;
  insert into public.logs(owner_id,brand_id,event,detail) values(p_owner,p.brand_id,'Produto arquivado',p.id::text||' · '||(p.data->>'name')||' · históricos preservados');
  return jsonb_build_object('archived',true,'cancelledJobs',pending,'images','[]'::jsonb);
 end if;
 images:=to_jsonb(array_remove(array[p.data->>'imagePath',p.data->>'thumbnailPath'],null));
 -- No confirmed/uncertain publication exists. Audit events retain their labels and snapshots.
 delete from public.telegram_jobs where product_id=p.id;
 delete from public.deliveries where product_id=p.id and state='failed';
 delete from public.price_records where product_id=p.id;
 -- Preserve legacy AI drafts and the billing ledger; invalidate only this deleted product's cache.
 if to_regclass('public.ai_drafts') is not null then
  execute 'update public.ai_drafts set product_id=null where product_id=$1' using p.id;
 end if;
 delete from public.ai_caption_cache where product_id=p.id;
 delete from public.offers where product_id=p.id;
 delete from public.products where id=p.id;
 insert into public.logs(owner_id,brand_id,event,detail) values(p_owner,p.brand_id,'Produto excluído do catálogo',p.id::text||' · '||(p.data->>'name'));
 return jsonb_build_object('deleted',true,'cancelledJobs',pending,'images',images);
end $$;
commit;
