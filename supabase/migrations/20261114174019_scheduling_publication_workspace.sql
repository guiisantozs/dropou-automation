-- Incremental scheduling/history workspace. No existing records are removed.
begin;
alter table public.telegram_jobs add column queued_by uuid references auth.users(id);
alter table public.product_channel_marks add column actor_id uuid references auth.users(id);
alter table public.channel_events add column actor_id uuid references auth.users(id);
alter table public.publications add column revoked_at timestamptz;
alter table public.publications add column revoked_by uuid references auth.users(id);
create index telegram_jobs_queued_by_idx on public.telegram_jobs(queued_by) where queued_by is not null;
create index product_channel_marks_actor_idx on public.product_channel_marks(actor_id) where actor_id is not null;
create index channel_events_actor_idx on public.channel_events(actor_id) where actor_id is not null;
create index publications_revoked_by_idx on public.publications(revoked_by) where revoked_by is not null;
create index publications_active_confirmation_idx on public.publications(owner_id,brand_id,product_id,confirmed_at desc) where revoked_at is null;

create view public.dropou_active_manual_publications with(security_invoker=true) as select * from public.publications where revoked_at is null;
revoke all on public.dropou_active_manual_publications from public,anon;
grant select on public.dropou_active_manual_publications to authenticated,service_role;
-- Only publication preflights ignore revoked confirmations. Historical/lifecycle
-- queries keep the original table so evidence and media references are preserved.
do $$ declare f record;definition text;begin
 for f in select oid from pg_proc where pronamespace='public'::regnamespace and proname in
 ('dropou_singlebrand_queue','dropou_publication_queue','dropou_singlebrand_claim','dropou_publication_claim','dropou_publication_manual_v2','dropou_publication_manual_round','dropou_review_manual_publication') loop
  definition:=replace(pg_get_functiondef(f.oid),'from public.publications','from public.dropou_active_manual_publications');execute definition;
 end loop;
end $$;

create view public.dropou_publication_records with(security_invoker=true) as
 select distinct on(e.owner_id,e.brand_id,coalesce(e.publication_round,e.id))
 e.id,e.owner_id,e.brand_id,e.product_id,e.channel,e.effective_at occurred_at,e.created_at recorded_at,e.scheduled_at,
 e.destination,e.destination_id,e.message_ids,e.snapshot,e.actor_id,coalesce(e.publication_round,e.id) publication_round,'telegram_receipt'::text source
 from public.channel_events e
 where e.channel='telegram' and e.event in ('sent','legacy_telegram_verified') and jsonb_array_length(e.message_ids)>0
 order by e.owner_id,e.brand_id,coalesce(e.publication_round,e.id),e.effective_at desc nulls last,e.created_at desc,e.id;
-- Add the other sources separately to retain all historic publication rounds.
create view public.dropou_confirmed_publications with(security_invoker=true) as
 select * from public.dropou_publication_records
 union all
 select d.product_id,d.owner_id,d.brand_id,d.product_id,d.channel,d.sent_at,d.sent_at,null::timestamptz,d.destination_title,d.destination_id,d.message_ids,d.snapshot,null::uuid,d.product_id,'telegram_receipt'
 from public.deliveries d where d.channel='telegram' and d.state='sent' and jsonb_array_length(d.message_ids)>0
 and not exists(select 1 from public.dropou_publication_records e where e.owner_id=d.owner_id and e.brand_id=d.brand_id and e.product_id=d.product_id)
 union all
 select w.id,w.owner_id,w.brand_id,w.product_id,w.channel,w.confirmed_at,w.published_at,null,w.destination,null,'[]'::jsonb,w.snapshot,w.confirmed_by,w.publication_round,'whatsapp_manual'
 from public.publications w where w.channel='whatsapp' and w.revoked_at is null and not w.review_required and w.confirmed_by is not null and w.confirmation_source in ('manual','audit_manual')
 union all
 select m.id,m.owner_id,m.brand_id,m.product_id,m.channel,m.published_at,m.published_at,null,coalesce(s.whatsapp_name,'WhatsApp'),null,'[]'::jsonb,m.snapshot,m.actor_id,m.id,'manual_mark'
 from public.product_channel_marks m join public.operation_settings s on s.owner_id=m.owner_id and s.brand_id=m.brand_id
 where m.channel='whatsapp' and m.revoked_at is null;
