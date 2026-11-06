-- Aplicar após schema.sql e whatsapp-flow.sql. Ledger global da chave OpenAI.
begin;
create table if not exists public.ai_budget (
 id integer primary key check(id=1), enabled boolean not null default false,not_before timestamptz,
 total_limit numeric(14,8) not null default 4.50 check(total_limit between 0 and 1000),
 daily_limit numeric(14,8) not null default 0.50 check(daily_limit between 0 and 100),
 daily_requests integer not null default 100 check(daily_requests between 0 and 10000)
);
insert into public.ai_budget(id) values(1) on conflict do nothing;
create table if not exists public.ai_requests (
 id uuid primary key default gen_random_uuid(),owner_id uuid not null references auth.users(id),
 model text not null,state text not null check(state in ('reserved','complete','failed','uncertain')),
 reserved_usd numeric(14,8) not null check(reserved_usd>=0),cost_usd numeric(14,8) not null default 0 check(cost_usd>=0),
 input_tokens integer not null default 0,output_tokens integer not null default 0,cached_tokens integer not null default 0,
 cache_write_tokens integer not null default 0,cache_write_12h_tokens integer not null default 0,rates jsonb not null default '{}',
 captions integer not null default 0,error_code text,created_at timestamptz not null default now()
);
create index if not exists ai_requests_date_idx on public.ai_requests(created_at);
create index if not exists ai_requests_owner_idx on public.ai_requests(owner_id,created_at);
create table if not exists public.ai_caption_cache (
 owner_id uuid not null references auth.users(id),cache_key text not null,product_id uuid not null references public.products(id),
 marketplace text not null,verified_data jsonb not null,brand text not null,prompt_version text not null,model text not null,
 request_id uuid not null references public.ai_requests(id),captions jsonb,generated_at timestamptz,
 primary key(owner_id,cache_key)
);
create index if not exists ai_cache_request_idx on public.ai_caption_cache(request_id);
create table if not exists public.ai_cache_hits (
 id bigint generated always as identity primary key,owner_id uuid not null references auth.users(id),
 captions integer not null,created_at timestamptz not null default now()
);
create index if not exists ai_hits_date_idx on public.ai_cache_hits(created_at);
alter table public.ai_budget enable row level security;
alter table public.ai_requests enable row level security;
alter table public.ai_caption_cache enable row level security;
alter table public.ai_cache_hits enable row level security;
revoke all on public.ai_budget,public.ai_requests,public.ai_caption_cache,public.ai_cache_hits from public,anon,authenticated;
grant all on public.ai_budget,public.ai_requests,public.ai_caption_cache,public.ai_cache_hits to service_role;
grant usage,select on sequence public.ai_cache_hits_id_seq to service_role;

