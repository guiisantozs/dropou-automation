-- Execute no SQL Editor de um projeto Supabase novo. Não contém dados reais.
create table public.products (
 id uuid primary key,
 owner_id uuid not null references auth.users(id) on delete cascade,
 canonical_url text not null,
 data jsonb not null check (jsonb_typeof(data) = 'object' and data->>'id' is not null and data->>'id'=id::text),
 created_at timestamptz not null default now(),
 unique(owner_id, canonical_url)
);
create index products_owner_idx on public.products(owner_id);
create table public.settings (
 owner_id uuid primary key references auth.users(id) on delete cascade,
 schedule jsonb not null default '{"enabled":false,"timezone":"America/Bahia","times":["09:00","12:00","16:00","20:00"],"telegram":false}'
);
create table public.logs (
 id bigint generated always as identity primary key,
 owner_id uuid not null references auth.users(id) on delete cascade,
 event text not null, detail text not null,
 created_at timestamptz not null default now()
);
create index logs_owner_idx on public.logs(owner_id);
create table public.runs (
 owner_id uuid not null references auth.users(id) on delete cascade,
 slot text not null, created_at timestamptz not null default now(),
 primary key(owner_id,slot)
);
create table public.deliveries (
 owner_id uuid not null references auth.users(id) on delete cascade,
 product_id uuid not null references public.products(id) on delete cascade,
 channel text not null check(channel='telegram'),
 state text not null check(state in ('sending','sent')),
 message_id text, created_at timestamptz not null default now(),
 primary key(product_id,channel)
);
alter table public.products enable row level security;
alter table public.settings enable row level security;
alter table public.logs enable row level security;
alter table public.runs enable row level security;
alter table public.deliveries enable row level security;
create policy products_read on public.products for select to authenticated using ((select auth.uid())=owner_id);
create policy products_insert on public.products for insert to authenticated with check ((select auth.uid())=owner_id);
create policy products_update on public.products for update to authenticated using ((select auth.uid())=owner_id) with check ((select auth.uid())=owner_id);
create policy products_delete on public.products for delete to authenticated using ((select auth.uid())=owner_id);
create policy settings_read on public.settings for select to authenticated using ((select auth.uid())=owner_id);
create policy settings_insert on public.settings for insert to authenticated with check ((select auth.uid())=owner_id);
create policy settings_update on public.settings for update to authenticated using ((select auth.uid())=owner_id) with check ((select auth.uid())=owner_id);
create policy logs_read on public.logs for select to authenticated using ((select auth.uid())=owner_id);
create policy logs_insert on public.logs for insert to authenticated with check ((select auth.uid())=owner_id);
create policy deliveries_read on public.deliveries for select to authenticated using ((select auth.uid())=owner_id);
create policy runs_read on public.runs for select to authenticated using ((select auth.uid())=owner_id);
revoke all on public.products,public.settings,public.logs,public.runs,public.deliveries from anon;
grant select,insert,update,delete on public.products to authenticated;
grant select,insert,update on public.settings to authenticated;
grant select,insert on public.logs to authenticated;
grant usage,select on sequence public.logs_id_seq to authenticated;
grant select on public.runs,public.deliveries to authenticated;
