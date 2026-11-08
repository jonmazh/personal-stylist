-- BIS 2 · Analisis automatico de la temperatura cromatica (subtono de la piel) a partir de la foto de rostro.
-- Ejecutar despues de 0005. Es idempotente.
-- Separacion IA / usuario (como observations frente a assessment_findings):
--   color_analyses  → cada estimacion de la IA tal cual (nunca se modifica): resultado inicial y trazabilidad.
--   color_profiles  → el dato vigente de temperatura con su origen, estado y fechas. La IA nunca lo escribe:
--                     solo cambia cuando el usuario confirma o corrige.

create table if not exists public.color_analyses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  photo_id uuid references public.body_photos(id) on delete set null,   -- foto analizada (se conserva el analisis si se borra la foto)
  photo_path text,                                                       -- referencia de la foto en el bucket privado en el momento del analisis
  temperature text check (temperature in ('Cálida','Fría','Neutra')),   -- null = informacion insuficiente o foto no apta
  secondary_tendency text check (secondary_tendency in ('Cálida','Fría')),
  confidence text not null check (confidence in ('alta','media','baja')),
  explanation text,
  observations text[] not null default '{}',
  limitations text[] not null default '{}',
  image_quality jsonb,                                                   -- veredicto de la IA: {suitable, issues[]}
  client_quality jsonb,                                                  -- control de calidad del navegador al subir la foto
  confidence_capped boolean not null default false,                     -- la aplicacion rebajo la confianza propuesta por la IA
  model text,
  created_at timestamptz default now()
);
alter table public.color_analyses enable row level security;
drop policy if exists "own rows" on public.color_analyses;
create policy "own rows" on public.color_analyses for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

alter table public.color_profiles
  add column if not exists temperature_source text check (temperature_source in ('ia','usuario')),        -- ia = estimacion confirmada por el usuario
  add column if not exists temperature_status text check (temperature_status in ('pendiente','recopilado','validado')),
  add column if not exists temperature_analysis_id uuid references public.color_analyses(id) on delete set null,
  add column if not exists temperature_updated_at timestamptz,                                               -- ultima correccion o eleccion
  add column if not exists temperature_validated_at timestamptz;

-- Las temperaturas ya declaradas en el cuestionario pasan a origen «usuario», estado «recopilado».
update public.color_profiles set temperature_source = 'usuario', temperature_status = 'recopilado'
  where temperature is not null and temperature_source is null;
