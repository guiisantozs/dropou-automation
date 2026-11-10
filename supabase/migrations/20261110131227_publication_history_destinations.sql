begin;
alter table public.channel_events add column effective_at timestamptz;
alter table public.channel_events add column scheduled_at timestamptz;
alter table public.channel_events add column destination_id text;
alter table public.channel_events add column republication_key uuid;

-- An actual receipt transition has a server timestamp. A copied legacy row does not.
update public.channel_events e set
 effective_at=case when e.event='sent' then e.created_at when e.event='legacy_telegram_verified' then
  (select d.sent_at from public.deliveries d where d.owner_id=e.owner_id and d.product_id=e.product_id and d.channel='telegram' and d.state='sent' and d.publication_round=e.publication_round and d.message_ids=e.message_ids) end,
 destination_id=coalesce(
  (select d.destination_id from public.deliveries d where d.owner_id=e.owner_id and d.product_id=e.product_id and d.channel=e.channel and d.publication_round=e.publication_round),
  (select j.destination_id from public.telegram_jobs j where j.owner_id=e.owner_id and j.product_id=e.product_id and j.channel=e.channel and j.publication_round=e.publication_round),
  (select i.previous_receipt->>'destination_id' from public.republication_intents i where i.owner_id=e.owner_id and i.product_id=e.product_id and i.channel=e.channel and i.previous_receipt->>'publication_round'=e.publication_round::text order by i.created_at desc limit 1)),
 scheduled_at=(select j.scheduled_at from public.telegram_jobs j where j.owner_id=e.owner_id and j.product_id=e.product_id and j.channel=e.channel and j.publication_round=e.publication_round),
 republication_key=(select j.republication_key from public.telegram_jobs j where j.owner_id=e.owner_id and j.product_id=e.product_id and j.channel=e.channel and j.publication_round=e.publication_round)
where e.channel='telegram' and e.event in ('sent','legacy_telegram_verified');

create or replace function public.dropou_channel_job_event() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if tg_op='INSERT' or old.state is distinct from new.state or old.message_ids is distinct from new.message_ids then
  insert into public.channel_events(owner_id,product_id,product_name,offer_id,job_id,channel,event,attempt,destination,message_ids,caption,snapshot,error,publication_round,effective_at,scheduled_at,destination_id,republication_key)
  values(new.owner_id,new.product_id,coalesce(new.snapshot->>'name','Oferta'),new.offer_id,new.id,new.channel,new.state,new.attempts,new.destination_title,new.message_ids,new.caption,new.snapshot,left(new.error,500),new.publication_round,
   case when new.state='sent' then new.sent_at end,new.scheduled_at,new.destination_id,new.republication_key);
 end if;return new;
end $$;

create index channel_events_effective_history_idx on public.channel_events(owner_id,channel,effective_at desc,created_at desc)
 where event in ('sent','legacy_telegram_verified');

