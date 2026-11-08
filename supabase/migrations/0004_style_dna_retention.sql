-- Fase 1 · Pendientes del punto 4: descubrimiento visual del Style DNA, referencias propias y borrado de fotos tras el analisis.
-- Ejecutar en Supabase > SQL Editor despues de 0003. Es idempotente.

-- Valoracion de los conjuntos de referencia del catalogo (lib/style/references.ts).
create table if not exists public.style_reference_ratings (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  reference_id text not null,
  rating text not null check (rating in ('love','like','aspire','admire','never')),
  rated_at timestamptz default now(),
  primary key (user_id, reference_id)
);

-- Referencias visuales propias (Pinterest, Instagram...): imagen en el bucket privado references-private.
-- Son senales de gusto, no prendas del armario. ai_tags: patrones que extrae la IA (estilo, ajuste, colores...).
create table if not exists public.style_references (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  storage_path text not null,
  source_url text,
  note text,
  rating text check (rating in ('love','like','aspire','admire','never')),
  ai_tags jsonb,
  created_at timestamptz default now()
);

do $$ declare t text; begin
  foreach t in array array['style_reference_ratings','style_references'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "own rows" on public.%I', t);
    execute format('create policy "own rows" on public.%I for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))', t);
  end loop;
end $$;

-- README 15: modo en el que las fotos corporales se borran despues del analisis y solo se conservan los resultados.
alter table public.profiles
  add column if not exists delete_photos_after_analysis boolean not null default false;
