-- Independent channel state; legacy product.status is curation only.
begin;
alter table public.products add column if not exists archived_at timestamptz;
create index if not exists products_active_owner_idx on public.products(owner_id,created_at desc) where archived_at is null;
alter table public.telegram_jobs drop constraint if exists telegram_jobs_offer_id_key;
alter table public.telegram_jobs drop constraint if exists telegram_jobs_product_id_key;
create unique index if not exists publication_job_offer_channel_idx on public.telegram_jobs(offer_id,channel);
create unique index if not exists publication_job_product_channel_idx on public.telegram_jobs(product_id,channel);
alter table public.telegram_jobs add column if not exists media_mode text not null default 'unselected' check(media_mode in ('unselected','photo','link_preview','text'));
alter table public.telegram_jobs add column if not exists photo_confirmed boolean not null default false;
alter table public.publications add column if not exists confirmed_by uuid references auth.users(id);
alter table public.publications add column if not exists confirmed_at timestamptz;
alter table public.publications add column if not exists confirmation_source text not null default 'legacy_review' check(confirmation_source in ('manual','audit_manual','legacy_review'));
alter table public.publications add column if not exists review_required boolean not null default true;
grant select,update on public.publications to service_role;
create table public.republication_intents(id uuid primary key,owner_id uuid not null references auth.users(id),product_id uuid not null references public.products(id),offer_id uuid not null references public.offers(id),channel text not null check(channel in ('telegram','whatsapp')),previous_receipt jsonb not null,created_at timestamptz not null default now(),used_at timestamptz);
create unique index unused_republication_idx on public.republication_intents(owner_id,product_id,channel) where used_at is null;
alter table public.republication_intents enable row level security;
create policy republication_read on public.republication_intents for select to authenticated using(owner_id=(select auth.uid()));
create policy republication_consume on public.republication_intents for update to authenticated using(owner_id=(select auth.uid()) and channel='whatsapp' and used_at is null) with check(owner_id=(select auth.uid()) and channel='whatsapp' and used_at is not null);
revoke all on public.republication_intents from public,anon,authenticated;
grant select,update(used_at) on public.republication_intents to authenticated;grant all on public.republication_intents to service_role;
alter table public.telegram_jobs add column publication_round uuid not null default gen_random_uuid();
alter table public.telegram_jobs add column republication_key uuid references public.republication_intents(id);
alter table public.deliveries add column publication_round uuid not null default gen_random_uuid();
alter table public.publications add column publication_round uuid not null default gen_random_uuid();
alter table public.publications add column republication_key uuid unique references public.republication_intents(id);
alter table public.publications drop constraint if exists publications_product_id_key;
alter table public.publications drop constraint if exists publications_offer_id_key;
create index publications_owner_time_idx on public.publications(owner_id,published_at desc);
create index publications_product_time_idx on public.publications(product_id,published_at desc);

create table public.channel_events(
 id uuid primary key default gen_random_uuid(),owner_id uuid not null references auth.users(id),
 product_id uuid references public.products(id) on delete set null,product_name text not null,
 offer_id uuid references public.offers(id) on delete set null,job_id uuid references public.telegram_jobs(id) on delete set null,
 publication_round uuid,channel text check(channel in ('telegram','whatsapp')),event text not null,attempt integer not null default 0,
 destination text,message_ids jsonb not null default '[]',caption text,snapshot jsonb,error text,
 created_at timestamptz not null default now()
);
create index channel_events_owner_channel_idx on public.channel_events(owner_id,channel,created_at desc);
create index channel_events_product_fk_idx on public.channel_events(product_id);
create index channel_events_offer_fk_idx on public.channel_events(offer_id);
create index channel_events_job_fk_idx on public.channel_events(job_id);
create index republication_product_fk_idx on public.republication_intents(product_id);
create index republication_offer_fk_idx on public.republication_intents(offer_id);
create index republication_owner_fk_idx on public.republication_intents(owner_id);
create index channel_events_product_history_idx on public.channel_events(owner_id,product_id,created_at desc);
alter table public.channel_events enable row level security;
create policy channel_events_read on public.channel_events for select to authenticated using(owner_id=(select auth.uid()));
revoke all on public.channel_events from public,anon,authenticated;
grant select on public.channel_events to authenticated;
grant all on public.channel_events to service_role;
create table public.retired_product_images(path text primary key,owner_id uuid not null references auth.users(id),created_at timestamptz not null default now());
create index retired_product_images_owner_idx on public.retired_product_images(owner_id);
alter table public.retired_product_images enable row level security;
create policy retired_images_read on public.retired_product_images for select to authenticated using(owner_id=(select auth.uid()));
revoke all on public.retired_product_images from public,anon,authenticated;
grant select on public.retired_product_images to authenticated;
grant all on public.retired_product_images to service_role;

create or replace function public.dropou_channel_job_event() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if tg_op='INSERT' or old.state is distinct from new.state or old.message_ids is distinct from new.message_ids then
 insert into public.channel_events(owner_id,product_id,product_name,offer_id,job_id,channel,event,attempt,destination,message_ids,caption,snapshot,error,publication_round)
 values(new.owner_id,new.product_id,coalesce(new.snapshot->>'name','Oferta'),new.offer_id,new.id,new.channel,new.state,new.attempts,new.destination_title,new.message_ids,new.caption,new.snapshot,left(new.error,500),new.publication_round);
 end if;return new;
