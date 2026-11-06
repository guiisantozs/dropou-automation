-- Fix real legacy AI draft references and keep expired schedules out of a resumed queue.
begin;
alter table public.telegram_dispatch_config add column if not exists automatic_not_before timestamptz;

create or replace function public.dropou_product_lifecycle(p_owner uuid,p_product uuid,p_action text,p_confirm boolean,p_cancel boolean) returns jsonb language plpgsql security invoker set search_path='' as $$
declare p public.products; history boolean; pending integer; sending boolean; images jsonb;
begin
 select * into p from public.products where id=p_product and owner_id=p_owner for update;
 if p.id is null then raise exception 'Produto não encontrado';end if;
 history:=exists(select 1 from public.republication_intents where product_id=p.id) or p.data->>'status'='publicado' or exists(select 1 from public.publications where product_id=p.id) or exists(select 1 from public.deliveries where product_id=p.id and state in ('sent','sending','uncertain','partial')) or exists(select 1 from public.channel_events where product_id=p.id and (event in ('sent','uncertain','partial') or jsonb_array_length(message_ids)>0));
 select count(*),coalesce(bool_or(state='sending'),false) into pending,sending from public.telegram_jobs where product_id=p.id and state in ('queued','blocked','ready','sending');
 if p_action='inspect' then return jsonb_build_object('hasHistory',history,'pendingJobs',pending,'sending',sending,'archived',p.archived_at is not null);end if;
 if not p_confirm then raise exception 'Confirme a exclusão ou restauração';end if;
 if sending then raise exception 'Envio em andamento. Aguarde antes de excluir ou arquivar';end if;
 if p_action='restore' then
  update public.products set archived_at=null where id=p.id;
  insert into public.logs(owner_id,event,detail) values(p_owner,'Produto restaurado',p.id::text||' · '||(p.data->>'name'));
  return jsonb_build_object('restored',true,'images','[]'::jsonb);
 end if;
 if p_action not in ('delete','archive') then raise exception 'Ação inválida';end if;
 if pending>0 and not p_cancel then raise exception 'Autorize cancelar os agendamentos vinculados';end if;
 update public.telegram_jobs set state='cancelled',error='Produto removido do catálogo' where product_id=p.id and state in ('queued','blocked','ready','failed');
 if history or p_action='archive' then
  update public.products set archived_at=now() where id=p.id;
  insert into public.logs(owner_id,event,detail) values(p_owner,'Produto arquivado',p.id::text||' · '||(p.data->>'name')||' · históricos preservados');
  return jsonb_build_object('archived',true,'cancelledJobs',pending,'images','[]'::jsonb);
 end if;
 images:=to_jsonb(array_remove(array[p.data->>'imagePath',p.data->>'thumbnailPath'],null));
 -- No confirmed/uncertain publication exists. Audit events retain their labels and snapshots.
 delete from public.telegram_jobs where product_id=p.id;
 delete from public.deliveries where product_id=p.id and state='failed';
 delete from public.price_records where product_id=p.id;
 -- Preserve legacy AI drafts and the billing ledger; invalidate only this deleted product's cache.
 if to_regclass('public.ai_drafts') is not null then
  execute 'update public.ai_drafts set product_id=null where product_id=$1' using p.id;
 end if;
 delete from public.ai_caption_cache where product_id=p.id;
 delete from public.offers where product_id=p.id;
 delete from public.products where id=p.id;
 insert into public.logs(owner_id,event,detail) values(p_owner,'Produto excluído do catálogo',p.id::text||' · '||(p.data->>'name'));
 return jsonb_build_object('deleted',true,'cancelledJobs',pending,'images',images);
end $$;

