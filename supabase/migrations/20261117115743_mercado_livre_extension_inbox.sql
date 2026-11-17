-- Local incremental migration. Does not install a cron, enable integrations or send messages.
begin;
create table public.ml_extension_inbox(
 id uuid primary key default gen_random_uuid(),owner_id uuid not null references auth.users(id),actor_id uuid not null references auth.users(id),
 brand_id text not null references public.affiliate_operations(id) check(brand_id in ('dropou','bruto','moda','celulares','tenis','automoto')),
 request_id uuid not null,original_url text not null check(length(original_url)<=4096),
 candidate_url text not null check(candidate_url ~ '^https://meli\.la/[A-Za-z0-9_-]{1,200}$'),
 identity_key text not null check(identity_key ~ '^(item|catalog):MLB[0-9]{5,20}$'),
 draft jsonb not null check(jsonb_typeof(draft)='object'),message text not null,
 state text not null default 'pending' check(state in ('pending','prepared')),product_id uuid references public.products(id) on delete set null,
 existing boolean not null default false,destination_match boolean,created_at timestamptz not null default now(),reviewed_at timestamptz,
 unique(owner_id,brand_id,request_id)
);
create index ml_extension_pending_idx on public.ml_extension_inbox(owner_id,brand_id,created_at desc) where state='pending';
create index ml_extension_actor_idx on public.ml_extension_inbox(actor_id);
create index ml_extension_brand_idx on public.ml_extension_inbox(brand_id);
create index ml_extension_product_idx on public.ml_extension_inbox(product_id);
alter table public.ml_extension_inbox enable row level security;
create policy ml_extension_read on public.ml_extension_inbox for select to authenticated using(
 owner_id=(select private.dropou_workspace_owner()) and private.dropou_channel_allowed(brand_id) and public.dropou_brand_scope(brand_id));
revoke all on public.ml_extension_inbox from public,anon,authenticated;
grant select on public.ml_extension_inbox to authenticated;
grant all on public.ml_extension_inbox to service_role;
create function public.dropou_ml_extension_prepare(p_owner uuid,p_actor uuid,p_brand text,p_id uuid,p_product jsonb,p_key text) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare r public.ml_extension_inbox;p public.products;saved jsonb;was_existing boolean:=false;
begin
 if p_actor is distinct from p_owner and not exists(select 1 from public.operation_members where member_id=p_actor and owner_id=p_owner and active and (role='admin' or p_brand=any(brands))) then raise exception 'Integrante sem acesso à operação';end if;
 select * into r from public.ml_extension_inbox where id=p_id and owner_id=p_owner and brand_id=p_brand for update;
 if r.id is null then raise exception 'Solicitação indisponível nesta operação';end if;
 if r.state='prepared' then
  select * into p from public.products where id=r.product_id and owner_id=p_owner and brand_id=p_brand;
  if p.id is null or p.archived_at is not null then raise exception 'Cadastro removido ou arquivado. Revise o catálogo';end if;
  return jsonb_build_object('product',p.data,'existing',r.existing);
 end if;
 if p_key is distinct from 'mercadolivre.com.br/'||r.identity_key or p_product->>'id' is distinct from r.draft->>'id' or p_product->>'operation' is distinct from p_brand
  or p_product->>'store' is distinct from 'Mercado Livre' or p_product->>'originalUrl' is distinct from r.draft->>'originalUrl'
  or p_product->'mercadoLivreImport'->>'resolvedUrl' is distinct from r.draft->'mercadoLivreImport'->>'resolvedUrl'
  or p_product->>'affiliateUrl' is distinct from r.candidate_url or p_product->'mercadoLivreImport'->>'affiliateConfirmed' is distinct from 'true'
  or coalesce((p_product->>'price')::numeric,0)<=0 or coalesce(length(p_product->>'name'),0)<3 or coalesce((p_product->>'demo')::boolean,true)
 then raise exception 'Conferência ou identificação inválida';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_owner::text||':'||p_brand||':'||p_key,0));
 select * into p from public.products where owner_id=p_owner and brand_id=p_brand and
 (canonical_url=p_key or (r.existing and id=(r.draft->>'id')::uuid) or (r.identity_key like 'item:%' and (data->'mercadoLivreImport'->>'itemId'=substr(r.identity_key,6) or data->'source'->>'itemId'=substr(r.identity_key,6)))) order by created_at,id limit 1 for update;
 if p.id is null then
  saved:=p_product||jsonb_build_object('status','encontrado','scheduledAt',null);
  insert into public.products(id,owner_id,brand_id,canonical_url,data) values((saved->>'id')::uuid,p_owner,p_brand,p_key,saved) on conflict(owner_id,brand_id,canonical_url) do nothing returning * into p;
  if p.id is null then select * into p from public.products where owner_id=p_owner and brand_id=p_brand and canonical_url=p_key for update;was_existing:=true;
  else
   insert into public.price_records(owner_id,product_id,price,previous_price,payment_method,checked_at,snapshot) values(p_owner,p.id,(saved->>'price')::numeric,null,'nao_informado',(saved->>'checkedAt')::timestamptz,saved);
   insert into public.logs(owner_id,brand_id,event,detail) values(p_owner,p_brand,'Produto recebido da extensão',p.id::text);
  end if;
 else was_existing:=true;end if;
 if p.archived_at is not null then raise exception 'Este anúncio está arquivado. Restaure o cadastro existente no catálogo';end if;
 -- Explicit review may fill a missing affiliate link. Existing links and all other edits stay intact.
 if was_existing and coalesce(p.data->>'affiliateUrl','')='' then
  saved:=p.data||jsonb_build_object('affiliateUrl',r.candidate_url,'mercadoLivreImport',
   coalesce(p.data->'mercadoLivreImport',r.draft->'mercadoLivreImport')||jsonb_build_object('affiliateState','informed','affiliateConfirmed',true),
   'status',case when p.data->>'status'='aguardando link' then 'encontrado' else p.data->>'status' end);
  update public.products set data=saved where id=p.id returning * into p;
  update public.offers set status='rascunho',updated_at=now() where product_id=p.id and status<>'excluido';
 end if;
 update public.ml_extension_inbox set state='prepared',product_id=p.id,existing=was_existing,reviewed_at=now() where id=r.id;
 return jsonb_build_object('product',p.data,'existing',was_existing);
end $$;
revoke all on function public.dropou_ml_extension_prepare(uuid,uuid,text,uuid,jsonb,text) from public,anon,authenticated;
grant execute on function public.dropou_ml_extension_prepare(uuid,uuid,text,uuid,jsonb,text) to service_role;
commit;
