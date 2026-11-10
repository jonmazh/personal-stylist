-- Personal Shopper 2.0 · 2.0D: estrategias de estilo y oportunidades (idempotente).
create table if not exists public.style_strategies (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  version text not null,
  fingerprint text not null,
  wardrobe_analysis_id uuid references public.wardrobe_analyses(id) on delete set null,
  trend_research_id uuid references public.trend_researches(id) on delete set null,
  direction text not null,
  experimentation text,
  no_purchase_needed boolean not null default false,
  rejected jsonb not null default '[]',      -- ideas descartadas y por qué
  meta jsonb not null default '{}',
  created_at timestamptz default now()
);
create index if not exists style_strategies_user_idx on public.style_strategies (user_id, created_at desc);

create table if not exists public.style_opportunities (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  strategy_id uuid not null references public.style_strategies(id) on delete cascade,
  key text not null,
  rank integer not null,
  title text not null check (char_length(title) <= 200),
  mode text not null check (mode in ('evolution','expansion','exploration')),
  purchase boolean not null default true,
  priority integer not null check (priority between 0 and 100),
  confidence text not null check (confidence in ('alta','media','baja')),
  scores jsonb not null,                     -- {fashion_relevance|null, personal_suitability, stylistic_impact}
  detail jsonb not null,                     -- diagnóstico, evidencias, relación con el perfil, mercado, propuesta, objetivo, beneficios, inconvenientes
  status text not null default 'propuesta' check (status in ('propuesta','me_interesa','descartada')),
  created_at timestamptz default now()
);
create index if not exists style_opportunities_strategy_idx on public.style_opportunities (strategy_id, rank);

do $$ declare t text; begin
  foreach t in array array['style_strategies','style_opportunities'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "own rows" on public.%I', t);
    execute format('create policy "own rows" on public.%I for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))', t);
  end loop;
end $$;
