-- Incremental: no destination, budget, automation, historical receipt or cron changes.
begin;
alter table public.operation_settings add column celulares_curation jsonb not null default '{}' check(jsonb_typeof(celulares_curation)='object');
alter table public.shopee_search_leases add column search_cursor bigint not null default 0 check(search_cursor>=0);
alter table public.shopee_search_leases add column last_success_at timestamptz;
alter table public.shopee_search_leases add column success_policy_hash text;
alter table public.shopee_observations add column variant_key text;

create function public.dropou_celulares_search_window(p_owner uuid,p_token uuid,p_steps integer,p_cache_minutes integer,p_policy_hash text) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare l public.shopee_search_leases;begin
 if p_steps not between 1 and 5 or p_cache_minutes not between 1 and 60 or p_policy_hash !~ '^[a-f0-9]{64}$' then raise exception 'Parâmetros de busca inválidos';end if;
 select * into l from public.shopee_search_leases where owner_id=p_owner and brand_id='celulares' and token=p_token and lease_until>clock_timestamp() for update;
 if l.token is null then raise exception 'Reserva de busca expirada';end if;
 if l.success_policy_hash=p_policy_hash and l.last_success_at>clock_timestamp()-make_interval(mins=>p_cache_minutes) then return jsonb_build_object('cached',true,'retryAt',l.last_success_at+make_interval(mins=>p_cache_minutes));end if;
 update public.shopee_search_leases set search_cursor=search_cursor+p_steps where owner_id=p_owner and brand_id='celulares' and token=p_token;
 return jsonb_build_object('cached',false,'cursor',l.search_cursor);
end $$;
create function public.dropou_celulares_search_complete(p_owner uuid,p_token uuid,p_policy_hash text) returns void
language plpgsql security invoker set search_path='' as $$ begin
 update public.shopee_search_leases set last_success_at=clock_timestamp(),success_policy_hash=p_policy_hash
 where owner_id=p_owner and brand_id='celulares' and token=p_token and lease_until>clock_timestamp();
 if not found then raise exception 'Reserva de busca expirada';end if;
end $$;
create function public.dropou_celulares_cache(p_owner uuid,p_token uuid,p_rows jsonb) returns void
language plpgsql security invoker set search_path='' as $$ begin
 perform 1 from public.shopee_search_leases where owner_id=p_owner and brand_id='celulares' and token=p_token and lease_until>clock_timestamp() for update;
 if not found then raise exception 'Reserva de busca expirada';end if;
 perform public.dropou_shopee_cache_channel('celulares',p_owner,p_rows);
 update public.shopee_observations h set variant_key=r.assessment#>>'{mobile,variantKey}'
 from jsonb_to_recordset(p_rows) as r(shop_id text,item_id text,checked_at timestamptz,assessment jsonb)
 where h.owner_id=p_owner and h.brand_id='celulares' and h.shop_id=r.shop_id and h.item_id=r.item_id and h.observed_at=r.checked_at;
