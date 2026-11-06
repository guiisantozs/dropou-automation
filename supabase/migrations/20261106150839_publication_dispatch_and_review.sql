begin;
-- Extend the existing queue; pg_cron remains the only scheduler.
create table if not exists public.telegram_dispatch_config(id boolean primary key default true check(id),secret text not null,owner_ids uuid[] not null,destination_key text not null,updated_at timestamptz not null default now());
alter table public.telegram_dispatch_config add column if not exists automation_enabled boolean not null default false;
create table if not exists public.telegram_jobs(id uuid primary key default gen_random_uuid(),owner_id uuid not null references auth.users(id),offer_id uuid not null unique references public.offers(id),product_id uuid not null unique references public.products(id),state text not null,scheduled_at timestamptz not null,caption text not null,snapshot jsonb not null,destination_key text not null,created_at timestamptz not null default now(),started_at timestamptz,sent_at timestamptz,message_id text,error text);
alter table public.telegram_jobs drop constraint if exists telegram_jobs_state_check;
alter table public.telegram_jobs add constraint telegram_jobs_state_check check(state in ('queued','sending','sent','blocked','cancelled','uncertain','failed','partial','ready'));
alter table public.telegram_jobs add column if not exists channel text not null default 'telegram' check(channel in ('telegram','whatsapp'));
alter table public.telegram_jobs add column if not exists destination_title text;
alter table public.telegram_jobs add column if not exists destination_id text;
alter table public.telegram_jobs add column if not exists authorized_until timestamptz;
alter table public.telegram_jobs add column if not exists attempts integer not null default 0;
alter table public.telegram_jobs add column if not exists message_ids jsonb not null default '[]';
alter table public.deliveries drop constraint if exists deliveries_state_check;
alter table public.deliveries add constraint deliveries_state_check check(state in ('sending','sent','uncertain','failed','partial'));
alter table public.deliveries add column if not exists destination_id text;
alter table public.deliveries add column if not exists destination_title text;
alter table public.deliveries add column if not exists message_ids jsonb not null default '[]';
alter table public.deliveries add column if not exists error text;
alter table public.publications add column if not exists destination text;
create index if not exists publication_jobs_due_idx on public.telegram_jobs(scheduled_at) where state='queued';
alter table public.telegram_jobs enable row level security;
alter table public.telegram_dispatch_config enable row level security;
drop policy if exists telegram_jobs_read on public.telegram_jobs;
drop policy if exists publication_jobs_read on public.telegram_jobs;
create policy publication_jobs_read on public.telegram_jobs for select to authenticated using(owner_id=(select auth.uid()));
revoke all on public.telegram_jobs,public.telegram_dispatch_config from anon,authenticated;
grant select on public.telegram_jobs to authenticated;
grant all on public.telegram_jobs,public.telegram_dispatch_config to service_role;
-- Old authenticated queue entry points must not bypass the new authorization checks.
do $$ declare r record; begin for r in select oid::regprocedure signature from pg_proc where pronamespace='public'::regnamespace and proname in ('dropou_queue_telegram','dropou_cancel_telegram') loop execute format('revoke execute on function %s from public,anon,authenticated',r.signature); end loop; end $$;
create or replace function public.dropou_economy_legacy_job_guard() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if new.state in ('queued','sending') and (tg_op='INSERT' or old.state is distinct from new.state) and exists(select 1 from public.deliveries where product_id=new.product_id and channel='telegram' and state<>'failed') then raise exception 'Envio Telegram já registrado; confira o histórico'; end if; return new;
end $$;
create or replace function public.dropou_economy_product_guard() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if exists(select 1 from public.deliveries where product_id=old.id and channel='telegram' and state in ('sending','uncertain','partial')) then raise exception 'Envio em andamento ou incerto; confira o canal antes de editar'; end if;
 if exists(select 1 from public.deliveries d where d.product_id=old.id and d.channel='telegram' and d.state='sent' and d.snapshot is not null and new.data is distinct from d.snapshot||'{"status":"publicado","scheduledAt":null}'::jsonb) then raise exception 'Produto publicado permanece no histórico'; end if; return new;
