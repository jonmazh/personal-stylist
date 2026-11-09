-- Fase 2A · Base del armario digital. Ejecutar despues de 0006. Es idempotente.
-- Evoluciona la tabla minima `garments` de la fase 1 (nunca usada por la interfaz) en lugar de crear otra.
-- Las listas de los CHECK se corresponden con lib/wardrobe/taxonomy.ts (una prueba lo verifica).

-- ── garments: registro principal de cada prenda ──
do $$ begin
  -- columnas de la fase 1 que cambian de nombre (se conservan los datos)
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'garments' and column_name = 'color') then
    alter table public.garments rename column color to primary_color; end if;
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'garments' and column_name = 'formality') then
    alter table public.garments rename column formality to formality_level; end if;
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'garments' and column_name = 'price') then
    alter table public.garments rename column price to purchase_price; end if;
end $$;

alter table public.garments
  alter column name drop not null,                       -- un borrador puede no tener nombre todavia
  alter column formality_level drop default,             -- sin dato no hay formalidad (antes: 1 por defecto)
  add column if not exists subcategory text,
  add column if not exists brand text,
  add column if not exists size_label text,              -- talla de la etiqueta
  add column if not exists size_fit text,                -- talla que de verdad te funciona (no siempre coincide)
  add column if not exists secondary_colors jsonb not null default '[]',
  add column if not exists cut text,
  add column if not exists silhouette text,
  add column if not exists pattern text,
  add column if not exists apparent_material text,       -- estimacion visual (IA o usuario)
  add column if not exists confirmed_composition text,   -- composicion de etiqueta, ficha comercial o usuario
  add column if not exists composition_source text,
  add column if not exists attributes jsonb not null default '{}',   -- atributos tecnicos de su familia (tiro, solapa, cuello...)
  add column if not exists seasons jsonb not null default '[]',
  add column if not exists occasions jsonb not null default '[]',
  add column if not exists style_tags jsonb not null default '[]',   -- ids de lib/style/catalog.ts
  add column if not exists condition text not null default 'desconocido',
  add column if not exists wardrobe_status text not null default 'draft',
  add column if not exists location text,
  add column if not exists purchase_date date,
  add column if not exists store text,
  add column if not exists estimated_uses int,
  add column if not exists notes text,
  add column if not exists is_favorite boolean not null default false,
  add column if not exists archived_at timestamptz,
  add column if not exists field_sources jsonb not null default '{}', -- trazabilidad: {campo: {source: usuario|ia|etiqueta|ficha, at}}
  add column if not exists updated_at timestamptz not null default now();

-- la temporada de la fase 1 (texto) pasa a la lista `seasons`; las columnas antiguas quedan sin uso
update public.garments set seasons = '[]' where seasons is null;
comment on column public.garments.season is 'Obsoleta (fase 1): usar seasons';
comment on column public.garments.photo_path is 'Obsoleta (fase 1): usar garment_images';
comment on column public.garments.fit_score is 'Obsoleta (fase 1): el ajuste real ira en garment_fit_reviews (fase 2C)';

do $$ begin
  alter table public.garments drop constraint if exists garments_category_check;
  alter table public.garments add constraint garments_category_check
    check (category in ('top','outerwear','bottom','footwear','accessories','tailoring','sport','underwear','sleepwear'));
  alter table public.garments drop constraint if exists garments_status_check;
  alter table public.garments add constraint garments_status_check check (wardrobe_status in ('draft','active','archived'));
  alter table public.garments drop constraint if exists garments_condition_check;
  alter table public.garments add constraint garments_condition_check check (condition in ('nuevo','bueno','usado','desgastado','danado','desconocido'));
  alter table public.garments drop constraint if exists garments_formality_check;
  alter table public.garments add constraint garments_formality_check check (formality_level is null or formality_level between 1 and 5);
  alter table public.garments drop constraint if exists garments_composition_source_check;
  alter table public.garments add constraint garments_composition_source_check check (composition_source is null or composition_source in ('etiqueta','ficha','usuario'));
  alter table public.garments drop constraint if exists garments_price_check;
  alter table public.garments add constraint garments_price_check check (purchase_price is null or purchase_price >= 0);
end $$;

create index if not exists garments_user_idx on public.garments (user_id);
create index if not exists garments_user_category_idx on public.garments (user_id, category);
create index if not exists garments_user_status_idx on public.garments (user_id, wardrobe_status);

create or replace function public.touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;
drop trigger if exists garments_touch on public.garments;
create trigger garments_touch before update on public.garments for each row execute function public.touch_updated_at();

-- ── garment_images: fotografias y su funcion ──
create table if not exists public.garment_images (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  garment_id uuid not null references public.garments(id) on delete cascade,
  role text not null default 'front' check (role in ('front','back','detail','label','worn','other')),
  storage_path text not null,             -- wardrobe-originals/<user>/<garment>/<id>.jpg
  thumb_path text,                        -- wardrobe-thumbnails/<user>/<garment>/<id>.webp
  width int, height int, bytes int,
  sha256 text,                            -- hash del original: evita analizar dos veces la misma foto (fase 2B)
  position int not null default 0,
  created_at timestamptz default now()
);
create index if not exists garment_images_garment_idx on public.garment_images (garment_id);
create index if not exists garment_images_hash_idx on public.garment_images (user_id, sha256);

-- ── garment_events: incorporaciones, cambios y movimientos ──
create table if not exists public.garment_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  garment_id uuid references public.garments(id) on delete cascade,
  kind text not null check (kind in ('created','updated','status','favorite','image_added','image_removed','archived','restored')),
  changes jsonb,                          -- {campo: [antes, despues]}
  source text not null default 'usuario', -- usuario | ia | sistema
  created_at timestamptz default now()
);
create index if not exists garment_events_garment_idx on public.garment_events (garment_id, created_at desc);

do $$ declare t text; begin
  foreach t in array array['garment_images','garment_events'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "own rows" on public.%I', t);
    execute format('create policy "own rows" on public.%I for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))', t);
  end loop;
end $$;

-- ── Storage: originales y miniaturas, privados; la primera carpeta es el id del usuario ──
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('wardrobe-originals', 'wardrobe-originals', false, 10485760, array['image/jpeg','image/webp','image/png']),
  ('wardrobe-thumbnails', 'wardrobe-thumbnails', false, 2097152, array['image/webp','image/jpeg'])
on conflict (id) do nothing;
do $$ declare b text; begin
  foreach b in array array['wardrobe-originals','wardrobe-thumbnails'] loop
    execute format('drop policy if exists %I on storage.objects', 'own files '||b);
    execute format('create policy %I on storage.objects for all to authenticated using (bucket_id = %L and (storage.foldername(name))[1] = (select auth.uid())::text) with check (bucket_id = %L and (storage.foldername(name))[1] = (select auth.uid())::text)', 'own files '||b, b, b);
  end loop;
end $$;
