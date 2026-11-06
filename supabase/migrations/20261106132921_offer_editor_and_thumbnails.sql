begin;
alter table public.offers add column if not exists original_caption text;
alter table public.offers add column if not exists manually_edited boolean not null default false;
do $$ begin
 if not exists(select 1 from pg_constraint where conname='offers_original_caption_length' and conrelid='public.offers'::regclass) then
  alter table public.offers add constraint offers_original_caption_length check(original_caption is null or length(original_caption) between 1 and 4000);
 end if;
end $$;
-- Keep the existing transaction, owner checks, RLS, snapshot and publication rules.
create or replace function public.dropou_save_offer_version(p_product uuid,p_expected jsonb,p_caption text,p_original text,p_manual boolean) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare uid uuid:=auth.uid(); prior public.offers; result jsonb; oid uuid;
begin
 if uid is null then raise exception 'Autenticação obrigatória'; end if;
 perform 1 from public.products where id=p_product and owner_id=uid for update;
 select * into prior from public.offers where product_id=p_product and owner_id=uid and status<>'excluido' for update;
 result:=public.dropou_save_offer(p_product,p_expected,p_caption);
 oid:=(result->>'id')::uuid;
 update public.offers set original_caption=coalesce(prior.original_caption,prior.caption,p_original,p_caption),manually_edited=p_manual
 where id=oid and owner_id=uid returning to_jsonb(offers.*) into result;
 return result;
end $$;
revoke all on function public.dropou_save_offer_version(uuid,jsonb,text,text,boolean) from public,anon;
grant execute on function public.dropou_save_offer_version(uuid,jsonb,text,text,boolean) to authenticated;
update storage.buckets set public=false,allowed_mime_types=array['image/jpeg','image/webp'] where id='offer-images';
commit;
