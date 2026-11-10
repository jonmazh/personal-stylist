-- Personal Shopper 2.0 · 2.0C: Trend Intelligence (idempotente).
-- Condiciones de Brave Search API: sin un plan con derechos de almacenamiento NO se guardan sus resultados (ni URL,
-- ni títulos, ni fragmentos). Se guardan las conclusiones del sistema (señales validadas) y nuestras propias consultas;
-- las fuentes se vuelven a consultar en vivo cuando las pides. La columna «evidence» solo se rellena con
-- BRAVE_STORAGE_RIGHTS=1 (plan con derechos de almacenamiento).
create table if not exists public.trend_researches (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  version text not null,
  season text not null,
  mode text not null check (mode in ('editorial_comercial','editorial','comercial','sin_fuentes')),
  status text not null default 'ok' check (status in ('ok','parcial','error')),
  queries jsonb not null default '[]',        -- nuestras consultas (texto propio)
  stats jsonb not null default '{}',          -- recuentos, descartes por motivo, consumo de Brave, IA y Channel3
  limitations jsonb not null default '[]',
  hypotheses jsonb not null default '[]',     -- presencia comercial de hipótesis del armario (Channel3), sin tendencia
  identity_hash text,
  evidence jsonb,                             -- solo con derechos de almacenamiento de Brave
  error text,
  created_at timestamptz default now()
);
create index if not exists trend_researches_user_idx on public.trend_researches (user_id, created_at desc);

create table if not exists public.trend_signals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  research_id uuid not null references public.trend_researches(id) on delete cascade,
  key text not null,
  name text not null check (char_length(name) <= 160),
  dimension text not null check (dimension in ('silhouette','color','material','wash','pattern','footwear','outerwear','layering','aesthetic','garment')),
  description text not null,
  kind text not null check (kind in ('tendencia_editorial','propuesta_editorial')),
  stage text not null check (stage in ('emergente','consolidada','estacional','saturada','sin_determinar')),
  confidence text not null check (confidence in ('alta','media','baja')),
  confidence_reasons jsonb not null default '[]',
  evidence_count integer not null default 0,
  source_count integer not null default 0,
  published_from timestamptz, published_to timestamptz,
  validity text,
  brands jsonb not null default '[]',
  presence jsonb,                             -- presencia comercial (Channel3): recuentos propios, separada de la evidencia
  search_query text,                          -- nuestra consulta para volver a consultar las fuentes en vivo
  validation jsonb not null default '[]',
  evidence jsonb,                             -- solo con derechos de almacenamiento de Brave
  observed_at timestamptz not null default now()
);
create index if not exists trend_signals_research_idx on public.trend_signals (research_id);

do $$ declare t text; begin
  foreach t in array array['trend_researches','trend_signals'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "own rows" on public.%I', t);
    execute format('create policy "own rows" on public.%I for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))', t);
  end loop;
end $$;
