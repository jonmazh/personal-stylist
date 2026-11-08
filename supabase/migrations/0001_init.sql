-- Style Profile: esquema inicial. Ejecutar en Supabase > SQL Editor (o `supabase db push`).
create extension if not exists pgcrypto;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text, age int, height_cm numeric, weight_kg numeric, city text,
  sizes text, brands text, budget_max numeric default 80, fit_pref text,
  updated_at timestamptz default now()
);
-- Medidas con fecha y origen: nunca se sobrescriben, se acumulan.
create table public.body_measurements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  key text not null, value_cm numeric not null,
  source text not null default 'manual' check (source in ('manual','ai_estimate')),
  measured_at timestamptz default now()
);
create table public.body_photos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  kind text not null check (kind in ('frontal','lateral','espalda','rostro')),
  storage_path text not null, created_at timestamptz default now()
);
create table public.color_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  temperature text, depth text, intensity text, contrast text, updated_at timestamptz default now()
);
create table public.style_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  dims jsonb not null default '{}', styles text[] not null default '{}', updated_at timestamptz default now()
);
create table public.lifestyle_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  life jsonb not null default '{"trabajo":40,"ocio":30,"deporte":10,"eventos":20}',
  constraints text[] not null default '{}', updated_at timestamptz default now()
);
create table public.fit_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  prefs jsonb not null default '{}', updated_at timestamptz default now()
);
create table public.style_goals (
  user_id uuid primary key references auth.users(id) on delete cascade,
  answers jsonb not null default '{}', updated_at timestamptz default now()
);
-- pendiente -> recopilada (derivado de los datos) -> validada (lo confirma el usuario)
create table public.area_states (
  user_id uuid not null references auth.users(id) on delete cascade,
  area text not null, validated boolean not null default false, validated_at timestamptz,
  primary key (user_id, area)
);
-- Historial tecnico de la IA y lo que la IA detecta (observations != confirmaciones != recomendaciones).
create table public.ai_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  kind text not null, model text, meta jsonb, created_at timestamptz default now()
);
create table public.observations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  run_id uuid references public.ai_runs(id) on delete cascade,
  area text not null, title text not null, body text not null,
  confidence text not null check (confidence in ('alta','media','baja')),
  justification text, source_photo text, created_at timestamptz default now()
);
-- Style Blueprint versionado; cada conclusion con origen, confianza y estado de validacion.
create table public.blueprints (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  version int not null, validated_areas int not null default 0, created_at timestamptz default now(),
  unique (user_id, version)
);
create table public.assessment_findings (
  id uuid primary key default gen_random_uuid(),
  blueprint_id uuid not null references public.blueprints(id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  position int not null, title text not null, body text not null,
  origin text not null, confidence text not null, justification text,
  status text not null default 'pending' check (status in ('pending','confirmed','corrected')),
  corrected_body text
);
-- Fase 2 (armario): tabla minima lista para usar.
create table public.garments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null, category text not null, color text, formality int default 1, season text default 'T',
  price numeric, photo_path text, fit_score int, created_at timestamptz default now()
);

-- RLS: cada usuario solo ve y escribe sus filas.
alter table public.profiles enable row level security;
create policy "own profile" on public.profiles for all to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));
do $$ declare t text; begin
  foreach t in array array['body_measurements','body_photos','color_profiles','style_preferences','lifestyle_profiles',
    'fit_preferences','style_goals','area_states','ai_runs','observations','blueprints','assessment_findings','garments'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy "own rows" on public.%I for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))', t);
  end loop;
end $$;

-- Storage: 4 buckets privados; la primera carpeta de cada ruta es el id del usuario.
insert into storage.buckets (id, name, public, file_size_limit) values
  ('profile-private','profile-private',false,10485760), ('wardrobe-private','wardrobe-private',false,10485760),
  ('outfits-private','outfits-private',false,10485760), ('references-private','references-private',false,10485760)
on conflict (id) do nothing;
do $$ declare b text; begin
  foreach b in array array['profile-private','wardrobe-private','outfits-private','references-private'] loop
    execute format('create policy %L on storage.objects for all to authenticated using (bucket_id = %L and (storage.foldername(name))[1] = (select auth.uid())::text) with check (bucket_id = %L and (storage.foldername(name))[1] = (select auth.uid())::text)', 'own files '||b, b, b);
  end loop;
end $$;
