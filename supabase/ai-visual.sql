-- Extensão do mesmo orçamento. Somente hashes e fatos extraídos são persistidos.
begin;
alter table public.ai_requests add column if not exists kind text not null default 'caption' check(kind in ('caption','vision'));
alter table public.ai_cache_hits add column if not exists kind text not null default 'caption' check(kind in ('caption','vision'));
create table if not exists public.ai_visual_cache (
 owner_id uuid not null references auth.users(id),cache_key text not null,
 image_hashes jsonb not null,model text not null,brand text not null,prompt_version text not null,
 request_id uuid not null references public.ai_requests(id),result jsonb,created_at timestamptz not null default now(),generated_at timestamptz,
 primary key(owner_id,cache_key)
);
create index if not exists ai_visual_request_idx on public.ai_visual_cache(request_id);
alter table public.ai_visual_cache enable row level security;
revoke all on public.ai_visual_cache from public,anon,authenticated;
grant all on public.ai_visual_cache to service_role;
create or replace function public.dropou_economy_visual_reserve(p_owner uuid,p_key text,p_hashes jsonb,p_model text,p_brand text,p_prompt text,p_max_cost numeric,p_rates jsonb) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare b public.ai_budget; c public.ai_visual_cache; rid uuid; spent numeric; daily numeric; calls integer; reason text;
 day_start timestamptz:=date_trunc('day',now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo';
begin
 select * into strict b from public.ai_budget where id=1 for update;
 if length(p_key)<>64 or jsonb_array_length(p_hashes) not between 1 and 3 or p_max_cost<0 then raise exception 'Leitura visual inválida'; end if;
 select * into c from public.ai_visual_cache where owner_id=p_owner and cache_key=p_key;
 if found then
  if c.result is not null then
   insert into public.ai_cache_hits(owner_id,captions,kind) values(p_owner,1,'vision');
   return jsonb_build_object('cached',c.result);
  end if;
  return jsonb_build_object('reason','Leitura em andamento ou com resultado incerto. Nenhuma nova chamada será feita.');
 end if;
 select coalesce(sum(case when state='reserved' then reserved_usd else cost_usd end),0),
 coalesce(sum(case when created_at>=day_start then case when state='reserved' then reserved_usd else cost_usd end else 0 end),0),
 count(*) filter(where created_at>=day_start) into spent,daily,calls from public.ai_requests;
 reason:=case when not b.enabled or p_max_cost=0 then 'Leitura visual paga desativada. Usando OCR local gratuito.'
 when b.not_before>now() then 'Aguarde o Retry-After. Usando OCR local gratuito.'
 when spent+p_max_cost>b.total_limit then 'Orçamento operacional atingido. Usando OCR local gratuito.'
 when daily+p_max_cost>b.daily_limit then 'Limite diário atingido. Usando OCR local gratuito.'
 when calls>=b.daily_requests then 'Limite diário de chamadas atingido. Usando OCR local gratuito.' end;
 if reason is not null then return jsonb_build_object('reason',reason); end if;
 insert into public.ai_requests(owner_id,model,state,reserved_usd,rates,kind) values(p_owner,p_model,'reserved',p_max_cost,p_rates,'vision') returning id into rid;
 insert into public.ai_visual_cache(owner_id,cache_key,image_hashes,model,brand,prompt_version,request_id) values(p_owner,p_key,p_hashes,p_model,p_brand,p_prompt,rid);
 return jsonb_build_object('id',rid);
end $$;
create or replace function public.dropou_economy_visual_finish(p_id uuid,p_result jsonb,p_payload jsonb) returns void
language plpgsql security invoker set search_path='' as $$
begin
 if not exists(select 1 from public.ai_requests where id=p_id and kind='vision') then raise exception 'Reserva visual não encontrada'; end if;
 if p_result->>'state'='complete' and (p_payload is null or jsonb_typeof(p_payload)<>'object') then raise exception 'Leitura incompleta'; end if;
 perform public.dropou_economy_ai_finish(p_id,p_result);
 if p_result->>'state'='complete' then update public.ai_visual_cache set result=p_payload,generated_at=now() where request_id=p_id;
 elsif p_result->>'state'='failed' then delete from public.ai_visual_cache where request_id=p_id;
 end if;
end $$;
create or replace function public.dropou_economy_visual_usage() returns jsonb
language sql stable security invoker set search_path='' as $$
 select jsonb_build_object('calls',count(*),'input',coalesce(sum(input_tokens),0),'output',coalesce(sum(output_tokens),0),'cost',coalesce(sum(cost_usd),0),
 'cache',(select coalesce(sum(captions),0) from public.ai_cache_hits where kind='vision')) from public.ai_requests where kind='vision'
$$;
revoke all on function public.dropou_economy_visual_reserve(uuid,text,jsonb,text,text,text,numeric,jsonb),public.dropou_economy_visual_finish(uuid,jsonb,jsonb),public.dropou_economy_visual_usage() from public,anon,authenticated;
grant execute on function public.dropou_economy_visual_reserve(uuid,text,jsonb,text,text,text,numeric,jsonb),public.dropou_economy_visual_finish(uuid,jsonb,jsonb),public.dropou_economy_visual_usage() to service_role;
commit;
