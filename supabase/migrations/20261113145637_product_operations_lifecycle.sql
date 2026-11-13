begin;
alter table public.products add column curation_state text not null default 'pending' check(curation_state in ('pending','approved','rejected'));
alter table public.products add column legacy_archive_reason text;
create index products_operational_idx on public.products(owner_id,brand_id,curation_state,created_at desc,id) where archived_at is null;
create table public.product_channel_marks(
 id uuid primary key,owner_id uuid not null,brand_id text not null default 'dropou' check(brand_id='dropou'),product_id uuid not null,
 channel text not null check(channel in ('telegram','whatsapp')),published_at timestamptz not null default now(),revoked_at timestamptz,superseded_at timestamptz,
 snapshot jsonb not null,caption text not null default '',
 foreign key(owner_id,product_id,brand_id) references public.products(owner_id,id,brand_id)
);
create unique index product_channel_marks_active_idx on public.product_channel_marks(owner_id,product_id,channel) where revoked_at is null and superseded_at is null;
create index product_channel_marks_recent_idx on public.product_channel_marks(owner_id,brand_id,published_at desc,product_id) where revoked_at is null;
alter table public.product_channel_marks enable row level security;
create policy own_marks on public.product_channel_marks for select to authenticated using(owner_id=(select auth.uid()) and public.dropou_brand_scope(brand_id));
revoke all on public.product_channel_marks from public,anon,authenticated;
grant select on public.product_channel_marks to authenticated;
grant select,insert,update on public.product_channel_marks to service_role;

-- This view is evidence, not an editable global product status.
create view public.dropou_operation_publications with(security_invoker=true) as
 select m.owner_id,m.brand_id,m.product_id,m.channel,m.published_at,'manual_mark'::text source,m.id
 from public.product_channel_marks m where m.revoked_at is null
 union all
 select e.owner_id,e.brand_id,e.product_id,e.channel,max(e.effective_at),'telegram_receipt',coalesce(e.publication_round,e.id)
 from public.channel_events e where e.channel='telegram' and e.event in ('sent','legacy_telegram_verified') and jsonb_array_length(e.message_ids)>0
 group by e.owner_id,e.brand_id,e.product_id,e.channel,coalesce(e.publication_round,e.id)
 union all
 select d.owner_id,d.brand_id,d.product_id,d.channel,d.sent_at,'telegram_receipt',d.product_id from public.deliveries d
 where d.channel='telegram' and d.state='sent' and jsonb_array_length(d.message_ids)>0
 and not exists(select 1 from public.channel_events e where e.owner_id=d.owner_id and e.product_id=d.product_id and e.channel='telegram' and e.event in ('sent','legacy_telegram_verified') and jsonb_array_length(e.message_ids)>0)
 union all
 select w.owner_id,w.brand_id,w.product_id,w.channel,w.confirmed_at,'whatsapp_manual',w.id from public.publications w
 where w.channel='whatsapp' and not w.review_required and w.confirmed_by is not null and w.confirmation_source in ('manual','audit_manual');
revoke all on public.dropou_operation_publications from public,anon;
grant select on public.dropou_operation_publications to authenticated,service_role;

-- One-time data migration. No trigger or ongoing rule archives future Mercado Livre products.
do $$ begin
 if exists(select 1 from public.telegram_jobs j join public.products p on p.id=j.product_id where p.brand_id='dropou' and p.data->>'store'='Mercado Livre' and j.state in ('sending','uncertain','partial')) then raise exception 'Revise entregas Mercado Livre em andamento antes de arquivar';end if;
 update public.telegram_jobs j set state='cancelled',error='Cadastro legado Mercado Livre arquivado na reorganização'
 from public.products p where p.id=j.product_id and p.brand_id='dropou' and p.data->>'store'='Mercado Livre' and j.state in ('queued','blocked','ready','failed');
 with archived as(update public.products set archived_at=coalesce(archived_at,now()),legacy_archive_reason='mercado_livre_before_product_operations'
  where brand_id='dropou' and data->>'store'='Mercado Livre' and created_at<=now() returning owner_id,id,brand_id)
 insert into public.logs(owner_id,brand_id,event,detail) select owner_id,brand_id,'Legado Mercado Livre arquivado',id::text from archived;
