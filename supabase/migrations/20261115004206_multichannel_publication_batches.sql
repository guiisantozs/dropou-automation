-- Explicit multi-channel authorization; uses the existing queue and receipts.
begin;
alter table public.operation_settings add column telegram_bot_username text check(telegram_bot_username is null or telegram_bot_username ~ '^[A-Za-z0-9_]{5,32}$');
create table public.publication_batches(
 id uuid primary key,owner_id uuid not null references auth.users(id),actor_id uuid not null references auth.users(id),
 source_offer uuid not null,payload jsonb not null,jobs jsonb not null default '[]',created_at timestamptz not null default now()
);
create index publication_batches_owner_idx on public.publication_batches(owner_id,created_at desc);
create index publication_batches_actor_idx on public.publication_batches(actor_id);
alter table public.publication_batches enable row level security;
revoke all on public.publication_batches from public,anon,authenticated;
grant all on public.publication_batches to service_role;

create function public.dropou_multichannel_queue(p_owner uuid,p_actor uuid,p_offer uuid,p_request uuid,p_expected jsonb,p_caption text,p_targets jsonb,p_at timestamptz,p_payload jsonb) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare source public.offers;origin public.products;existing public.products;dest public.offers;batch public.publication_batches;
 target jsonb;brand text;pid uuid;data jsonb;j jsonb;result jsonb:='[]';
begin
 perform pg_advisory_xact_lock(hashtextextended('publication-batch-'||p_owner::text,0));
 select * into batch from public.publication_batches where id=p_request;
 if batch.id is not null then
  if batch.owner_id<>p_owner or batch.actor_id<>p_actor or batch.source_offer<>p_offer or batch.payload is distinct from p_payload then raise exception 'Autorização já utilizada com outros dados';end if;
  return jsonb_build_object('jobs',batch.jobs,'alreadyReserved',true);
 end if;
 select * into origin from public.products where owner_id=p_owner and id=(select product_id from public.offers where owner_id=p_owner and id=p_offer) for update;
 select * into source from public.offers where owner_id=p_owner and id=p_offer for update;
 perform private.dropou_assert_publication_actor(p_owner,source.brand_id,p_actor);
 if source.id is null or origin.archived_at is not null or origin.curation_state='rejected' or source.status='excluido'
 or origin.data is distinct from source.snapshot or source.snapshot is distinct from p_expected or source.caption is distinct from p_caption
 or not public.dropou_publication_caption_valid(source.snapshot,p_caption,'verified') then raise exception 'Oferta alterada ou não aprovada. Salve a prévia antes de escolher os canais';end if;
 if jsonb_typeof(p_targets)<>'array' or jsonb_array_length(p_targets) not between 1 and 6
 or (select count(distinct t->>'brand') from jsonb_array_elements(p_targets)t)<>jsonb_array_length(p_targets)
 or (select count(distinct t->>'id') from jsonb_array_elements(p_targets)t)<>jsonb_array_length(p_targets) then raise exception 'Selecione canais e destinos distintos';end if;
 for target in select value from jsonb_array_elements(p_targets) order by value->>'brand' loop
  brand:=target->>'brand';perform private.dropou_assert_publication_actor(p_owner,brand,p_actor);
  select * into existing from public.products where owner_id=p_owner and brand_id=brand and canonical_url=origin.canonical_url for update;
  if existing.id is null then
   pid:=gen_random_uuid();data:=source.snapshot||jsonb_build_object('id',pid,'operation',brand,'status','pronto','scheduledAt',null,'createdAt',to_char(now() at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'));
   insert into public.products(id,owner_id,canonical_url,data,brand_id,curation_state) values(pid,p_owner,origin.canonical_url,data,brand,'approved');
   insert into public.offers(owner_id,product_id,brand_id,caption,original_caption,manually_edited,snapshot,status) values(p_owner,pid,brand,p_caption,p_caption,true,data,'pronto') returning * into dest;
  else
   if existing.archived_at is not null or existing.curation_state='rejected' then raise exception 'Produto arquivado ou rejeitado no canal %',brand;end if;
   select * into dest from public.offers where product_id=existing.id and owner_id=p_owner and status<>'excluido' for update;
   if dest.id is null or dest.snapshot is distinct from existing.data or dest.caption is distinct from p_caption
   or (existing.data-array['id','operation','createdAt','status','scheduledAt']) is distinct from (source.snapshot-array['id','operation','createdAt','status','scheduledAt']) then raise exception 'Há outro cadastro ou edição no canal %. Abra e revise a oferta desse canal',brand;end if;
   pid:=existing.id;
  end if;
  if exists(select 1 from public.telegram_jobs where owner_id=p_owner and product_id=pid and channel='telegram' and state in ('queued','ready','sending','partial','uncertain','sent'))
   or exists(select 1 from public.dropou_confirmed_publications where owner_id=p_owner and product_id=pid and channel='telegram') then raise exception 'Já existe envio ou agendamento Telegram no canal %. Ele não será repetido',brand;end if;
  j:=public.dropou_publication_queue_actor(p_actor,p_owner,dest.id,'telegram',p_at,target,p_caption,p_caption,'verified',false);
  result:=result||jsonb_build_array(jsonb_build_object('id',j->>'id','brand',brand));
  insert into public.operation_audit(owner_id,actor_id,brand_id,action,resource_id,detail) values(p_owner,p_actor,brand,'Publicação em canais autorizada',pid,jsonb_build_object('batch',p_request,'sourceOffer',p_offer));
 end loop;
 insert into public.publication_batches(id,owner_id,actor_id,source_offer,payload,jobs) values(p_request,p_owner,p_actor,p_offer,p_payload,result);
 return jsonb_build_object('jobs',result,'alreadyReserved',false);
end $$;
revoke all on function public.dropou_multichannel_queue(uuid,uuid,uuid,uuid,jsonb,text,jsonb,timestamptz,jsonb) from public,anon,authenticated;
grant execute on function public.dropou_multichannel_queue(uuid,uuid,uuid,uuid,jsonb,text,jsonb,timestamptz,jsonb) to service_role;
commit;