end $$;
create trigger channel_job_event after insert or update on public.telegram_jobs for each row execute function public.dropou_channel_job_event();

create or replace function public.dropou_economy_product_guard() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if exists(select 1 from public.deliveries where product_id=old.id and channel='telegram' and state='sending') then raise exception 'Envio em andamento; aguarde antes de editar ou excluir';end if;
 if new.data is distinct from old.data and exists(select 1 from public.deliveries where product_id=old.id and channel='telegram' and state in ('uncertain','partial')) then raise exception 'Entrega incerta; confira o canal antes de editar';end if;
 return new;
end $$;
create or replace function public.dropou_economy_legacy_job_guard() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if new.channel='telegram' and new.state in ('queued','sending') and (tg_op='INSERT' or old.state is distinct from new.state) and exists(select 1 from public.deliveries where product_id=new.product_id and channel=new.channel and state<>'failed') then raise exception 'Envio Telegram já registrado; confira o histórico';end if;return new;
end $$;
create or replace function public.dropou_economy_publication_guard() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if new.channel<>'whatsapp' or new.confirmation_source<>'manual' or new.review_required or new.confirmed_by is distinct from auth.uid() or new.confirmed_at is null then raise exception 'WhatsApp exige confirmação manual explícita e autenticada';end if;return new;
end $$;

create or replace function public.dropou_image_reference_guard() returns trigger language plpgsql security invoker set search_path='' as $$
declare candidate_path text;
begin
 for candidate_path in select distinct value from unnest(array[new.data->>'imagePath',new.data->>'thumbnailPath']) value where value is not null order by value loop
  perform pg_advisory_xact_lock(hashtextextended(candidate_path,0));
  if candidate_path not like new.owner_id::text||'/%' or exists(select 1 from public.retired_product_images r where r.path=candidate_path) then raise exception 'Imagem removida ou não pertence à conta. Selecione outra foto';end if;
 end loop;return new;
end $$;
create trigger image_reference_guard before insert or update of data on public.products for each row execute function public.dropou_image_reference_guard();

create or replace function public.dropou_publication_queue_v2(p_owner uuid,p_offer uuid,p_channel text,p_at timestamptz,p_target jsonb,p_caption text,p_source text,p_mode text,p_allow_safe boolean) returns jsonb language plpgsql security invoker set search_path='' as $$
declare p jsonb; o public.offers; j public.telegram_jobs; intent public.republication_intents; republish boolean:=false;
begin
 if not exists(select 1 from public.telegram_dispatch_config where p_owner=any(owner_ids)) then raise exception 'Administrador não autorizado para publicação';end if;
 select data into p from public.products where owner_id=p_owner and id=(select product_id from public.offers where id=p_offer and owner_id=p_owner) for update;
 select * into o from public.offers where id=p_offer and owner_id=p_owner for update;
 select * into j from public.telegram_jobs where product_id=o.product_id and channel=p_channel for update;
 if j.id is not null and j.owner_id<>p_owner then raise exception 'Vínculo de proprietário inválido';end if;
 if nullif(p_target->>'republicationKey','') is not null then
 select * into intent from public.republication_intents where id=(p_target->>'republicationKey')::uuid and owner_id=p_owner and product_id=o.product_id and channel=p_channel and used_at is null for update;
 if intent.id is null then raise exception 'Autorização de republicação inválida ou consumida';end if;
 republish:=true;
 if p_channel='telegram' then
  if not exists(select 1 from public.deliveries where product_id=o.product_id and channel='telegram' and state='sent' and message_ids=intent.previous_receipt->'message_ids') then raise exception 'A publicação anterior mudou';end if;
  delete from public.deliveries where product_id=o.product_id and channel='telegram' and state='sent';
  update public.republication_intents set used_at=now() where id=intent.id;
 end if;
 if j.state='sent' then update public.telegram_jobs set state='cancelled' where id=j.id;j.state:='cancelled';end if;
 end if;
 if j.state in ('sending','sent','uncertain','partial') or exists(select 1 from public.deliveries where product_id=o.product_id and channel=p_channel and state<>'failed') or (p_channel='whatsapp' and not republish and exists(select 1 from public.publications where product_id=o.product_id)) then raise exception 'Envio registrado ou incerto. Confira o canal; não repita';end if;
 if exists(select 1 from public.products where id=o.product_id and archived_at is not null) then raise exception 'Produto arquivado';end if;
 if p is null or o.id is null or o.status='excluido' or o.snapshot is distinct from p or o.caption is distinct from p_source then raise exception 'Oferta alterada. Salve e confira a prévia novamente';end if;
 if not public.dropou_publication_caption_valid(p,p_caption,p_mode) then raise exception 'A conferência venceu ou a legenda não é segura. Confira a prévia sem valores';end if;
 if p_mode='verified' and p_caption<>o.caption then raise exception 'Salve a legenda antes de publicar';end if;
 if p_channel not in ('telegram','whatsapp') or p_at<now()-interval '1 minute' or p_at>now()+interval '30 days' then raise exception 'Agende até 30 dias no futuro';end if;
 if p_channel='telegram' and (coalesce(p_target->>'key','')!~'^[a-f0-9]{64}$' or coalesce(p_target->>'id','')!~'^-?[0-9]+$' or length(coalesce(p_target->>'title',''))=0) then raise exception 'Confira o canal Telegram';end if;
 if p_channel='telegram' and (coalesce(p_target->>'mediaMode','') not in ('photo','link_preview','text') or (p_target->>'mediaMode'='photo' and (coalesce(p->>'imagePath',p->>'image','')='' or not coalesce((p_target->>'photoConfirmed')::boolean,false)))) then raise exception 'Adicione e autorize a foto ou escolha explicitamente outra apresentação';end if;
 insert into public.telegram_jobs(owner_id,offer_id,product_id,state,scheduled_at,caption,snapshot,destination_key,channel,destination_id,destination_title,authorized_until,source_caption,publication_mode,allow_safe,media_mode,photo_confirmed,republication_key)
 values(p_owner,o.id,o.product_id,'queued',p_at,p_caption,p,coalesce(p_target->>'key','whatsapp'),p_channel,p_target->>'id',coalesce(p_target->>'title','Destino escolhido manualmente'),case when p_mode='verified' then (p->>'checkedAt')::timestamptz+interval '15 minutes' end,o.caption,p_mode,p_allow_safe,coalesce(p_target->>'mediaMode','unselected'),coalesce((p_target->>'photoConfirmed')::boolean,false),intent.id)
 on conflict(product_id,channel) do update set offer_id=excluded.offer_id,state='queued',scheduled_at=excluded.scheduled_at,caption=excluded.caption,snapshot=excluded.snapshot,destination_key=excluded.destination_key,channel=excluded.channel,destination_id=excluded.destination_id,destination_title=excluded.destination_title,authorized_until=excluded.authorized_until,source_caption=excluded.source_caption,publication_mode=excluded.publication_mode,allow_safe=excluded.allow_safe,media_mode=excluded.media_mode,photo_confirmed=excluded.photo_confirmed,attempts=case when republish then 0 else public.telegram_jobs.attempts end,republication_key=excluded.republication_key,publication_round=case when republish then excluded.publication_round else public.telegram_jobs.publication_round end,message_ids=case when republish then '[]'::jsonb else public.telegram_jobs.message_ids end,message_id=case when republish then null else public.telegram_jobs.message_id end,started_at=null,error=null returning * into j;
 insert into public.logs(owner_id,event,detail) values(p_owner,'Publicação autorizada',o.product_id::text||' · '||p_channel||' · '||p_mode);return to_jsonb(j);
