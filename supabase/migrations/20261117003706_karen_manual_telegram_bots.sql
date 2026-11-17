-- Manual Telegram only. No cron, credentials, automation activation or legacy token changes.
begin;
alter table public.operation_settings drop constraint operation_settings_telegram_bot_env_check;
alter table public.operation_settings add constraint operation_settings_telegram_bot_env_check check(telegram_bot_env in (
 'TELEGRAM_BOT_TOKEN','TELEGRAM_CELULARES_BOT_TOKEN','TELEGRAM_TENIS_BOT_TOKEN','TELEGRAM_AUTOMOTO_BOT_TOKEN',
 'TELEGRAM_BELEZA_BOT_TOKEN','TELEGRAM_CASA_BOT_TOKEN','TELEGRAM_NATAL_BOT_TOKEN'));
update public.operation_settings set telegram_bot_env=case brand_id when 'beleza' then 'TELEGRAM_BELEZA_BOT_TOKEN' when 'casa' then 'TELEGRAM_CASA_BOT_TOKEN' when 'natal' then 'TELEGRAM_NATAL_BOT_TOKEN' end
 where brand_id in ('beleza','casa','natal');
alter table public.operation_settings add constraint operation_telegram_bot_binding check(
 case brand_id when 'beleza' then telegram_bot_env='TELEGRAM_BELEZA_BOT_TOKEN' when 'casa' then telegram_bot_env='TELEGRAM_CASA_BOT_TOKEN' when 'natal' then telegram_bot_env='TELEGRAM_NATAL_BOT_TOKEN'
 else telegram_bot_env in ('TELEGRAM_BOT_TOKEN','TELEGRAM_CELULARES_BOT_TOKEN','TELEGRAM_TENIS_BOT_TOKEN','TELEGRAM_AUTOMOTO_BOT_TOKEN') end);
-- Assign the correct default also for future workspace settings inserts.
create function private.dropou_dedicated_bot_default() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if new.brand_id in ('beleza','casa','natal') and new.telegram_bot_env='TELEGRAM_BOT_TOKEN' then
  new.telegram_bot_env:=case new.brand_id when 'beleza' then 'TELEGRAM_BELEZA_BOT_TOKEN' when 'casa' then 'TELEGRAM_CASA_BOT_TOKEN' else 'TELEGRAM_NATAL_BOT_TOKEN' end;
 end if;return new;
end $$;
revoke all on function private.dropou_dedicated_bot_default() from public,anon,authenticated;
create trigger dedicated_bot_default before insert on public.operation_settings for each row execute function private.dropou_dedicated_bot_default();

alter table public.operation_settings drop constraint local_brands_integrations_off;
alter table public.operation_settings add constraint local_brands_integrations_off check(brand_id not in ('beleza','casa','natal') or
 (not automation_enabled and automatic_not_before is null and whatsapp_name='' and whatsapp_url=''
 and coalesce((shopee_config->>'enabled')::boolean,false)=false and coalesce((shopee_config->>'dryRun')::boolean,true)=true
 and coalesce((shopee_config->>'requireReview')::boolean,true)=true));
alter table public.telegram_jobs drop constraint local_brands_no_jobs;
alter table public.telegram_jobs add constraint local_brands_no_jobs check(brand_id not in ('beleza','casa','natal') or
 (channel='telegram' and shopee_offer_id is null and publication_mode='verified' and not allow_safe));

-- Keep the existing reviewed-snapshot/receipt/duplicate checks for every legacy call.
alter function public.dropou_publication_claim_v2(uuid,text,boolean) rename to dropou_claim_before_manual_bots;
revoke all on function public.dropou_claim_before_manual_bots(uuid,text,boolean) from public,anon,authenticated;
create function public.dropou_publication_claim_v2(p_job uuid,p_target text,p_automatic boolean) returns jsonb language plpgsql security invoker set search_path='' as $$
declare j public.telegram_jobs;s public.operation_settings;begin
 select * into j from public.telegram_jobs where id=p_job;
 if j.brand_id not in ('beleza','casa','natal') then return public.dropou_claim_before_manual_bots(p_job,p_target,p_automatic);end if;
 select * into s from public.operation_settings where owner_id=j.owner_id and brand_id=j.brand_id for share;
 -- queued_by is written only by the server-only actor queue RPC after explicit confirmation.
 if j.queued_by is null or not(j.queued_by=j.owner_id or exists(select 1 from public.operation_members where member_id=j.queued_by and owner_id=j.owner_id and active and (role='admin' or j.brand_id=any(brands))))
 or j.channel<>'telegram' or j.shopee_offer_id is not null or j.publication_mode<>'verified' or j.allow_safe
 or s.telegram_verified_at is null or s.telegram_chat_id is distinct from j.destination_id then
  update public.telegram_jobs set state='blocked',error='Autorização manual ou destino indisponível; confira a operação e confirme novamente' where id=j.id and state='queued';return null;
 end if;
 -- false bypasses only automation toggles/resume cutoffs for this explicitly authorized job.
 -- The single-brand claim still checks due time, snapshot, review, target key and prior deliveries.
 return public.dropou_singlebrand_claim(p_job,p_target,false);
end $$;
revoke all on function public.dropou_publication_claim_v2(uuid,text,boolean) from public,anon,authenticated;
grant execute on function public.dropou_publication_claim_v2(uuid,text,boolean) to service_role;

create function public.dropou_due_manual_telegram_jobs() returns setof uuid language sql stable security invoker set search_path='' as $$
 select j.id from public.telegram_jobs j join public.operation_settings s on s.owner_id=j.owner_id and s.brand_id=j.brand_id
 where j.brand_id in ('beleza','casa','natal') and j.channel='telegram' and j.shopee_offer_id is null and j.queued_by is not null
 and j.state='queued' and j.scheduled_at<=now() order by j.scheduled_at,j.id limit 1
$$;
revoke all on function public.dropou_due_manual_telegram_jobs() from public,anon,authenticated;
grant execute on function public.dropou_due_manual_telegram_jobs() to service_role;
create or replace function public.dropou_due_operation_jobs() returns setof uuid language sql stable security invoker set search_path='' as $$
 select j.id from public.telegram_jobs j join public.operation_settings s on s.owner_id=j.owner_id and s.brand_id=j.brand_id
 where (s.automation_enabled or (j.brand_id in ('beleza','casa','natal') and j.channel='telegram' and j.queued_by is not null))
 and j.state='queued' and j.scheduled_at<=now() and j.shopee_offer_id is null order by j.scheduled_at,j.id limit 1
$$;
commit;
