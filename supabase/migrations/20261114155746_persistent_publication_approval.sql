-- Human approval belongs to the saved snapshot; time passing does not revoke it.
-- No flags, destinations, receipts or existing queue states are changed.
begin;
create or replace function public.dropou_publishable(p jsonb) returns boolean
language sql stable security invoker set search_path='' as $$
 select coalesce((p->>'demo')::boolean=false and length(p->>'affiliateUrl')>0 and (p->>'inStock')::boolean=true
 and (p->>'checkedAt')::timestamptz<=now()+interval '1 second'
 and (coalesce(p->>'paymentMethod','nao_informado')<>'pix' or (p->>'pixVerified')::boolean=true)
 and (coalesce(p->>'dataOrigin','manual')<>'screenshot' or (p->>'screenshotConfirmed')::boolean=true),false)
$$;
-- Patch the existing queue implementation under the multibrand wrapper, retaining
-- its locks, immutable snapshot comparison, destination binding and idempotency.
do $$ declare f record; definition text; begin
 for f in select oid from pg_proc where pronamespace='public'::regnamespace
 and proname in ('dropou_singlebrand_queue','dropou_singlebrand_claim','dropou_publication_claim','dropou_publication_queue') loop
  definition:=pg_get_functiondef(f.oid);
  definition:=replace(definition,$old$(p->>'checkedAt')::timestamptz+interval '15 minutes'$old$,$new$'infinity'::timestamptz$new$);
  definition:=replace(definition,' or j.authorized_until is null or j.authorized_until<now()','');
  definition:=replace(definition,'j.authorized_until<now() or ','');
  execute definition;
 end loop;
end $$;
commit;
