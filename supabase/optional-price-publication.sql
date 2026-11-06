-- Optional price confirmation, approved and applied as migration 20261106191236.
-- Requires the existing publication_dispatch_and_review schema. No new table, cron, policy or integration.
begin;
alter table public.telegram_jobs add column if not exists publication_mode text not null default 'verified' check(publication_mode in ('verified','safe'));
alter table public.telegram_jobs add column if not exists source_caption text;
alter table public.telegram_jobs add column if not exists allow_safe boolean not null default false;
alter table public.publications add column if not exists publication_mode text not null default 'verified' check(publication_mode in ('verified','safe'));
alter table public.deliveries add column if not exists publication_mode text not null default 'verified' check(publication_mode in ('verified','safe'));
create or replace function public.dropou_publication_identity(p jsonb) returns boolean language sql stable security invoker set search_path='' as $$
 select coalesce((p->>'demo')::boolean=false and p->>'store'='Mercado Livre' and length(p->>'name')>=3 and p->>'affiliateUrl' ~* '^https://([a-zA-Z0-9-]+\.)*(meli\.la|mercadolivre\.com\.br|mercadolivre\.com|mercadolibre\.com)(:443)?([/?#]|$)' and p->>'affiliateUrl' !~ '[[:space:]<>]' and strpos(p->>'affiliateUrl',chr(160))=0 and strpos(p->>'affiliateUrl',chr(8239))=0,false)
$$;
create or replace function public.dropou_safe_publication_caption(p jsonb) returns text language sql immutable security invoker set search_path='' as $$
 select '🎮🔥 CONFIRA ESSE ACHADO GAMER! #publi'||E'\n\n⚡ *'||case when coalesce(p->>'name','') ~* 'https?://|www\.|R\$|[$€%]|pix|frete|cupom|desconto|economiz|estoque|dispon[ií]vel|gr[aá]tis|promo[cç]|parcel|sem juros|menor pre[cç]o|garant|reais|por\s+[0-9]|[uú]ltim|vendid|imperd[ií]vel|barat[ií]ssim' then 'Seleção de games e tecnologia' else translate(p->>'name',chr(13)||chr(10)||'*_~<>[]',repeat(' ',9)) end||E'*\n\n🛒 Veja o preço e a disponibilidade atualizados na loja 👇\n'||(p->>'affiliateUrl')||E'\n\nAs condições podem ter mudado.\n\n💙 Dropou o preço? A gente te avisa!'
$$;
create or replace function public.dropou_publication_amount(value text) returns numeric language plpgsql immutable security invoker set search_path='' as $$
begin
 if value like '%,%' then return replace(replace(value,'.',''),',','.')::numeric; end if;
 return value::numeric;
exception when others then return null;
end $$;
create or replace function public.dropou_publication_caption_valid(p jsonb,p_caption text,p_mode text) returns boolean language plpgsql stable security invoker set search_path='' as $$
declare amount numeric; allowed numeric[]; hit text[]; main_found boolean:=false; old numeric; current_price numeric:=(p->>'price')::numeric; plan text[]; plan_amount numeric; expected_discount numeric;
begin
 if not public.dropou_publication_identity(p) or length(p_caption) not between 1 and 4000 then return false; end if;
 if p_mode='safe' then return p_caption=public.dropou_safe_publication_caption(p); end if;
 -- Intl.NumberFormat('pt-BR') emits non-breaking spaces after R$. Normalize only for validation.
 p_caption:=replace(replace(p_caption,chr(160),' '),chr(8239),' ');
 if p_mode<>'verified' or not public.dropou_publishable(p) or p_caption !~* '(^|[[:space:]])#publi\y' or strpos(p_caption,p->>'affiliateUrl')=0 or replace(p_caption,p->>'affiliateUrl','') ~* 'https?://' then return false; end if;
 if p_caption ~* 'frete[[:space:]]+gr[aá]tis|cupom|brinde|[uú]ltimas?[[:space:]]+unidades?|menor[[:space:]]+pre[cç]o|desconto[[:space:]]+garantido|US\$|€' then return false; end if;
 allowed:=array[current_price];
 if coalesce((p->>'previousVerified')::boolean,false) and (p->>'previousPrice')::numeric>current_price then old:=(p->>'previousPrice')::numeric; allowed:=allowed||old||(old-current_price); expected_discount:=floor((old-current_price)*100/old); end if;
 if p_caption ~* 'desconto|economiz' and old is null then return false;end if;
 if coalesce((p->>'installmentsVerified')::boolean,false) then
  plan:=regexp_match(replace(replace(p->>'installments',chr(160),' '),chr(8239),' '),'([0-9]{1,2})[[:space:]]*x[[:space:]]*(?:de[[:space:]]*)?R\$[[:space:]]*([0-9.,]+)','i');
  if plan is not null then plan_amount:=public.dropou_publication_amount(plan[2]);allowed:=allowed||plan_amount;end if;
 end if;
 for hit in select regexp_matches(p_caption,'R\$[[:space:]]*([0-9.,]+)','g') loop
  amount:=public.dropou_publication_amount(hit[1]);if amount is null or not(amount=any(allowed)) then return false;end if;if amount=current_price then main_found:=true;end if;
 end loop;
 if not main_found then return false;end if;
 if p_caption ~* '\ypix\y' and p->>'paymentMethod'<>'pix' then return false;end if;
 if p_caption ~* 'sem juros' and (plan is null or p->>'installments' !~* 'sem juros') then return false;end if;
 for hit in select regexp_matches(p_caption,'([0-9]+)[[:space:]]*x[[:space:]]*(?:de[[:space:]]*)?R\$','gi') loop if plan is null or hit[1]<>plan[1] then return false;end if;end loop;
 for hit in select regexp_matches(p_caption,'([0-9]+(?:[.,][0-9]+)?)[[:space:]]*%','g') loop if expected_discount is null or abs(replace(hit[1],',','.')::numeric-expected_discount)>1 then return false;end if;end loop;
 return true;
