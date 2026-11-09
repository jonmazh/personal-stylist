-- Fase 2C · Evaluacion personal: Fit Assessment y decisiones de conservacion. Ejecutar despues de 0008. Es idempotente.
-- La compatibilidad personal y el valor estrategico se calculan con reglas a partir del perfil y del armario (no se guardan
-- como verdad): solo se guarda una instantanea junto a cada decision, para saber con que datos se tomo.

-- Ajuste real: evaluaciones con la prenda puesta (propuestas por IA con fotos «llevandola puesta» o autoevaluacion)
create table if not exists public.garment_fit_reviews (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  garment_id uuid not null references public.garments(id) on delete cascade,
  source text not null check (source in ('ia','usuario')),
  status text not null default 'confirmed' check (status in ('proposed','confirmed','discarded','superseded')),
  model_id text, prompt_version text,
  image_ids uuid[] not null default '{}',
  dimensions jsonb not null default '[]',   -- [{key, label, score 1-10|null, note, fixable, confidence}]
  overall numeric,
  provisional boolean not null default true,
  photo_issues jsonb not null default '[]',
  limitations jsonb not null default '[]',
  notes text,
  ai_result jsonb,                          -- respuesta de la IA validada, tal cual
  usage jsonb,
  confirmed_at timestamptz,
  created_at timestamptz default now()
);
create index if not exists garment_fit_reviews_garment_idx on public.garment_fit_reviews (garment_id, created_at desc);
alter table public.garment_fit_reviews enable row level security;
drop policy if exists "own rows" on public.garment_fit_reviews;
create policy "own rows" on public.garment_fit_reviews for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- Decisiones: conservar, modificar, revisar, sustituir, donar/vender. Siempre las toma el usuario.
create table if not exists public.garment_decisions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  garment_id uuid not null references public.garments(id) on delete cascade,
  decision text not null check (decision in ('keep','modify','review','replace','donate_sell')),
  reason text,
  alteration text,                           -- arreglo previsto (si decision = modify)
  proposed text check (proposed in ('keep','modify','review','replace','donate_sell')),
  followed_proposal boolean,
  scores jsonb,                              -- instantanea {compat, fit, value, proposal}
  created_at timestamptz default now()
);
create index if not exists garment_decisions_garment_idx on public.garment_decisions (garment_id, created_at desc);
alter table public.garment_decisions enable row level security;
drop policy if exists "own rows" on public.garment_decisions;
create policy "own rows" on public.garment_decisions for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- Decision vigente en la ficha (para filtrar y para la auditoria)
alter table public.garments add column if not exists decision text;
alter table public.garments add column if not exists decision_at timestamptz;
alter table public.garments drop constraint if exists garments_decision_check;
alter table public.garments add constraint garments_decision_check check (decision is null or decision in ('keep','modify','review','replace','donate_sell'));

alter table public.garment_events drop constraint if exists garment_events_kind_check;
alter table public.garment_events add constraint garment_events_kind_check
  check (kind in ('created','updated','status','favorite','image_added','image_removed','archived','restored','analyzed','analysis_reviewed','fit_reviewed','decided'));