end $$;
update public.products p set curation_state='approved' where exists(select 1 from public.offers o where o.product_id=p.id and o.status<>'excluido') or exists(select 1 from public.shopee_offers s where s.prepared_product_id=p.id and s.decision='approved');
update public.products p set curation_state='rejected' where exists(select 1 from public.shopee_offers s where s.prepared_product_id=p.id and s.decision in ('rejected','removed')) and not exists(select 1 from public.dropou_operation_publications e where e.product_id=p.id);

create function public.dropou_channel_mark(p_owner uuid,p_product uuid,p_channel text,p_request uuid,p_undo uuid default null,p_repost boolean default false) returns jsonb language plpgsql security invoker set search_path='' as $$
declare p public.products;m public.product_channel_marks;
begin
 select * into p from public.products where id=p_product and owner_id=p_owner and brand_id='dropou' for update;
 if p.id is null or p_channel not in ('telegram','whatsapp') then raise exception 'Produto ou canal indisponível';end if;
 if p_undo is not null then
  update public.product_channel_marks set revoked_at=clock_timestamp() where id=p_undo and owner_id=p_owner and product_id=p.id and channel=p_channel and revoked_at is null returning * into m;
  if m.id is not null then insert into public.logs(owner_id,brand_id,event,detail) values(p_owner,'dropou','Marcação manual desfeita',p.id::text||' · '||p_channel);end if;
  return jsonb_build_object('undone',true);
 end if;
 if p.archived_at is not null or p.curation_state='rejected' then raise exception 'Restaure ou aprove o produto antes de marcar';end if;
 if exists(select 1 from public.product_channel_marks where id=p_request and owner_id=p_owner and product_id=p.id and channel=p_channel) then return jsonb_build_object('marked',true);end if;
 if exists(select 1 from public.telegram_jobs where owner_id=p_owner and product_id=p.id and channel=p_channel and state in ('sending','uncertain','partial'))
 or exists(select 1 from public.deliveries where owner_id=p_owner and product_id=p.id and channel=p_channel and state in ('sending','uncertain','partial')) then raise exception 'Entrega em andamento ou incerta; confira o canal';end if;
 if not p_repost and exists(select 1 from public.dropou_operation_publications where owner_id=p_owner and product_id=p.id and channel=p_channel) then return jsonb_build_object('alreadyPublished',true);end if;
 if p_repost then update public.product_channel_marks set superseded_at=clock_timestamp() where owner_id=p_owner and product_id=p.id and channel=p_channel and revoked_at is null and superseded_at is null;end if;
 insert into public.product_channel_marks(id,owner_id,brand_id,product_id,channel,snapshot,caption)
 values(p_request,p_owner,'dropou',p.id,p_channel,p.data,coalesce((select caption from public.offers where product_id=p.id and owner_id=p_owner and status<>'excluido'),''));
 update public.products set curation_state='approved' where id=p.id;
 update public.telegram_jobs set state='cancelled',error='Publicação manual marcada pelo administrador' where product_id=p.id and owner_id=p_owner and channel=p_channel and state in ('queued','blocked','ready','failed');
 insert into public.logs(owner_id,brand_id,event,detail) values(p_owner,'dropou','Publicação manual marcada',p.id::text||' · '||p_channel);
 return jsonb_build_object('marked',true);
end $$;
revoke all on function public.dropou_channel_mark(uuid,uuid,text,uuid,uuid,boolean) from public,anon,authenticated;
grant execute on function public.dropou_channel_mark(uuid,uuid,text,uuid,uuid,boolean) to service_role;

