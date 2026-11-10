-- Personal Shopper 2.0 · 2.0B: grado de experimentación y diagnóstico estratégico del armario (idempotente)

-- Grado de experimentación (Objetivos de imagen): orienta la prioridad de las oportunidades, no las prohíbe
alter table public.style_goals add column if not exists experimentation text;
do $$ begin
  alter table public.style_goals add constraint style_goals_experimentation_check check (experimentation is null or experimentation in ('Conservador','Abierto','Explorador'));
exception when duplicate_object then null; end $$;

-- Diagnóstico estratégico del armario: versionado y reutilizable mientras no cambie su huella (prendas, perfil, uso)
create table if not exists public.wardrobe_analyses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  version text not null,
  fingerprint text not null,
  result jsonb not null,
  ms integer,
  created_at timestamptz default now()
);
create index if not exists wardrobe_analyses_user_idx on public.wardrobe_analyses (user_id, created_at desc);
alter table public.wardrobe_analyses enable row level security;
drop policy if exists "own rows" on public.wardrobe_analyses;
create policy "own rows" on public.wardrobe_analyses for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