revoke all on public.dropou_publication_records,public.dropou_confirmed_publications from public,anon;
grant select on public.dropou_publication_records,public.dropou_confirmed_publications to authenticated,service_role;
create or replace view public.dropou_operation_publications with(security_invoker=true) as
 select owner_id,brand_id,product_id,channel,occurred_at published_at,source,publication_round id from public.dropou_confirmed_publications;

create or replace function public.dropou_product_channel_summaries(p_ids uuid[]) returns table(product_id uuid,telegram jsonb,whatsapp jsonb)
language sql stable security invoker set search_path='' as $$
 select p.id,
 jsonb_build_object('published',tg.id is not null,'publishedAt',tg.occurred_at,'state',case when tj.state in ('sending','uncertain','partial') then tj.state when tg.id is not null then 'sent' when tj.state='sent' then 'review' else coalesce(tj.state,'not_published') end,'scheduledAt',tj.scheduled_at,'manualMarkId',null),
 jsonb_build_object('published',wa.id is not null,'publishedAt',wa.occurred_at,'state',case when wa.id is not null then 'sent' when wj.state='sent' then 'review' else coalesce(wj.state,'not_published') end,'scheduledAt',wj.scheduled_at,'manualMarkId',case when wa.source='manual_mark' then wa.id else null end)
 from public.products p
 left join lateral(select r.* from public.dropou_confirmed_publications r where r.owner_id=p.owner_id and r.brand_id=p.brand_id and r.product_id=p.id and r.channel='telegram' order by occurred_at desc nulls last,recorded_at desc,id desc limit 1)tg on true
 left join lateral(select r.* from public.dropou_confirmed_publications r where r.owner_id=p.owner_id and r.brand_id=p.brand_id and r.product_id=p.id and r.channel='whatsapp' order by occurred_at desc nulls last,recorded_at desc,id desc limit 1)wa on true
 left join lateral(select * from public.telegram_jobs j where j.owner_id=p.owner_id and j.brand_id=p.brand_id and j.product_id=p.id and j.channel='telegram' order by created_at desc,id desc limit 1)tj on true
 left join lateral(select * from public.telegram_jobs j where j.owner_id=p.owner_id and j.brand_id=p.brand_id and j.product_id=p.id and j.channel='whatsapp' order by created_at desc,id desc limit 1)wj on true
 where p.id=any(p_ids) and p.owner_id=private.dropou_workspace_owner()
$$;

create or replace function public.dropou_channel_metrics() returns jsonb language sql stable security invoker set search_path='' as $$
 with products as(select id from public.products where owner_id=private.dropou_workspace_owner() and archived_at is null and coalesce((data->>'demo')::boolean,false)=false),
 states as(select * from public.dropou_product_channel_summaries(array(select id from products)))
 select jsonb_build_object('telegram',jsonb_build_object(
 'published',(select count(*) from states where (telegram->>'published')::boolean),
 'scheduled',(select count(*) from states where telegram->>'state'='queued'),
 'pending',(select count(*) from states where not (telegram->>'published')::boolean and telegram->>'state' not in ('queued','sending','failed','uncertain','partial')),
 'failed',(select count(*) from states where telegram->>'state' in ('failed','blocked','uncertain','partial'))),
 'whatsapp',jsonb_build_object(
 'published',(select count(*) from states where (whatsapp->>'published')::boolean),
 'scheduled',(select count(*) from states where whatsapp->>'state'='queued'),
 'ready',(select count(*) from states where whatsapp->>'state'='ready'),
 'pending',(select count(*) from states where not (whatsapp->>'published')::boolean and whatsapp->>'state' not in ('queued','ready')),
 'review',(select count(*) from states where whatsapp->>'state'='review')))
$$;
create or replace function public.dropou_workspace_metrics() returns jsonb language sql stable security invoker set search_path='' as $$
 select jsonb_build_object('products',(select count(*) from public.products where owner_id=private.dropou_workspace_owner() and archived_at is null and coalesce((data->>'demo')::boolean,false)=false),
 'published',(select count(distinct product_id) from public.dropou_confirmed_publications where owner_id=private.dropou_workspace_owner()),
 'scheduled',(select count(*) from public.telegram_jobs where owner_id=private.dropou_workspace_owner() and state='queued'),
 'waiting',(select count(*) from public.products where owner_id=private.dropou_workspace_owner() and archived_at is null and not public.dropou_publishable(data)))