alter function public.dropou_product_channel_summaries(uuid[]) rename to dropou_product_channel_summaries_before_operations;
create function public.dropou_product_channel_summaries(p_ids uuid[]) returns table(product_id uuid,telegram jsonb,whatsapp jsonb) language sql stable security invoker set search_path='' as $$
 select s.product_id,s.telegram||jsonb_build_object('published',coalesce((s.telegram->>'published')::boolean,false) or tg.published_at is not null,'publishedAt',greatest((s.telegram->>'publishedAt')::timestamptz,tg.published_at),'manualMarkId',tm.id),
 s.whatsapp||jsonb_build_object('published',coalesce((s.whatsapp->>'published')::boolean,false) or wa.published_at is not null,'publishedAt',greatest((s.whatsapp->>'publishedAt')::timestamptz,wa.published_at),'manualMarkId',wm.id)
 from public.dropou_product_channel_summaries_before_operations(p_ids) s
 left join lateral(select max(published_at) published_at from public.dropou_operation_publications where product_id=s.product_id and owner_id=(select auth.uid()) and channel='telegram') tg on true
 left join lateral(select max(published_at) published_at from public.dropou_operation_publications where product_id=s.product_id and owner_id=(select auth.uid()) and channel='whatsapp') wa on true
 left join public.product_channel_marks tm on tm.product_id=s.product_id and tm.owner_id=(select auth.uid()) and tm.channel='telegram' and tm.revoked_at is null and tm.superseded_at is null
 left join public.product_channel_marks wm on wm.product_id=s.product_id and wm.owner_id=(select auth.uid()) and wm.channel='whatsapp' and wm.revoked_at is null and wm.superseded_at is null
$$;
revoke all on function public.dropou_product_channel_summaries(uuid[]) from public,anon;
grant execute on function public.dropou_product_channel_summaries(uuid[]) to authenticated,service_role;

create view public.dropou_curation_queue with(security_invoker=true) as
 select s.id,'cache'::text kind,s.owner_id,s.brand_id,s.data,s.eligible,s.reasons,s.score,s.checked_at created_at,s.prepared_product_id
 from public.shopee_offers s
 left join lateral(select p.* from public.products p where p.owner_id=s.owner_id and p.brand_id=s.brand_id and (p.id=s.prepared_product_id or p.canonical_url='shopee.com.br/product/'||s.shop_id||'/'||s.item_id) order by (p.id=s.prepared_product_id) desc nulls last,p.id limit 1) p on true
 where s.brand_id='dropou' and s.decision='found' and s.assessment->>'relevant'='true'
 and (p.id is null or p.archived_at is null and p.curation_state='pending')
 and not exists(select 1 from public.dropou_operation_publications e where e.owner_id=s.owner_id and e.product_id=p.id)
 union all
 select p.id,'product',p.owner_id,p.brand_id,p.data,false,'[]'::jsonb,0,p.created_at,p.id
 from public.products p where p.brand_id='dropou' and p.archived_at is null and p.curation_state='pending' and coalesce((p.data->>'demo')::boolean,false)=false
 and not exists(select 1 from public.shopee_offers s where s.owner_id=p.owner_id and s.brand_id=p.brand_id and (s.prepared_product_id=p.id or p.canonical_url='shopee.com.br/product/'||s.shop_id||'/'||s.item_id))
 and not exists(select 1 from public.dropou_operation_publications e where e.owner_id=p.owner_id and e.product_id=p.id);
revoke all on public.dropou_curation_queue from public,anon;
grant select on public.dropou_curation_queue to authenticated,service_role;

create function public.dropou_curation_page(p_page integer default 0) returns jsonb language sql stable security invoker set search_path='' as $$
 select jsonb_build_object('total',(select count(*) from public.dropou_curation_queue where owner_id=(select auth.uid())),
 'rows',coalesce((select jsonb_agg(to_jsonb(r)) from(select id,kind,data,eligible,reasons,score,prepared_product_id from public.dropou_curation_queue where owner_id=(select auth.uid()) order by created_at desc,id limit 24 offset least(greatest(p_page,0),10000)*24) r),'[]'::jsonb))
$$;
revoke all on function public.dropou_curation_page(integer) from public,anon;
grant execute on function public.dropou_curation_page(integer) to authenticated,service_role;

