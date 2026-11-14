-- Seven days in saved links, then fourteen more days in the catalog.
-- Scheduled/in-progress publications and historical proof are preserved.
begin;
alter table public.shopee_saved_products add column catalog_at timestamptz;
alter table public.shopee_saved_products add column retention_checked_at timestamptz;
create index shopee_saved_retention_idx on public.shopee_saved_products(created_at,retention_checked_at);
create index shopee_saved_active_idx on public.shopee_saved_products(owner_id,brand_id,created_at desc,id) where catalog_at is null;
create index shopee_saved_catalog_idx on public.shopee_saved_products(owner_id,brand_id,catalog_at desc,id) where catalog_at is not null;

create function public.dropou_saved_catalog_remove(p_owner uuid,p_brand text,p_saved uuid default null,p_product uuid default null) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare s public.shopee_saved_products;pid uuid:=p_product;linked uuid[];result jsonb:='{}';
begin
 if (p_saved is null)=(p_product is null) then raise exception 'Informe um produto ou link salvo';end if;
 if p_saved is not null then
  select * into s from public.shopee_saved_products where id=p_saved and owner_id=p_owner and brand_id=p_brand;
  if not found then return jsonb_build_object('removed',false);end if;
  pid:=s.prepared_product_id;
 end if;
 -- Same product-before-link lock order as preparation and the existing lifecycle.
 if pid is not null then
  perform 1 from public.products where id=pid and owner_id=p_owner and brand_id=p_brand for update;
  if not found then raise exception 'Produto indisponível neste canal';end if;
 end if;
 if p_saved is not null then
  select * into s from public.shopee_saved_products where id=p_saved and owner_id=p_owner and brand_id=p_brand for update;
  if not found then return jsonb_build_object('removed',false);end if;
  if s.prepared_product_id is distinct from pid then raise exception 'O produto mudou. Atualize a lista e tente novamente';end if;
  if s.state='fetching' and s.lease_until>clock_timestamp() then
   return jsonb_build_object('removed',false,'protected',true,'message','Consulta em andamento. Aguarde a conclusão antes de excluir');
  end if;
 end if;
 select array_agg(id) into linked from public.shopee_saved_products
 where owner_id=p_owner and brand_id=p_brand and (id=p_saved or prepared_product_id=pid);
 if pid is not null then
  result:=public.dropou_product_lifecycle(p_owner,pid,'inspect',false,false);
  if coalesce((result->>'pendingJobs')::integer,0)>0 or coalesce((result->>'sending')::boolean,false) then
   return jsonb_build_object('removed',false,'protected',true,'message','Este produto tem agendamento ou envio pendente. Cancele o agendamento na oferta antes de excluir');
  end if;
  result:=public.dropou_product_lifecycle(p_owner,pid,'delete',true,false);
 end if;
 delete from public.shopee_saved_products where owner_id=p_owner and brand_id=p_brand and id=any(linked);
 return result||jsonb_build_object('removed',true);
end $$;
revoke all on function public.dropou_saved_catalog_remove(uuid,text,uuid,uuid) from public,anon,authenticated;
grant execute on function public.dropou_saved_catalog_remove(uuid,text,uuid,uuid) to service_role;