$$;

create function private.dropou_assert_publication_actor(p_owner uuid,p_brand text,p_actor uuid) returns void language plpgsql security invoker set search_path='' as $$
begin
 if p_actor is null or not(p_actor=p_owner or exists(select 1 from public.operation_members where member_id=p_actor and owner_id=p_owner and active and (role='admin' or p_brand=any(brands)))) then raise exception 'Operador sem acesso a este canal';end if;
end $$;
revoke all on function private.dropou_assert_publication_actor(uuid,text,uuid) from public,anon,authenticated;
grant execute on function private.dropou_assert_publication_actor(uuid,text,uuid) to service_role;

create function public.dropou_publication_queue_actor(p_actor uuid,p_owner uuid,p_offer uuid,p_channel text,p_at timestamptz,p_target jsonb,p_caption text,p_source text,p_mode text,p_allow_safe boolean) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare b text;r jsonb;begin
 select brand_id into b from public.offers where owner_id=p_owner and id=p_offer;
 perform private.dropou_assert_publication_actor(p_owner,b,p_actor);
 r:=public.dropou_publication_queue_v2(p_owner,p_offer,p_channel,p_at,p_target,p_caption,p_source,p_mode,p_allow_safe);
 update public.telegram_jobs set queued_by=p_actor where id=(r->>'id')::uuid and owner_id=p_owner;
 return r||jsonb_build_object('queued_by',p_actor);
end $$;
revoke all on function public.dropou_publication_queue_actor(uuid,uuid,uuid,text,timestamptz,jsonb,text,text,text,boolean) from public,anon,authenticated;
grant execute on function public.dropou_publication_queue_actor(uuid,uuid,uuid,text,timestamptz,jsonb,text,text,text,boolean) to service_role;

alter function public.dropou_publication_receipt(uuid,jsonb,text,text) rename to dropou_publication_receipt_before_workspace;
create function public.dropou_publication_receipt(p_job uuid,p_ids jsonb,p_state text,p_error text default null) returns void
language plpgsql security invoker set search_path='' as $$
declare j public.telegram_jobs;begin
 perform 1 from public.products where id=(select product_id from public.telegram_jobs where id=p_job) for update;
 select * into j from public.telegram_jobs where id=p_job for update;
 if j.channel='telegram' and j.state='sent' and p_state='sent' and j.message_ids=p_ids and jsonb_array_length(p_ids)>0 then return;end if;
 perform public.dropou_publication_receipt_before_workspace(p_job,p_ids,p_state,p_error);
end $$;
revoke all on function public.dropou_publication_receipt(uuid,jsonb,text,text) from public,anon,authenticated;
grant execute on function public.dropou_publication_receipt(uuid,jsonb,text,text) to service_role;

create function public.dropou_schedule_change(p_owner uuid,p_job uuid,p_actor uuid,p_action text,p_at timestamptz default null) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare j public.telegram_jobs;pid uuid;begin
 select product_id into pid from public.telegram_jobs where id=p_job and owner_id=p_owner;
 perform 1 from public.products where id=pid and owner_id=p_owner for update;
 select * into j from public.telegram_jobs where id=p_job and owner_id=p_owner for update;
 if j.id is null then raise exception 'Agendamento indisponível';end if;
 perform private.dropou_assert_publication_actor(p_owner,j.brand_id,p_actor);
 if j.state='cancelled' and p_action='cancel' then return jsonb_build_object('cancelled',true);end if;
 if j.state not in ('queued','ready','blocked','failed') then raise exception 'Envio concluído, em andamento ou incerto. Confira os detalhes antes de alterar';end if;
 if p_action='cancel' then
  perform public.dropou_channel_cancel(p_owner,j.offer_id,j.channel);
 elsif p_action='reschedule' then
  if p_at is null or p_at<=clock_timestamp() then raise exception 'Escolha um horário futuro em America/Bahia';end if;
  if exists(select 1 from public.products where id=pid and (archived_at is not null or curation_state='rejected')) then raise exception 'Produto arquivado ou rejeitado';end if;
  update public.telegram_jobs set scheduled_at=p_at,state='queued',error=null,queued_by=p_actor where id=j.id;
 else raise exception 'Ação inválida';end if;
 insert into public.operation_audit(owner_id,actor_id,brand_id,action,resource_id) values(p_owner,p_actor,j.brand_id,case when p_action='cancel' then 'Agendamento cancelado' else 'Agendamento editado' end,j.id);
 return jsonb_build_object('saved',true);