create function public.dropou_curate(p_owner uuid,p_kind text,p_id uuid,p_decision text,p_product jsonb default null,p_caption text default null) returns jsonb language plpgsql security invoker set search_path='' as $$
declare c public.shopee_offers;p public.products;k text;pid uuid;
begin
 if p_kind not in ('cache','product') or p_decision not in ('approved','rejected') then raise exception 'Decisão inválida';end if;
 if p_kind='cache' then
  select * into c from public.shopee_offers where id=p_id and owner_id=p_owner and brand_id='dropou';
  if c.id is null then raise exception 'Oferta indisponível';end if;
  k:='shopee.com.br/product/'||c.shop_id||'/'||c.item_id;
  perform pg_advisory_xact_lock(hashtextextended('dropou-shopee-product-'||p_owner::text||c.shop_id||':'||c.item_id,0));
  select * into p from public.products where owner_id=p_owner and brand_id='dropou' and canonical_url=k for update;
  select * into c from public.shopee_offers where id=p_id and owner_id=p_owner for update;
  if c.decision<>'found' then raise exception 'Esta oferta já foi decidida';end if;
 else select * into p from public.products where id=p_id and owner_id=p_owner and brand_id='dropou' for update;
  if p.id is null or p.curation_state<>'pending' then raise exception 'Produto não está pendente';end if;
 end if;
 if p.id is not null and exists(select 1 from public.telegram_jobs where product_id=p.id and owner_id=p_owner and state in ('sending','uncertain','partial')) then raise exception 'Entrega em andamento ou incerta; confira o canal';end if;
 if p.id is not null and (p.archived_at is not null or exists(select 1 from public.dropou_operation_publications e where e.product_id=p.id and e.owner_id=p_owner)) then raise exception 'Produto arquivado ou publicado; consulte o catálogo';end if;
 if p_decision='rejected' then
  if c.id is not null then update public.shopee_offers set decision='rejected' where id=c.id;end if;
  if p.id is not null then update public.products set curation_state='rejected' where id=p.id;end if;
  update public.telegram_jobs set state='cancelled',error='Rejeitado na curadoria' where owner_id=p_owner and (product_id=p.id or shopee_offer_id=c.id) and state in ('queued','blocked','ready','failed');
 else
  if c.id is not null and p.id is null then
   if c.assessment->>'relevant' is distinct from 'true' or p_product->>'name' is distinct from c.data->>'name' or p_product->>'affiliateUrl' is distinct from c.data->>'offerLink' or p_product->>'image' is distinct from c.data->>'image' or (p_product->>'price')::numeric is distinct from (c.data->>'price')::numeric or p_product->>'originalUrl' is distinct from 'https://'||k or p_product->>'operation' is distinct from 'dropou' or not public.dropou_publication_identity(p_product) then raise exception 'Revise os dados originais da oferta';end if;
   pid:=(p_product->>'id')::uuid;
   insert into public.products(id,owner_id,brand_id,canonical_url,data,curation_state) values(pid,p_owner,'dropou',k,p_product,'approved') returning * into p;
  end if;
  update public.products set curation_state='approved' where id=p.id;
  if c.id is not null then update public.shopee_offers set decision='approved',prepared_product_id=p.id where id=c.id;end if;
  -- Manual approval does not forge eligibility for the automatic search/dispatcher.
  if c.id is null or (c.data->>'price')::numeric=(c.data->>'priceMax')::numeric then
   insert into public.offers(owner_id,brand_id,product_id,caption,original_caption,snapshot,status)
   select p_owner,'dropou',p.id,coalesce(p_caption,public.dropou_priced_draft_caption(p.data)),coalesce(p_caption,public.dropou_priced_draft_caption(p.data)),p.data,'rascunho'
   where not exists(select 1 from public.offers where product_id=p.id and status<>'excluido');
  end if;
 end if;
 insert into public.logs(owner_id,brand_id,event,detail) values(p_owner,'dropou','Decisão da curadoria',p_id::text||' · '||p_decision);
 return jsonb_build_object('productId',p.id,'needsReview',c.id is not null and (c.data->>'price')::numeric<>(c.data->>'priceMax')::numeric);
end $$;
revoke all on function public.dropou_curate(uuid,text,uuid,text,jsonb,text) from public,anon,authenticated;
grant execute on function public.dropou_curate(uuid,text,uuid,text,jsonb,text) to service_role;