end $$;
create or replace function public.dropou_economy_publication_guard() returns trigger language plpgsql security invoker set search_path='' as $$
declare p jsonb;
begin
 select data into p from public.products where id=new.product_id;
 if coalesce(p->>'dataOrigin','manual')='screenshot' and coalesce((p->>'screenshotConfirmed')::boolean,false)=false then raise exception 'Confirme os dados do print antes de publicar'; end if;
 if exists(select 1 from public.deliveries where product_id=new.product_id and state<>'failed') or exists(select 1 from public.telegram_jobs where product_id=new.product_id and channel='telegram' and state in ('queued','sending','uncertain','partial','sent')) then raise exception 'Cancele o agendamento Telegram ou confira a entrega antes de publicar'; end if; return new;
end $$;
create or replace function public.dropou_publication_queue(p_owner uuid,p_offer uuid,p_channel text,p_at timestamptz,p_target jsonb,p_caption text) returns jsonb language plpgsql security invoker set search_path='' as $$
declare p jsonb; o public.offers; j public.telegram_jobs;
begin
 if not exists(select 1 from public.telegram_dispatch_config where p_owner=any(owner_ids)) then raise exception 'Administrador não autorizado para publicação'; end if;
 select data into p from public.products where owner_id=p_owner and id=(select product_id from public.offers where id=p_offer and owner_id=p_owner) for update;
 select * into o from public.offers where id=p_offer and owner_id=p_owner for update;
 select * into j from public.telegram_jobs where product_id=o.product_id for update;
 if j.state in ('sending','sent','uncertain','partial') or exists(select 1 from public.deliveries where product_id=o.product_id and state<>'failed') then raise exception 'Envio registrado ou incerto. Confira o canal; não repita'; end if;
 if p is null or p->>'store' is distinct from 'Mercado Livre' or o.status<>'pronto' or o.snapshot is distinct from p or o.caption is distinct from p_caption or not public.dropou_publishable(p) or p->>'status' not in ('pronto','agendado') or exists(select 1 from public.publications where product_id=o.product_id) then raise exception 'Revalide e salve a oferta antes de publicar ou agendar'; end if;
 if p_channel not in ('telegram','whatsapp') or p_at<now()-interval '1 minute' or p_at>now()+interval '30 days' then raise exception 'Agende até 30 dias no futuro'; end if;
 if p_channel='telegram' and (coalesce(p_target->>'key','')!~'^[a-f0-9]{64}$' or coalesce(p_target->>'id','')!~'^-?[0-9]+$' or length(coalesce(p_target->>'title',''))=0) then raise exception 'Confira o canal Telegram'; end if;
 p:=p||jsonb_build_object('status','agendado','scheduledAt',to_char(p_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),'needsHumanReview',true);
 update public.products set data=p where id=o.product_id;
 update public.offers set snapshot=p,updated_at=now() where id=o.id;
 insert into public.telegram_jobs(owner_id,offer_id,product_id,state,scheduled_at,caption,snapshot,destination_key,channel,destination_id,destination_title,authorized_until)
 values(p_owner,o.id,o.product_id,'queued',p_at,o.caption,p,coalesce(p_target->>'key','whatsapp'),p_channel,p_target->>'id',coalesce(p_target->>'title','Destino escolhido manualmente'),(p->>'checkedAt')::timestamptz+interval '15 minutes')
 on conflict(offer_id) do update set state='queued',scheduled_at=excluded.scheduled_at,caption=excluded.caption,snapshot=excluded.snapshot,destination_key=excluded.destination_key,channel=excluded.channel,destination_id=excluded.destination_id,destination_title=excluded.destination_title,authorized_until=excluded.authorized_until,started_at=null,error=null returning * into j;
 insert into public.logs(owner_id,event,detail) values(p_owner,'Publicação autorizada',o.product_id::text||' · '||p_channel||' · '||p_at::text);
 return to_jsonb(j);
end $$;
create or replace function public.dropou_publication_cancel(p_owner uuid,p_offer uuid) returns void language plpgsql security invoker set search_path='' as $$
declare pid uuid;
begin
 select product_id into pid from public.offers where id=p_offer and owner_id=p_owner;
 perform 1 from public.products where id=pid for update;
 update public.telegram_jobs set state='cancelled',error=null where offer_id=p_offer and owner_id=p_owner and state in ('queued','blocked','ready','failed');
 if not found then raise exception 'O envio já começou ou não pode ser cancelado'; end if;
 update public.products set data=data||'{"status":"pronto","scheduledAt":null}'::jsonb where id=pid;
 update public.offers set snapshot=(select data from public.products where id=pid),updated_at=now() where id=p_offer;
 insert into public.logs(owner_id,event,detail) values(p_owner,'Agendamento cancelado',pid::text);
