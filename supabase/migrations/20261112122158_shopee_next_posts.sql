begin;
alter table public.shopee_offers add column prepared_product_id uuid references public.products(id) on delete set null;

-- Server-only bridge. Approval prepares a draft; it never schedules or sends.
create function public.dropou_shopee_stage(p_owner uuid,p_cache uuid,p_product jsonb,p_assessment jsonb) returns uuid
language plpgsql security invoker set search_path='' as $$
declare c public.shopee_offers; p public.products; pid uuid; k text; saved jsonb;
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
   saved:=p_product||jsonb_build_object('status','encontrado','scheduledAt',null,'previousPrice',null,'previousVerified',false);
   insert into public.products(id,owner_id,brand_id,canonical_url,data) values(pid,p_owner,'dropou',k,saved) on conflict(owner_id,brand_id,canonical_url) do nothing;
   select * into p from public.products where owner_id=p_owner and brand_id='dropou' and canonical_url=k for update;
   if p.id=pid then
     insert into public.price_records(owner_id,brand_id,product_id,price,previous_price,payment_method,checked_at,snapshot)
     values(p_owner,'dropou',p.id,(saved->>'price')::numeric,null,'nao_informado',(saved->>'checkedAt')::timestamptz,saved);
   end if;
 end if;
 if p.archived_at is not null then raise exception 'Restaure o produto arquivado no catálogo antes de preparar';end if;
 -- Existing edits, receipts and schedules survive repeated approval.
 insert into public.offers(owner_id,brand_id,product_id,caption,original_caption,snapshot,status)
 select p_owner,'dropou',p.id,public.dropou_safe_publication_caption(p.data),public.dropou_safe_publication_caption(p.data),p.data,'rascunho'
 where not exists(select 1 from public.offers where product_id=p.id and status<>'excluido')
 on conflict(product_id) where status<>'excluido' do nothing;
 update public.shopee_offers set decision='approved',prepared_product_id=p.id,assessment=p_assessment,eligible=true,score=(p_assessment->>'score')::integer,reasons=p_assessment->'reasons' where id=c.id;
 insert into public.logs(owner_id,brand_id,event,detail) values(p_owner,'dropou','Oferta aprovada para próximos posts',c.data->>'name');
 return p.id;
end $$;
revoke all on function public.dropou_shopee_stage(uuid,uuid,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.dropou_shopee_stage(uuid,uuid,jsonb,jsonb) to service_role;
commit;
