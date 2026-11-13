begin;
-- A draft may display the recorded price. Sending still requires current verification.
create function public.dropou_priced_draft_caption(p jsonb) returns text
language sql immutable security invoker set search_path='' as $$
 select E'🔥 OLHA ESSE ACHADO TECH!\n\n🎮 *'||left(regexp_replace(p->>'name',E'[\\r\\n*_~<>\\[\\]]',' ','g'),140)||'*'
 ||E'\n\n💰 *POR APENAS R$'||chr(160)||translate(to_char((p->>'price')::numeric,'FM9,999,990.00'),'.,',',.')
 ||case when p->>'paymentMethod'='pix' then ' no Pix' else '' end
 ||E'!*\n\n🛒 Garanta o seu aqui:\n🔗 '||(p->>'affiliateUrl')
 ||E'\n\n#publi | Dropou 🎮'
$$;
revoke all on function public.dropou_priced_draft_caption(jsonb) from public,anon;
grant execute on function public.dropou_priced_draft_caption(jsonb) to authenticated,service_role;

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
create or replace function public.dropou_publication_claim_v2(p_job uuid,p_target text,p_automatic boolean) returns jsonb language plpgsql security invoker set search_path='' as $$
declare j public.telegram_jobs;s public.operation_settings;result jsonb;begin
 select * into j from public.telegram_jobs where id=p_job;
 select * into s from public.operation_settings where owner_id=j.owner_id and brand_id=j.brand_id for share;
 if p_automatic and not coalesce(s.automation_enabled,false) then return null;end if;
 if j.channel='telegram' and ((s.telegram_chat_id is not null and s.telegram_chat_id is distinct from j.destination_id) or (s.telegram_chat_id is null and j.brand_id<>'dropou')) then
  update public.telegram_jobs set state='blocked',error='Destino da marca alterado ou não configurado; autorize novamente' where id=j.id and state='queued';return null;
 end if;
 if j.channel='whatsapp' and (coalesce(s.whatsapp_name,'')='' or s.whatsapp_name is distinct from j.destination_title) then
  update public.telegram_jobs set state='blocked',error='Destino WhatsApp desta marca mudou; revise o preparo manual' where id=j.id and state='queued';return null;
 end if;
 if p_automatic and s.automatic_not_before is not null and j.scheduled_at<=s.automatic_not_before then
  update public.telegram_jobs set state='blocked',error='Horário anterior à retomada desta marca; revise antes de reagendar' where id=j.id and state='queued';return null;
 end if;
 result:=public.dropou_singlebrand_claim(p_job,p_target,p_automatic);
 if result is null then update public.telegram_jobs set error='A conferência venceu. Revalide o preço e autorize novamente.' where id=p_job and brand_id='dropou' and state='blocked' and not allow_safe and error='A conferência venceu. Confira a prévia sem valores e autorize novamente';end if;
 return result;
end $$;
commit;
