begin;
-- API attempts and cooldowns use one authoritative clock, even when the local
-- machine's clock differs from Postgres. Existing request charges are retained.
create function public.dropou_shopee_finish(p_request uuid,p_state text,p_retry_seconds integer) returns void language plpgsql security invoker set search_path='' as $$
begin
 if p_state not in ('ok','provider','auth','rate_limit','contract') or p_retry_seconds not between 0 and 86400 then raise exception 'Resultado de consulta inválido';end if;
 update public.shopee_requests set state=p_state,finished_at=clock_timestamp(),blocked_until=case when p_state='ok' then null else clock_timestamp()+make_interval(secs=>greatest(60,p_retry_seconds)) end where id=p_request and state='reserved';
end $$;
revoke all on function public.dropou_shopee_finish(uuid,text,integer) from public,anon,authenticated;
grant execute on function public.dropou_shopee_finish(uuid,text,integer) to service_role;
-- Repair the observed premature cooldown, never refund or repeat its attempt.
update public.shopee_requests set blocked_until=created_at+interval '2 minutes' where state='provider' and blocked_until<created_at;
commit;
