-- Cofre de tokens: nenhuma policy para anon/authenticated. Só o servidor pode acessar.
begin;
create table if not exists public.mercado_livre_oauth_flows (
 state_hash text primary key,
 owner_id uuid not null references auth.users(id) on delete cascade,
 browser_hash text not null,
 encrypted_verifier text not null,
 expires_at timestamptz not null,
 created_at timestamptz not null default now()
);
create index if not exists ml_flows_owner_idx on public.mercado_livre_oauth_flows(owner_id);
create index if not exists ml_flows_expiry_idx on public.mercado_livre_oauth_flows(expires_at);
create table if not exists public.mercado_livre_connections (
 owner_id uuid primary key references auth.users(id) on delete cascade,
 ml_user_id text not null,
 encrypted_tokens text not null,
 expires_at timestamptz not null,
 status text not null check(status in ('active','refreshing','reconnect_required','refresh_uncertain')),
 version uuid not null default gen_random_uuid(),
 lock_id text,
 refresh_started_at timestamptz,
 updated_at timestamptz not null default now()
);
alter table public.mercado_livre_oauth_flows enable row level security;
alter table public.mercado_livre_connections enable row level security;
revoke all on public.mercado_livre_oauth_flows,public.mercado_livre_connections from public,anon,authenticated;
grant select,insert,update,delete on public.mercado_livre_oauth_flows,public.mercado_livre_connections to service_role;
commit;
