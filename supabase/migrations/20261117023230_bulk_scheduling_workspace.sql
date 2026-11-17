-- Incremental only. No cron, automation flag, destination or existing receipt is changed.
begin;
create table public.schedule_batches(
 id uuid primary key,owner_id uuid not null references auth.users(id),actor_id uuid not null references auth.users(id),
 brand_id text not null references public.affiliate_operations(id),channel text not null check(channel in ('telegram','whatsapp')),
 scheduled_at timestamptz not null,fingerprint text not null,target jsonb not null,items jsonb not null,
 state text not null default 'review' check(state in ('review','completed')),result jsonb,
 created_at timestamptz not null default now(),confirmed_at timestamptz,
 check(jsonb_typeof(items)='array' and jsonb_array_length(items) between 1 and 50)
);
create index schedule_batches_scope_idx on public.schedule_batches(owner_id,brand_id,scheduled_at);
create index schedule_batches_actor_idx on public.schedule_batches(actor_id);
create index schedule_batches_brand_idx on public.schedule_batches(brand_id);
alter table public.schedule_batches enable row level security;
create policy schedule_batches_read on public.schedule_batches for select to authenticated
 using(owner_id=(select private.dropou_workspace_owner()) and private.dropou_channel_allowed(brand_id) and public.dropou_brand_scope(brand_id));
revoke all on public.schedule_batches from public,anon,authenticated;
grant select on public.schedule_batches to authenticated;
grant all on public.schedule_batches to service_role;
alter table public.telegram_jobs add column schedule_batch_id uuid references public.schedule_batches(id);
alter table public.telegram_jobs add column schedule_batch_position integer check(schedule_batch_position>=0);
create index telegram_jobs_schedule_batch_idx on public.telegram_jobs(schedule_batch_id,state) where schedule_batch_id is not null;

-- All saved products, including unreviewed imports. RLS is inherited from the source tables.
create function public.dropou_schedule_candidates(p_page integer default 0,p_q text default '',p_status text default 'all',p_channel text default 'telegram',p_refs jsonb default null) returns jsonb
language sql stable security invoker set search_path='' as $$
 with raw as(
  select p.id,'product'::text kind,p.brand_id,p.data,p.id product_id,p.curation_state,p.archived_at,
   not p.catalog_pinned and p.catalog_entered_at+interval '14 days'<=now() expired,null::text saved_state,p.created_at,
   null::jsonb source_data
  from public.products p where p.owner_id=private.dropou_workspace_owner()
   and (p_refs is not null or not exists(select 1 from public.shopee_saved_products s where s.prepared_product_id=p.id and s.catalog_at is null))
  union all
  select s.id,'saved',s.brand_id,coalesce(p.data,s.data,'{}'::jsonb)||jsonb_build_object('name',coalesce(p.data->>'name',s.data->>'name','Produto aguardando dados'),'store','Shopee'),
   p.id,coalesce(p.curation_state,'pending'),p.archived_at,
   case when p.id is not null then not p.catalog_pinned and p.catalog_entered_at+interval '14 days'<=now()
    else not s.catalog_pinned and coalesce(s.catalog_at,s.created_at+interval '7 days')+interval '14 days'<=now() end,
   s.state,s.created_at,s.data
  from public.shopee_saved_products s left join public.products p on p.id=s.prepared_product_id and p.owner_id=s.owner_id and p.brand_id=s.brand_id
  where s.owner_id=private.dropou_workspace_owner()
 ), enriched as(
  select r.*,coalesce(public.dropou_publishable(r.data),false) reviewed,
   (select max(c.occurred_at) from public.dropou_confirmed_publications c where c.product_id=r.product_id and c.channel=p_channel) published_at,
   exists(select 1 from public.telegram_jobs j where j.product_id=r.product_id and j.channel=p_channel and j.state in ('queued','ready','blocked','sending','partial','uncertain')) pending
  from raw r where (p_refs is null or exists(select 1 from jsonb_array_elements(p_refs) x where x->>'id'=r.id::text and x->>'kind'=r.kind))
 ), filtered as(
  select * from enriched r where (p_q='' or coalesce(r.data->>'name','') ilike '%'||left(p_q,180)||'%')
   and (p_status='all' or p_status='unreviewed' and not r.reviewed or p_status='published' and r.published_at is not null or p_status='unpublished' and r.published_at is null)
 ), page as(select * from filtered order by created_at desc,id limit case when p_refs is null then 24 else 50 end offset case when p_refs is null then least(greatest(p_page,0),10000)*24 else 0 end)
 select jsonb_build_object('rows',coalesce((select jsonb_agg(to_jsonb(p)) from page p),'[]'::jsonb),'total',(select count(*) from filtered),'more',(select count(*) from filtered)>(p_page+1)*24,'serverNow',now())