end $$;
revoke all on function public.dropou_schedule_change(uuid,uuid,uuid,text,timestamptz) from public,anon,authenticated;
grant execute on function public.dropou_schedule_change(uuid,uuid,uuid,text,timestamptz) to service_role;

create function public.dropou_publication_mark_actor(p_owner uuid,p_brand text,p_product uuid,p_actor uuid,p_channel text,p_request uuid,p_undo uuid default null,p_repost boolean default false,p_cancel boolean default false) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare r jsonb;existed boolean;undo_active boolean;begin
 perform private.dropou_assert_publication_actor(p_owner,p_brand,p_actor);
 perform 1 from public.products where id=p_product and owner_id=p_owner and brand_id=p_brand for update;
 if not found then raise exception 'Produto indisponível neste canal';end if;
 if p_channel='telegram' and p_undo is null then raise exception 'Telegram só é publicado após confirmação da API. Abra a oferta para enviar';end if;
 if p_undo is null and not p_cancel and exists(select 1 from public.telegram_jobs where owner_id=p_owner and brand_id=p_brand and product_id=p_product and channel=p_channel and state in ('queued','ready','blocked','failed')) then raise exception 'Confirme a conclusão manual e o cancelamento do agendamento deste destino em Agendamentos';end if;
 select exists(select 1 from public.product_channel_marks where id=p_request) into existed;
 select exists(select 1 from public.product_channel_marks where id=p_undo and owner_id=p_owner and brand_id=p_brand and product_id=p_product and revoked_at is null) into undo_active;
 r:=public.dropou_channel_mark_channel(p_brand,p_owner,p_product,p_channel,p_request,p_undo,p_repost);
 if not existed and p_undo is null then
  update public.product_channel_marks set actor_id=p_actor where id=p_request and owner_id=p_owner and brand_id=p_brand;
  if found then insert into public.operation_audit(owner_id,actor_id,brand_id,action,resource_id) values(p_owner,p_actor,p_brand,'WhatsApp publicado manualmente',p_request);end if;
 elsif undo_active then insert into public.operation_audit(owner_id,actor_id,brand_id,action,resource_id) values(p_owner,p_actor,p_brand,'Marcação manual corrigida',p_undo);end if;
 return r;
end $$;
revoke all on function public.dropou_publication_mark_actor(uuid,text,uuid,uuid,text,uuid,uuid,boolean,boolean) from public,anon,authenticated;
grant execute on function public.dropou_publication_mark_actor(uuid,text,uuid,uuid,text,uuid,uuid,boolean,boolean) to service_role;

create function public.dropou_publication_undo(p_owner uuid,p_brand text,p_id uuid,p_source text,p_actor uuid) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare pid uuid;begin
 perform private.dropou_assert_publication_actor(p_owner,p_brand,p_actor);
 if p_source='manual_mark' then
  select product_id into pid from public.product_channel_marks where id=p_id and owner_id=p_owner and brand_id=p_brand and channel='whatsapp';
 elsif p_source='whatsapp_manual' then
  select product_id into pid from public.publications where id=p_id and owner_id=p_owner and brand_id=p_brand and channel='whatsapp';
 else raise exception 'Recibos Telegram não podem ser desfeitos como marcações manuais';end if;
 if pid is null then raise exception 'Marcação indisponível';end if;
 perform 1 from public.products where id=pid and owner_id=p_owner for update;
 if p_source='manual_mark' then
  update public.product_channel_marks set revoked_at=clock_timestamp() where id=p_id and owner_id=p_owner and brand_id=p_brand and revoked_at is null;
 else update public.publications set revoked_at=clock_timestamp(),revoked_by=p_actor where id=p_id and owner_id=p_owner and brand_id=p_brand and revoked_at is null;end if;
 if not found then return jsonb_build_object('undone',true);end if;
 if not exists(select 1 from public.dropou_confirmed_publications where owner_id=p_owner and brand_id=p_brand and product_id=pid and channel='whatsapp') then
  update public.telegram_jobs set state='cancelled',error='Confirmação manual corrigida; reagende se necessário' where owner_id=p_owner and brand_id=p_brand and product_id=pid and channel='whatsapp' and state='sent';
 end if;
 insert into public.operation_audit(owner_id,actor_id,brand_id,action,resource_id) values(p_owner,p_actor,p_brand,'Marcação manual corrigida',p_id);
 return jsonb_build_object('undone',true);