end $$;

create or replace function public.dropou_publication_claim_v2(p_job uuid,p_target text,p_automatic boolean) returns jsonb language plpgsql security invoker set search_path='' as $$
declare p jsonb; o public.offers; j public.telegram_jobs; enabled boolean;
begin
 select automation_enabled into enabled from public.telegram_dispatch_config where id=true for share;
 if p_automatic and not coalesce(enabled,false) then return null;end if;
 select data into p from public.products where id=(select product_id from public.telegram_jobs where id=p_job) for update skip locked;if p is null then return null;end if;
 select * into j from public.telegram_jobs where id=p_job for update skip locked;if j.id is null or j.state<>'queued' or j.scheduled_at>now() then return null;end if;
 select * into o from public.offers where id=j.offer_id and owner_id=j.owner_id for update;
 if not exists(select 1 from public.telegram_dispatch_config where j.owner_id=any(owner_ids)) then raise exception 'Administrador não autorizado';end if;
 if exists(select 1 from public.products where id=j.product_id and archived_at is not null) then update public.telegram_jobs set state='cancelled',error='Produto arquivado' where id=j.id;return null;end if;
 if j.channel='telegram' and (j.media_mode='unselected' or (j.media_mode='photo' and not j.photo_confirmed)) then update public.telegram_jobs set state='blocked',error='Escolha e autorize a apresentação Telegram' where id=j.id;return null;end if;
 if o.id is null or o.status='excluido' or not public.dropou_publication_identity(p) or o.snapshot is distinct from p or j.snapshot is distinct from p or o.caption is distinct from coalesce(j.source_caption,j.caption) or (j.channel='telegram' and j.destination_key<>p_target) then
  update public.telegram_jobs set state='blocked',error='Dados ou destino mudaram. Reabra a oferta e autorize novamente' where id=j.id;return null;
 end if;
 if j.publication_mode='verified' and (not public.dropou_publication_caption_valid(p,j.caption,'verified') or j.authorized_until is null or j.authorized_until<now()) then
  if not j.allow_safe then update public.telegram_jobs set state='blocked',error='A conferência venceu. Confira a prévia sem valores e autorize novamente' where id=j.id;return null;end if;
  j.publication_mode:='safe';j.caption:=public.dropou_safe_publication_caption(p);
 end if;
 if not public.dropou_publication_caption_valid(p,j.caption,j.publication_mode) then update public.telegram_jobs set state='blocked',error='Legenda inválida para as condições atuais' where id=j.id;return null;end if;
 if j.channel='whatsapp' then update public.telegram_jobs set state='ready',caption=j.caption,publication_mode=j.publication_mode,error=null where id=j.id;return null;end if;
 update public.telegram_jobs set state='sending',caption=j.caption,publication_mode=j.publication_mode,started_at=now(),attempts=attempts+1,error=null where id=j.id returning * into j;
 insert into public.deliveries(owner_id,product_id,channel,state,offer_id,caption,snapshot,destination_id,destination_title,publication_mode,publication_round) values(j.owner_id,j.product_id,'telegram','sending',j.offer_id,j.caption,p,j.destination_id,j.destination_title,j.publication_mode,j.publication_round)
 on conflict(product_id,channel) do update set state='sending',caption=excluded.caption,snapshot=excluded.snapshot,destination_id=excluded.destination_id,destination_title=excluded.destination_title,publication_mode=excluded.publication_mode,publication_round=excluded.publication_round,error=null where public.deliveries.state='failed';if not found then raise exception 'Entrega já reservada';end if;return to_jsonb(j);