exception when others then return false;
end $$;
-- Shared manual-publication guard retains owner/snapshot/idempotency checks, with an explicit copy mode.
create or replace function public.dropou_guard_publication() returns trigger language plpgsql security invoker set search_path='' as $$
declare p jsonb; o public.offers;
begin
 select * into o from public.offers where id=new.offer_id and owner_id=auth.uid() for update;
 select data into p from public.products where id=new.product_id and owner_id=auth.uid() for update;
 if o.id is null or p is null or o.product_id<>new.product_id or new.owner_id<>auth.uid() or o.status in ('publicado','excluido') or o.snapshot is distinct from p or p->>'status'='publicado' then raise exception 'Oferta alterada ou já publicada. Reabra os dados salvos';end if;
 if not public.dropou_publication_caption_valid(p,new.caption,new.publication_mode) then raise exception 'A legenda não corresponde ao modo e às condições confirmadas';end if;
 if new.publication_mode='verified' and new.caption is distinct from o.caption then raise exception 'Salve a legenda antes de publicar';end if;
 new.snapshot:=p;new.published_at:=now();return new;
end $$;
create or replace function public.dropou_economy_publication_guard() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if exists(select 1 from public.deliveries where product_id=new.product_id and state<>'failed') or exists(select 1 from public.telegram_jobs where product_id=new.product_id and channel='telegram' and state in ('queued','sending','uncertain','partial','sent')) then raise exception 'Cancele o agendamento Telegram ou confira a entrega antes de publicar';end if;return new;
end $$;
create or replace function public.dropou_publication_queue_v2(p_owner uuid,p_offer uuid,p_channel text,p_at timestamptz,p_target jsonb,p_caption text,p_source text,p_mode text,p_allow_safe boolean) returns jsonb language plpgsql security invoker set search_path='' as $$
declare p jsonb; o public.offers; j public.telegram_jobs;
begin
 if not exists(select 1 from public.telegram_dispatch_config where p_owner=any(owner_ids)) then raise exception 'Administrador não autorizado para publicação';end if;
 select data into p from public.products where owner_id=p_owner and id=(select product_id from public.offers where id=p_offer and owner_id=p_owner) for update;
 select * into o from public.offers where id=p_offer and owner_id=p_owner for update;
 select * into j from public.telegram_jobs where product_id=o.product_id for update;
 if j.state in ('sending','sent','uncertain','partial') or exists(select 1 from public.deliveries where product_id=o.product_id and state<>'failed') or exists(select 1 from public.publications where product_id=o.product_id) then raise exception 'Envio registrado ou incerto. Confira o canal; não repita';end if;
 if p is null or o.id is null or o.status in ('publicado','excluido') or o.snapshot is distinct from p or o.caption is distinct from p_source or p->>'status'='publicado' then raise exception 'Oferta alterada. Salve e confira a prévia novamente';end if;
 if not public.dropou_publication_caption_valid(p,p_caption,p_mode) then raise exception 'A conferência venceu ou a legenda não é segura. Confira a prévia sem valores';end if;
 if p_mode='verified' and p_caption<>o.caption then raise exception 'Salve a legenda antes de publicar';end if;
 if p_channel not in ('telegram','whatsapp') or p_at<now()-interval '1 minute' or p_at>now()+interval '30 days' then raise exception 'Agende até 30 dias no futuro';end if;
 if p_channel='telegram' and (coalesce(p_target->>'key','')!~'^[a-f0-9]{64}$' or coalesce(p_target->>'id','')!~'^-?[0-9]+$' or length(coalesce(p_target->>'title',''))=0) then raise exception 'Confira o canal Telegram';end if;
 p:=p||jsonb_build_object('status','agendado','scheduledAt',to_char(p_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'));
 update public.products set data=p where id=o.product_id;
 update public.offers set snapshot=p,updated_at=now() where id=o.id;
 insert into public.telegram_jobs(owner_id,offer_id,product_id,state,scheduled_at,caption,snapshot,destination_key,channel,destination_id,destination_title,authorized_until,source_caption,publication_mode,allow_safe)
 values(p_owner,o.id,o.product_id,'queued',p_at,p_caption,p,coalesce(p_target->>'key','whatsapp'),p_channel,p_target->>'id',coalesce(p_target->>'title','Destino escolhido manualmente'),case when p_mode='verified' then (p->>'checkedAt')::timestamptz+interval '15 minutes' end,o.caption,p_mode,p_allow_safe)
 on conflict(offer_id) do update set state='queued',scheduled_at=excluded.scheduled_at,caption=excluded.caption,snapshot=excluded.snapshot,destination_key=excluded.destination_key,channel=excluded.channel,destination_id=excluded.destination_id,destination_title=excluded.destination_title,authorized_until=excluded.authorized_until,source_caption=excluded.source_caption,publication_mode=excluded.publication_mode,allow_safe=excluded.allow_safe,started_at=null,error=null returning * into j;
 insert into public.logs(owner_id,event,detail) values(p_owner,'Publicação autorizada',o.product_id::text||' · '||p_channel||' · '||p_mode);return to_jsonb(j);
end $$;
create or replace function public.dropou_publication_claim_v2(p_job uuid,p_target text,p_automatic boolean) returns jsonb language plpgsql security invoker set search_path='' as $$
declare p jsonb; o public.offers; j public.telegram_jobs; enabled boolean;
begin
 select automation_enabled into enabled from public.telegram_dispatch_config where id=true for share;
 if p_automatic and not coalesce(enabled,false) then return null;end if;
 select data into p from public.products where id=(select product_id from public.telegram_jobs where id=p_job) for update skip locked;if p is null then return null;end if;
 select * into j from public.telegram_jobs where id=p_job for update skip locked;if j.id is null or j.state<>'queued' or j.scheduled_at>now() then return null;end if;
 select * into o from public.offers where id=j.offer_id and owner_id=j.owner_id for update;
 if not exists(select 1 from public.telegram_dispatch_config where j.owner_id=any(owner_ids)) then raise exception 'Administrador não autorizado';end if;
 if o.id is null or o.status in ('publicado','excluido') or not public.dropou_publication_identity(p) or p->>'status'='publicado' or o.snapshot is distinct from p or j.snapshot is distinct from p or o.caption is distinct from coalesce(j.source_caption,j.caption) or (j.channel='telegram' and j.destination_key<>p_target) then
  update public.telegram_jobs set state='blocked',error='Dados ou destino mudaram. Reabra a oferta e autorize novamente' where id=j.id;return null;
 end if;
 if j.publication_mode='verified' and (not public.dropou_publication_caption_valid(p,j.caption,'verified') or j.authorized_until is null or j.authorized_until<now()) then
  if not j.allow_safe then update public.telegram_jobs set state='blocked',error='A conferência venceu. Confira a prévia sem valores e autorize novamente' where id=j.id;return null;end if;
  j.publication_mode:='safe';j.caption:=public.dropou_safe_publication_caption(p);
 end if;
 if not public.dropou_publication_caption_valid(p,j.caption,j.publication_mode) then update public.telegram_jobs set state='blocked',error='Legenda inválida para as condições atuais' where id=j.id;return null;end if;
 if j.channel='whatsapp' then update public.telegram_jobs set state='ready',caption=j.caption,publication_mode=j.publication_mode,error=null where id=j.id;return null;end if;
 update public.telegram_jobs set state='sending',caption=j.caption,publication_mode=j.publication_mode,started_at=now(),attempts=attempts+1,error=null where id=j.id returning * into j;
 insert into public.deliveries(owner_id,product_id,channel,state,offer_id,caption,snapshot,destination_id,destination_title,publication_mode) values(j.owner_id,j.product_id,'telegram','sending',j.offer_id,j.caption,p,j.destination_id,j.destination_title,j.publication_mode)
 on conflict(product_id,channel) do update set state='sending',caption=excluded.caption,snapshot=excluded.snapshot,destination_id=excluded.destination_id,destination_title=excluded.destination_title,publication_mode=excluded.publication_mode,error=null where public.deliveries.state='failed';if not found then raise exception 'Entrega já reservada';end if;return to_jsonb(j);
end $$;
-- A schedule may expire during image preparation. Downgrade only before any Telegram receipt.
create or replace function public.dropou_publication_downgrade(p_job uuid) returns jsonb language plpgsql security invoker set search_path='' as $$
declare j public.telegram_jobs; p jsonb; safe_caption text;
begin
 select data into p from public.products where id=(select product_id from public.telegram_jobs where id=p_job) for update;
 select * into j from public.telegram_jobs where id=p_job for update;
 if j.id is null or j.state<>'sending' or not j.allow_safe or jsonb_array_length(j.message_ids)<>0 or j.snapshot is distinct from p or not public.dropou_publication_identity(p) then raise exception 'Não é possível adaptar um envio iniciado ou sem autorização';end if;
 safe_caption:=public.dropou_safe_publication_caption(p);
 update public.telegram_jobs set publication_mode='safe',caption=safe_caption where id=j.id returning * into j;
 update public.deliveries set publication_mode='safe',caption=safe_caption where product_id=j.product_id and channel='telegram' and state='sending' and jsonb_array_length(message_ids)=0;
 if not found then raise exception 'Entrega não reservada ou já iniciada';end if;return to_jsonb(j);
end $$;
create or replace function public.dropou_publication_manual_v2(p_offer uuid,p_destination text,p_caption text,p_mode text,p_source text) returns jsonb language plpgsql security invoker set search_path='' as $$
declare result public.publications; o public.offers; pid uuid; uid uuid:=auth.uid();
begin
 if length(trim(p_destination)) not between 2 and 120 then raise exception 'Informe o destino da publicação';end if;
 select product_id into pid from public.offers where id=p_offer and owner_id=uid;perform 1 from public.products where id=pid and owner_id=uid for update;
 select * into o from public.offers where id=p_offer and owner_id=uid for update;if o.id is null then raise exception 'Oferta não encontrada';end if;
 select * into result from public.publications where offer_id=p_offer and owner_id=uid;if found then return to_jsonb(result);end if;
 if o.caption is distinct from p_source then raise exception 'A legenda salva mudou. Confira a prévia novamente';end if;
 insert into public.publications(owner_id,offer_id,product_id,caption,snapshot,destination,publication_mode) values(uid,o.id,o.product_id,p_caption,o.snapshot,trim(p_destination),p_mode) returning * into result;
 update public.offers set status='publicado',updated_at=now() where id=o.id and owner_id=uid;
 update public.products set data=data||'{"status":"publicado","scheduledAt":null}'::jsonb where id=o.product_id and owner_id=uid;
 insert into public.logs(owner_id,event,detail) values(uid,'Publicação manual registrada',o.product_id::text||' · WhatsApp · '||trim(p_destination)||' · '||p_mode);return to_jsonb(result);
end $$;
revoke all on function public.dropou_publication_queue_v2(uuid,uuid,text,timestamptz,jsonb,text,text,text,boolean),public.dropou_publication_claim_v2(uuid,text,boolean) from public,anon,authenticated;
grant execute on function public.dropou_publication_queue_v2(uuid,uuid,text,timestamptz,jsonb,text,text,text,boolean),public.dropou_publication_claim_v2(uuid,text,boolean) to service_role;
revoke all on function public.dropou_publication_downgrade(uuid) from public,anon,authenticated;
grant execute on function public.dropou_publication_downgrade(uuid) to service_role;
revoke all on function public.dropou_publication_identity(jsonb),public.dropou_safe_publication_caption(jsonb),public.dropou_publication_amount(text),public.dropou_publication_caption_valid(jsonb,text,text),public.dropou_publication_manual_v2(uuid,text,text,text,text) from public,anon;
grant execute on function public.dropou_publication_identity(jsonb),public.dropou_safe_publication_caption(jsonb),public.dropou_publication_amount(text),public.dropou_publication_caption_valid(jsonb,text,text),public.dropou_publication_manual_v2(uuid,text,text,text,text) to authenticated,service_role;
commit;
