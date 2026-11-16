-- Catalog expiration hides rows only. No product, proof or media is deleted.
begin;
alter table public.products add column catalog_entered_at timestamptz;
alter table public.products add column catalog_pinned boolean not null default false;
update public.products p set catalog_entered_at=least(p.created_at,coalesce((select min(coalesce(s.catalog_at,s.created_at+interval '7 days')) from public.shopee_saved_products s where s.owner_id=p.owner_id and s.brand_id=p.brand_id and s.prepared_product_id=p.id),p.created_at));
alter table public.products alter column catalog_entered_at set default now();
alter table public.products alter column catalog_entered_at set not null;
alter table public.shopee_saved_products add column catalog_pinned boolean not null default false;
create index products_catalog_page_idx on public.products(owner_id,brand_id,catalog_pinned desc,catalog_entered_at desc,id) where archived_at is null;
create index products_catalog_category_idx on public.products(owner_id,brand_id,(data->>'niche')) where archived_at is null;
create index channel_events_catalog_destination_idx on public.channel_events(owner_id,brand_id,product_id,channel,destination_id,effective_at desc) where event in ('sent','legacy_telegram_verified');

-- Old manual marks did not store a destination. Never attribute them to a newly
-- configured WhatsApp group. Preserve them as historical proof with unknown target.
alter table public.product_channel_marks add column destination text;
create function private.dropou_catalog_mark_destination() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if tg_op='INSERT' then select s.whatsapp_name into new.destination from public.operation_settings s where s.owner_id=new.owner_id and s.brand_id=new.brand_id;
 elsif new.destination is distinct from old.destination then raise exception 'O destino histórico não pode ser alterado';end if;return new;
end $$;
revoke all on function private.dropou_catalog_mark_destination() from public,anon,authenticated;
grant execute on function private.dropou_catalog_mark_destination() to service_role;
create trigger catalog_mark_destination before insert or update on public.product_channel_marks for each row execute function private.dropou_catalog_mark_destination();
create or replace view public.dropou_confirmed_publications with(security_invoker=true) as
 select * from public.dropou_publication_records
 union all
 select d.product_id,d.owner_id,d.brand_id,d.product_id,d.channel,d.sent_at,d.sent_at,null::timestamptz,d.destination_title,d.destination_id,d.message_ids,d.snapshot,null::uuid,d.product_id,'telegram_receipt'
 from public.deliveries d where d.channel='telegram' and d.state='sent' and jsonb_array_length(d.message_ids)>0
 and not exists(select 1 from public.dropou_publication_records e where e.owner_id=d.owner_id and e.brand_id=d.brand_id and e.product_id=d.product_id)
 union all
 select w.id,w.owner_id,w.brand_id,w.product_id,w.channel,w.confirmed_at,w.published_at,null,w.destination,null,'[]'::jsonb,w.snapshot,w.confirmed_by,w.publication_round,'whatsapp_manual'
 from public.publications w where w.channel='whatsapp' and w.revoked_at is null and not w.review_required and w.confirmed_by is not null and w.confirmation_source in ('manual','audit_manual')
 union all
 select m.id,m.owner_id,m.brand_id,m.product_id,m.channel,m.published_at,m.published_at,null,coalesce(nullif(m.destination,''),'Destino não registrado'),null,'[]'::jsonb,m.snapshot,m.actor_id,m.id,'manual_mark'
 from public.product_channel_marks m where m.channel='whatsapp' and m.revoked_at is null;

create function private.dropou_catalog_clock() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if tg_op='INSERT' then new.catalog_entered_at:=clock_timestamp();
 elsif new.catalog_entered_at is distinct from old.catalog_entered_at and not(current_user='service_role' and new.catalog_entered_at<old.catalog_entered_at) then raise exception 'A entrada no catálogo não pode ser renovada';end if;
 return new;
end $$;
revoke all on function private.dropou_catalog_clock() from public,anon;
grant execute on function private.dropou_catalog_clock() to authenticated,service_role;
create trigger catalog_clock before insert or update on public.products for each row execute function private.dropou_catalog_clock();

