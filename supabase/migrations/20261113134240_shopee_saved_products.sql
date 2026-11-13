begin;
create table public.shopee_saved_products(
 id uuid primary key default gen_random_uuid(),owner_id uuid not null,brand_id text not null default 'dropou' check(brand_id='dropou'),
 input_url text not null check(length(input_url)<=2048),canonical_url text not null check(length(canonical_url)<=2048),
 shop_id text,item_id text,data jsonb,
 state text not null default 'pending' check(state in ('pending','fetching','ready','error')),error text,
 lease_token uuid,lease_until timestamptz,prepared_product_id uuid,
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 unique(owner_id,brand_id,canonical_url),foreign key(owner_id,brand_id) references public.operation_settings(owner_id,brand_id),
 foreign key(owner_id,prepared_product_id,brand_id) references public.products(owner_id,id,brand_id) on delete set null (prepared_product_id),
 check((shop_id is null and item_id is null) or (shop_id~'^[0-9]{1,19}$' and item_id~'^[0-9]{1,19}$')),
 check(state<>'ready' or (data is not null and shop_id is not null and item_id is not null and data->>'shopId'=shop_id and data->>'itemId'=item_id))
);
create index shopee_saved_owner_time_idx on public.shopee_saved_products(owner_id,brand_id,created_at desc,id);
create index shopee_saved_product_fk_idx on public.shopee_saved_products(prepared_product_id) where prepared_product_id is not null;
alter table public.shopee_saved_products enable row level security;
create policy shopee_saved_read on public.shopee_saved_products for select to authenticated using(owner_id=(select auth.uid()) and public.dropou_brand_scope(brand_id));
revoke all on public.shopee_saved_products from public,anon,authenticated;
grant select on public.shopee_saved_products to authenticated;
grant all on public.shopee_saved_products to service_role;

create function public.dropou_shopee_saved_claim(p_owner uuid,p_ids uuid[],p_refresh boolean default false) returns setof public.shopee_saved_products
language plpgsql security invoker set search_path='' as $$
begin
 if cardinality(p_ids) not between 1 and 5 then raise exception 'Consulte até cinco links por lote';end if;
 return query update public.shopee_saved_products s set state='fetching',lease_token=gen_random_uuid(),lease_until=clock_timestamp()+interval '60 seconds',error=null,updated_at=clock_timestamp()
 where s.id in (select id from public.shopee_saved_products where owner_id=p_owner and brand_id='dropou' and id=any(p_ids)
 and (state in ('pending','error') or (state='fetching' and lease_until<clock_timestamp()) or (state='ready' and p_refresh)) order by id for update skip locked)
 returning s.*;
end $$;

create function public.dropou_shopee_saved_finish(p_owner uuid,p_id uuid,p_token uuid,p_data jsonb,p_error text default null) returns uuid
language plpgsql security invoker set search_path='' as $$
declare s public.shopee_saved_products;target public.shopee_saved_products;canonical text;
begin
 if p_data is not null then
  if coalesce(p_data->>'shopId','')!~'^[0-9]{1,19}$' or coalesce(p_data->>'itemId','')!~'^[0-9]{1,19}$' or coalesce((p_data->>'price')::numeric,0)<=0
   or coalesce(p_data->>'offerLink','')!~'^https://(s[.])?shopee[.]com[.]br/|^https://shope[.]ee/' then raise exception 'Dados oficiais inválidos';end if;
  canonical:='https://shopee.com.br/product/'||(p_data->>'shopId')||'/'||(p_data->>'itemId');
  perform pg_advisory_xact_lock(hashtextextended('dropou-saved-'||p_owner::text||canonical,0));
  select * into target from public.shopee_saved_products where owner_id=p_owner and brand_id='dropou' and canonical_url=canonical for update;
 end if;
 select * into s from public.shopee_saved_products where id=p_id and owner_id=p_owner and brand_id='dropou' for update;
 if s.id is null or s.state<>'fetching' or s.lease_token is distinct from p_token or s.lease_until<clock_timestamp() then return null;end if;
 if p_data is null then
  update public.shopee_saved_products set state='error',error=left(coalesce(p_error,'Não foi possível consultar o produto.'),400),lease_until=null,lease_token=null,updated_at=clock_timestamp() where id=s.id;
  return s.id;
 end if;
 if target.id is not null and target.id<>s.id then
  -- A full URL and a share link for the same product converge without deleting offers.
  update public.shopee_saved_products set shop_id=p_data->>'shopId',item_id=p_data->>'itemId',data=case when data is null or (data->>'checkedAt')::timestamptz<=(p_data->>'checkedAt')::timestamptz then p_data else data end,
   state='ready',error=null,lease_until=null,lease_token=null,prepared_product_id=coalesce(prepared_product_id,s.prepared_product_id),updated_at=clock_timestamp() where id=target.id;
  delete from public.shopee_saved_products where id=s.id;
  return target.id;
 end if;
 update public.shopee_saved_products set canonical_url=canonical,shop_id=p_data->>'shopId',item_id=p_data->>'itemId',data=p_data,state='ready',error=null,lease_until=null,lease_token=null,updated_at=clock_timestamp() where id=s.id;
 return s.id;