end $$;

create or replace function public.dropou_guard_publication() returns trigger language plpgsql security invoker set search_path='' as $$
declare p jsonb; o public.offers;
begin
 select * into o from public.offers where id=new.offer_id and owner_id=auth.uid() for update;
 select data into p from public.products where id=new.product_id and owner_id=auth.uid() for update;
 if exists(select 1 from public.products where id=new.product_id and archived_at is not null) then raise exception 'Produto arquivado';end if;
 if o.id is null or p is null or o.product_id<>new.product_id or new.owner_id<>auth.uid() or o.status='excluido' or o.snapshot is distinct from p then raise exception 'Oferta alterada ou já publicada. Reabra os dados salvos';end if;
 if not public.dropou_publication_caption_valid(p,new.caption,new.publication_mode) then raise exception 'A legenda não corresponde ao modo e às condições confirmadas';end if;
 if new.publication_mode='verified' and new.caption is distinct from o.caption then raise exception 'Salve a legenda antes de publicar';end if;
 new.snapshot:=p;new.published_at:=now();return new;
end $$;

create or replace function public.dropou_publication_manual_v2(p_offer uuid,p_destination text,p_caption text,p_mode text,p_source text) returns jsonb language plpgsql security invoker set search_path='' as $$
declare result public.publications; o public.offers; pid uuid; uid uuid:=auth.uid();
begin
 if length(trim(p_destination)) not between 2 and 120 then raise exception 'Informe o destino da publicação';end if;
 select product_id into pid from public.offers where id=p_offer and owner_id=uid;perform 1 from public.products where id=pid and owner_id=uid for update;
 select * into o from public.offers where id=p_offer and owner_id=uid for update;if o.id is null then raise exception 'Oferta não encontrada';end if;
 select * into result from public.publications where product_id=o.product_id and owner_id=uid order by published_at desc limit 1;if found then if result.review_required then raise exception 'Histórico WhatsApp ambíguo; revise a confirmação antiga';end if;return to_jsonb(result);end if;
 if o.caption is distinct from p_source then raise exception 'A legenda salva mudou. Confira a prévia novamente';end if;
 insert into public.publications(owner_id,offer_id,product_id,caption,snapshot,destination,publication_mode,confirmed_by,confirmed_at,confirmation_source,review_required) values(uid,o.id,o.product_id,p_caption,o.snapshot,trim(p_destination),p_mode,uid,now(),'manual',false) returning * into result;
 insert into public.logs(owner_id,event,detail) values(uid,'Publicação manual registrada',o.product_id::text||' · WhatsApp · '||trim(p_destination)||' · '||p_mode);return to_jsonb(result);
end $$;

create or replace function public.dropou_publication_receipt(p_job uuid,p_ids jsonb,p_state text,p_error text default null) returns void language plpgsql security invoker set search_path='' as $$
declare j public.telegram_jobs;
begin
 perform 1 from public.products where id=(select product_id from public.telegram_jobs where id=p_job) for update;
 select * into j from public.telegram_jobs where id=p_job for update;
 if j.channel<>'telegram' then raise exception 'Recibo Telegram não altera WhatsApp';end if;
 if j.state<>'sending' then raise exception 'Entrega não reservada'; end if;
 if not (j.message_ids <@ p_ids) then raise exception 'Recibos confirmados não podem ser removidos'; end if;
 if p_state not in ('sending','sent','failed','uncertain','partial') or jsonb_typeof(p_ids)<>'array' or (p_state='sent' and jsonb_array_length(p_ids)=0) or (p_state='failed' and jsonb_array_length(p_ids)>0) then raise exception 'Recibo inválido'; end if;
 update public.deliveries set state=p_state,message_ids=p_ids,message_id=p_ids->>0,error=left(p_error,500),sent_at=case when p_state='sent' then now() else null end where product_id=j.product_id and channel='telegram';
 update public.telegram_jobs set state=p_state,message_ids=p_ids,message_id=p_ids->>0,error=left(p_error,500),sent_at=case when p_state='sent' then now() else null end where id=j.id;
 if p_state<>'sending' then insert into public.logs(owner_id,event,detail) values(j.owner_id,'Telegram · '||p_state,j.product_id::text||' · '||coalesce(p_error,p_ids::text)); end if;