-- Supersedes the old destructive 21-day maintenance, including dispatcher callers.
-- Only promote at most 200 saved links per invocation; never scan/delete old products.
create or replace function public.dropou_saved_retention(p_owner uuid default null,p_brand text default null) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare moved integer;begin
 if not pg_try_advisory_xact_lock(hashtextextended('dropou-saved-retention',0)) then return jsonb_build_object('busy',true);end if;
 with batch as(select id from public.shopee_saved_products where catalog_at is null and created_at<=now()-interval '7 days'
  and (p_owner is null or owner_id=p_owner) and (p_brand is null or brand_id=p_brand) order by created_at,id limit 200)
 update public.shopee_saved_products s set catalog_at=s.created_at+interval '7 days' from batch where s.id=batch.id;
 get diagnostics moved=row_count;
 return jsonb_build_object('moved',moved,'removed',0,'protected',0,'cleanup','[]'::jsonb,'visualOnly',true);
end $$;

create view public.dropou_catalog_items with(security_invoker=true) as
 select p.id,p.owner_id,p.brand_id,p.data,'product'::text kind,p.catalog_entered_at entered_at,p.catalog_pinned pinned,p.archived_at,p.curation_state,null::text saved_state,null::text saved_error
 from public.products p where coalesce((p.data->>'demo')::boolean,false)=false
 union all
 select s.id,s.owner_id,s.brand_id,coalesce(s.data,'{}'::jsonb)||jsonb_build_object('name',coalesce(s.data->>'name','Produto aguardando consulta'),'store','Shopee','originalUrl',s.input_url),
 'saved',coalesce(s.catalog_at,s.created_at+interval '7 days'),s.catalog_pinned,null::timestamptz,'pending',s.state,s.error
 from public.shopee_saved_products s where s.prepared_product_id is null and (s.catalog_at is not null or s.created_at<=now()-interval '7 days');
revoke all on public.dropou_catalog_items from public,anon;
grant select on public.dropou_catalog_items to authenticated,service_role;

create function public.dropou_catalog_destinations(p_ids uuid[]) returns table(product_id uuid,destinations jsonb)
language sql stable security invoker set search_path='' as $$
 select p.id,coalesce((select jsonb_agg(jsonb_build_object('channel',d.channel,'name',d.name,'destinationId',d.target,
 'publishedAt',r.occurred_at,'source',r.source,'state',case when r.id is not null then 'published' else coalesce(j.state,'not_published') end,'scheduledAt',j.scheduled_at) order by d.channel)
 from (select 'telegram'::text channel,s.telegram_title name,s.telegram_chat_id target where nullif(s.telegram_chat_id,'') is not null
 union all select 'whatsapp',s.whatsapp_name,null where nullif(s.whatsapp_name,'') is not null)d
 left join lateral(select r.* from public.dropou_confirmed_publications r where r.owner_id=p.owner_id and r.brand_id=p.brand_id and r.product_id=p.id and r.channel=d.channel
 and (d.channel='telegram' and (r.destination_id=d.target or r.destination_id is null and r.destination=d.name) or d.channel='whatsapp' and r.destination=d.name)
 order by r.occurred_at desc nulls last,r.recorded_at desc limit 1)r on true
 left join lateral(select j.* from public.telegram_jobs j where j.owner_id=p.owner_id and j.brand_id=p.brand_id and j.product_id=p.id and j.channel=d.channel
 and (d.channel='telegram' and j.destination_id=d.target or d.channel='whatsapp' and j.destination_title=d.name) and j.state in ('queued','ready','blocked','sending','uncertain','partial','failed')
 order by j.created_at desc limit 1)j on true),'[]'::jsonb)
 from public.products p join public.operation_settings s on s.owner_id=p.owner_id and s.brand_id=p.brand_id
 where p.id=any(p_ids) and p.owner_id=private.dropou_workspace_owner()
$$;
revoke all on function public.dropou_catalog_destinations(uuid[]) from public,anon;
grant execute on function public.dropou_catalog_destinations(uuid[]) to authenticated,service_role;

