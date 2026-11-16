-- Isolated MTProto account sessions. Never grant clients access to the ciphertext.
create table public.telegram_mtproto_connections (
 id uuid primary key default gen_random_uuid(),
 owner_id uuid not null references auth.users(id) on delete cascade,
 brand_id text not null references public.affiliate_operations(id),
 status text not null default 'disconnected' check(status in ('disconnected','code','password','connected','error')),
 encrypted_state text,
 auth_expires_at timestamptz,
 attempts integer not null default 0 check(attempts between 0 and 8),
 next_attempt_at timestamptz not null default now(),
 error_code text,
 selected jsonb not null default '[]' check(jsonb_typeof(selected)='array' and jsonb_array_length(selected)<=10),
 test_channel_id text,
 test_started_at timestamptz,
 test_expires_at timestamptz,
 heartbeat_at timestamptz,
 updated_at timestamptz not null default now(),
 unique(owner_id,brand_id),
 check(status not in ('code','password','connected') or encrypted_state is not null),
 check(test_channel_id is null or (status='connected' and test_started_at is not null and test_expires_at is not null and test_expires_at>test_started_at and test_expires_at<=test_started_at+interval '10 minutes'))
);
create table public.telegram_mtproto_diagnostics (
 connection_id uuid not null references public.telegram_mtproto_connections(id) on delete cascade,
 test_id timestamptz not null,
 channel_id text not null,
 message_id bigint not null check(message_id>0),
 message_at timestamptz not null,
 received_at timestamptz not null default now(),
 kind text not null check(kind in ('text','photo','document','other')),
 primary key(connection_id,test_id,channel_id,message_id)
);
create index telegram_mtproto_diagnostics_retention on public.telegram_mtproto_diagnostics(received_at);
create table public.telegram_mtproto_worker_lease (
 id boolean primary key default true check(id),
 holder uuid not null,
 expires_at timestamptz not null
);
alter table public.telegram_mtproto_connections enable row level security;
alter table public.telegram_mtproto_diagnostics enable row level security;
alter table public.telegram_mtproto_worker_lease enable row level security;
revoke all on public.telegram_mtproto_connections,public.telegram_mtproto_diagnostics,public.telegram_mtproto_worker_lease from public,anon,authenticated;
grant select,insert,update,delete on public.telegram_mtproto_connections,public.telegram_mtproto_diagnostics,public.telegram_mtproto_worker_lease to service_role;

create function public.dropou_mtproto_lease(p_holder uuid,p_release boolean default false) returns boolean
language plpgsql security invoker set search_path='' as $$
begin
 if p_release then
  delete from public.telegram_mtproto_worker_lease where id and holder=p_holder;
  return found;
 end if;
 insert into public.telegram_mtproto_worker_lease(id,holder,expires_at) values(true,p_holder,clock_timestamp()+interval '30 seconds')
 on conflict(id) do update set holder=excluded.holder,expires_at=excluded.expires_at
 where public.telegram_mtproto_worker_lease.holder=p_holder or public.telegram_mtproto_worker_lease.expires_at<clock_timestamp();
 return found;
end $$;
revoke all on function public.dropou_mtproto_lease(uuid,boolean) from public,anon,authenticated;
grant execute on function public.dropou_mtproto_lease(uuid,boolean) to service_role;

create function public.dropou_mtproto_update(p_holder uuid,p_connection uuid,p_patch jsonb) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare c public.telegram_mtproto_connections;
begin
 perform 1 from public.telegram_mtproto_worker_lease where id and holder=p_holder and expires_at>clock_timestamp() for share;
 if not found then return null;end if;
 select * into c from public.telegram_mtproto_connections where id=p_connection for update;
 if not found then return null;end if;
 c:=jsonb_populate_record(c,p_patch-'id'-'owner_id'-'brand_id');
 update public.telegram_mtproto_connections set status=c.status,encrypted_state=c.encrypted_state,auth_expires_at=c.auth_expires_at,
 attempts=c.attempts,next_attempt_at=c.next_attempt_at,error_code=c.error_code,selected=c.selected,test_channel_id=c.test_channel_id,
 test_started_at=c.test_started_at,test_expires_at=c.test_expires_at,heartbeat_at=c.heartbeat_at,updated_at=clock_timestamp() where id=c.id;
 return (select to_jsonb(r) from public.telegram_mtproto_connections r where r.id=c.id);
end $$;
revoke all on function public.dropou_mtproto_update(uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.dropou_mtproto_update(uuid,uuid,jsonb) to service_role;

-- Recheck the active test and fencing lease at ingestion, and retain at most 50 metadata entries.
create function public.dropou_mtproto_diagnostic(p_holder uuid,p_connection uuid,p_test timestamptz,p_channel text,p_message bigint,p_at timestamptz,p_kind text) returns boolean
language plpgsql security invoker set search_path='' as $$
declare c public.telegram_mtproto_connections;
begin
 perform 1 from public.telegram_mtproto_worker_lease where id and holder=p_holder and expires_at>clock_timestamp() for share;
 if not found then return false;end if;
 select * into c from public.telegram_mtproto_connections where id=p_connection for update;
 if not found or c.status<>'connected' or c.test_channel_id is distinct from p_channel or c.test_started_at is distinct from p_test
 or c.test_expires_at is null or c.test_expires_at<=clock_timestamp() or p_at<c.test_started_at or p_at>clock_timestamp()+interval '5 seconds' then return false;end if;
 insert into public.telegram_mtproto_diagnostics(connection_id,test_id,channel_id,message_id,message_at,kind)
 values(p_connection,p_test,p_channel,p_message,p_at,p_kind) on conflict do nothing;
 delete from public.telegram_mtproto_diagnostics where connection_id=p_connection and (received_at<clock_timestamp()-interval '1 hour' or (test_id,channel_id,message_id) in (
 select test_id,channel_id,message_id from public.telegram_mtproto_diagnostics where connection_id=p_connection order by received_at desc,message_id desc offset 50));
 return true;
end $$;
revoke all on function public.dropou_mtproto_diagnostic(uuid,uuid,timestamptz,text,bigint,timestamptz,text) from public,anon,authenticated;
grant execute on function public.dropou_mtproto_diagnostic(uuid,uuid,timestamptz,text,bigint,timestamptz,text) to service_role;
