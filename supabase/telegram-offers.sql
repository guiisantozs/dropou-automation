begin;
alter table public.deliveries add column if not exists offer_id uuid references public.offers(id);
alter table public.deliveries add column if not exists caption text;
alter table public.deliveries add column if not exists snapshot jsonb;
alter table public.deliveries add column if not exists sent_at timestamptz;
create or replace function public.dropou_economy_claim_telegram(p_owner uuid,p_offer uuid) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare p jsonb; o public.offers; legacy_busy boolean:=false;
begin
 select data into p from public.products where owner_id=p_owner and id=(select product_id from public.offers where id=p_offer and owner_id=p_owner) for update;
 select * into o from public.offers where id=p_offer and owner_id=p_owner for update;
 if p is null or o.id is null or o.status<>'pronto' or o.snapshot is distinct from p or not public.dropou_publishable(p)
 or p->>'status' not in ('pronto','agendado') or exists(select 1 from public.publications where product_id=o.product_id)
 then raise exception 'Publicação bloqueada: salve e revalide a oferta'; end if;
 if to_regclass('public.telegram_jobs') is not null then
  execute 'select exists(select 1 from public.telegram_jobs where product_id=$1 and state in (''queued'',''sending'',''uncertain'',''sent''))' into legacy_busy using o.product_id;
  if legacy_busy then raise exception 'Este produto já possui um envio Telegram. Confira a fila existente'; end if;
 end if;
 if length(o.caption)>(case when length(coalesce(p->>'imagePath',p->>'image',''))>0 then 1024 else 4000 end) then raise exception 'Reduza a legenda: Telegram aceita 1024 caracteres com imagem'; end if;
 insert into public.deliveries(owner_id,product_id,channel,state,offer_id,caption,snapshot)
 values(p_owner,o.product_id,'telegram','sending',o.id,o.caption,p);
 return jsonb_build_object('product',p,'caption',o.caption);
end $$;
create or replace function public.dropou_economy_finish_telegram(p_owner uuid,p_offer uuid,p_message text) returns void
language plpgsql security invoker set search_path='' as $$
declare d public.deliveries;
begin
 perform 1 from public.products where owner_id=p_owner and id=(select product_id from public.deliveries where owner_id=p_owner and offer_id=p_offer) for update;
 select * into d from public.deliveries where owner_id=p_owner and offer_id=p_offer for update;
 if d.product_id is null then raise exception 'Envio não reservado'; end if;
 if d.state='sent' then return; end if;
 update public.deliveries set state='sent',message_id=p_message,sent_at=now() where product_id=d.product_id and channel='telegram';
 update public.offers set status='publicado',caption=d.caption,snapshot=d.snapshot,updated_at=now() where id=p_offer and owner_id=p_owner;
 update public.products set data=d.snapshot||'{"status":"publicado","scheduledAt":null}'::jsonb where id=d.product_id and owner_id=p_owner;
 insert into public.logs(owner_id,event,detail) values(p_owner,'Publicado no Telegram',d.product_id::text||' · mensagem '||p_message);
