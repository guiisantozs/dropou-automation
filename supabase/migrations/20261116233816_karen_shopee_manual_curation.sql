-- Only manual Shopee search/import/preparation. No destinations, sends or cron.
begin;
alter table public.operation_settings drop constraint local_brands_integrations_off;
alter table public.operation_settings add constraint local_brands_integrations_off check(
 brand_id not in ('beleza','casa','natal') or
 (not automation_enabled and automatic_not_before is null and telegram_chat_id is null and telegram_title is null and telegram_verified_at is null
 and whatsapp_name='' and whatsapp_url='' and coalesce((shopee_config->>'enabled')::boolean,false)=false
 and coalesce((shopee_config->>'dryRun')::boolean,true)=true and coalesce((shopee_config->>'requireReview')::boolean,true)=true));
alter table public.shopee_offers drop constraint shopee_offers_channels_check;
alter table public.shopee_offers add constraint shopee_offers_channels_check check(brand_id in ('dropou','celulares','tenis','automoto','beleza','casa','natal'));
alter table public.shopee_saved_products drop constraint shopee_saved_products_channels_check;
alter table public.shopee_saved_products add constraint shopee_saved_products_channels_check check(brand_id in ('dropou','celulares','tenis','automoto','beleza','casa','natal'));
alter table public.shopee_observations drop constraint shopee_observations_channels_check;
alter table public.shopee_observations add constraint shopee_observations_channels_check check(brand_id in ('dropou','celulares','tenis','automoto','beleza','casa','natal'));

alter table public.shopee_search_leases add column member_cursor integer not null default 0 check(member_cursor>=0);
alter table public.shopee_search_leases add column member_policy_hash text;
alter table public.shopee_search_leases add column member_cached_until timestamptz;
create function public.dropou_member_search_window(p_owner uuid,p_brand text,p_token uuid,p_policy_hash text,p_steps integer) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare s public.shopee_search_leases;
begin
 if p_brand not in ('beleza','casa','natal') or p_steps not between 1 and 3 or length(p_policy_hash)<>64 then raise exception 'Curadoria inválida';end if;
 select * into s from public.shopee_search_leases where owner_id=p_owner and brand_id=p_brand and token=p_token and lease_until>clock_timestamp() for update;
 if not found then raise exception 'Reserva de busca indisponível';end if;
 if s.member_policy_hash=p_policy_hash and s.member_cached_until>clock_timestamp() then return jsonb_build_object('cached',true,'retryAt',s.member_cached_until);end if;
 update public.shopee_search_leases set member_cursor=(s.member_cursor+p_steps)%1000000 where owner_id=p_owner and brand_id=p_brand and token=p_token;
 return jsonb_build_object('cached',false,'cursor',s.member_cursor);
end $$;
create function public.dropou_member_search_complete(p_owner uuid,p_brand text,p_token uuid,p_policy_hash text) returns void
language plpgsql security invoker set search_path='' as $$
begin
 if p_brand not in ('beleza','casa','natal') or length(p_policy_hash)<>64 then raise exception 'Curadoria inválida';end if;
 update public.shopee_search_leases set member_policy_hash=p_policy_hash,member_cached_until=clock_timestamp()+interval '30 minutes'
 where owner_id=p_owner and brand_id=p_brand and token=p_token and lease_until>clock_timestamp();
 if not found then raise exception 'Reserva de busca expirou; atualize os resultados';end if;
end $$;
revoke all on function public.dropou_member_search_window(uuid,text,uuid,text,integer),public.dropou_member_search_complete(uuid,text,uuid,text) from public,anon,authenticated;
grant execute on function public.dropou_member_search_window(uuid,text,uuid,text,integer),public.dropou_member_search_complete(uuid,text,uuid,text) to service_role;