create function public.dropou_catalog_page(p_filters jsonb default '{}') returns jsonb
language sql stable security invoker set search_path='' as $$
 with filtered as materialized(select c.*,last.occurred_at published_at from public.dropou_catalog_items c
 left join lateral(select max(r.occurred_at) occurred_at from public.dropou_confirmed_publications r where r.owner_id=c.owner_id and r.brand_id=c.brand_id and r.product_id=c.id)last on true
 where c.owner_id=private.dropou_workspace_owner()
 and (nullif(p_filters->>'operation','') is null or c.brand_id=p_filters->>'operation')
 and (coalesce(p_filters->>'status','active')='archived' and c.archived_at is not null or coalesce(p_filters->>'status','active')<>'archived' and c.archived_at is null and (p_filters->>'status'='rejected' and c.curation_state='rejected' or coalesce(p_filters->>'status','active')<>'rejected' and c.curation_state<>'rejected'))
 and (coalesce(p_filters->>'retention','active')='all' or p_filters->>'retention'='expired' and not c.pinned and c.entered_at+interval '14 days'<=now()
 or coalesce(p_filters->>'retention','active')='active' and (c.pinned or c.entered_at+interval '14 days'>now()))
 and (not coalesce((p_filters->>'pinned')::boolean,false) or c.pinned)
 and (nullif(p_filters->>'q','') is null or concat_ws(' ',c.data->>'name',c.data->>'brand',c.data->>'model',c.data->>'sku',c.data->'visualDetails'->>'brand',c.data->'visualDetails'->>'model',c.data->'source'->>'itemId') ilike '%'||replace(replace(p_filters->>'q','%',''),'_','')||'%')
 and (nullif(p_filters->>'store','') is null or c.data->>'store'=p_filters->>'store')
 and (nullif(p_filters->>'category','') is null or c.data->>'niche'=p_filters->>'category')
 and (nullif(p_filters->>'channel','') is null or exists(select 1 from public.dropou_confirmed_publications r where r.owner_id=c.owner_id and r.brand_id=c.brand_id and r.product_id=c.id and r.channel=p_filters->>'channel'))
 and (nullif(p_filters->>'from','') is null or last.occurred_at>=(p_filters->>'from')::timestamptz)
 and (nullif(p_filters->>'to','') is null or last.occurred_at<(p_filters->>'to')::timestamptz)
 and (coalesce(p_filters->>'status','active') not in ('published','unpublished') or (last.occurred_at is not null)=(p_filters->>'status'='published'))
 and (coalesce(p_filters->>'status','active')<>'missing' or exists(select 1 from public.dropou_catalog_destinations(array[c.id]) d,jsonb_array_elements(d.destinations) target where target->>'publishedAt' is null))
 ),page as materialized(select * from filtered order by pinned desc,published_at desc nulls last,entered_at desc,id limit 24 offset least(greatest(coalesce((p_filters->>'page')::integer,0),0),10000)*24),
 destinations as(select * from public.dropou_catalog_destinations(array(select id from page where kind='product')))
 select jsonb_build_object('total',(select count(*) from filtered),'rows',coalesce((select jsonb_agg(to_jsonb(p)||jsonb_build_object('expires_at',p.entered_at+interval '14 days','destinations',coalesce(d.destinations,'[]'::jsonb))) from page p left join destinations d on d.product_id=p.id),'[]'::jsonb),'serverNow',now(),
 'categories',coalesce((select jsonb_agg(niche) from(select distinct data->>'niche' niche from public.dropou_catalog_items where owner_id=(select private.dropou_workspace_owner()) and (nullif(p_filters->>'operation','') is null or brand_id=p_filters->>'operation') and nullif(data->>'niche','') is not null order by niche limit 100)c),'[]'::jsonb))
$$;
revoke all on function public.dropou_catalog_page(jsonb) from public,anon;
grant execute on function public.dropou_catalog_page(jsonb) to authenticated,service_role;