$$;
revoke all on function public.dropou_schedule_candidates(integer,text,text,text,jsonb) from public,anon;
grant execute on function public.dropou_schedule_candidates(integer,text,text,text,jsonb) to authenticated;

create function public.dropou_schedule_batch_prepare(p_owner uuid,p_actor uuid,p_brand text,p_id uuid,p_at timestamptz,p_channel text,p_fingerprint text,p_target jsonb,p_items jsonb) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare b public.schedule_batches;begin
 perform private.dropou_assert_publication_actor(p_owner,p_brand,p_actor);
 if p_at<=now() or p_at>now()+interval '180 days' then raise exception 'Escolha um horário futuro em até 180 dias';end if;
 if p_brand in ('beleza','casa','natal') and p_channel<>'telegram' then raise exception 'Esta operação permite somente Telegram';end if;
 insert into public.schedule_batches(id,owner_id,actor_id,brand_id,scheduled_at,channel,fingerprint,target,items)
 values(p_id,p_owner,p_actor,p_brand,p_at,p_channel,p_fingerprint,p_target,p_items) on conflict(id) do nothing;
 select * into b from public.schedule_batches where id=p_id for update;
 if b.owner_id<>p_owner or b.actor_id<>p_actor or b.brand_id<>p_brand or b.fingerprint<>p_fingerprint then raise exception 'Identificador de lote já utilizado com outros dados';end if;
 return to_jsonb(b);
