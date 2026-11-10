-- A failed preflight may clear a mutable job key; the original authorized round remains in the audit.
begin;
create or replace function public.dropou_publication_history(p_product uuid default null,p_channel text default null,p_from timestamptz default null,p_to timestamptz default null,p_page integer default 0,p_attempts boolean default false)
returns setof jsonb language sql stable security invoker set search_path='' as $$
 with telegram_completed as (
  select distinct on (coalesce(e.publication_round,e.id))
   e.id,e.product_id,e.product_name,'telegram'::text channel,'sent'::text status,e.effective_at occurred_at,e.created_at recorded_at,e.scheduled_at,e.destination,e.destination_id,e.message_ids,
   null::uuid confirmed_by,(e.republication_key is not null or exists(select 1 from public.channel_events proof where proof.owner_id=e.owner_id and proof.product_id=e.product_id and proof.channel=e.channel and proof.publication_round=e.publication_round and proof.republication_key is not null)) is_republication,e.publication_round,e.error,false review_required
  from public.channel_events e where e.owner_id=(select auth.uid()) and e.channel='telegram' and e.event in ('sent','legacy_telegram_verified') and jsonb_array_length(e.message_ids)>0
   and (p_product is null or e.product_id=p_product) and (p_channel is null or p_channel='telegram')
  order by coalesce(e.publication_round,e.id),e.effective_at desc nulls last,e.created_at desc,e.id
 ), rows as (
  select * from telegram_completed
  union all
  select e.id,e.product_id,e.product_name,'telegram',e.event,null::timestamptz,e.created_at,e.scheduled_at,e.destination,e.destination_id,e.message_ids,
   null::uuid,(e.republication_key is not null or exists(select 1 from public.channel_events proof where proof.owner_id=e.owner_id and proof.product_id=e.product_id and proof.channel=e.channel and proof.publication_round=e.publication_round and proof.republication_key is not null)),e.publication_round,e.error,false
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
commit;