create function public.dropou_catalog_pin(p_owner uuid,p_brand text,p_actor uuid,p_id uuid,p_kind text,p_pinned boolean) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare n integer;begin
 perform private.dropou_assert_publication_actor(p_owner,p_brand,p_actor);
 if p_kind='product' then update public.products set catalog_pinned=p_pinned where owner_id=p_owner and brand_id=p_brand and id=p_id;
 elsif p_kind='saved' then update public.shopee_saved_products set catalog_pinned=p_pinned where owner_id=p_owner and brand_id=p_brand and id=p_id and prepared_product_id is null;
 else raise exception 'Tipo de produto inválido';end if;
 get diagnostics n=row_count;if n<>1 then raise exception 'Produto indisponível nesta operação';end if;
 insert into public.operation_audit(owner_id,actor_id,brand_id,action,resource_id) values(p_owner,p_actor,p_brand,case when p_pinned then 'Produto fixado no catálogo' else 'Produto desafixado do catálogo' end,p_id);
 return jsonb_build_object('id',p_id,'pinned',p_pinned);
end $$;
revoke all on function public.dropou_catalog_pin(uuid,text,uuid,uuid,text,boolean) from public,anon,authenticated;
grant execute on function public.dropou_catalog_pin(uuid,text,uuid,uuid,text,boolean) to service_role;

-- Preserve pinning when an imported saved link becomes a canonical product.
create function private.dropou_catalog_prepare_pin() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if new.prepared_product_id is not null then
 update public.products set catalog_pinned=catalog_pinned or new.catalog_pinned,catalog_entered_at=least(catalog_entered_at,coalesce(new.catalog_at,new.created_at+interval '7 days')) where id=new.prepared_product_id and owner_id=new.owner_id and brand_id=new.brand_id
 and (new.catalog_pinned and not catalog_pinned or coalesce(new.catalog_at,new.created_at+interval '7 days')<catalog_entered_at);
 end if;return new;
end $$;
revoke all on function private.dropou_catalog_prepare_pin() from public,anon,authenticated;
grant execute on function private.dropou_catalog_prepare_pin() to service_role;
create trigger catalog_prepare_pin after insert or update of prepared_product_id,catalog_at on public.shopee_saved_products for each row execute function private.dropou_catalog_prepare_pin();

-- Stage B is deliberately a bounded, read-only impact report. No hard-delete
-- switch exists until media references/business retention have been approved.
create function public.dropou_catalog_cleanup_plan(p_owner uuid,p_brand text,p_limit integer default 100) returns jsonb
language sql stable security invoker set search_path='' as $$
 with batch as(select p.* from public.products p where p.owner_id=p_owner and p.brand_id=p_brand and not p.catalog_pinned and p.catalog_entered_at+interval '14 days'<=now()
 order by p.catalog_entered_at,p.id limit least(greatest(p_limit,1),200)),
 protected as(select b.id,exists(select 1 from public.dropou_confirmed_publications r where r.owner_id=b.owner_id and r.brand_id=b.brand_id and r.product_id=b.id) proof,
 exists(select 1 from public.telegram_jobs j where j.owner_id=b.owner_id and j.brand_id=b.brand_id and j.product_id=b.id and j.state in ('queued','ready','blocked','sending','uncertain','partial','failed')) pending,
 exists(select 1 from public.offers o where o.owner_id=b.owner_id and o.product_id=b.id) offer_ref,
 b.data ? 'imagePath' or b.data ? 'thumbnailPath' media_ref from batch b)
 select jsonb_build_object('dryRun',true,'reviewed',(select count(*) from protected),'withHistory',(select count(*) from protected where proof),'withPendingJobs',(select count(*) from protected where pending),'withOfferReferences',(select count(*) from protected where offer_ref),'withOwnMedia',(select count(*) from protected where media_ref),'deletions',0,'requiresBusinessAndMediaReview',true)
$$;
revoke all on function public.dropou_catalog_cleanup_plan(uuid,text,integer) from public,anon,authenticated;
grant execute on function public.dropou_catalog_cleanup_plan(uuid,text,integer) to service_role;
commit;