-- One row per completed Telegram round; manual WhatsApp records stay explicitly manual.
-- Missing publication times stay NULL. recorded_at is audit metadata, never a substitute.
create or replace function public.dropou_publication_history(p_product uuid default null,p_channel text default null,p_from timestamptz default null,p_to timestamptz default null,p_page integer default 0,p_attempts boolean default false)
returns setof jsonb language sql stable security invoker set search_path='' as $$
 with telegram_completed as (
  select distinct on (coalesce(e.publication_round,e.id))
   e.id,e.product_id,e.product_name,'telegram'::text channel,'sent'::text status,e.effective_at occurred_at,e.created_at recorded_at,e.scheduled_at,e.destination,e.destination_id,e.message_ids,
   null::uuid confirmed_by,e.republication_key is not null is_republication,e.publication_round,e.error,false review_required
  from public.channel_events e where e.owner_id=(select auth.uid()) and e.channel='telegram' and e.event in ('sent','legacy_telegram_verified') and jsonb_array_length(e.message_ids)>0
   and (p_product is null or e.product_id=p_product) and (p_channel is null or p_channel='telegram')
  order by coalesce(e.publication_round,e.id),e.effective_at desc nulls last,e.created_at desc,e.id
 ), rows as (
  select * from telegram_completed
  union all
  select e.id,e.product_id,e.product_name,'telegram',e.event,null::timestamptz,e.created_at,e.scheduled_at,e.destination,e.destination_id,e.message_ids,
   null::uuid,e.republication_key is not null,e.publication_round,e.error,false
  from public.channel_events e where p_attempts and e.owner_id=(select auth.uid()) and e.channel='telegram' and e.event not in ('sent','legacy_telegram_verified','legacy_global_status_corrected')
   and (p_product is null or e.product_id=p_product) and (p_channel is null or p_channel='telegram')
  union all
  select w.id,w.product_id,coalesce(w.snapshot->>'name','Oferta histórica'),'whatsapp',
   case when not w.review_required and w.confirmed_by is not null and w.confirmation_source in ('manual','audit_manual') then 'manual_confirmed' else 'review' end,
   case when not w.review_required and w.confirmed_by is not null then w.confirmed_at end,w.published_at,null::timestamptz,w.destination,null::text,'[]'::jsonb,
   w.confirmed_by,w.republication_key is not null,w.publication_round,null::text,w.review_required
  from public.publications w where w.owner_id=(select auth.uid()) and w.channel='whatsapp' and (p_attempts or (not w.review_required and w.confirmed_by is not null and w.confirmation_source in ('manual','audit_manual')))
   and (p_product is null or w.product_id=p_product) and (p_channel is null or p_channel='whatsapp')
 )
 select to_jsonb(r) from rows r
 where (p_from is null or coalesce(r.occurred_at,case when r.status not in ('sent','manual_confirmed') then r.recorded_at end)>=p_from)
  and (p_to is null or coalesce(r.occurred_at,case when r.status not in ('sent','manual_confirmed') then r.recorded_at end)<p_to)
 order by coalesce(r.occurred_at,r.recorded_at) desc,r.recorded_at desc,r.channel,r.id
 limit 21 offset least(greatest(coalesce(p_page,0),0),10000)*20
$$;
revoke all on function public.dropou_publication_history(uuid,text,timestamptz,timestamptz,integer,boolean) from public,anon;
grant execute on function public.dropou_publication_history(uuid,text,timestamptz,timestamptz,integer,boolean) to authenticated,service_role;

create or replace function public.dropou_product_channel_summaries(p_ids uuid[])
returns table(product_id uuid,telegram jsonb,whatsapp jsonb)
language sql stable security invoker set search_path='' as $$
 select p.id,
 jsonb_build_object('published',coalesce(tg.total,0)>0 or coalesce(d.state='sent' and jsonb_array_length(d.message_ids)>0,false),
  'publishedAt',case when tg.total>0 then tg.published_at when d.state='sent' and jsonb_array_length(d.message_ids)>0 then d.sent_at end,
  'state',coalesce(case when d.state in ('sending','uncertain','partial') then d.state end,tj.state),
  'scheduledAt',case when tj.state='queued' then tj.scheduled_at end),
 jsonb_build_object('published',coalesce(wa.total,0)>0,'publishedAt',wa.published_at,
  'review',coalesce(wa.review,false),'state',wj.state,'scheduledAt',case when wj.state='queued' then wj.scheduled_at end)
 from public.products p
 left join public.telegram_jobs tj on tj.product_id=p.id and tj.owner_id=p.owner_id and tj.channel='telegram'
 left join public.telegram_jobs wj on wj.product_id=p.id and wj.owner_id=p.owner_id and wj.channel='whatsapp'
 left join public.deliveries d on d.product_id=p.id and d.owner_id=p.owner_id and d.channel='telegram'
 left join lateral (select count(distinct publication_round) total,(array_agg(effective_at order by coalesce(effective_at,created_at) desc,created_at desc,id))[1] published_at from public.channel_events
  where owner_id=p.owner_id and product_id=p.id and channel='telegram' and event in ('sent','legacy_telegram_verified') and jsonb_array_length(message_ids)>0) tg on true
 left join lateral (select count(*) filter(where not review_required and confirmed_by is not null and confirmation_source in ('manual','audit_manual')) total,
  (array_agg(confirmed_at order by coalesce(confirmed_at,published_at) desc,published_at desc,id) filter(where not review_required and confirmed_by is not null and confirmation_source in ('manual','audit_manual')))[1] published_at,
  bool_or(review_required or confirmed_by is null) review from public.publications where owner_id=p.owner_id and product_id=p.id and channel='whatsapp') wa on true
 where p.owner_id=(select auth.uid()) and p.id=any(p_ids[1:24])
$$;
commit;