end $$;
revoke all on function public.dropou_celulares_search_window(uuid,uuid,integer,integer,text),public.dropou_celulares_search_complete(uuid,uuid,text),public.dropou_celulares_cache(uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.dropou_celulares_search_window(uuid,uuid,integer,integer,text),public.dropou_celulares_search_complete(uuid,uuid,text),public.dropou_celulares_cache(uuid,uuid,jsonb) to service_role;

-- One catalog identity, many existing channel-specific records. Preserve every
-- edited snapshot and decision rather than merging data or old publication proof.
create table public.catalog_product_identities(
 id uuid primary key default gen_random_uuid(),owner_id uuid not null references auth.users(id),canonical_url text not null,
 created_at timestamptz not null default now(),unique(owner_id,canonical_url),unique(owner_id,id)
);
alter table public.catalog_product_identities enable row level security;
revoke all on public.catalog_product_identities from public,anon,authenticated;
grant select on public.catalog_product_identities to authenticated;
grant all on public.catalog_product_identities to service_role;
alter table public.products add column identity_id uuid;
insert into public.catalog_product_identities(owner_id,canonical_url) select distinct owner_id,canonical_url from public.products;
do $$ declare before_state text;after_state text;begin
 select md5(string_agg((to_jsonb(p)-'identity_id')::text,'' order by id)) into before_state from public.products p;
 update public.products p set identity_id=i.id from public.catalog_product_identities i where i.owner_id=p.owner_id and i.canonical_url=p.canonical_url;
 select md5(string_agg((to_jsonb(p)-'identity_id')::text,'' order by id)) into after_state from public.products p;
 if before_state is distinct from after_state then raise exception 'A vinculação alterou dados existentes; migração cancelada';end if;
end $$;
alter table public.products alter column identity_id set not null;
alter table public.products add constraint products_catalog_identity_fk foreign key(owner_id,identity_id) references public.catalog_product_identities(owner_id,id);
create index products_catalog_identity_idx on public.products(identity_id,owner_id,brand_id);
create policy catalog_identity_read on public.catalog_product_identities for select to authenticated using(owner_id=(select private.dropou_workspace_owner()) and exists(select 1 from public.products p where p.identity_id=catalog_product_identities.id and p.owner_id=catalog_product_identities.owner_id));

-- Narrow private trigger: table callers cannot write identities or reassign one.
-- RLS INSERT checks run after BEFORE triggers, so authorize the actor here too.
create function private.dropou_bind_catalog_identity() returns trigger language plpgsql security definer set search_path='' as $$
declare identity uuid;begin
 if current_setting('role',true)<>'service_role' and not(coalesce(new.owner_id=private.dropou_workspace_owner() and private.dropou_channel_allowed(new.brand_id),false)) then raise exception 'Canal não autorizado para vincular produto';end if;
 insert into public.catalog_product_identities(owner_id,canonical_url) values(new.owner_id,new.canonical_url) on conflict(owner_id,canonical_url) do nothing returning id into identity;
 if identity is null then select id into identity from public.catalog_product_identities where owner_id=new.owner_id and canonical_url=new.canonical_url;end if;
 new.identity_id:=identity;return new;
end $$;
revoke all on function private.dropou_bind_catalog_identity() from public,anon,authenticated;
grant execute on function private.dropou_bind_catalog_identity() to service_role;
create trigger products_bind_catalog_identity before insert or update of owner_id,canonical_url,identity_id on public.products for each row execute function private.dropou_bind_catalog_identity();

create function public.dropou_shared_whatsapp_mark(p_owner uuid,p_actor uuid,p_offer uuid,p_brand text,p_request uuid,p_expected jsonb,p_caption text) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare source public.offers;origin public.products;destination public.products;dest_offer public.offers;pid uuid;data jsonb;result jsonb;group_url text;begin
 perform pg_advisory_xact_lock(hashtextextended('publication-batch-'||p_owner::text,0));
 perform private.dropou_assert_publication_actor(p_owner,p_brand,p_actor);
 select * into origin from public.products where owner_id=p_owner and id=(select product_id from public.offers where owner_id=p_owner and id=p_offer) for update;
 select * into source from public.offers where owner_id=p_owner and id=p_offer for update;
 if source.id is null then raise exception 'Oferta indisponível';end if;
 perform private.dropou_assert_publication_actor(p_owner,source.brand_id,p_actor);
 if origin.archived_at is not null or origin.curation_state='rejected' or source.status='excluido' or origin.data is distinct from source.snapshot or source.snapshot is distinct from p_expected or source.caption is distinct from p_caption or not public.dropou_publication_caption_valid(source.snapshot,p_caption,'verified') then raise exception 'Oferta alterada ou não aprovada';end if;
 select whatsapp_url into group_url from public.operation_settings where owner_id=p_owner and brand_id=p_brand;
 if coalesce(group_url,'') !~ '^https://(chat\.whatsapp\.com/[A-Za-z0-9]+|whatsapp\.com/channel/[A-Za-z0-9]+)/?$' then raise exception 'Configure o destino WhatsApp deste canal';end if;
 select * into destination from public.products where owner_id=p_owner and brand_id=p_brand and canonical_url=origin.canonical_url for update;
 if destination.id is null then
  pid:=gen_random_uuid();data:=source.snapshot||jsonb_build_object('id',pid,'operation',p_brand,'status','pronto','scheduledAt',null,'createdAt',to_char(now() at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'));
  insert into public.products(id,owner_id,brand_id,canonical_url,data,curation_state) values(pid,p_owner,p_brand,origin.canonical_url,data,'approved') returning * into destination;
  insert into public.offers(owner_id,product_id,brand_id,caption,original_caption,manually_edited,snapshot,status) values(p_owner,pid,p_brand,p_caption,p_caption,true,data,'pronto') returning * into dest_offer;
 else
  if destination.archived_at is not null or destination.curation_state='rejected' then raise exception 'Produto arquivado ou rejeitado neste canal';end if;
  select * into dest_offer from public.offers where owner_id=p_owner and product_id=destination.id and status<>'excluido' for update;
  if dest_offer.id is null or dest_offer.snapshot is distinct from destination.data or dest_offer.caption is distinct from p_caption or (destination.data-array['id','operation','createdAt','status','scheduledAt']) is distinct from (source.snapshot-array['id','operation','createdAt','status','scheduledAt']) then raise exception 'Há outro cadastro ou edição neste canal. Revise antes de compartilhar';end if;
 end if;
 result:=public.dropou_publication_mark_actor(p_owner,p_brand,destination.id,p_actor,'whatsapp',p_request,null,false,false);
 return result||jsonb_build_object('brand',p_brand,'productId',destination.id,'identityId',destination.identity_id,'channel','whatsapp');
end $$;
revoke all on function public.dropou_shared_whatsapp_mark(uuid,uuid,uuid,text,uuid,jsonb,text) from public,anon,authenticated;
grant execute on function public.dropou_shared_whatsapp_mark(uuid,uuid,uuid,text,uuid,jsonb,text) to service_role;
commit;