end $$;
revoke all on function public.dropou_schedule_batch_prepare(uuid,uuid,text,uuid,timestamptz,text,text,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.dropou_schedule_batch_prepare(uuid,uuid,text,uuid,timestamptz,text,text,jsonb,jsonb) to service_role;

create function public.dropou_schedule_batch_commit(p_owner uuid,p_actor uuid,p_id uuid,p_target_key text,p_confirmed boolean) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare b public.schedule_batches;p public.products;o public.offers;i jsonb;j jsonb;intent jsonb;target jsonb;
 outcomes jsonb:='[]';position integer:=0;published boolean;reason text;
begin
 select * into b from public.schedule_batches where id=p_id for update;
 if b.id is null or b.owner_id<>p_owner or b.actor_id<>p_actor then raise exception 'Lote indisponível para esta sessão';end if;
 perform private.dropou_assert_publication_actor(p_owner,b.brand_id,p_actor);
 if b.state='completed' then return b.result;end if;
 if p_confirmed is distinct from true then raise exception 'Confirme a revisão coletiva dos dados e a intenção de agendamento';end if;
 if b.created_at<now()-interval '30 minutes' or b.scheduled_at<=now() then raise exception 'A revisão expirou ou o horário passou. Prepare o lote novamente';end if;
 if b.target->>'key' is distinct from p_target_key then raise exception 'O bot ou destino mudou. Prepare e confirme novamente';end if;
 -- Lock shared products in a stable order even when two operators select opposite orders.
 perform 1 from public.products where owner_id=p_owner and brand_id=b.brand_id
  and id in(select nullif(x->>'productId','')::uuid from jsonb_array_elements(b.items) x where nullif(x->>'productId','') is not null)
  order by id for update;
 for i in select value from jsonb_array_elements(b.items) loop
  begin
   if nullif(i->>'error','') is not null then raise exception '%',i->>'error';end if;
   select * into p from public.products where id=(i->>'productId')::uuid and owner_id=p_owner and brand_id=b.brand_id for update;
   if p.id is null or p.archived_at is not null or p.curation_state='rejected' then raise exception 'Produto indisponível, rejeitado ou arquivado';end if;
   if not p.catalog_pinned and p.catalog_entered_at+interval '14 days'<=now() then raise exception 'Prazo do catálogo expirado. Fixe ou revise o cadastro explicitamente';end if;
   if p.data is distinct from i->'expected' or coalesce((p.data->>'inStock')::boolean,true)=false or coalesce((p.data->>'price')::numeric,0)<=0 then raise exception 'Dados alterados, preço inválido ou produto indisponível. Revise este item';end if;
   if exists(select 1 from public.telegram_jobs where product_id=p.id and channel=b.channel and state in ('queued','ready','blocked','sending','partial','uncertain')) then raise exception 'Já existe agendamento, envio ou entrega em revisão neste destino';end if;
   select * into o from public.offers where product_id=p.id and owner_id=p_owner and status<>'excluido' for update;
   if (o.id is null and nullif(i->>'offerId','') is not null) or (o.id is not null and (o.id::text is distinct from i->>'offerId' or o.caption is distinct from i->>'caption')) then raise exception 'A legenda ou oferta mudou desde a revisão';end if;
   if o.id is null then
    insert into public.offers(owner_id,brand_id,product_id,caption,original_caption,manually_edited,snapshot,status)
    values(p_owner,b.brand_id,p.id,i->>'caption',i->>'caption',false,p.data,'rascunho') returning * into o;
   else
    update public.offers set snapshot=p.data,updated_at=now() where id=o.id returning * into o;
   end if;
   -- Human review is explicit and collective. Existing validator/reconfirm remains authoritative.
   if not public.dropou_publishable(p.data) then
    perform public.dropou_publication_reconfirm(p_owner,o.id,p.data);
    select * into o from public.offers where id=o.id;
   end if;
   if not public.dropou_publication_caption_valid(o.snapshot,i->>'caption','verified') then raise exception 'Preço, link, disponibilidade ou legenda não permitem publicação';end if;
   published:=exists(select 1 from public.dropou_confirmed_publications where product_id=p.id and channel=b.channel);
   target:=b.target||coalesce(i->'presentation','{}'::jsonb);
   if published then
    if coalesce((i->>'repost')::boolean,false)=false then raise exception 'Produto já publicado. Autorize expressamente a republicação';end if;
    if nullif(i->>'publishedAt','')::timestamptz is distinct from (select max(occurred_at) from public.dropou_confirmed_publications where product_id=p.id and channel=b.channel) then raise exception 'O histórico de publicação mudou. Prepare e revise a republicação novamente';end if;
    intent:=public.dropou_prepare_republication(p_owner,o.id,b.channel,gen_random_uuid());
    target:=target||jsonb_build_object('republicationKey',intent->>'id');
   end if;
   j:=public.dropou_publication_queue_actor(p_actor,p_owner,o.id,b.channel,b.scheduled_at,target,i->>'caption',i->>'caption','verified',false);
   update public.telegram_jobs set schedule_batch_id=b.id,schedule_batch_position=position where id=(j->>'id')::uuid;
   update public.products set curation_state='approved' where id=p.id;
   insert into public.operation_audit(owner_id,actor_id,brand_id,action,resource_id,detail)
   values(p_owner,p_actor,b.brand_id,'Revisão coletiva e agendamento autorizados',p.id,jsonb_build_object('batch',b.id,'job',j->>'id','scheduledAt',b.scheduled_at,'channel',b.channel,'repost',published));
   outcomes:=outcomes||jsonb_build_array(jsonb_build_object('key',i->>'key','productId',p.id,'jobId',j->>'id','state','queued','name',p.data->>'name'));
  exception when others then
   reason:=case when sqlstate='P0001' then sqlerrm else 'O banco recusou este item. Confira os dados e as permissões.' end;
   outcomes:=outcomes||jsonb_build_array(jsonb_build_object('key',i->>'key','productId',i->>'productId','state','failed','error',reason,'name',i->>'name'));
  end;
  position:=position+1;
 end loop;
 update public.schedule_batches set state='completed',confirmed_at=now(),result=jsonb_build_object('id',b.id,'scheduledAt',b.scheduled_at,'items',outcomes) where id=b.id returning * into b;
 return b.result;
end $$;
revoke all on function public.dropou_schedule_batch_commit(uuid,uuid,uuid,text,boolean) from public,anon,authenticated;
grant execute on function public.dropou_schedule_batch_commit(uuid,uuid,uuid,text,boolean) to service_role;

-- Existing executor: one job per invocation, ordered within a batch; never retry uncertain deliveries.
create or replace function public.dropou_due_manual_telegram_jobs() returns setof uuid language sql stable security invoker set search_path='' as $$
 select j.id from public.telegram_jobs j join public.operation_settings s on s.owner_id=j.owner_id and s.brand_id=j.brand_id
 where j.brand_id in ('beleza','casa','natal') and j.channel='telegram' and j.shopee_offer_id is null and j.queued_by is not null
 and j.state='queued' and j.scheduled_at<=now()
 and (j.schedule_batch_id is null or not exists(select 1 from public.telegram_jobs running where running.schedule_batch_id=j.schedule_batch_id and running.state='sending'))
 order by j.scheduled_at,coalesce(j.schedule_batch_id,j.id),coalesce(j.schedule_batch_position,0),j.id limit 1
$$;
create or replace function public.dropou_due_operation_jobs() returns setof uuid language sql stable security invoker set search_path='' as $$
 select j.id from public.telegram_jobs j join public.operation_settings s on s.owner_id=j.owner_id and s.brand_id=j.brand_id
 where (s.automation_enabled or (j.brand_id in ('beleza','casa','natal') and j.channel='telegram' and j.queued_by is not null))
 and j.state='queued' and j.scheduled_at<=now() and j.shopee_offer_id is null
 and (j.schedule_batch_id is null or not exists(select 1 from public.telegram_jobs running where running.schedule_batch_id=j.schedule_batch_id and running.state='sending'))
 order by j.scheduled_at,coalesce(j.schedule_batch_id,j.id),coalesce(j.schedule_batch_position,0),j.id limit 1
$$;

create or replace function public.dropou_schedule_page(p_page integer default 0) returns jsonb language sql stable security invoker set search_path='' as $$
 with pending as(select j.* from public.telegram_jobs j where j.owner_id=private.dropou_workspace_owner() and j.state in ('queued','ready','blocked','failed','sending','partial','uncertain')),
 groups as(select brand_id,coalesce(schedule_batch_id,product_id) group_id,min(scheduled_at) at from pending group by brand_id,coalesce(schedule_batch_id,product_id)),
 page as(select * from groups order by at,group_id limit 20 offset least(greatest(p_page,0),10000)*20)
 select jsonb_build_object('jobs',coalesce((select jsonb_agg(to_jsonb(j)||jsonb_build_object('name',j.snapshot->>'name','data',j.snapshot,'batch_result',b.result) order by j.scheduled_at,j.schedule_batch_position,j.id) from pending j join page p on p.group_id=coalesce(j.schedule_batch_id,j.product_id) and p.brand_id=j.brand_id left join public.schedule_batches b on b.id=j.schedule_batch_id),'[]'::jsonb),
 'more',(select count(*) from groups)>(p_page+1)*20,'total',(select count(*) from groups),'summary',jsonb_build_object(
 'today',(select count(*) from pending where (scheduled_at at time zone 'America/Bahia')::date=(now() at time zone 'America/Bahia')::date),
 'pending',(select count(*) from pending),'attention',(select count(*) from pending where state in ('blocked','failed','partial','uncertain') or state in ('queued','ready') and scheduled_at<now()),
 'next',(select min(scheduled_at) from pending where state='queued' and scheduled_at>=now())))
$$;
commit;
