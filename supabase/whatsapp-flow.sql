-- Após schema.sql. Idempotente. Funções usam os privilégios e RLS do usuário.
begin;
create table if not exists public.price_records (
 id uuid primary key default gen_random_uuid(),
 owner_id uuid not null references auth.users(id),
 product_id uuid not null references public.products(id),
 price numeric(12,2) not null check(price>0),
 previous_price numeric(12,2), payment_method text not null,
 checked_at timestamptz, snapshot jsonb not null,
 recorded_at timestamptz not null default now()
);
create index if not exists price_records_owner_idx on public.price_records(owner_id,product_id);
create table if not exists public.offers (
 id uuid primary key default gen_random_uuid(),
 owner_id uuid not null references auth.users(id),
 product_id uuid not null references public.products(id),
 caption text not null check(length(caption) between 1 and 4000),
 snapshot jsonb not null,
 status text not null check(status in ('rascunho','pronto','publicado','excluido')),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index if not exists offers_owner_idx on public.offers(owner_id,product_id);
create unique index if not exists offers_active_product_idx on public.offers(product_id) where status<>'excluido';
create table if not exists public.publications (
 id uuid primary key default gen_random_uuid(),
 owner_id uuid not null references auth.users(id),
 offer_id uuid not null unique references public.offers(id),
 product_id uuid not null unique references public.products(id),
 channel text not null default 'whatsapp' check(channel='whatsapp'),
 caption text not null, snapshot jsonb not null,
 published_at timestamptz not null default now()
);
create index if not exists publications_owner_idx on public.publications(owner_id);
alter table public.price_records enable row level security;
alter table public.offers enable row level security;
alter table public.publications enable row level security;
drop policy if exists prices_read on public.price_records;
create policy prices_read on public.price_records for select to authenticated using((select auth.uid())=owner_id);
drop policy if exists prices_insert on public.price_records;
create policy prices_insert on public.price_records for insert to authenticated with check((select auth.uid())=owner_id and exists(select 1 from public.products p where p.id=product_id and p.owner_id=(select auth.uid())));
drop policy if exists offers_read on public.offers;
create policy offers_read on public.offers for select to authenticated using((select auth.uid())=owner_id);
drop policy if exists offers_insert on public.offers;
create policy offers_insert on public.offers for insert to authenticated with check((select auth.uid())=owner_id and exists(select 1 from public.products p where p.id=product_id and p.owner_id=(select auth.uid())));
drop policy if exists offers_update on public.offers;
create policy offers_update on public.offers for update to authenticated using((select auth.uid())=owner_id) with check((select auth.uid())=owner_id and exists(select 1 from public.products p where p.id=product_id and p.owner_id=(select auth.uid())));
drop policy if exists publications_read on public.publications;
create policy publications_read on public.publications for select to authenticated using((select auth.uid())=owner_id);
drop policy if exists publications_insert on public.publications;
create policy publications_insert on public.publications for insert to authenticated with check((select auth.uid())=owner_id and exists(select 1 from public.offers o where o.id=offer_id and o.owner_id=(select auth.uid()) and o.product_id=publications.product_id));
revoke all on public.price_records,public.offers,public.publications from anon,authenticated;
grant select,insert on public.price_records,public.publications to authenticated;
grant select,insert,update on public.offers to authenticated;

create or replace function public.dropou_publishable(p jsonb) returns boolean
language sql stable security invoker set search_path='' as $$
 select coalesce(
   (p->>'demo')::boolean=false and length(p->>'affiliateUrl')>0
   and (p->>'inStock')::boolean=true
   and (p->>'checkedAt')::timestamptz between now()-interval '15 minutes' and now()+interval '1 second'
   and (coalesce(p->>'paymentMethod','nao_informado')<>'pix' or (p->>'pixVerified')::boolean=true), false)
$$;

create or replace function public.dropou_save_product(p_data jsonb,p_key text) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare uid uuid:=auth.uid(); pid uuid:=(p_data->>'id')::uuid; old_data jsonb; saved jsonb;
begin
 if uid is null or coalesce((p_data->>'demo')::boolean,true) then raise exception 'Cadastro real exige autenticação e dados reais'; end if;
 if (p_data->>'price')::numeric<=0 or length(p_key)=0 then raise exception 'Preço ou link inválido'; end if;
 select data into old_data from public.products where id=pid and owner_id=uid for update;
 if exists(select 1 from public.publications where product_id=pid) then raise exception 'Produto publicado permanece no histórico'; end if;
 saved:=p_data || jsonb_build_object('status',case when length(p_data->>'affiliateUrl')>0 then 'encontrado' else 'aguardando link' end,'scheduledAt',null);
 insert into public.products(id,owner_id,canonical_url,data) values(pid,uid,p_key,saved)
 on conflict(id) do update set data=excluded.data,canonical_url=excluded.canonical_url where products.owner_id=uid;
 if not found then raise exception 'Produto não encontrado'; end if;
 if old_data is distinct from saved then
   insert into public.price_records(owner_id,product_id,price,previous_price,payment_method,checked_at,snapshot)
   values(uid,pid,(saved->>'price')::numeric,(saved->>'previousPrice')::numeric,coalesce(saved->>'paymentMethod','nao_informado'),(saved->>'checkedAt')::timestamptz,saved);
   update public.offers set status='rascunho',updated_at=now() where product_id=pid and status<>'excluido';
 end if;
 insert into public.logs(owner_id,event,detail) values(uid,'Produto salvo',saved->>'name');
 return saved;
end $$;

create or replace function public.dropou_save_offer(p_product uuid,p_expected jsonb,p_caption text) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare uid uuid:=auth.uid(); p jsonb; result public.offers;
begin
 select data into p from public.products where id=p_product and owner_id=uid for update;
 if p is null then raise exception 'Produto não encontrado'; end if;
 if exists(select 1 from public.publications where product_id=p_product) then raise exception 'Produto já publicado'; end if;
 if p is distinct from p_expected then raise exception 'Produto alterado; gere a legenda novamente'; end if;
 if (p->>'demo')::boolean is distinct from false then raise exception 'Demonstração não pode virar oferta real'; end if;
 insert into public.offers(owner_id,product_id,caption,snapshot,status)
 values(uid,p_product,p_caption,p,case when public.dropou_publishable(p) then 'pronto' else 'rascunho' end)
 on conflict(product_id) where status<>'excluido' do update
 set caption=excluded.caption,snapshot=excluded.snapshot,status=excluded.status,updated_at=now()
 returning * into result;
 -- Snapshot acompanha o estado resultante do produto para comparação na publicação.
 if result.status='pronto' then
   p:=p || jsonb_build_object('status','pronto','scheduledAt',null);
   update public.products set data=p where id=p_product and owner_id=uid;
   update public.offers set snapshot=p where id=result.id returning * into result;
 end if;
 insert into public.logs(owner_id,event,detail) values(uid,'Oferta salva',p->>'name');
 return to_jsonb(result);
end $$;

create or replace function public.dropou_guard_publication() returns trigger
language plpgsql security invoker set search_path='' as $$
declare p jsonb; o public.offers;
begin
 select * into o from public.offers where id=new.offer_id and owner_id=auth.uid() for update;
 select data into p from public.products where id=new.product_id and owner_id=auth.uid() for update;
 if o.id is null or p is null or o.product_id<>new.product_id or new.owner_id<>auth.uid()
   or o.status<>'pronto' or o.snapshot is distinct from p or not public.dropou_publishable(p)
   or p->>'status' not in ('pronto','agendado') then
   raise exception 'Publicação bloqueada: salve a oferta com preço, estoque e condições revalidados';
 end if;
 new.caption:=o.caption; new.snapshot:=p; new.published_at:=now();
 return new;
end $$;
drop trigger if exists dropou_publication_guard on public.publications;
create trigger dropou_publication_guard before insert on public.publications for each row execute function public.dropou_guard_publication();

create or replace function public.dropou_publish_offer(p_offer uuid) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare uid uuid:=auth.uid(); o public.offers; result public.publications; pid uuid;
begin
 -- Todas as operações seguem a ordem de locks produto → oferta.
 select product_id into pid from public.offers where id=p_offer and owner_id=uid;
 perform 1 from public.products where id=pid and owner_id=uid for update;
 select * into o from public.offers where id=p_offer and owner_id=uid for update;
 if o.id is null then raise exception 'Oferta não encontrada'; end if;
 select * into result from public.publications where offer_id=p_offer and owner_id=uid;
 if found then return to_jsonb(result); end if;
 insert into public.publications(owner_id,offer_id,product_id,caption,snapshot)
 values(uid,o.id,o.product_id,o.caption,o.snapshot) returning * into result;
 update public.offers set status='publicado',updated_at=now() where id=o.id and owner_id=uid;
 update public.products set data=data||'{"status":"publicado","scheduledAt":null}'::jsonb where id=o.product_id and owner_id=uid;
 insert into public.logs(owner_id,event,detail) values(uid,'Publicação manual registrada',o.product_id::text||' · WhatsApp');
 return to_jsonb(result);
end $$;

create or replace function public.dropou_delete_offer(p_offer uuid) returns void
language plpgsql security invoker set search_path='' as $$
declare uid uuid:=auth.uid(); pid uuid;
begin
 select product_id into pid from public.offers where id=p_offer and owner_id=uid;
 if pid is null then raise exception 'Oferta não encontrada'; end if;
 perform 1 from public.products where id=pid and owner_id=uid for update;
 update public.offers set status='excluido',updated_at=now() where id=p_offer and owner_id=uid;
 update public.products set data=data||'{"status":"encontrado","scheduledAt":null}'::jsonb where id=pid and owner_id=uid and data->>'status'<>'publicado';
 insert into public.logs(owner_id,event,detail) values(uid,'Oferta excluída',p_offer::text||' · histórico preservado');
end $$;
revoke all on function public.dropou_publishable(jsonb),public.dropou_save_product(jsonb,text),public.dropou_save_offer(uuid,jsonb,text),public.dropou_guard_publication(),public.dropou_publish_offer(uuid),public.dropou_delete_offer(uuid) from public,anon;
grant execute on function public.dropou_publishable(jsonb),public.dropou_save_product(jsonb,text),public.dropou_save_offer(uuid,jsonb,text),public.dropou_guard_publication(),public.dropou_publish_offer(uuid),public.dropou_delete_offer(uuid) to authenticated;
commit;