create function public.dropou_operational_products(p_stage text default 'approved',p_page integer default 0,p_q text default '',p_store text default null,p_channel text default null,p_from timestamptz default null,p_to timestamptz default null) returns jsonb language sql stable security invoker set search_path='' as $$
 with rows as(
 select p.id,p.data,p.created_at,p.curation_state,p.legacy_archive_reason,max(e.published_at) published_at
 from public.products p left join public.dropou_operation_publications e on e.owner_id=p.owner_id and e.product_id=p.id and (p_channel is null or e.channel=p_channel)
 where p.owner_id=(select auth.uid()) and coalesce((p.data->>'demo')::boolean,false)=false
 and (case when p_stage='archived' then p.archived_at is not null else p.archived_at is null and p.curation_state<>'rejected' end)
 and (p_stage<>'approved' or not exists(select 1 from public.shopee_offers s where s.owner_id=p.owner_id and s.prepared_product_id=p.id and s.decision in ('rejected','removed')))
 and (p_q='' or p.data->>'name' ilike '%'||replace(replace(p_q,'%',''),'_','')||'%') and (p_store is null or p.data->>'store'=p_store)
 group by p.id
 having case when p_stage='catalog' then count(e.id)>0 when p_stage='recent' then max(e.published_at)>=((now() at time zone 'America/Bahia')::date-1)::timestamp at time zone 'America/Bahia' and max(e.published_at)<((now() at time zone 'America/Bahia')::date+1)::timestamp at time zone 'America/Bahia' when p_stage='approved' then p.curation_state='approved' and count(e.id)=0 else true end
 and (p_channel is null or bool_or(e.channel=p_channel)) and (p_from is null or max(e.published_at)>=p_from) and (p_to is null or max(e.published_at)<p_to)
 ) select jsonb_build_object('total',(select count(*) from rows),'rows',coalesce((select jsonb_agg(to_jsonb(r)) from(select * from rows order by published_at desc nulls last,created_at desc,id limit 24 offset least(greatest(p_page,0),10000)*24)r),'[]'::jsonb))
$$;
revoke all on function public.dropou_operational_products(text,integer,text,text,text,timestamptz,timestamptz) from public,anon;
grant execute on function public.dropou_operational_products(text,integer,text,text,text,timestamptz,timestamptz) to authenticated,service_role;
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
 union all
 select m.id,m.product_id,m.snapshot->>'name',m.channel,case when m.revoked_at is null then 'manual_confirmed' else 'manual_revoked' end,
 m.published_at,coalesce(m.revoked_at,m.published_at),null::timestamptz,'Marcação manual no painel',null::text,'[]'::jsonb,m.owner_id,
 exists(select 1 from public.product_channel_marks old where old.owner_id=m.owner_id and old.product_id=m.product_id and old.channel=m.channel and old.published_at<m.published_at),m.id,null::text,false,m.brand_id,m.snapshot->>'store'
 from public.product_channel_marks m where m.owner_id=(select auth.uid()) and (p_attempts or m.revoked_at is null)
 and (p_product is null or m.product_id=p_product) and (p_channel is null or m.channel=p_channel)
 )
 select to_jsonb(r)||jsonb_build_object('next_scheduled_at',(select j.scheduled_at from public.telegram_jobs j where j.owner_id=(select auth.uid()) and j.product_id=r.product_id and j.brand_id=r.brand_id and j.channel=r.channel and j.state='queued' and j.scheduled_at>now() order by j.scheduled_at limit 1)) from rows r
 where (p_marketplace is null or r.marketplace=p_marketplace) and (p_status is null or r.status=p_status) and (p_from is null or coalesce(r.occurred_at,case when r.status not in ('sent','manual_confirmed') then r.recorded_at end)>=p_from)
  and (p_to is null or coalesce(r.occurred_at,case when r.status not in ('sent','manual_confirmed') then r.recorded_at end)<p_to)
 order by coalesce(r.occurred_at,r.recorded_at) desc,r.recorded_at desc,r.channel,r.id
 limit 21 offset least(greatest(coalesce(p_page,0),0),10000)*20
$$;
revoke all on function public.dropou_publication_history_v2(uuid,text,timestamptz,timestamptz,integer,boolean,text,text) from public,anon;grant execute on function public.dropou_publication_history_v2(uuid,text,timestamptz,timestamptz,integer,boolean,text,text) to authenticated,service_role;