end $$;

create or replace function public.dropou_publication_reconfirm(p_owner uuid,p_offer uuid,p_expected jsonb) returns jsonb language plpgsql security invoker set search_path='' as $$
declare p jsonb; o public.offers;
begin
 select data into p from public.products where id=(select product_id from public.offers where id=p_offer and owner_id=p_owner) for update;
 select * into o from public.offers where id=p_offer and owner_id=p_owner for update;
 if exists(select 1 from public.products where id=o.product_id and archived_at is not null) then raise exception 'Produto arquivado';end if;
 if p is null or p is distinct from p_expected or o.status='excluido' or exists(select 1 from public.deliveries where product_id=o.product_id and channel='telegram' and state in ('sending','uncertain','partial')) then raise exception 'Produto mudou ou já foi enviado. Reabra a oferta'; end if;
 p:=p||jsonb_build_object('checkedAt',to_char(now() at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),'inStock',true,'pixVerified',(p->>'paymentMethod'='pix'),'screenshotConfirmed',true,'status','pronto','scheduledAt',null);
 if not public.dropou_publishable(p) then raise exception 'Complete os dados do produto antes de conferir'; end if;
 update public.products set data=p where id=o.product_id;
 update public.offers set snapshot=p,status='pronto',updated_at=now() where id=o.id returning * into o;
 update public.telegram_jobs set state='blocked',error='Dados conferidos. Autorize o envio ou reagende.' where offer_id=o.id and state in ('queued','blocked','ready','failed');
 insert into public.price_records(owner_id,product_id,price,previous_price,payment_method,checked_at,snapshot) values(p_owner,o.product_id,(p->>'price')::numeric,(p->>'previousPrice')::numeric,p->>'paymentMethod',now(),p);
 insert into public.logs(owner_id,event,detail) values(p_owner,'Conferência humana atual',o.product_id::text);
 return to_jsonb(o);
end $$;

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
 insert into public.logs(owner_id,event,detail) values(uid,'Produto salvo',saved->>'name');
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
 insert into public.logs(owner_id,event,detail) values(uid,'Oferta salva',p->>'name');
 return to_jsonb(result);
end $$;

create or replace function public.dropou_channel_cancel(p_owner uuid,p_offer uuid,p_channel text) returns void language plpgsql security invoker set search_path='' as $$
declare pid uuid;
begin
 if p_channel not in ('telegram','whatsapp') then raise exception 'Informe o canal';end if;
 select product_id into pid from public.offers where id=p_offer and owner_id=p_owner;perform 1 from public.products where id=pid and owner_id=p_owner for update;
 update public.telegram_jobs set state='cancelled',error=null where owner_id=p_owner and offer_id=p_offer and channel=p_channel and state in ('queued','blocked','ready','failed');
 if not found then raise exception 'O envio começou ou não há agendamento cancelável neste canal';end if;
 insert into public.logs(owner_id,event,detail) values(p_owner,'Agendamento cancelado · '||p_channel,pid::text);
end $$;

create or replace function public.dropou_product_media(p_owner uuid,p_product uuid,p_expected jsonb,p_path text) returns jsonb language plpgsql security invoker set search_path='' as $$
declare p public.products; o public.offers;
begin
 select * into p from public.products where id=p_product and owner_id=p_owner for update;
 if p.id is null or p.archived_at is not null or p.data is distinct from p_expected then raise exception 'Produto mudou ou foi arquivado. Reabra os dados';end if;
 if p_path !~ ('^'||p_owner::text||'/[a-f0-9-]{36}\.jpg$') then raise exception 'Selecione uma foto autorizada da conta';end if;
 update public.products set data=data||jsonb_build_object('imagePath',p_path) where id=p.id returning * into p;
 update public.offers set snapshot=p.data,updated_at=now() where product_id=p.id and owner_id=p_owner and status<>'excluido' returning * into o;
 update public.telegram_jobs set state='blocked',error='Foto alterada; confira a prévia e autorize este canal novamente' where product_id=p.id and state in ('queued','blocked','ready');
 insert into public.logs(owner_id,event,detail) values(p_owner,'Foto de publicação alterada',p.id::text);
 return jsonb_build_object('product',p.data,'offer',case when o.id is not null then to_jsonb(o) end);
end $$;