end $$;
revoke all on function public.dropou_economy_claim_telegram(uuid,uuid),public.dropou_economy_finish_telegram(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.dropou_economy_claim_telegram(uuid,uuid),public.dropou_economy_finish_telegram(uuid,uuid,text) to service_role;
grant all on public.deliveries,public.offers,public.products,public.logs to service_role;
grant select on public.publications to service_role;
grant execute on function public.dropou_publishable(jsonb) to service_role;
grant usage,select on sequence public.logs_id_seq to service_role;

create or replace function public.dropou_economy_schedule_offer(p_offer uuid,p_at timestamptz,p_human boolean) returns void
language plpgsql security invoker set search_path='' as $$
declare p jsonb; o public.offers; uid uuid:=auth.uid();
begin
 select data into p from public.products where owner_id=uid and id=(select product_id from public.offers where id=p_offer and owner_id=uid) for update;
 select * into o from public.offers where id=p_offer and owner_id=uid for update;
 if p is null or o.id is null or o.status<>'pronto' or o.snapshot is distinct from p or not public.dropou_publishable(p) or p_at<=now() then raise exception 'Revalide e salve a oferta antes de agendar'; end if;
 p:=p||jsonb_build_object('status','agendado','scheduledAt',p_at,'needsHumanReview',p_human);
 update public.products set data=p where id=o.product_id and owner_id=uid;
 update public.offers set snapshot=p,updated_at=now() where id=o.id and owner_id=uid;
 insert into public.logs(owner_id,event,detail) values(uid,'Oferta agendada',o.product_id::text||case when p_human then ' · revalidação humana obrigatória' else ' · atualização oficial obrigatória' end);
end $$;
revoke all on function public.dropou_economy_schedule_offer(uuid,timestamptz,boolean) from public,anon;
grant execute on function public.dropou_economy_schedule_offer(uuid,timestamptz,boolean) to authenticated;
create or replace function public.dropou_economy_refresh_scheduled(p_owner uuid,p_product uuid,p_expected jsonb,p_fresh jsonb) returns void
language plpgsql security invoker set search_path='' as $$
declare p jsonb;
begin
 select data into p from public.products where id=p_product and owner_id=p_owner for update;
 if p is null or p is distinct from p_expected or p->>'status'<>'agendado' or not public.dropou_publishable(p_fresh) then raise exception 'Produto alterado ou preço inválido'; end if;
 update public.products set data=p_fresh where id=p_product and owner_id=p_owner;
 update public.offers set snapshot=p_fresh,updated_at=now() where product_id=p_product and owner_id=p_owner and status='pronto';
end $$;
revoke all on function public.dropou_economy_refresh_scheduled(uuid,uuid,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.dropou_economy_refresh_scheduled(uuid,uuid,jsonb,jsonb) to service_role;

create or replace function public.dropou_economy_publication_guard() returns trigger
language plpgsql security invoker set search_path='' as $$
declare p jsonb;
begin
 select data into p from public.products where id=new.product_id;
 if coalesce(p->>'dataOrigin','manual')='screenshot' and coalesce((p->>'screenshotConfirmed')::boolean,false)=false then raise exception 'Confirme os dados do print antes de publicar'; end if;
 if exists(select 1 from public.deliveries where product_id=new.product_id and channel='telegram') then raise exception 'Envio Telegram registrado ou em andamento; confira antes de publicar novamente'; end if;
 return new;
end $$;
drop trigger if exists dropou_economy_publication_guard on public.publications;
create trigger dropou_economy_publication_guard before insert on public.publications for each row execute function public.dropou_economy_publication_guard();
create or replace function public.dropou_economy_product_guard() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
 if exists(select 1 from public.deliveries where product_id=old.id and channel='telegram' and state='sending') then raise exception 'Envio Telegram em andamento; aguarde antes de editar'; end if;
 if exists(select 1 from public.deliveries d where d.product_id=old.id and d.channel='telegram' and d.state='sent' and d.snapshot is not null and new.data is distinct from d.snapshot||'{"status":"publicado","scheduledAt":null}'::jsonb) then raise exception 'Produto publicado permanece no histórico'; end if;
 return new;
end $$;
drop trigger if exists dropou_economy_product_guard on public.products;
create trigger dropou_economy_product_guard before update on public.products for each row execute function public.dropou_economy_product_guard();
revoke all on function public.dropou_economy_publication_guard(),public.dropou_economy_product_guard() from public,anon;
grant execute on function public.dropou_economy_publication_guard(),public.dropou_economy_product_guard() to authenticated,service_role;
-- Optional compatibility with the previously installed Telegram queue.
create or replace function public.dropou_economy_legacy_job_guard() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
 if new.state in ('queued','sending') and exists(select 1 from public.deliveries where product_id=new.product_id and channel='telegram') then raise exception 'Envio Telegram já registrado na fila de ofertas'; end if;
 return new;
end $$;
revoke all on function public.dropou_economy_legacy_job_guard() from public,anon;
grant execute on function public.dropou_economy_legacy_job_guard() to authenticated,service_role;
do $$begin
 if to_regclass('public.telegram_jobs') is not null then
  execute 'drop trigger if exists dropou_economy_legacy_job_guard on public.telegram_jobs';
  execute 'create trigger dropou_economy_legacy_job_guard before insert or update on public.telegram_jobs for each row execute function public.dropou_economy_legacy_job_guard()';
 end if;
end $$;
commit;