alter function public.dropou_product_lifecycle(uuid,uuid,text,boolean,boolean) rename to dropou_product_lifecycle_before_operations;
create function public.dropou_product_lifecycle(p_owner uuid,p_product uuid,p_action text,p_confirm boolean,p_cancel boolean) returns jsonb language plpgsql security invoker set search_path='' as $$
declare marked boolean;r jsonb;begin
 select exists(select 1 from public.product_channel_marks where owner_id=p_owner and product_id=p_product) into marked;
 r:=public.dropou_product_lifecycle_before_operations(p_owner,p_product,case when marked and p_action='delete' then 'archive' else p_action end,p_confirm,p_cancel);
 if marked and p_action='inspect' then r:=r||jsonb_build_object('hasHistory',true);end if;return r;end $$;
revoke all on function public.dropou_product_lifecycle(uuid,uuid,text,boolean,boolean) from public,anon,authenticated;
grant execute on function public.dropou_product_lifecycle(uuid,uuid,text,boolean,boolean) to service_role;

create function public.dropou_operation_summary() returns jsonb language sql stable security invoker set search_path='' as $$
 with rows as(select p.id,p.archived_at,p.curation_state,max(e.published_at) latest
 from public.products p left join public.dropou_operation_publications e on e.owner_id=p.owner_id and e.product_id=p.id
 where p.owner_id=(select auth.uid()) and coalesce((p.data->>'demo')::boolean,false)=false group by p.id)
 select jsonb_build_object('pending',(select count(*) from public.dropou_curation_queue where owner_id=(select auth.uid())),
 'approved',(select count(*) from rows r where archived_at is null and curation_state='approved' and latest is null and not exists(select 1 from public.shopee_offers s where s.prepared_product_id=r.id and s.decision in ('rejected','removed'))),
 'published',(select count(*) from rows where archived_at is null and curation_state<>'rejected' and latest is not null),
 'recent',(select count(*) from rows where archived_at is null and curation_state<>'rejected' and latest>=((now() at time zone 'America/Bahia')::date-1)::timestamp at time zone 'America/Bahia' and latest<((now() at time zone 'America/Bahia')::date+1)::timestamp at time zone 'America/Bahia'),
 'archived',(select count(*) from rows where archived_at is not null))
$$;
revoke all on function public.dropou_operation_summary() from public,anon;
grant execute on function public.dropou_operation_summary() to authenticated,service_role;