create or replace function public.dropou_product_lifecycle(p_owner uuid,p_product uuid,p_action text,p_confirm boolean,p_cancel boolean) returns jsonb language plpgsql security invoker set search_path='' as $$
declare p public.products; history boolean; pending integer; sending boolean; images jsonb;
begin
 select * into p from public.products where id=p_product and owner_id=p_owner for update;
 if p.id is null then raise exception 'Produto não encontrado';end if;
 history:=p.data->>'status'='publicado' or exists(select 1 from public.publications where product_id=p.id) or exists(select 1 from public.deliveries where product_id=p.id and state in ('sent','sending','uncertain','partial')) or exists(select 1 from public.channel_events where product_id=p.id and (event in ('sent','uncertain','partial') or jsonb_array_length(message_ids)>0));
 select count(*),coalesce(bool_or(state='sending'),false) into pending,sending from public.telegram_jobs where product_id=p.id and state in ('queued','blocked','ready','sending');
 if p_action='inspect' then return jsonb_build_object('hasHistory',history,'pendingJobs',pending,'sending',sending,'archived',p.archived_at is not null);end if;
 if not p_confirm then raise exception 'Confirme a exclusão ou restauração';end if;
 if sending then raise exception 'Envio em andamento. Aguarde antes de excluir ou arquivar';end if;
 if p_action='restore' then
  update public.products set archived_at=null where id=p.id;
  insert into public.logs(owner_id,event,detail) values(p_owner,'Produto restaurado',p.id::text||' · '||(p.data->>'name'));
  return jsonb_build_object('restored',true,'images','[]'::jsonb);
 end if;
 if p_action not in ('delete','archive') then raise exception 'Ação inválida';end if;
 if pending>0 and not p_cancel then raise exception 'Autorize cancelar os agendamentos vinculados';end if;
 update public.telegram_jobs set state='cancelled',error='Produto removido do catálogo' where product_id=p.id and state in ('queued','blocked','ready','failed');
 if history or p_action='archive' then
  update public.products set archived_at=now() where id=p.id;
  insert into public.logs(owner_id,event,detail) values(p_owner,'Produto arquivado',p.id::text||' · '||(p.data->>'name')||' · históricos preservados');
  return jsonb_build_object('archived',true,'cancelledJobs',pending,'images','[]'::jsonb);
 end if;
 images:=to_jsonb(array_remove(array[p.data->>'imagePath',p.data->>'thumbnailPath'],null));
 -- No confirmed/uncertain publication exists. Audit events retain their labels and snapshots.
 delete from public.telegram_jobs where product_id=p.id;
 delete from public.deliveries where product_id=p.id and state='failed';
 delete from public.price_records where product_id=p.id;
 delete from public.offers where product_id=p.id;
 delete from public.products where id=p.id;
 insert into public.logs(owner_id,event,detail) values(p_owner,'Produto excluído do catálogo',p.id::text||' · '||(p.data->>'name'));
 return jsonb_build_object('deleted',true,'cancelledJobs',pending,'images',images);
end $$;

create or replace function public.dropou_retire_unused_images(p_owner uuid,p_paths text[]) returns text[] language plpgsql security invoker set search_path='' as $$
declare path text; result text[]:='{}';
begin
 for path in select distinct value from unnest(p_paths) value order by value loop
  if path !~ ('^'||p_owner::text||'/[a-f0-9-]{36}\.(jpg|webp)$') then raise exception 'Arquivo não pertence à conta';end if;
  perform pg_advisory_xact_lock(hashtextextended(path,0));
  if exists(select 1 from public.products where data->>'imagePath'=path or data->>'thumbnailPath'=path)
   or exists(select 1 from public.offers where snapshot->>'imagePath'=path or snapshot->>'thumbnailPath'=path)
   or exists(select 1 from public.publications where snapshot->>'imagePath'=path or snapshot->>'thumbnailPath'=path)
   or exists(select 1 from public.deliveries where snapshot->>'imagePath'=path or snapshot->>'thumbnailPath'=path)
   or exists(select 1 from public.channel_events where snapshot->>'imagePath'=path or snapshot->>'thumbnailPath'=path) then continue;end if;
  insert into public.retired_product_images(path,owner_id) values(path,p_owner) on conflict do nothing;result:=array_append(result,path);
 end loop;return result;
end $$;

create or replace function public.dropou_channel_metrics() returns jsonb language sql stable security invoker set search_path='' as $$
 with catalog as(select p.id,p.data,o.id offer_id from public.products p left join public.offers o on o.product_id=p.id and o.status<>'excluido' where p.owner_id=(select auth.uid()) and p.archived_at is null and p.data->>'store'='Mercado Livre' and coalesce((p.data->>'demo')::boolean,false)=false),
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
 select jsonb_build_object('products',(select count(*) from public.products where owner_id=(select auth.uid()) and archived_at is null and data->>'store'='Mercado Livre' and coalesce((data->>'demo')::boolean,false)=false),
 'published',(select count(distinct product_id) from (select product_id from public.channel_events where owner_id=(select auth.uid()) and channel='telegram' and event in ('sent','legacy_telegram_verified') and jsonb_array_length(message_ids)>0 union all select product_id from public.publications where owner_id=(select auth.uid()) and not review_required and confirmed_by is not null) sent),
 'scheduled',(select count(*) from public.telegram_jobs where owner_id=(select auth.uid()) and state='queued'),
 'waiting',(select count(*) from public.products where owner_id=(select auth.uid()) and archived_at is null and not public.dropou_publishable(data)))
$$;

