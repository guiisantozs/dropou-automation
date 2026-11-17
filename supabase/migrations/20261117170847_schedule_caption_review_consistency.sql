begin;
set local lock_timeout='5s';
set local statement_timeout='45s';
-- Keeps original events and receipts; never dispatches jobs.
do $guard$ begin
 if to_regprocedure('public.dropou_schedule_review(uuid,uuid,uuid,jsonb,text,text,timestamp with time zone,text,boolean)') is not null or to_regprocedure('public.dropou_schedule_change_before_caption_review(uuid,uuid,uuid,text,timestamp with time zone)') is not null then raise exception 'Schedule review already exists; inspect before applying';end if;
 if to_regprocedure('public.dropou_schedule_change(uuid,uuid,uuid,text,timestamp with time zone)') is null then raise exception 'Missing scheduling prerequisite';end if;
end $guard$;
create function public.dropou_schedule_review(p_owner uuid,p_actor uuid,p_job uuid,p_expected jsonb,p_before text,p_caption text,p_at timestamptz,p_target_key text,p_confirmed boolean) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare j public.telegram_jobs;p public.products;o public.offers;
begin
 if p_confirmed is distinct from true or p_at is null or p_at<=clock_timestamp() then raise exception 'Confirme uma nova data futura em America/Bahia';end if;
 perform 1 from public.products where id=(select product_id from public.telegram_jobs where id=p_job and owner_id=p_owner) and owner_id=p_owner for update;
 perform 1 from public.offers where id=(select offer_id from public.telegram_jobs where id=p_job and owner_id=p_owner) for update;
 select * into j from public.telegram_jobs where id=p_job and owner_id=p_owner for update;
 if j.id is null then raise exception 'Agendamento indisponível';end if;
 perform private.dropou_assert_publication_actor(p_owner,j.brand_id,p_actor);
 if j.shopee_offer_id is not null or j.publication_mode='official' then raise exception 'Revise este agendamento na automação Shopee existente';end if;
 if j.state not in ('queued','ready','blocked','failed') or jsonb_array_length(j.message_ids)>0 then raise exception 'Envio concluído, parcial ou incerto não pode ser repetido';end if;
 if j.destination_key is distinct from p_target_key then raise exception 'Destino alterado. Confira a configuração';end if;
 select * into p from public.products where id=j.product_id and owner_id=p_owner and brand_id=j.brand_id;
 select * into o from public.offers where id=j.offer_id and owner_id=p_owner and brand_id=j.brand_id for update;
 if p.archived_at is not null or p.curation_state='rejected' or o.id is null or o.status='excluido' or p.data is distinct from p_expected or o.snapshot is distinct from p.data or j.caption is distinct from p_before or (o.caption is distinct from p_before and o.caption is distinct from p_caption) then raise exception 'Oferta alterada. Reabra a conferência';end if;
 if exists(select 1 from public.deliveries d where d.owner_id=p_owner and d.product_id=p.id and d.channel=j.channel and d.state in ('sending','sent','partial','uncertain')) or exists(select 1 from public.product_channel_marks m where m.owner_id=p_owner and m.product_id=p.id and m.channel=j.channel and m.revoked_at is null) then raise exception 'Entrega já registrada ou incerta. Não repetir';end if;
 if not public.dropou_publication_caption_valid(p.data,p_caption,'verified') then raise exception 'Preço, disponibilidade ou legenda precisam de revisão';end if;
 -- Snapshot the old error/copy even if this was queued and its state will not change.
 insert into public.channel_events(owner_id,brand_id,product_id,product_name,offer_id,job_id,publication_round,channel,event,attempt,destination,message_ids,caption,snapshot,error)
 values(p_owner,j.brand_id,p.id,p.data->>'name',o.id,j.id,j.publication_round,j.channel,'reviewed_before_reschedule',j.attempts,j.destination_title,j.message_ids,j.caption,j.snapshot,j.error);
 update public.offers set caption=p_caption,manually_edited=true,updated_at=clock_timestamp() where id=o.id;
 update public.telegram_jobs set caption=p_caption,snapshot=p.data,scheduled_at=p_at,state='queued',error=null,queued_by=p_actor,publication_mode='verified',allow_safe=false,authorized_until='infinity'::timestamptz where id=j.id;
 insert into public.operation_audit(owner_id,actor_id,brand_id,action,resource_id) values(p_owner,p_actor,j.brand_id,'Legenda revisada e reagendamento confirmado',j.id);
 return jsonb_build_object('saved',true,'jobId',j.id);
end $$;
revoke all on function public.dropou_schedule_review(uuid,uuid,uuid,jsonb,text,text,timestamptz,text,boolean) from public,anon,authenticated;
grant execute on function public.dropou_schedule_review(uuid,uuid,uuid,jsonb,text,text,timestamptz,text,boolean) to service_role;
-- Plain date changes must validate their unchanged copy/snapshot too. Wrap the
-- existing actor/lock implementation so its permissions and cancellation remain.
alter function public.dropou_schedule_change(uuid,uuid,uuid,text,timestamptz) rename to dropou_schedule_change_before_caption_review;
create function public.dropou_schedule_change(p_owner uuid,p_job uuid,p_actor uuid,p_action text,p_at timestamptz default null) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare j public.telegram_jobs;
begin
 perform 1 from public.products where id=(select product_id from public.telegram_jobs where id=p_job and owner_id=p_owner) for update;
 select * into j from public.telegram_jobs where id=p_job and owner_id=p_owner for update;
 if j.id is null then raise exception 'Agendamento indisponível';end if;
 perform private.dropou_assert_publication_actor(p_owner,j.brand_id,p_actor);
 if p_action='reschedule' and j.publication_mode<>'official' and (not public.dropou_publication_caption_valid(j.snapshot,j.caption,j.publication_mode) or exists(select 1 from public.products p where p.id=j.product_id and p.data is distinct from j.snapshot)) then raise exception 'Revise a legenda e os dados antes de reagendar';end if;
 return public.dropou_schedule_change_before_caption_review(p_owner,p_job,p_actor,p_action,p_at);
end $$;
revoke all on function public.dropou_schedule_change_before_caption_review(uuid,uuid,uuid,text,timestamptz),public.dropou_schedule_change(uuid,uuid,uuid,text,timestamptz) from public,anon,authenticated;
grant execute on function public.dropou_schedule_change_before_caption_review(uuid,uuid,uuid,text,timestamptz),public.dropou_schedule_change(uuid,uuid,uuid,text,timestamptz) to service_role;
commit;
