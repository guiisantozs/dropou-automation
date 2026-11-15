begin;
-- Raw, public product metadata only. No OAuth tokens or edited channel products.
create table public.mercado_livre_import_cache(
 owner_id uuid not null references auth.users(id) on delete cascade,
 path text not null check(length(path)<=1800),resource text not null check(resource in ('item','catalog','price')),
 data jsonb,check_result jsonb,expires_at timestamptz not null default '-infinity',
 lease uuid,lease_until timestamptz,updated_at timestamptz not null default now(),
 primary key(owner_id,path)
);
create index mercado_livre_import_leases_idx on public.mercado_livre_import_cache(owner_id,lease_until) where lease is not null;
create table public.mercado_livre_import_cooldowns(
 owner_id uuid not null references auth.users(id) on delete cascade,
 resource text not null check(resource in ('item','catalog','price','all')),retry_at timestamptz not null,check_result jsonb not null,
 primary key(owner_id,resource)
);
alter table public.mercado_livre_import_cache enable row level security;
alter table public.mercado_livre_import_cooldowns enable row level security;
revoke all on public.mercado_livre_import_cache,public.mercado_livre_import_cooldowns from public,anon,authenticated;
grant select,insert,update,delete on public.mercado_livre_import_cache,public.mercado_livre_import_cooldowns to service_role;

create function public.dropou_ml_import_claim(p_owner uuid,p_path text,p_resource text,p_lease uuid) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare c public.mercado_livre_import_cache;blocked jsonb;now_at timestamptz:=clock_timestamp();
begin
 if p_resource not in ('item','catalog','price') or length(p_path)>1800 or p_path !~ '^/(items/MLB[0-9]{5,20}(/sale_price\?context=channel_marketplace)?|products/MLB[0-9]{5,20}|products/search\?status=active&site_id=MLB&q=[A-Za-z0-9%+_.~-]+&limit=5)$' then raise exception 'Recurso inválido';end if;
 perform pg_advisory_xact_lock(hashtextextended('ml-import:'||p_owner::text,0));
 delete from public.mercado_livre_import_cache where owner_id=p_owner and path in(
  select path from public.mercado_livre_import_cache where owner_id=p_owner and updated_at<now_at-interval '7 days' and coalesce(lease_until,'-infinity')<now_at order by updated_at limit 100
 );
 delete from public.mercado_livre_import_cooldowns where owner_id=p_owner and retry_at<=now_at;
 select * into c from public.mercado_livre_import_cache where owner_id=p_owner and path=p_path for update;
 if c.expires_at>now_at then return jsonb_build_object('mode','cached','data',c.data,'check',c.check_result||'{"cached":true}'::jsonb);end if;
 select check_result||jsonb_build_object('cached',true,'retryAt',retry_at) into blocked from public.mercado_livre_import_cooldowns
 where owner_id=p_owner and resource in(p_resource,'all') and retry_at>now_at order by retry_at desc limit 1;
 if blocked is not null then return jsonb_build_object('mode','blocked','data',null,'check',blocked||jsonb_build_object('resource',p_resource));end if;
 if c.lease_until>now_at or (select count(*) from public.mercado_livre_import_cache where owner_id=p_owner and lease_until>now_at)>=3 then
  return jsonb_build_object('mode','pending','data',null,'check',jsonb_build_object('resource',p_resource,'state','pending','retryAt',now_at+interval '15 seconds'));
 end if;
 insert into public.mercado_livre_import_cache(owner_id,path,resource,lease,lease_until) values(p_owner,p_path,p_resource,p_lease,now_at+interval '30 seconds')
 on conflict(owner_id,path) do update set lease=p_lease,lease_until=excluded.lease_until;
 return jsonb_build_object('mode','claimed');
end $$;

create function public.dropou_ml_import_finish(p_owner uuid,p_path text,p_lease uuid,p_data jsonb,p_check jsonb,p_seconds integer) returns boolean
language plpgsql security invoker set search_path='' as $$
declare r text;expires timestamptz:=clock_timestamp()+make_interval(secs=>greatest(15,least(p_seconds,86400)));
begin
 update public.mercado_livre_import_cache set data=p_data,check_result=p_check,expires_at=expires,lease=null,lease_until=null,updated_at=clock_timestamp()
 where owner_id=p_owner and path=p_path and lease=p_lease returning resource into r;
 if r is null then return false;end if;
 -- A 403 can be specific to one listing. Its cached response stops retries of that
 -- exact request; it is not evidence that every other listing is forbidden.
 if p_check->>'state' in ('unauthorized','rate_limit') then
  insert into public.mercado_livre_import_cooldowns(owner_id,resource,retry_at,check_result)
  values(p_owner,case when p_check->>'state' in ('unauthorized','rate_limit') then 'all' else r end,expires,p_check)
  on conflict(owner_id,resource) do update set retry_at=excluded.retry_at,check_result=excluded.check_result;
 end if;
 return true;
end $$;
revoke all on function public.dropou_ml_import_claim(uuid,text,text,uuid),public.dropou_ml_import_finish(uuid,text,uuid,jsonb,jsonb,integer) from public,anon,authenticated;
grant execute on function public.dropou_ml_import_claim(uuid,text,text,uuid),public.dropou_ml_import_finish(uuid,text,uuid,jsonb,jsonb,integer) to service_role;
-- Lookup is always scoped to the operator's current channel through the existing RLS.
create index products_ml_import_identity_idx on public.products(owner_id,brand_id,((data->'mercadoLivreImport'->>'itemId'))) where data->>'store'='Mercado Livre';
commit;