create or replace function public.dropou_publication_claim_v2(p_job uuid,p_target text,p_automatic boolean) returns jsonb language plpgsql security invoker set search_path='' as $$
declare p jsonb; o public.offers; j public.telegram_jobs; enabled boolean; resume_at timestamptz;
begin
 select automation_enabled,automatic_not_before into enabled,resume_at from public.telegram_dispatch_config where id=true for share;
 if p_automatic and not coalesce(enabled,false) then return null;end if;
 select data into p from public.products where id=(select product_id from public.telegram_jobs where id=p_job) for update skip locked;if p is null then return null;end if;
 select * into j from public.telegram_jobs where id=p_job for update skip locked;if j.id is null or j.state<>'queued' or j.scheduled_at>now() then return null;end if;
 if p_automatic and resume_at is not null and j.scheduled_at<=resume_at then
  update public.telegram_jobs set state='blocked',error='Horário anterior à retomada. Confira o canal e reagende para evitar duplicação' where id=j.id;return null;
 end if;
 select * into o from public.offers where id=j.offer_id and owner_id=j.owner_id for update;
 if not exists(select 1 from public.telegram_dispatch_config where j.owner_id=any(owner_ids)) then raise exception 'Administrador não autorizado';end if;
 if exists(select 1 from public.products where id=j.product_id and archived_at is not null) then update public.telegram_jobs set state='cancelled',error='Produto arquivado' where id=j.id;return null;end if;
 if j.channel='telegram' and (j.media_mode='unselected' or (j.media_mode='photo' and not j.photo_confirmed)) then update public.telegram_jobs set state='blocked',error='Escolha e autorize a apresentação Telegram' where id=j.id;return null;end if;
 if o.id is null or o.status='excluido' or not public.dropou_publication_identity(p) or o.snapshot is distinct from p or j.snapshot is distinct from p or o.caption is distinct from coalesce(j.source_caption,j.caption) or (j.channel='telegram' and j.destination_key<>p_target) then
  update public.telegram_jobs set state='blocked',error='Dados ou destino mudaram. Reabra a oferta e autorize novamente' where id=j.id;return null;
 end if;
 if j.publication_mode='verified' and (not public.dropou_publication_caption_valid(p,j.caption,'verified') or j.authorized_until is null or j.authorized_until<now()) then
  if not j.allow_safe then update public.telegram_jobs set state='blocked',error='A conferência venceu. Confira a prévia sem valores e autorize novamente' where id=j.id;return null;end if;
  j.publication_mode:='safe';j.caption:=public.dropou_safe_publication_caption(p);
 end if;
 if not public.dropou_publication_caption_valid(p,j.caption,j.publication_mode) then update public.telegram_jobs set state='blocked',error='Legenda inválida para as condições atuais' where id=j.id;return null;end if;
 if j.channel='whatsapp' then update public.telegram_jobs set state='ready',caption=j.caption,publication_mode=j.publication_mode,error=null where id=j.id;return null;end if;
 update public.telegram_jobs set state='sending',caption=j.caption,publication_mode=j.publication_mode,started_at=now(),attempts=attempts+1,error=null where id=j.id returning * into j;
 insert into public.deliveries(owner_id,product_id,channel,state,offer_id,caption,snapshot,destination_id,destination_title,publication_mode,publication_round) values(j.owner_id,j.product_id,'telegram','sending',j.offer_id,j.caption,p,j.destination_id,j.destination_title,j.publication_mode,j.publication_round)
 on conflict(product_id,channel) do update set state='sending',caption=excluded.caption,snapshot=excluded.snapshot,destination_id=excluded.destination_id,destination_title=excluded.destination_title,publication_mode=excluded.publication_mode,publication_round=excluded.publication_round,error=null where public.deliveries.state='failed';if not found then raise exception 'Entrega já reservada';end if;return to_jsonb(j);
end $$;

