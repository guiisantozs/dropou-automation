-- Extend the existing member workflow. No Auth identities, secrets, sends or cron changes.
begin;
set local lock_timeout='5s';
insert into public.affiliate_operations(id,name) values
 ('kess','Achadinhos da Kess'),('primeiro-lar','Nosso Primeiro Lar | Enxoval & Casa Nova')
on conflict(id) do nothing;

alter table public.operation_settings drop constraint operation_settings_telegram_bot_env_check;
alter table public.operation_settings add constraint operation_settings_telegram_bot_env_check check(telegram_bot_env in (
 'TELEGRAM_BOT_TOKEN','TELEGRAM_CELULARES_BOT_TOKEN','TELEGRAM_TENIS_BOT_TOKEN','TELEGRAM_AUTOMOTO_BOT_TOKEN',
 'TELEGRAM_BELEZA_BOT_TOKEN','TELEGRAM_CASA_BOT_TOKEN','TELEGRAM_NATAL_BOT_TOKEN','TELEGRAM_KESS_BOT_TOKEN','TELEGRAM_PRIMEIRO_LAR_BOT_TOKEN'));
alter table public.operation_settings drop constraint operation_telegram_bot_binding;
alter table public.operation_settings add constraint operation_telegram_bot_binding check(case brand_id
 when 'beleza' then telegram_bot_env='TELEGRAM_BELEZA_BOT_TOKEN'
 when 'casa' then telegram_bot_env='TELEGRAM_CASA_BOT_TOKEN'
 when 'natal' then telegram_bot_env='TELEGRAM_NATAL_BOT_TOKEN'
 when 'kess' then telegram_bot_env='TELEGRAM_KESS_BOT_TOKEN'
 when 'primeiro-lar' then telegram_bot_env='TELEGRAM_PRIMEIRO_LAR_BOT_TOKEN'
 else telegram_bot_env in ('TELEGRAM_BOT_TOKEN','TELEGRAM_CELULARES_BOT_TOKEN','TELEGRAM_TENIS_BOT_TOKEN','TELEGRAM_AUTOMOTO_BOT_TOKEN') end);
create or replace function private.dropou_dedicated_bot_default() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if new.telegram_bot_env='TELEGRAM_BOT_TOKEN' then
  new.telegram_bot_env:=case new.brand_id when 'beleza' then 'TELEGRAM_BELEZA_BOT_TOKEN' when 'casa' then 'TELEGRAM_CASA_BOT_TOKEN'
   when 'natal' then 'TELEGRAM_NATAL_BOT_TOKEN' when 'kess' then 'TELEGRAM_KESS_BOT_TOKEN' when 'primeiro-lar' then 'TELEGRAM_PRIMEIRO_LAR_BOT_TOKEN' else new.telegram_bot_env end;
 end if;return new;
end $$;
revoke all on function private.dropou_dedicated_bot_default() from public,anon,authenticated;

alter table public.operation_settings drop constraint local_brands_integrations_off;
alter table public.operation_settings add constraint local_brands_integrations_off check(brand_id not in ('beleza','casa','natal','kess','primeiro-lar') or
 (not automation_enabled and automatic_not_before is null and whatsapp_name='' and whatsapp_url=''
 and coalesce((shopee_config->>'enabled')::boolean,false)=false and coalesce((shopee_config->>'dryRun')::boolean,true)=true
 and coalesce((shopee_config->>'requireReview')::boolean,true)=true));
alter table public.telegram_jobs drop constraint local_brands_no_jobs;
alter table public.telegram_jobs add constraint local_brands_no_jobs check(brand_id not in ('beleza','casa','natal','kess','primeiro-lar') or
 (channel='telegram' and shopee_offer_id is null and publication_mode='verified' and not allow_safe));

do $$ declare tab text;begin
 foreach tab in array array['shopee_offers','shopee_saved_products','shopee_observations'] loop
  execute format('alter table public.%I drop constraint %I',tab,tab||'_channels_check');
  execute format('alter table public.%I add constraint %I check(brand_id in (''dropou'',''celulares'',''tenis'',''automoto'',''beleza'',''casa'',''natal'',''kess'',''primeiro-lar''))',tab,tab||'_channels_check');
 end loop;
end $$;

-- Preserve function bodies/ACLs and all receipt, actor, snapshot and budget checks.
-- Abort on unexpected definitions rather than silently omitting a protection.
do $$ declare signature text;definition text;patched text;begin
 foreach signature in array array[
 'public.dropou_local_products(text,integer,text,text,text,timestamptz,timestamptz)',
 'public.dropou_member_search_window(uuid,text,uuid,text,integer)',
 'public.dropou_member_search_complete(uuid,text,uuid,text)',
 'public.dropou_shopee_saved_claim_channel(text,uuid,uuid[],boolean)',
 'private.dropou_member_affiliate_guard()',
 'public.dropou_publication_claim_v2(uuid,text,boolean)',
 'public.dropou_due_manual_telegram_jobs()',
 'public.dropou_due_operation_jobs()',
 'public.dropou_schedule_batch_prepare(uuid,uuid,text,uuid,timestamptz,text,text,jsonb,jsonb)'
 ] loop
  definition:=pg_get_functiondef(signature::regprocedure);
  patched:=replace(definition,$old$('beleza','casa','natal')$old$,$new$('beleza','casa','natal','kess','primeiro-lar')$new$);
  if patched=definition and position($check$'primeiro-lar'$check$ in definition)=0 then
   raise exception 'Unexpected member workflow definition: %',signature;
  end if;
  if patched<>definition then execute patched;end if;
 end loop;
end $$;

-- Default settings only: preserve every existing workspace setting and decision.
insert into public.operation_settings(owner_id,brand_id,display_name)
 select distinct s.owner_id,b.id,b.name from public.operation_settings s cross join public.affiliate_operations b
 where b.id in ('kess','primeiro-lar') on conflict do nothing;
commit;
