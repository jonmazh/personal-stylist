-- Fase 1 · Cuestionario completo (A) y protocolo fotografico (B).
-- Ejecutar en Supabase > SQL Editor despues de 0001_init.sql. Es idempotente: se puede ejecutar mas de una vez.

-- A.3 Estudio cromatico: rasgos naturales y gustos, de los que sale la hipotesis de temperatura y contraste.
alter table public.color_profiles
  add column if not exists eye_color text,
  add column if not exists hair_color text,
  add column if not exists skin_tone text,
  add column if not exists vein_color text,
  add column if not exists sun_reaction text,
  add column if not exists metal text,
  add column if not exists likes text[] not null default '{}',
  add column if not exists avoids text[] not null default '{}';

-- A.4 Identidad estetica: lo que nunca se pondria (tan informativo como lo que le gusta).
alter table public.style_preferences
  add column if not exists never_wear text;

-- A.5 Estilo de vida: contexto practico del armario.
alter table public.lifestyle_profiles
  add column if not exists work_formality text,
  add column if not exists climate text,
  add column if not exists travel text,
  add column if not exists laundry text;

-- A.7 Objetivos: hasta tres palabras de la imagen que quiere proyectar (utilizables por el motor).
alter table public.style_goals
  add column if not exists image_words text[] not null default '{}';

-- A.6 Prendas de referencia: medidas de prendas que ya le quedan bien (README 4.1).
create table if not exists public.reference_garments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  category text not null check (category in ('pantalon','camiseta','camisa','chaqueta','abrigo')),
  name text not null,
  measurements jsonb not null default '{}',
  notes text,
  created_at timestamptz default now()
);
alter table public.reference_garments enable row level security;
drop policy if exists "own rows" on public.reference_garments;
create policy "own rows" on public.reference_garments for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- El presupuesto no tiene valor por defecto: un 80 € que el usuario no ha indicado seria un dato inventado.
alter table public.profiles alter column budget_max drop default;

-- B. Protocolo fotografico: consentimiento explicito y resultado del control de calidad de cada foto.
alter table public.profiles
  add column if not exists photo_consent_at timestamptz;
alter table public.body_photos
  add column if not exists quality jsonb;