-- Repeated resume requests are idempotent. Past jobs need explicit review, never catch-up sends.
create or replace function public.dropou_set_automation(p_owner uuid,p_enabled boolean)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare config public.telegram_dispatch_config; held integer:=0; resumed timestamptz:=clock_timestamp();
begin
 select * into config from public.telegram_dispatch_config where id=true for update;
 if config.id is null or not coalesce(p_owner=any(config.owner_ids),false) then raise exception 'Administrador não autorizado';end if;
 if p_enabled is null then raise exception 'Informe a situação da automação';end if;
 if p_enabled and not config.automation_enabled then
  update public.telegram_jobs set state='blocked',error='Horário vencido durante a pausa. Confira o canal e reagende para evitar duplicação'
   where state='queued' and scheduled_at<=resumed;
  get diagnostics held=row_count;
  update public.telegram_dispatch_config set automation_enabled=true,automatic_not_before=resumed,updated_at=resumed where id=true;
 elsif not p_enabled and config.automation_enabled then
  update public.telegram_dispatch_config set automation_enabled=false,updated_at=resumed where id=true;
 end if;
 if config.automation_enabled is distinct from p_enabled then
  insert into public.logs(owner_id,event,detail) values(p_owner,case when p_enabled then 'Automação retomada' else 'Automação pausada' end,
   case when p_enabled then 'Somente próximos agendamentos · vencidos retidos: '||held else 'Envios futuros pausados' end||' · America/Sao_Paulo');
 end if;
 return jsonb_build_object('enabled',p_enabled,'held',held);
end $$;
revoke all on function public.dropou_set_automation(uuid,boolean) from public,anon,authenticated;
grant execute on function public.dropou_set_automation(uuid,boolean) to service_role;

-- One bounded read supplies product rows without loading full captions or all historical events.
create or replace function public.dropou_product_channel_summaries(p_ids uuid[])
returns table(product_id uuid,telegram jsonb,whatsapp jsonb)
language sql stable security invoker set search_path='' as $$
 select p.id,
 jsonb_build_object('published',coalesce(tg.total,0)>0 or coalesce(d.state='sent' and jsonb_array_length(d.message_ids)>0,false),
  'publishedAt',greatest(tg.published_at,case when d.state='sent' and jsonb_array_length(d.message_ids)>0 then d.sent_at end),
  'state',coalesce(case when d.state in ('sending','uncertain','partial') then d.state end,tj.state),
  'scheduledAt',case when tj.state='queued' then tj.scheduled_at end),
 jsonb_build_object('published',coalesce(wa.total,0)>0,'publishedAt',wa.published_at,
  'review',coalesce(wa.review,false),'state',wj.state,'scheduledAt',case when wj.state='queued' then wj.scheduled_at end)
 from public.products p
 left join public.telegram_jobs tj on tj.product_id=p.id and tj.owner_id=p.owner_id and tj.channel='telegram'
 left join public.telegram_jobs wj on wj.product_id=p.id and wj.owner_id=p.owner_id and wj.channel='whatsapp'
 left join public.deliveries d on d.product_id=p.id and d.owner_id=p.owner_id and d.channel='telegram'
 left join lateral (select count(distinct publication_round) total,max(created_at) published_at from public.channel_events
  where owner_id=p.owner_id and product_id=p.id and channel='telegram' and event in ('sent','legacy_telegram_verified') and jsonb_array_length(message_ids)>0) tg on true
 left join lateral (select count(*) filter(where not review_required and confirmed_by is not null and confirmation_source in ('manual','audit_manual')) total,
  max(published_at) filter(where not review_required and confirmed_by is not null and confirmation_source in ('manual','audit_manual')) published_at,
  bool_or(review_required or confirmed_by is null) review from public.publications where owner_id=p.owner_id and product_id=p.id and channel='whatsapp') wa on true
 where p.owner_id=(select auth.uid()) and p.id=any(p_ids[1:24])
$$;
revoke all on function public.dropou_product_channel_summaries(uuid[]) from public,anon;
grant execute on function public.dropou_product_channel_summaries(uuid[]) to authenticated,service_role;
commit;

