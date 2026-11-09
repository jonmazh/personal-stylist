-- Fase 3B · Motor de combinaciones: historial de peticiones y propuestas. Ejecutar despues de 0011. Es idempotente.
-- El motor (lib/outfits/engine) genera, puntua y valida sin IA; aqui se guarda que se pidio, con que pesos y
-- version del motor, que se descarto y cada propuesta con su desglose, para poder auditarla.
-- El contexto de la peticion se guarda en outfit_generations.context (no se crea outfit_contexts hasta que
-- los conjuntos guardados lo necesiten por si mismos, en 3C).

create table if not exists public.outfit_generations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  engine_version text not null,
  request jsonb not null,                    -- peticion estructurada tal cual
  context jsonb not null,                    -- contexto resuelto: formalidad objetivo, temporada, capas prohibidas
  weights jsonb not null,                    -- pesos usados (configurables)
  stats jsonb not null,                      -- prendas elegibles, excluidas (y por que), combinaciones evaluadas y descartadas
  notes jsonb not null default '[]',
  created_at timestamptz default now()
);
create index if not exists outfit_generations_user_idx on public.outfit_generations (user_id, created_at desc);

create table if not exists public.outfit_generation_results (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  generation_id uuid not null references public.outfit_generations(id) on delete cascade,
  rank integer not null,
  intent text not null check (intent in ('elegante','minimalista','relajada','personalidad','versatil')),
  name text not null,
  template text not null,
  score numeric not null check (score between 0 and 100),
  confidence text not null check (confidence in ('alta','media','baja')),
  garment_ids uuid[] not null,
  items jsonb not null,                      -- [{garment_id, role, title, snapshot}]
  breakdown jsonb not null,                  -- criterios: peso, valor, puntos, razones, matices, datos usados
  why jsonb not null default '[]',
  cons jsonb not null default '[]',
  warnings jsonb not null default '[]',
  alternatives jsonb not null default '[]',
  status text not null default 'proposed' check (status in ('proposed','saved','dismissed')),
  saved_outfit_id uuid references public.outfits(id) on delete set null,
  created_at timestamptz default now()
);
create index if not exists outfit_generation_results_gen_idx on public.outfit_generation_results (generation_id, rank);

alter table public.outfit_generations enable row level security;
alter table public.outfit_generation_results enable row level security;
drop policy if exists "own rows" on public.outfit_generations;
create policy "own rows" on public.outfit_generations for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
drop policy if exists "own rows" on public.outfit_generation_results;
create policy "own rows" on public.outfit_generation_results for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()) and exists (select 1 from public.outfit_generations g where g.id = generation_id and g.user_id = (select auth.uid())));

-- Conjuntos guardados desde el motor: su puntuacion, confianza y la propuesta de la que vienen
alter table public.outfits add column if not exists compatibility_score numeric;
alter table public.outfits add column if not exists confidence_level text;
alter table public.outfits add column if not exists generation_result_id uuid references public.outfit_generation_results(id) on delete set null;
alter table public.outfits drop constraint if exists outfits_score_check;
alter table public.outfits add constraint outfits_score_check check (compatibility_score is null or compatibility_score between 0 and 100);
alter table public.outfits drop constraint if exists outfits_confidence_check;
alter table public.outfits add constraint outfits_confidence_check check (confidence_level is null or confidence_level in ('alta','media','baja'));