-- Short transaction holds a single row lock across all owners for a shared API key.
-- No provider request happens inside the transaction. Unknown outcomes retain reserve.
create or replace function public.dropou_economy_ai_reserve(p_owner uuid,p_entries jsonb,p_model text,p_max_cost numeric,p_rates jsonb default '{}') returns jsonb
language plpgsql security invoker set search_path='' as $$
declare b public.ai_budget; e jsonb; c public.ai_caption_cache; fresh jsonb:='[]'; cached jsonb:='{}'; blocked jsonb:='[]'; rid uuid;
 spent numeric; daily numeric; calls integer; reason text; day_start timestamptz:=date_trunc('day',now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo';
begin
 select * into strict b from public.ai_budget where id=1 for update;
 if jsonb_array_length(p_entries)>5 or p_max_cost<0 then raise exception 'Reserva inválida'; end if;
 for e in select value from jsonb_array_elements(p_entries) loop
  if not exists(select 1 from public.products where id=(e->>'productId')::uuid and owner_id=p_owner) then raise exception 'Produto não encontrado'; end if;
  select * into c from public.ai_caption_cache where owner_id=p_owner and cache_key=e->>'key';
  if found then
   if c.captions is not null then
    cached:=cached||jsonb_build_object(e->>'key',c.captions);
    insert into public.ai_cache_hits(owner_id,captions) values(p_owner,jsonb_array_length(c.captions));
   else blocked:=blocked||jsonb_build_array(e->>'key'); end if;
  elsif not fresh @> jsonb_build_array(e->>'key') then fresh:=fresh||jsonb_build_array(e->>'key'); end if;
 end loop;
 if jsonb_array_length(fresh)=0 then return jsonb_build_object('fresh','[]'::jsonb,'cached',cached,'blocked',blocked); end if;
 select coalesce(sum(case when state='reserved' then reserved_usd else cost_usd end),0),
 coalesce(sum(case when created_at>=day_start then case when state='reserved' then reserved_usd else cost_usd end else 0 end),0),
 count(*) filter(where created_at>=day_start) into spent,daily,calls from public.ai_requests;
 reason:=case when not b.enabled or p_max_cost=0 then 'IA paga desativada ou sem chave. Usando template gratuito.'
 when b.not_before>now() then 'Limite transitório: aguarde o Retry-After antes de tentar novamente.'
 when spent+p_max_cost>b.total_limit then 'Orçamento operacional atingido (inclui reservas).'
 when daily+p_max_cost>b.daily_limit then 'Limite diário de gastos atingido.'
 when calls>=b.daily_requests then 'Limite diário de requisições atingido.' end;
 if reason is not null then return jsonb_build_object('fresh','[]'::jsonb,'cached',cached,'blocked',blocked,'reason',reason); end if;
 insert into public.ai_requests(owner_id,model,state,reserved_usd,rates) values(p_owner,p_model,'reserved',p_max_cost,p_rates) returning id into rid;
 for e in select value from jsonb_array_elements(p_entries) loop
  if fresh @> jsonb_build_array(e->>'key') then
   insert into public.ai_caption_cache(owner_id,cache_key,product_id,marketplace,verified_data,brand,prompt_version,model,request_id)
   values(p_owner,e->>'key',(e->>'productId')::uuid,e->>'marketplace',e->'verifiedData',e->>'brand',e->>'prompt',p_model,rid) on conflict do nothing;
  end if;
 end loop;
 return jsonb_build_object('id',rid,'fresh',fresh,'cached',cached,'blocked',blocked);
end $$;

create or replace function public.dropou_economy_ai_finish(p_id uuid,p_result jsonb) returns void
language plpgsql security invoker set search_path='' as $$
declare r public.ai_requests; e record;
begin
 perform 1 from public.ai_budget where id=1 for update;
 select * into r from public.ai_requests where id=p_id for update;
 if not found or r.state<>'reserved' then raise exception 'Reserva já encerrada ou inexistente'; end if;
 if p_result->>'state' not in ('complete','failed','uncertain') or (p_result->>'cost')::numeric<0 then raise exception 'Consumo inválido'; end if;
 update public.ai_requests set state=p_result->>'state',cost_usd=(p_result->>'cost')::numeric,
 input_tokens=(p_result->>'input')::integer,output_tokens=(p_result->>'output')::integer,cached_tokens=(p_result->>'cached')::integer,
 cache_write_tokens=coalesce((p_result->>'written')::integer,0),cache_write_12h_tokens=coalesce((p_result->>'longWritten')::integer,0),
 captions=(p_result->>'captionCount')::integer,error_code=p_result->>'error' where id=p_id;
 if p_result->>'error'='rate_limit' then update public.ai_budget set not_before=(p_result->>'retryAt')::timestamptz where id=1; end if;
 if p_result->>'error'='quota' then update public.ai_budget set enabled=false where id=1; end if;
 if p_result->>'state'='complete' then
  for e in select key,value from jsonb_each(p_result->'captions') loop
   update public.ai_caption_cache set captions=e.value,generated_at=now() where request_id=p_id and cache_key=e.key;
  end loop;
 elsif p_result->>'state'='failed' then delete from public.ai_caption_cache where request_id=p_id;
 end if;
end $$;

create or replace function public.dropou_economy_ai_usage() returns jsonb
language sql stable security invoker set search_path='' as $$
 select jsonb_build_object('budget',(select to_jsonb(b) from public.ai_budget b where id=1),
 'days',coalesce((select jsonb_agg(to_jsonb(d) order by d.day desc) from (
 select (created_at at time zone 'America/Sao_Paulo')::date as day,count(*) calls,sum(captions) captions,
 sum(input_tokens) input,sum(output_tokens) output,sum(cost_usd) cost,
 sum(case when state='reserved' then reserved_usd else 0 end) reserved
 from public.ai_requests group by 1) d),'[]'::jsonb),
 'cache',coalesce((select jsonb_agg(to_jsonb(h)) from (select (created_at at time zone 'America/Sao_Paulo')::date as day,sum(captions) captions from public.ai_cache_hits group by 1) h),'[]'::jsonb),
 'uncertain',(select count(*) from public.ai_requests where state in ('reserved','uncertain')))
$$;
revoke all on function public.dropou_economy_ai_reserve(uuid,jsonb,text,numeric,jsonb),public.dropou_economy_ai_finish(uuid,jsonb),public.dropou_economy_ai_usage() from public,anon,authenticated;
grant execute on function public.dropou_economy_ai_reserve(uuid,jsonb,text,numeric,jsonb),public.dropou_economy_ai_finish(uuid,jsonb),public.dropou_economy_ai_usage() to service_role;

-- A screenshot never bypasses human confirmation, even via direct authenticated RPC.
create or replace function public.dropou_publishable(p jsonb) returns boolean
language sql stable security invoker set search_path='' as $$
 select coalesce((p->>'demo')::boolean=false and length(p->>'affiliateUrl')>0 and (p->>'inStock')::boolean=true
 and (p->>'checkedAt')::timestamptz between now()-interval '15 minutes' and now()+interval '1 second'
 and (coalesce(p->>'paymentMethod','nao_informado')<>'pix' or (p->>'pixVerified')::boolean=true)
 and (coalesce(p->>'dataOrigin','manual')<>'screenshot' or (p->>'screenshotConfirmed')::boolean=true),false)
$$;
commit;