-- Exact provider link + product identity, from server-only writes. RLS still
-- applies to these reads; no definer, new privilege or browser credential.
create function private.dropou_member_affiliate_url(p_url text) returns boolean language sql immutable security invoker set search_path='' as $$
 select coalesce((p_url ~ '^https://(s[.]shopee[.]com[.]br|shope[.]ee)/[A-Za-z0-9_-]{2,100}/?([?][^[:space:]<>]*)?$'
 and p_url !~ '^https://(s[.]shopee[.]com[.]br|shope[.]ee)/(an_redir|product|search|shop)/?([?]|$)')
 or p_url ~ '^https://(s[.])?shopee[.]com[.]br/[^[:space:]<>]*[?&]affiliate_id=[0-9]+([&#]|$)',false);
$$;
revoke all on function private.dropou_member_affiliate_url(text) from public,anon;
grant execute on function private.dropou_member_affiliate_url(text) to authenticated,service_role;
-- A recent but invalid legacy ready link must be claimable for repair, too.
do $$ declare definition text; patched text; begin
 definition:=pg_get_functiondef('public.dropou_shopee_saved_claim_channel(text,uuid,uuid[],boolean)'::regprocedure);
 patched:=replace(definition,$old$state in ('pending','error')$old$,$new$(state in ('pending','error') or (p_brand in ('beleza','casa','natal') and state='ready' and not private.dropou_member_affiliate_url(data->>'offerLink')))$new$);
 if patched=definition then raise exception 'Unexpected saved-claim definition; review this incremental migration';end if;
 execute patched;
end $$;
create function private.dropou_member_affiliate_allowed(p_owner uuid,p_brand text,p_data jsonb) returns boolean
language sql stable security invoker set search_path='' as $$
 select private.dropou_member_affiliate_url(p_data->>'affiliateUrl')
 and (exists(
  select 1 from (
   select s.data from public.shopee_saved_products s where s.owner_id=p_owner and s.brand_id=p_brand and s.state='ready'
   union all select c.data from public.shopee_offers c where c.owner_id=p_owner and c.brand_id=p_brand
  ) evidence where evidence.data->>'offerLink'=p_data->>'affiliateUrl'
  and p_data->>'originalUrl'='https://shopee.com.br/product/'||(evidence.data->>'shopId')||'/'||(evidence.data->>'itemId')
 ) or exists(
  select 1 from public.offers o where o.owner_id=p_owner and o.brand_id=p_brand and o.product_id::text=p_data->>'id' and o.status<>'excluido'
  and o.snapshot->>'affiliateUrl'=p_data->>'affiliateUrl' and o.snapshot->>'originalUrl'=p_data->>'originalUrl'
 ));
$$;
revoke all on function private.dropou_member_affiliate_allowed(uuid,text,jsonb) from public,anon;
grant execute on function private.dropou_member_affiliate_allowed(uuid,text,jsonb) to authenticated,service_role;
create function private.dropou_member_affiliate_guard() returns trigger language plpgsql security invoker set search_path='' as $$
declare payload jsonb; previous jsonb;
begin
 if new.brand_id not in ('beleza','casa','natal') then return new;end if;
 if tg_table_name='offers' then
  if new.status='excluido' then return new;end if;
  payload:=new.snapshot;
  if tg_op='UPDATE' then previous:=old.snapshot;end if;
 else
  if new.curation_state<>'approved' and coalesce(new.data->>'status','') not in ('pronto','agendado','publicado') then return new;end if;
  payload:=new.data;
 end if;
 if payload->>'store'<>'Shopee' then return new;end if;
 -- Existing offer edits keep a verified binding after saved-link retention.
 if previous is not null and previous->>'affiliateUrl'=payload->>'affiliateUrl' and previous->>'originalUrl'=payload->>'originalUrl' then return new;end if;
 if not private.dropou_member_affiliate_allowed(new.owner_id,new.brand_id,payload) then raise exception 'Link de afiliado não validado pela integração Shopee. Importe ou atualize o link antes de preparar a oferta.';end if;
 return new;
end $$;
revoke all on function private.dropou_member_affiliate_guard() from public,anon,authenticated;
create trigger member_affiliate_offer before insert or update of snapshot,status on public.offers for each row execute function private.dropou_member_affiliate_guard();
create trigger member_affiliate_product before insert or update of data,curation_state on public.products for each row execute function private.dropou_member_affiliate_guard();
commit;
