begin;
-- Existing reviewed prices are preserved; changed API values require another review.
create or replace function public.dropou_shopee_saved_prepare(p_owner uuid,p_id uuid,p_product jsonb,p_caption text) returns jsonb
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
 return jsonb_build_object('productId',p.id,'needsReview',not has_offer or (p.data->>'price')::numeric is distinct from (s.data->>'price')::numeric);
end $$;
commit;
