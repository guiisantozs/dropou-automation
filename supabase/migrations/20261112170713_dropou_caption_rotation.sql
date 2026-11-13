begin;
create table public.dropou_caption_history(
 id bigint generated always as identity primary key,
 owner_id uuid not null,
 brand_id text not null default 'dropou' check(brand_id='dropou'),
 subject text not null check(length(subject) between 1 and 100),
 category text not null check(category in ('games','consoles','controls','peripherals','hardware','tech')),
 headline text not null check(length(headline) between 8 and 105),
 created_at timestamptz not null default clock_timestamp(),
 foreign key(owner_id,brand_id) references public.operation_settings(owner_id,brand_id) on delete cascade
);
create index dropou_caption_history_owner_time_idx on public.dropou_caption_history(owner_id,brand_id,id desc);
alter table public.dropou_caption_history enable row level security;
create policy dropou_caption_history_read on public.dropou_caption_history for select to authenticated using(owner_id=(select auth.uid()) and public.dropou_brand_scope(brand_id));
revoke all on public.dropou_caption_history from public,anon,authenticated;
grant select on public.dropou_caption_history to authenticated;
grant all on public.dropou_caption_history to service_role;
grant usage,select on sequence public.dropou_caption_history_id_seq to service_role;

-- The server supplies a category's local whitelist. One owner lock serializes choices.
-- Consult actual receipts as well as selected calls; previews never count as publications.
create function public.dropou_caption_rotate(p_owner uuid,p_subject text,p_category text,p_candidates text[],p_current text default '') returns text
language plpgsql security invoker set search_path='' as $$
declare chosen text;last_selected text;last_published text;
begin
 if cardinality(p_candidates) not between 4 and 12 or length(p_subject) not between 1 and 100
 or exists(select 1 from unnest(p_candidates) c where c is null or length(c) not between 8 and 105 or c~E'[\\n\\r]' or c~*'https?:|R\\$|[%<>*_~]')
 then raise exception 'Chamadas locais inválidas';end if;
 if not exists(select 1 from public.operation_settings where owner_id=p_owner and brand_id='dropou') then raise exception 'Operação indisponível';end if;
 perform pg_advisory_xact_lock(hashtextextended('dropou-caption-'||p_owner::text,0));
 select headline into last_selected from public.dropou_caption_history where owner_id=p_owner and brand_id='dropou' order by id desc limit 1;
 select split_part(published.caption,E'\n\n',1) into last_published from (
  select caption,coalesce(effective_at,created_at) occurred from public.channel_events where owner_id=p_owner and brand_id='dropou' and event in ('sent','legacy_telegram_verified') and jsonb_array_length(message_ids)>0
  union all select caption,confirmed_at from public.publications where owner_id=p_owner and brand_id='dropou' and not review_required and confirmed_by is not null
 ) published where caption<>'' order by occurred desc limit 1;
 select candidate into chosen from unnest(p_candidates) with ordinality c(candidate,position)
 where candidate is distinct from p_current and candidate is distinct from last_selected and candidate is distinct from last_published
 order by (select max(h.id) from public.dropou_caption_history h where h.owner_id=p_owner and h.brand_id='dropou' and h.headline=candidate) nulls first,position limit 1;
 if chosen is null then raise exception 'Sem outra chamada local disponível';end if;
 insert into public.dropou_caption_history(owner_id,subject,category,headline) values(p_owner,p_subject,p_category,chosen);
 return chosen;
end $$;
revoke all on function public.dropou_caption_rotate(uuid,text,text,text[],text) from public,anon,authenticated;
grant execute on function public.dropou_caption_rotate(uuid,text,text,text[],text) to service_role;
commit;