end $$;

create function public.dropou_shopee_saved_prepare(p_owner uuid,p_id uuid,p_product jsonb,p_caption text) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare s public.shopee_saved_products;p public.products;pid uuid;canonical text;saved jsonb;has_offer boolean;
begin
 select * into s from public.shopee_saved_products where id=p_id and owner_id=p_owner and brand_id='dropou';
 if s.id is null or s.data is null or s.state<>'ready' then raise exception 'Consulte os dados oficiais antes de preparar';end if;
 canonical:='shopee.com.br/product/'||s.shop_id||'/'||s.item_id;
 perform pg_advisory_xact_lock(hashtextextended('dropou-shopee-product-'||p_owner::text||s.shop_id||':'||s.item_id,0));
 -- Match the existing Shopee product-before-source lock ordering.
 perform 1 from public.products where owner_id=p_owner and brand_id='dropou' and canonical_url=canonical for update;
 select * into s from public.shopee_saved_products where id=p_id and owner_id=p_owner and brand_id='dropou' for update;
 if s.id is null or s.state<>'ready' then raise exception 'O produto mudou; atualize os salvos';end if;
 if p_product->>'operation' is distinct from 'dropou' or p_product->>'store' is distinct from 'Shopee'
 or p_product->>'originalUrl' is distinct from 'https://'||canonical or p_product->>'name' is distinct from s.data->>'name'
 or p_product->>'affiliateUrl' is distinct from s.data->>'offerLink' or p_product->>'image' is distinct from s.data->>'image'
 or (p_product->>'price')::numeric is distinct from (s.data->>'price')::numeric
 or p_product->>'checkedAt' is distinct from s.data->>'checkedAt' or p_product->'inStock' is distinct from 'null'::jsonb
 or (p_product->>'demo')::boolean is distinct from false then raise exception 'Dados divergentes; consulte o produto novamente';end if;
 select * into p from public.products where owner_id=p_owner and brand_id='dropou' and canonical_url=canonical for update;
 if p.id is null then
  pid:=(p_product->>'id')::uuid;saved:=p_product||jsonb_build_object('status','encontrado','scheduledAt',null,'previousPrice',null,'previousVerified',false);
  insert into public.products(id,owner_id,brand_id,canonical_url,data) values(pid,p_owner,'dropou',canonical,saved);
  select * into p from public.products where id=pid;
  insert into public.price_records(owner_id,brand_id,product_id,price,previous_price,payment_method,checked_at,snapshot) values(p_owner,'dropou',p.id,(saved->>'price')::numeric,null,'nao_informado',(saved->>'checkedAt')::timestamptz,saved);
 end if;
 if p.archived_at is not null then raise exception 'Restaure o produto arquivado no catálogo antes de preparar';end if;
 has_offer:=exists(select 1 from public.offers where product_id=p.id and status<>'excluido');
 -- An unreviewed price range must first go through the existing product editor.
 if not has_offer and (s.data->>'price')::numeric=(s.data->>'priceMax')::numeric then
  if p.data=p_product then
   insert into public.offers(owner_id,brand_id,product_id,caption,original_caption,snapshot,status) values(p_owner,'dropou',p.id,p_caption,p_caption,p.data,'rascunho');
   has_offer:=true;
  end if;
 end if;
 update public.shopee_saved_products set prepared_product_id=p.id,updated_at=clock_timestamp() where id=s.id;
 insert into public.logs(owner_id,brand_id,event,detail) values(p_owner,'dropou','Produto salvo preparado',s.data->>'name');
 return jsonb_build_object('productId',p.id,'needsReview',not has_offer);
end $$;
revoke all on function public.dropou_shopee_saved_claim(uuid,uuid[],boolean),public.dropou_shopee_saved_finish(uuid,uuid,uuid,jsonb,text),public.dropou_shopee_saved_prepare(uuid,uuid,jsonb,text) from public,anon,authenticated;
grant execute on function public.dropou_shopee_saved_claim(uuid,uuid[],boolean),public.dropou_shopee_saved_finish(uuid,uuid,uuid,jsonb,text),public.dropou_shopee_saved_prepare(uuid,uuid,jsonb,text) to service_role;
commit;