create function public.dropou_saved_retention(p_owner uuid default null,p_brand text default null) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare s record;r jsonb;moved integer:=0;removed integer:=0;protected integer:=0;cleanup jsonb:='[]';
begin
 if not pg_try_advisory_xact_lock(hashtextextended('dropou-saved-retention',0)) then return jsonb_build_object('busy',true);end if;
 for s in select id,owner_id,brand_id,prepared_product_id from public.shopee_saved_products
  where (catalog_at<=now()-interval '14 days' or catalog_at is null and created_at<=now()-interval '21 days')
  and (p_owner is null or owner_id=p_owner) and (p_brand is null or brand_id=p_brand)
  order by retention_checked_at nulls first,created_at,id limit 100 loop
  r:=public.dropou_saved_catalog_remove(s.owner_id,s.brand_id,s.id,null);
  if coalesce((r->>'protected')::boolean,false) then
   update public.shopee_saved_products set retention_checked_at=now(),catalog_at=coalesce(catalog_at,created_at+interval '7 days') where id=s.id;
   protected:=protected+1;continue;
  end if;
  if coalesce((r->>'removed')::boolean,false) then removed:=removed+1;end if;
  if coalesce(jsonb_array_length(r->'images'),0)>0 then cleanup:=cleanup||jsonb_build_array(jsonb_build_object('owner',s.owner_id,'images',r->'images'));end if;
 end loop;
 with batch as(select id from public.shopee_saved_products where catalog_at is null and created_at<=now()-interval '7 days'
  and (p_owner is null or owner_id=p_owner) and (p_brand is null or brand_id=p_brand) order by created_at,id limit 200)
 update public.shopee_saved_products target set catalog_at=target.created_at+interval '7 days' from batch b where target.id=b.id;
 get diagnostics moved=row_count;
 return jsonb_build_object('moved',moved,'removed',removed,'protected',protected,'cleanup',cleanup);
end $$;
revoke all on function public.dropou_saved_retention(uuid,text) from public,anon,authenticated;
grant execute on function public.dropou_saved_retention(uuid,text) to service_role;

alter function public.dropou_operational_products(text,integer,text,text,text,timestamptz,timestamptz) rename to dropou_operational_products_before_retention;
create function public.dropou_operational_products(p_stage text default 'approved',p_page integer default 0,p_q text default '',p_store text default null,p_channel text default null,p_from timestamptz default null,p_to timestamptz default null) returns jsonb
language plpgsql stable security invoker set search_path='' as $$
begin
 if p_stage<>'catalog' then return public.dropou_operational_products_before_retention(p_stage,p_page,p_q,p_store,p_channel,p_from,p_to);end if;
 return (with candidates as(
  select p.id,p.data,'product'::text kind,p.created_at,e.published_at,p.curation_state,p.legacy_archive_reason,
   null::uuid saved_id,null::text saved_state,null::text saved_error,s.catalog_at
  from public.products p
  left join lateral(select max(published_at) published_at from public.dropou_operation_publications e
   where e.owner_id=p.owner_id and e.product_id=p.id and (p_channel is null or e.channel=p_channel))e on true
  left join lateral(select min(catalog_at) catalog_at from public.shopee_saved_products s
   where s.owner_id=p.owner_id and s.brand_id=p.brand_id and s.prepared_product_id=p.id)s on true
  where p.owner_id=private.dropou_workspace_owner() and p.archived_at is null and p.curation_state<>'rejected'
   and coalesce((p.data->>'demo')::boolean,false)=false and (e.published_at is not null or s.catalog_at is not null)
   and (p_channel is null or e.published_at is not null)
  union all
  select s.id,coalesce(s.data,'{}'::jsonb)||jsonb_build_object('name',coalesce(s.data->>'name','Produto aguardando consulta'),'store','Shopee','originalUrl',s.input_url),
   'saved',s.created_at,null,'pending',null,s.id,s.state,s.error,s.catalog_at
  from public.shopee_saved_products s
  where s.owner_id=private.dropou_workspace_owner() and s.catalog_at is not null and s.prepared_product_id is null and p_channel is null
 ),filtered as(select * from candidates r where
  (p_q='' or r.data->>'name' ilike '%'||replace(replace(p_q,'%',''),'_','')||'%') and (p_store is null or r.data->>'store'=p_store)
  and (p_from is null or coalesce(r.published_at,r.catalog_at)>=p_from) and (p_to is null or coalesce(r.published_at,r.catalog_at)<p_to))
 select jsonb_build_object('total',(select count(*) from filtered),'rows',coalesce((select jsonb_agg(to_jsonb(r))
  from(select * from filtered order by published_at desc nulls last,catalog_at desc nulls last,created_at desc,id limit 24 offset least(greatest(p_page,0),10000)*24)r),'[]'::jsonb)));
end $$;
revoke all on function public.dropou_operational_products(text,integer,text,text,text,timestamptz,timestamptz) from public,anon;
grant execute on function public.dropou_operational_products(text,integer,text,text,text,timestamptz,timestamptz) to authenticated,service_role;
commit;