create function public.dropou_operational_queue_guard() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if new.state in ('queued','sending') and (exists(select 1 from public.products where id=new.product_id and owner_id=new.owner_id and (archived_at is not null or curation_state='rejected')) or new.republication_key is null and exists(select 1 from public.product_channel_marks where product_id=new.product_id and owner_id=new.owner_id and channel=new.channel and revoked_at is null)) then raise exception 'Produto arquivado, rejeitado ou com publicação manual registrada';end if;return new;
end $$;
create trigger operational_queue_guard before insert or update of state on public.telegram_jobs for each row execute function public.dropou_operational_queue_guard();
revoke all on function public.dropou_operational_queue_guard() from public,anon,authenticated;grant execute on function public.dropou_operational_queue_guard() to service_role;
create or replace function public.dropou_shopee_stage(p_owner uuid,p_cache uuid,p_product jsonb,p_assessment jsonb) returns uuid
language plpgsql security invoker set search_path='' as $$
declare c public.shopee_offers; p public.products; pid uuid; k text; saved jsonb; draft text;
begin
 select * into c from public.shopee_offers where id=p_cache and owner_id=p_owner and brand_id='dropou';
 if c.id is null then raise exception 'Oferta indisponível para preparação';end if;
 perform pg_advisory_xact_lock(hashtextextended('dropou-shopee-product-'||p_owner::text||c.shop_id||':'||c.item_id,0));
 -- Same identity lock and product-before-cache ordering as the existing queue.
 perform 1 from public.products where owner_id=p_owner and brand_id='dropou' and (id=c.prepared_product_id or canonical_url='shopee.com.br/product/'||c.shop_id||'/'||c.item_id) for update;
 select * into c from public.shopee_offers where id=p_cache and owner_id=p_owner and brand_id='dropou' for update;
 -- Use the server's current history-aware review, not a stale cached flag.
 if p_assessment->'eligible' is distinct from 'true'::jsonb or p_assessment->'relevant' is distinct from 'true'::jsonb then raise exception 'Oferta fora dos critérios; atualize a curadoria';end if;
 k:='shopee.com.br/product/'||c.shop_id||'/'||c.item_id;
 if p_product->>'operation' is distinct from 'dropou' or p_product->>'store' is distinct from 'Shopee'
   or p_product->>'originalUrl' is distinct from 'https://'||k
   or p_product->>'name' is distinct from c.data->>'name'
   or p_product->>'affiliateUrl' is distinct from c.data->>'offerLink'
   or p_product->>'image' is distinct from c.data->>'image'
   or (p_product->>'price')::numeric is distinct from (c.data->>'price')::numeric
   or (c.data->>'price')::numeric is distinct from (c.data->>'priceMax')::numeric
   or p_product->>'checkedAt' is distinct from c.data->>'checkedAt'
   or p_product->'inStock' is distinct from 'null'::jsonb
   or (p_product->>'demo')::boolean is distinct from false
 then raise exception 'Dados da oferta divergiram; atualize a curadoria';end if;
 select * into p from public.products where owner_id=p_owner and brand_id='dropou' and (id=c.prepared_product_id or canonical_url=k) order by (id=c.prepared_product_id) desc nulls last limit 1 for update;
 if p.id is null then
   pid:=(p_product->>'id')::uuid;
   saved:=(p_product-'_draftCaption')||jsonb_build_object('status','encontrado','scheduledAt',null,'previousPrice',null,'previousVerified',false);
   insert into public.products(id,owner_id,brand_id,canonical_url,data) values(pid,p_owner,'dropou',k,saved) on conflict(owner_id,brand_id,canonical_url) do nothing;
   select * into p from public.products where owner_id=p_owner and brand_id='dropou' and canonical_url=k for update;
   if p.id=pid then
     insert into public.price_records(owner_id,brand_id,product_id,price,previous_price,payment_method,checked_at,snapshot)
     values(p_owner,'dropou',p.id,(saved->>'price')::numeric,null,'nao_informado',(saved->>'checkedAt')::timestamptz,saved);
   end if;
 end if;
 if p.curation_state='rejected' then raise exception 'Produto rejeitado; não reimportar automaticamente';end if;
 update public.products set curation_state='approved' where id=p.id;
 if p.archived_at is not null then raise exception 'Restaure o produto arquivado no catálogo antes de preparar';end if;
 -- A server-rendered draft carries only a selected local opening and recorded facts.
 -- For an existing product use its preserved data, never overwrite its price/edits.
 draft:=case when (p.data-'status'-'scheduledAt')=((p_product-'_draftCaption')-'status'-'scheduledAt') then p_product->>'_draftCaption' end;
 draft:=coalesce(draft,public.dropou_priced_draft_caption(p.data));
 -- Existing edits, receipts and schedules survive repeated approval.
 insert into public.offers(owner_id,brand_id,product_id,caption,original_caption,snapshot,status)
 select p_owner,'dropou',p.id,draft,draft,p.data,'rascunho'
 where not exists(select 1 from public.offers where product_id=p.id and status<>'excluido')
 on conflict(product_id) where status<>'excluido' do nothing;
 -- Upgrade only an untouched unpublished draft when explicitly prepared again.
 update public.offers set caption=draft,original_caption=draft,updated_at=clock_timestamp()
 where product_id=p.id and owner_id=p_owner and status='rascunho' and not manually_edited
 and caption=public.dropou_safe_publication_caption(p.data)
 and not exists(select 1 from public.telegram_jobs where product_id=p.id and state in ('queued','sending','sent','uncertain','partial'))
 and not exists(select 1 from public.deliveries where product_id=p.id and state in ('sending','sent','uncertain','partial'));
 update public.shopee_offers set decision='approved',prepared_product_id=p.id,assessment=p_assessment,eligible=true,score=(p_assessment->>'score')::integer,reasons=p_assessment->'reasons' where id=c.id;
 insert into public.logs(owner_id,brand_id,event,detail) values(p_owner,'dropou','Oferta aprovada para próximos posts',c.data->>'name');
 return p.id;
end $$;
commit;