end $$;
revoke all on function public.dropou_publication_undo(uuid,text,uuid,text,uuid) from public,anon,authenticated;
grant execute on function public.dropou_publication_undo(uuid,text,uuid,text,uuid) to service_role;

create function public.dropou_schedule_page(p_page integer default 0) returns jsonb language sql stable security invoker set search_path='' as $$
 with pending as(select j.* from public.telegram_jobs j where j.owner_id=private.dropou_workspace_owner() and j.state in ('queued','ready','blocked','failed','sending','partial','uncertain')),
 groups as(select brand_id,product_id,min(scheduled_at) at from pending group by brand_id,product_id),
 page as(select * from groups order by at,product_id limit 20 offset least(greatest(p_page,0),10000)*20)
 select jsonb_build_object('jobs',coalesce((select jsonb_agg(to_jsonb(j)||jsonb_build_object('name',j.snapshot->>'name','data',j.snapshot) order by j.scheduled_at,j.id) from pending j join page p on p.product_id=j.product_id and p.brand_id=j.brand_id),'[]'::jsonb),
 'more',(select count(*) from groups)>(p_page+1)*20,'total',(select count(*) from groups),'summary',jsonb_build_object(
 'today',(select count(*) from pending where (scheduled_at at time zone 'America/Bahia')::date=(now() at time zone 'America/Bahia')::date),
 'pending',(select count(*) from pending),
 'attention',(select count(*) from pending where state in ('blocked','failed','partial','uncertain') or state in ('queued','ready') and scheduled_at<now()),
 'next',(select min(scheduled_at) from pending where state='queued' and scheduled_at>=now())))
$$;
revoke all on function public.dropou_schedule_page(integer) from public,anon;
grant execute on function public.dropou_schedule_page(integer) to authenticated,service_role;

create function public.dropou_publication_records_page(p_page integer default 0,p_from timestamptz default null,p_to timestamptz default null,p_channel text default null,p_actor uuid default null) returns jsonb
language sql stable security invoker set search_path='' as $$
 with filtered as(select r.* from public.dropou_confirmed_publications r where r.owner_id=private.dropou_workspace_owner()
 and (p_channel is null or r.channel=p_channel) and (p_from is null or r.occurred_at>=p_from) and (p_to is null or r.occurred_at<p_to)
 and (p_actor is null or private.dropou_workspace_admin() and r.actor_id=p_actor))
 select jsonb_build_object('entries',coalesce((select jsonb_agg(to_jsonb(r)||jsonb_build_object('product_name',r.snapshot->>'name','status',case when r.channel='telegram' then 'sent' else 'manual_confirmed' end,'confirmed_by',r.actor_id,'is_republication',exists(select 1 from public.dropou_confirmed_publications previous where previous.owner_id=r.owner_id and previous.brand_id=r.brand_id and previous.product_id=r.product_id and previous.channel=r.channel and previous.id<>r.id and previous.occurred_at<r.occurred_at),'review_required',false,'error',null)) from(select * from filtered order by occurred_at desc nulls last,recorded_at desc,id limit 20 offset least(greatest(p_page,0),10000)*20)r),'[]'::jsonb),
 'more',(select count(*) from filtered)>(p_page+1)*20,'total',(select count(*) from filtered))
$$;
revoke all on function public.dropou_publication_records_page(integer,timestamptz,timestamptz,text,uuid) from public,anon;
grant execute on function public.dropou_publication_records_page(integer,timestamptz,timestamptz,text,uuid) to authenticated,service_role;

create function private.dropou_receipt_actor() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if new.job_id is not null then select queued_by into new.actor_id from public.telegram_jobs where id=new.job_id and owner_id=new.owner_id and brand_id=new.brand_id;end if;
 return new;
