-- Incremental quality evidence only; no scheduler activation or channel changes.
begin;
alter table public.shopee_offers add column assessment jsonb not null default '{}' check(jsonb_typeof(assessment)='object');
create table public.shopee_observations(
 owner_id uuid not null,brand_id text not null,shop_id text not null,item_id text not null,
 observed_at timestamptz not null,sales bigint check(sales>=0),rating numeric check(rating between 0 and 5),
 price numeric not null check(price>0),price_max numeric not null check(price_max>=price),
 primary key(owner_id,brand_id,shop_id,item_id,observed_at),
 foreign key(owner_id,brand_id,shop_id,item_id) references public.shopee_offers(owner_id,brand_id,shop_id,item_id),
 check(brand_id='dropou')
);
alter table public.shopee_observations enable row level security;
create policy shopee_observations_read on public.shopee_observations for select to authenticated using(owner_id=(select auth.uid()) and public.dropou_brand_scope(brand_id));
revoke all on public.shopee_observations from public,anon,authenticated;
grant select on public.shopee_observations to authenticated;
grant all on public.shopee_observations to service_role;
create index shopee_observations_owner_time_idx on public.shopee_observations(owner_id,brand_id,observed_at desc);
create function public.dropou_shopee_observe() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 -- Reassessment does not create an observation. An equal timestamp is idempotent.
 if tg_op='UPDATE' and new.checked_at=old.checked_at then return new;end if;
 insert into public.shopee_observations(owner_id,brand_id,shop_id,item_id,observed_at,sales,rating,price,price_max)
 values(new.owner_id,new.brand_id,new.shop_id,new.item_id,new.checked_at,(new.data->>'sales')::bigint,(new.data->>'rating')::numeric,(new.data->>'price')::numeric,(new.data->>'priceMax')::numeric)
 on conflict do nothing;
 return new;
end $$;
revoke all on function public.dropou_shopee_observe() from public,anon,authenticated;
grant execute on function public.dropou_shopee_observe() to service_role;
create trigger shopee_observe after insert or update of data,checked_at on public.shopee_offers for each row execute function public.dropou_shopee_observe();
-- Only the actually stored observation is migrated. Lost earlier samples are not reconstructed.
insert into public.shopee_observations(owner_id,brand_id,shop_id,item_id,observed_at,sales,rating,price,price_max)
select owner_id,brand_id,shop_id,item_id,checked_at,(data->>'sales')::bigint,(data->>'rating')::numeric,(data->>'price')::numeric,(data->>'priceMax')::numeric from public.shopee_offers;

create or replace function public.dropou_shopee_cache(p_owner uuid,p_rows jsonb) returns void language plpgsql security invoker set search_path='' as $$
begin
 if not exists(select 1 from public.telegram_dispatch_config where p_owner=any(owner_ids)) then raise exception 'Administrador não autorizado';end if;
 if jsonb_typeof(p_rows)<>'array' or jsonb_array_length(p_rows)>50 then raise exception 'Lote inválido';end if;
 insert into public.shopee_offers(owner_id,brand_id,shop_id,item_id,data,score,eligible,reasons,checked_at,assessment)
 select p_owner,'dropou',r.shop_id,r.item_id,r.data,r.score,r.eligible,r.reasons,r.checked_at,coalesce(r.assessment,'{}'::jsonb)
 from jsonb_to_recordset(p_rows) as r(shop_id text,item_id text,data jsonb,score integer,eligible boolean,reasons jsonb,checked_at timestamptz,assessment jsonb) order by r.shop_id,r.item_id
 on conflict(owner_id,brand_id,shop_id,item_id) do update set data=excluded.data,score=excluded.score,eligible=excluded.eligible,reasons=excluded.reasons,checked_at=excluded.checked_at,assessment=excluded.assessment
 where public.shopee_offers.checked_at<=excluded.checked_at;
end $$;
revoke all on function public.dropou_shopee_cache(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.dropou_shopee_cache(uuid,jsonb) to service_role;
commit;