end $$;
create or replace function public.dropou_publication_claim(p_job uuid,p_target text,p_automatic boolean) returns jsonb language plpgsql security invoker set search_path='' as $$
declare p jsonb; o public.offers; j public.telegram_jobs; enabled boolean;
begin
 select automation_enabled into enabled from public.telegram_dispatch_config where id=true for share;
 if p_automatic and not coalesce(enabled,false) then return null; end if;
 select data into p from public.products where id=(select product_id from public.telegram_jobs where id=p_job) for update skip locked;
 if p is null then return null; end if;
 select * into j from public.telegram_jobs where id=p_job for update skip locked;
 if j.id is null or j.state<>'queued' or j.scheduled_at>now() then return null; end if;
 select * into o from public.offers where id=j.offer_id and owner_id=j.owner_id for update;
 if not exists(select 1 from public.telegram_dispatch_config where j.owner_id=any(owner_ids)) then raise exception 'Administrador não autorizado'; end if;
 if j.channel='whatsapp' then update public.telegram_jobs set state='ready',error='Prepare e confira o preço antes de compartilhar manualmente' where id=j.id; return null; end if;
 if j.authorized_until<now() or not public.dropou_publishable(p) or o.status<>'pronto' or o.snapshot is distinct from p or j.snapshot is distinct from p or o.caption is distinct from j.caption or j.destination_key<>p_target then
  update public.telegram_jobs set state='blocked',error='Aguardando conferência: abra a loja, confirme os dados atuais e autorize novamente' where id=j.id; return null;
 end if;
 update public.telegram_jobs set state='sending',started_at=now(),attempts=attempts+1,error=null where id=j.id returning * into j;
 insert into public.deliveries(owner_id,product_id,channel,state,offer_id,caption,snapshot,destination_id,destination_title) values(j.owner_id,j.product_id,'telegram','sending',j.offer_id,j.caption,p,j.destination_id,j.destination_title)
 on conflict(product_id,channel) do update set state='sending',caption=excluded.caption,snapshot=excluded.snapshot,destination_id=excluded.destination_id,destination_title=excluded.destination_title,error=null where public.deliveries.state='failed';
 if not found then raise exception 'Entrega já reservada'; end if; return to_jsonb(j);
end $$;
create or replace function public.dropou_publication_receipt(p_job uuid,p_ids jsonb,p_state text,p_error text default null) returns void language plpgsql security invoker set search_path='' as $$
declare j public.telegram_jobs;
begin
 perform 1 from public.products where id=(select product_id from public.telegram_jobs where id=p_job) for update;
 select * into j from public.telegram_jobs where id=p_job for update;
 if j.state<>'sending' then raise exception 'Entrega não reservada'; end if;
 if not (j.message_ids <@ p_ids) then raise exception 'Recibos confirmados não podem ser removidos'; end if;
 if p_state not in ('sending','sent','failed','uncertain','partial') or jsonb_typeof(p_ids)<>'array' or (p_state='sent' and jsonb_array_length(p_ids)=0) or (p_state='failed' and jsonb_array_length(p_ids)>0) then raise exception 'Recibo inválido'; end if;
 update public.deliveries set state=p_state,message_ids=p_ids,message_id=p_ids->>0,error=left(p_error,500),sent_at=case when p_state='sent' then now() else null end where product_id=j.product_id and channel='telegram';
 update public.telegram_jobs set state=p_state,message_ids=p_ids,message_id=p_ids->>0,error=left(p_error,500),sent_at=case when p_state='sent' then now() else null end where id=j.id;
 if p_state='sent' then
  update public.offers set status='publicado',updated_at=now() where id=j.offer_id;
  update public.products set data=j.snapshot||'{"status":"publicado","scheduledAt":null}'::jsonb where id=j.product_id;
 end if;
 if p_state<>'sending' then insert into public.logs(owner_id,event,detail) values(j.owner_id,'Telegram · '||p_state,j.product_id::text||' · '||coalesce(p_error,p_ids::text)); end if;