-- Legacy manual rows require positive audit evidence; ambiguous records are retained for review.
update public.publications w set confirmation_source='audit_manual',review_required=false,confirmed_by=w.owner_id,confirmed_at=w.published_at
where exists(select 1 from public.logs l where l.owner_id=w.owner_id and l.event='Publicação manual registrada' and l.detail like w.product_id::text||' · WhatsApp · %' and abs(extract(epoch from(l.created_at-w.published_at)))<=5);
insert into public.channel_events(owner_id,product_id,product_name,offer_id,channel,event,caption,snapshot,error)
select owner_id,product_id,coalesce(snapshot->>'name','Oferta'),offer_id,'whatsapp',case when review_required then 'legacy_review' else 'legacy_manual_verified' end,caption,snapshot,case when review_required then 'Origem ambígua; confirmar manualmente antes de contabilizar' end from public.publications;
insert into public.channel_events(owner_id,product_id,product_name,offer_id,channel,event,message_ids,caption,snapshot,destination,created_at)
select owner_id,product_id,coalesce(snapshot->>'name','Oferta'),offer_id,'telegram','legacy_telegram_verified',message_ids,caption,snapshot,destination_title,coalesce(sent_at,created_at) from public.deliveries where state='sent' and jsonb_array_length(message_ids)>0;
insert into public.channel_events(owner_id,product_id,product_name,channel,event,snapshot)
select p.owner_id,p.id,p.data->>'name','telegram','legacy_global_status_corrected',p.data from public.products p where p.data->>'status'='publicado' and exists(select 1 from public.deliveries d where d.product_id=p.id and d.state='sent' and jsonb_array_length(d.message_ids)>0);
update public.products p set data=p.data||jsonb_build_object('status',case when public.dropou_publishable(p.data) then 'pronto' else 'encontrado' end,'scheduledAt',null)
where p.data->>'status'='publicado' and (exists(select 1 from public.deliveries d where d.product_id=p.id and d.state='sent' and jsonb_array_length(d.message_ids)>0) or exists(select 1 from public.publications w where w.product_id=p.id and not w.review_required));
update public.offers o set status=case when public.dropou_publishable(p.data) then 'pronto' else 'rascunho' end,snapshot=p.data,updated_at=now() from public.products p where o.product_id=p.id and o.status='publicado' and p.data->>'status'<>'publicado';

-- Grant only the intended entry points. No SECURITY DEFINER or client writes to jobs/events.
revoke all on function public.dropou_channel_metrics(),public.dropou_workspace_metrics() from public,anon;
grant execute on function public.dropou_channel_metrics(),public.dropou_workspace_metrics() to authenticated,service_role;
do $$ declare f record;begin
 for f in select oid::regprocedure signature from pg_proc where pronamespace='public'::regnamespace and proname in ('dropou_channel_cancel','dropou_product_media','dropou_product_lifecycle','dropou_retire_unused_images','dropou_publication_queue_v2','dropou_publication_claim_v2','dropou_publication_receipt','dropou_publication_downgrade','dropou_publication_reconfirm') loop
 execute format('revoke all on function %s from public,anon,authenticated',f.signature);execute format('grant execute on function %s to service_role',f.signature);end loop;
 for f in select oid::regprocedure signature from pg_proc where pronamespace='public'::regnamespace and proname in ('dropou_publication_queue','dropou_publication_claim','dropou_publication_cancel','dropou_economy_claim_telegram','dropou_economy_finish_telegram','dropou_publish_offer','dropou_publication_manual') loop execute format('revoke all on function %s from public,anon,authenticated,service_role',f.signature);end loop;
end $$;

create or replace function public.dropou_review_manual_publication(p_owner uuid,p_publication uuid,p_destination text,p_confirm boolean) returns jsonb language plpgsql security invoker set search_path='' as $$
declare w public.publications;
begin
 if not p_confirm or length(trim(p_destination)) not between 2 and 120 then raise exception 'Confirme a publicação manual antiga e informe o destino';end if;
 select * into w from public.publications where id=p_publication and owner_id=p_owner for update;
 if w.id is null then raise exception 'Registro não encontrado';end if;
 if not w.review_required then return to_jsonb(w);end if;
 update public.publications set review_required=false,confirmation_source='manual',confirmed_by=p_owner,confirmed_at=now(),destination=trim(p_destination) where id=w.id returning * into w;
 insert into public.channel_events(owner_id,product_id,product_name,offer_id,channel,event,caption,snapshot,destination)
 values(p_owner,w.product_id,coalesce(w.snapshot->>'name','Oferta'),w.offer_id,'whatsapp','legacy_manual_confirmed',w.caption,w.snapshot,w.destination);
 insert into public.logs(owner_id,event,detail) values(p_owner,'Legado WhatsApp confirmado manualmente',w.product_id::text||' · '||w.id::text);
 return to_jsonb(w);
end $$;
revoke all on function public.dropou_review_manual_publication(uuid,uuid,text,boolean) from public,anon,authenticated;
grant execute on function public.dropou_review_manual_publication(uuid,uuid,text,boolean) to service_role;