end $$;
revoke all on function private.dropou_receipt_actor() from public,anon;
grant execute on function private.dropou_receipt_actor() to authenticated,service_role;
create trigger receipt_actor before insert on public.channel_events for each row execute function private.dropou_receipt_actor();

create function private.dropou_manual_publication_actor() returns trigger language plpgsql security invoker set search_path='' as $$
begin if new.confirmation_source='manual' and auth.uid() is not null then new.confirmed_by:=auth.uid();end if;return new;end $$;
revoke all on function private.dropou_manual_publication_actor() from public,anon;
grant execute on function private.dropou_manual_publication_actor() to authenticated,service_role;
create trigger aa_manual_publication_actor before insert on public.publications for each row execute function private.dropou_manual_publication_actor();
create function private.dropou_complete_manual_schedule() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.channel='whatsapp' and new.confirmation_source='manual' and new.confirmed_by is not null and not new.review_required and new.revoked_at is null then
  update public.telegram_jobs set state='sent',sent_at=new.confirmed_at,error=null where owner_id=new.owner_id and brand_id=new.brand_id and product_id=new.product_id and channel='whatsapp' and destination_title=new.destination and state in ('queued','ready','blocked','failed');
  insert into public.operation_audit(owner_id,actor_id,brand_id,action,resource_id) values(new.owner_id,new.confirmed_by,new.brand_id,'WhatsApp publicado manualmente',new.id);
 end if;return null;
end $$;
revoke all on function private.dropou_complete_manual_schedule() from public,anon,authenticated;
grant execute on function private.dropou_complete_manual_schedule() to service_role;
create trigger complete_manual_schedule after insert on public.publications for each row execute function private.dropou_complete_manual_schedule();
do $$ declare definition text;begin
 definition:=pg_get_functiondef('public.dropou_publication_history_v2(uuid,text,timestamptz,timestamptz,integer,boolean,text,text)'::regprocedure);
 definition:=replace(definition,'not w.review_required and w.confirmed_by','w.revoked_at is null and not w.review_required and w.confirmed_by');execute definition;
end $$;

-- Compact notifications contain no product data or credentials. RLS does not
-- depend on a page's brand header, so allowed channels also work in Realtime.
create table public.publication_updates(owner_id uuid not null references auth.users(id),brand_id text not null references public.affiliate_operations(id),revision uuid not null default gen_random_uuid(),updated_at timestamptz not null default now(),primary key(owner_id,brand_id));
create index publication_updates_brand_idx on public.publication_updates(brand_id);
alter table public.publication_updates enable row level security;
create policy publication_updates_read on public.publication_updates for select to authenticated using(owner_id=private.dropou_workspace_owner() and private.dropou_channel_allowed(brand_id));
revoke all on public.publication_updates from public,anon,authenticated;
grant select on public.publication_updates to authenticated;
grant all on public.publication_updates to service_role;
create function private.dropou_notify_publication_change() returns trigger language plpgsql security definer set search_path='' as $$
declare uid uuid;brand text;begin
 if tg_op='DELETE' then uid:=old.owner_id;brand:=old.brand_id;else uid:=new.owner_id;brand:=new.brand_id;end if;
 -- Notifications are best effort; never let a notification lock delay a send.
 if pg_try_advisory_xact_lock(hashtextextended('publication-update-'||uid::text||brand,0)) then
  insert into public.publication_updates(owner_id,brand_id) values(uid,brand) on conflict(owner_id,brand_id) do update set revision=gen_random_uuid(),updated_at=clock_timestamp();
 end if;
 return null;
end $$;
revoke all on function private.dropou_notify_publication_change() from public,anon,authenticated;
grant execute on function private.dropou_notify_publication_change() to service_role;
do $$ declare tab text;begin
 foreach tab in array array['telegram_jobs','deliveries','publications','product_channel_marks'] loop
  execute format('create trigger publication_change after insert or update or delete on public.%I for each row execute function private.dropou_notify_publication_change()',tab);
 end loop;
 if exists(select 1 from pg_publication where pubname='supabase_realtime') then alter publication supabase_realtime add table public.publication_updates;end if;
end $$;
commit;
