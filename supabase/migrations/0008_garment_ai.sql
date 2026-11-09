-- Fase 2B · Garment AI: analisis de prendas versionados y revision por el usuario. Ejecutar despues de 0007. Es idempotente.
-- Los resultados de la IA NUNCA se escriben directamente en la ficha: se guardan aqui como propuesta y solo pasan a
-- `garments` lo que el usuario acepta o corrige (con su origen en garments.field_sources).

create table if not exists public.garment_analyses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  garment_id uuid not null references public.garments(id) on delete cascade,
  model_id text not null,
  prompt_version text not null,
  schema_version text not null,
  image_ids uuid[] not null default '{}',          -- fotos enviadas (por orden)
  image_roles text[] not null default '{}',
  input_key text not null,                          -- version + hashes de las fotos + pista: evita repetir el mismo analisis
  analysis_result jsonb not null,                   -- respuesta de la IA validada con Zod, tal cual
  normalized jsonb not null,                        -- propuesta ajustada a la taxonomia (campos, confianza, descartes, fotos pedidas)
  overall_confidence numeric,
  status text not null default 'proposed' check (status in ('proposed','accepted','partially_accepted','rejected','superseded')),
  decisions jsonb,                                  -- {campo: {action: accept|correct|reject, proposed, value}}
  reviewed_at timestamptz,
  usage jsonb,                                      -- {calls, prompt, completion, ms}
  created_at timestamptz default now()
);
create index if not exists garment_analyses_garment_idx on public.garment_analyses (garment_id, created_at desc);
create index if not exists garment_analyses_key_idx on public.garment_analyses (user_id, input_key);
alter table public.garment_analyses enable row level security;
drop policy if exists "own rows" on public.garment_analyses;
create policy "own rows" on public.garment_analyses for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- La IA puede identificar la categoria: un borrador puede no tenerla todavia (una prenda activa si debe tenerla).
alter table public.garments alter column category drop not null;
alter table public.garments drop constraint if exists garments_active_category_check;
alter table public.garments add constraint garments_active_category_check check (category is not null or wardrobe_status = 'draft');

-- Historial: analisis realizados y revisados.
alter table public.garment_events drop constraint if exists garment_events_kind_check;
alter table public.garment_events add constraint garment_events_kind_check
  check (kind in ('created','updated','status','favorite','image_added','image_removed','archived','restored','analyzed','analysis_reviewed'));