end $$;
-- Human confirmation keeps the saved text and original; only an explicit current-store check renews freshness.
create or replace function public.dropou_publication_reconfirm(p_owner uuid,p_offer uuid,p_expected jsonb) returns jsonb language plpgsql security invoker set search_path='' as $$
declare p jsonb; o public.offers;
begin
 select data into p from public.products where id=(select product_id from public.offers where id=p_offer and owner_id=p_owner) for update;
 select * into o from public.offers where id=p_offer and owner_id=p_owner for update;
 if p is null or p is distinct from p_expected or o.status in ('publicado','excluido') or exists(select 1 from public.deliveries where product_id=o.product_id and state<>'failed') then raise exception 'Produto mudou ou já foi enviado. Reabra a oferta'; end if;
 p:=p||jsonb_build_object('checkedAt',to_char(now() at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),'inStock',true,'pixVerified',(p->>'paymentMethod'='pix'),'screenshotConfirmed',true,'status','pronto','scheduledAt',null);
 if not public.dropou_publishable(p) then raise exception 'Complete os dados do produto antes de conferir'; end if;
 update public.products set data=p where id=o.product_id;
 update public.offers set snapshot=p,status='pronto',updated_at=now() where id=o.id returning * into o;
 update public.telegram_jobs set state='blocked',error='Dados conferidos. Autorize o envio ou reagende.' where offer_id=o.id and state in ('queued','blocked','ready','failed');
 insert into public.price_records(owner_id,product_id,price,previous_price,payment_method,checked_at,snapshot) values(p_owner,o.product_id,(p->>'price')::numeric,(p->>'previousPrice')::numeric,p->>'paymentMethod',now(),p);
 insert into public.logs(owner_id,event,detail) values(p_owner,'Conferência humana atual',o.product_id::text);
 return to_jsonb(o);
end $$;
create or replace function public.dropou_publication_manual(p_offer uuid,p_destination text) returns jsonb language plpgsql security invoker set search_path='' as $$
declare result public.publications; o public.offers; pid uuid; uid uuid:=auth.uid();
begin
 if length(trim(p_destination)) not between 2 and 120 then raise exception 'Informe o destino da publicação'; end if;
 select product_id into pid from public.offers where id=p_offer and owner_id=uid;
 perform 1 from public.products where id=pid and owner_id=uid for update;
 select * into o from public.offers where id=p_offer and owner_id=uid for update;
 if o.id is null then raise exception 'Oferta não encontrada'; end if;
 select * into result from public.publications where offer_id=p_offer and owner_id=uid;if found then return to_jsonb(result);end if;
 insert into public.publications(owner_id,offer_id,product_id,caption,snapshot,destination) values(uid,o.id,o.product_id,o.caption,o.snapshot,trim(p_destination)) returning * into result;
 update public.offers set status='publicado',updated_at=now() where id=o.id and owner_id=uid;
 update public.products set data=data||'{"status":"publicado","scheduledAt":null}'::jsonb where id=o.product_id and owner_id=uid;
 insert into public.logs(owner_id,event,detail) values(uid,'Publicação manual registrada',o.product_id::text||' · WhatsApp · '||trim(p_destination));
 return to_jsonb(result);
end $$;
revoke all on function public.dropou_publication_manual(uuid,text) from public,anon;
grant execute on function public.dropou_publication_manual(uuid,text) to authenticated;
-- Service functions run with service-role privileges, never SECURITY DEFINER.
do $$ declare r record; begin for r in select oid::regprocedure signature from pg_proc where pronamespace='public'::regnamespace and proname in ('dropou_publication_queue','dropou_publication_cancel','dropou_publication_claim','dropou_publication_receipt','dropou_publication_reconfirm') loop execute format('revoke all on function %s from public,anon,authenticated',r.signature); execute format('grant execute on function %s to service_role',r.signature); end loop; end $$;
grant all on public.price_records to service_role;
drop trigger if exists dropou_economy_legacy_job_guard on public.telegram_jobs;
create trigger dropou_economy_legacy_job_guard before insert or update on public.telegram_jobs for each row execute function public.dropou_economy_legacy_job_guard();
create index if not exists products_owner_created_idx on public.products(owner_id,created_at desc);
create index if not exists publication_jobs_owner_schedule_idx on public.telegram_jobs(owner_id,scheduled_at desc);
create or replace function public.dropou_workspace_metrics() returns jsonb language sql stable security invoker set search_path='' as $$
 select jsonb_build_object('products',count(*),'published',count(*) filter(where data->>'status'='publicado'),'scheduled',count(*) filter(where data->>'status'='agendado'),'waiting',count(*) filter(where data->>'status'<>'publicado' and not public.dropou_publishable(data))) from public.products where owner_id=(select auth.uid()) and data->>'store'='Mercado Livre' and coalesce((data->>'demo')::boolean,false)=false
$$;
revoke all on function public.dropou_workspace_metrics() from public,anon;
grant execute on function public.dropou_workspace_metrics() to authenticated;
commit;