create or replace function public.dropou_prepare_republication(p_owner uuid,p_offer uuid,p_channel text,p_request uuid) returns jsonb language plpgsql security invoker set search_path='' as $$
declare o public.offers; pid uuid; proof jsonb; existing public.republication_intents;
begin
 if p_channel not in ('telegram','whatsapp') then raise exception 'Escolha o canal';end if;
 select product_id into pid from public.offers where id=p_offer and owner_id=p_owner;perform 1 from public.products where id=pid and owner_id=p_owner and archived_at is null for update;if not found then raise exception 'Produto indisponível';end if;
 select * into o from public.offers where id=p_offer and owner_id=p_owner and status<>'excluido';if o.id is null then raise exception 'Oferta não encontrada';end if;
 select * into existing from public.republication_intents where id=p_request and owner_id=p_owner;
 if existing.id is not null then if existing.offer_id<>o.id or existing.channel<>p_channel then raise exception 'Autorização pertence a outra oferta ou canal';end if;if existing.used_at is not null then raise exception 'Esta autorização já foi utilizada';end if;return to_jsonb(existing);end if;
 select * into existing from public.republication_intents where product_id=pid and owner_id=p_owner and channel=p_channel and used_at is null;
 if existing.id is not null then return to_jsonb(existing);end if;
 if p_channel='telegram' then select to_jsonb(d) into proof from public.deliveries d where product_id=pid and channel='telegram' and state='sent' and jsonb_array_length(message_ids)>0;
 else select to_jsonb(w) into proof from public.publications w where product_id=pid and not review_required and confirmed_by is not null order by published_at desc limit 1;end if;
 if proof is null then raise exception 'Não há publicação confirmada neste canal para republicar';end if;
 insert into public.republication_intents(id,owner_id,product_id,offer_id,channel,previous_receipt) values(p_request,p_owner,pid,o.id,p_channel,proof) returning * into existing;
 insert into public.channel_events(owner_id,product_id,product_name,offer_id,channel,event,snapshot,destination) values(p_owner,pid,o.snapshot->>'name',o.id,p_channel,'republication_authorized',o.snapshot,'Autorização explícita; nenhum envio realizado');
 return to_jsonb(existing);
end $$;
create or replace function public.dropou_manual_round_guard() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if exists(select 1 from public.publications where product_id=new.product_id) then
  if new.republication_key is null then raise exception 'WhatsApp já confirmado. Autorize uma republicação intencional antes de registrar novamente';end if;
  perform 1 from public.republication_intents where id=new.republication_key and owner_id=new.owner_id and product_id=new.product_id and channel='whatsapp' and used_at is null for update;
  if not found then raise exception 'Autorização de republicação inválida ou já utilizada';end if;
  update public.republication_intents set used_at=now() where id=new.republication_key;
 elsif new.republication_key is not null then raise exception 'Não há confirmação anterior neste canal';end if;
 return new;
end $$;
create trigger manual_round_guard before insert on public.publications for each row execute function public.dropou_manual_round_guard();
create or replace function public.dropou_intent_consumption_guard() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if old.used_at is not null or new.used_at is null or new.id<>old.id or new.owner_id<>old.owner_id or new.product_id<>old.product_id or new.channel<>old.channel or new.previous_receipt is distinct from old.previous_receipt then raise exception 'Autorização consumida é imutável';end if;return new;
end $$;
create trigger intent_consumption_guard before update on public.republication_intents for each row execute function public.dropou_intent_consumption_guard();
revoke all on function public.dropou_prepare_republication(uuid,uuid,text,uuid) from public,anon,authenticated;
grant execute on function public.dropou_prepare_republication(uuid,uuid,text,uuid) to service_role;

create or replace function public.dropou_publication_manual_round(p_offer uuid,p_destination text,p_caption text,p_mode text,p_source text,p_intent uuid) returns jsonb language plpgsql security invoker set search_path='' as $$
declare result public.publications; o public.offers; pid uuid; uid uuid:=auth.uid();
begin
 if length(trim(p_destination)) not between 2 and 120 then raise exception 'Informe o destino da publicação';end if;
 select product_id into pid from public.offers where id=p_offer and owner_id=uid;perform 1 from public.products where id=pid and owner_id=uid for update;
 select * into o from public.offers where id=p_offer and owner_id=uid for update;if o.id is null then raise exception 'Oferta não encontrada';end if;
 if p_intent is null then raise exception 'Autorize a republicação intencional';end if;
 select * into result from public.publications where republication_key=p_intent and owner_id=uid;if found then return to_jsonb(result);end if;
 if o.caption is distinct from p_source then raise exception 'A legenda salva mudou. Confira a prévia novamente';end if;
 insert into public.publications(owner_id,offer_id,product_id,caption,snapshot,destination,publication_mode,confirmed_by,confirmed_at,confirmation_source,review_required,republication_key) values(uid,o.id,o.product_id,p_caption,o.snapshot,trim(p_destination),p_mode,uid,now(),'manual',false,p_intent) returning * into result;
 insert into public.logs(owner_id,event,detail) values(uid,'Publicação manual registrada',o.product_id::text||' · WhatsApp · '||trim(p_destination)||' · '||p_mode);return to_jsonb(result);
end $$;
revoke all on function public.dropou_publication_manual_round(uuid,text,text,text,text,uuid) from public,anon;grant execute on function public.dropou_publication_manual_round(uuid,text,text,text,text,uuid) to authenticated;
update public.deliveries d set publication_round=j.publication_round from public.telegram_jobs j where j.product_id=d.product_id and j.channel='telegram';
update public.channel_events e set publication_round=d.publication_round from public.deliveries d where e.product_id=d.product_id and e.event='legacy_telegram_verified';
commit;
