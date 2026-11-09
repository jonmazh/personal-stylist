-- Fase 4B · Product Discovery: tiendas, fuentes autorizadas, búsquedas y catálogo de productos candidatos.
-- Los productos candidatos NUNCA se mezclan con garments (lo que posees). Listas de valores: lib/shopping/catalog/taxonomy.ts
-- (una prueba lo verifica). Se puede ejecutar varias veces.

-- ── Tiendas: catálogo común (user_id null, solo lectura) y tiendas que añades tú ──
create table if not exists public.retailers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,          -- null = tienda del catálogo común
  slug text not null check (slug ~ '^[a-z0-9-]{2,40}$'),
  name text not null check (char_length(name) between 1 and 80),
  group_name text check (group_name is null or char_length(group_name) <= 60),
  domains text[] not null default '{}',
  market text not null default 'ES' check (market ~ '^[A-Z]{2}$'),
  url_policy text not null default 'metadata' check (url_policy in ('metadata','manual_only')),
  policy_note text check (policy_note is null or char_length(policy_note) <= 400),
  created_at timestamptz default now()
);
create unique index if not exists retailers_global_slug_idx on public.retailers (slug) where user_id is null;
create unique index if not exists retailers_user_slug_idx on public.retailers (user_id, slug) where user_id is not null;

insert into public.retailers (slug, name, group_name, domains, url_policy, policy_note) values
  ('zara', 'Zara', 'Inditex', array['zara.com'], 'manual_only', 'Las condiciones de Inditex prohíben la extracción automatizada sin autorización escrita: solo enlace y datos que aportes.'),
  ('massimo-dutti', 'Massimo Dutti', 'Inditex', array['massimodutti.com'], 'manual_only', 'Las condiciones de Inditex prohíben la extracción automatizada sin autorización escrita: solo enlace y datos que aportes.'),
  ('pull-and-bear', 'Pull&Bear', 'Inditex', array['pullandbear.com'], 'manual_only', 'Las condiciones de Inditex prohíben la extracción automatizada sin autorización escrita: solo enlace y datos que aportes.'),
  ('bershka', 'Bershka', 'Inditex', array['bershka.com'], 'manual_only', 'Las condiciones de Inditex prohíben la extracción automatizada sin autorización escrita: solo enlace y datos que aportes.'),
  ('stradivarius', 'Stradivarius', 'Inditex', array['stradivarius.com'], 'manual_only', 'Las condiciones de Inditex prohíben la extracción automatizada sin autorización escrita: solo enlace y datos que aportes.'),
  ('cos', 'COS', 'Complementarias', array['cos.com'], 'metadata', 'Condiciones sin revisar: solo metadatos públicos de una página, a petición tuya y si robots.txt lo permite.'),
  ('arket', 'ARKET', 'Complementarias', array['arket.com'], 'metadata', 'Condiciones sin revisar: solo metadatos públicos de una página, a petición tuya y si robots.txt lo permite.'),
  ('uniqlo', 'Uniqlo', 'Complementarias', array['uniqlo.com'], 'metadata', 'Condiciones sin revisar: solo metadatos públicos de una página, a petición tuya y si robots.txt lo permite.'),
  ('mango-man', 'Mango Man', 'Complementarias', array['mango.com'], 'metadata', 'Condiciones sin revisar: solo metadatos públicos de una página, a petición tuya y si robots.txt lo permite.'),
  ('selected-homme', 'Selected Homme', 'Complementarias', array['selected.com'], 'metadata', 'Condiciones sin revisar: solo metadatos públicos de una página, a petición tuya y si robots.txt lo permite.')
on conflict (slug) where user_id is null do update set name = excluded.name, group_name = excluded.group_name, domains = excluded.domains, url_policy = excluded.url_policy, policy_note = excluded.policy_note;

-- ── Fuentes configuradas por ti: feeds o APIs autorizados (p. ej. de un programa de afiliación) ──
create table if not exists public.product_sources (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  kind text not null check (kind in ('feed','api')),
  name text not null check (char_length(name) between 1 and 80),
  retailer_id uuid references public.retailers(id) on delete set null,
  feed_url text check (feed_url is null or (feed_url ~ '^https?://' and char_length(feed_url) <= 1000)),
  format text check (format is null or format in ('csv','json','xml')),
  authorization_note text not null check (char_length(authorization_note) between 3 and 300),  -- quién autoriza el uso
  status text not null default 'active' check (status in ('active','disabled','error')),
  item_count int not null default 0,
  last_sync_at timestamptz,
  last_error text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
drop trigger if exists product_sources_touch on public.product_sources;
create trigger product_sources_touch before update on public.product_sources for each row execute function public.touch_updated_at();

-- Elementos normalizados de un feed autorizado (se sustituyen en cada sincronización)
create table if not exists public.product_feed_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  source_id uuid not null references public.product_sources(id) on delete cascade,
  external_id text,
  product jsonb not null,           -- producto normalizado (lib/shopping/catalog/normalize.ts)
  search_text text not null default '',
  created_at timestamptz default now()
);
create index if not exists product_feed_items_source_idx on public.product_feed_items (source_id);

-- ── Búsquedas (historial y caché) ──
create table if not exists public.shopping_searches (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  need_id uuid references public.shopping_needs(id) on delete set null,
  query jsonb not null,
  query_text text not null,
  cache_key text not null,
  sources jsonb not null default '[]',      -- por fuente: estado, resultados, error
  results jsonb not null default '[]',      -- resultados normalizados (enlaces, no productos guardados)
  result_count int not null default 0,
  created_at timestamptz default now()
);
create index if not exists shopping_searches_cache_idx on public.shopping_searches (user_id, cache_key, created_at desc);

-- ── Catálogo de productos candidatos (lo que estás pensando comprar) ──
create table if not exists public.external_products (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  need_id uuid references public.shopping_needs(id) on delete set null,
  search_id uuid references public.shopping_searches(id) on delete set null,
  retailer_id uuid references public.retailers(id) on delete set null,
  source_kind text not null check (source_kind in ('api','feed','search','url','manual')),
  source_id uuid references public.product_sources(id) on delete set null,
  external_product_id text check (external_product_id is null or char_length(external_product_id) <= 120),
  product_url text check (product_url is null or (product_url ~ '^https?://' and char_length(product_url) <= 1000)),
  canonical_url text,
  product_name text not null check (char_length(product_name) between 1 and 200),
  brand text check (brand is null or char_length(brand) <= 80),
  category text,
  subcategory text,
  description text check (description is null or char_length(description) <= 4000),
  primary_color text,
  colors text[] not null default '{}',
  cut text,
  silhouette text,
  pattern text,
  apparent_material text,
  confirmed_composition text check (confirmed_composition is null or char_length(confirmed_composition) <= 300),
  current_price numeric check (current_price is null or current_price >= 0),
  currency text not null default 'EUR' check (currency ~ '^[A-Z]{3}$'),
  availability_status text not null default 'unknown' check (availability_status in ('in_stock','limited','out_of_stock','preorder','unknown')),
  market text not null default 'ES' check (market ~ '^[A-Z]{2}$'),
  images jsonb not null default '[]',        -- [{url|storage_path, origin: store|user, permission: link_only|stored}]
  field_sources jsonb not null default '{}', -- {campo: {source: store|feed|search|photo|ai|user, at}}
  raw_attributes jsonb not null default '{}',
  status text not null default 'candidate' check (status in ('candidate','saved','discarded')),
  discard_reason text check (discard_reason is null or char_length(discard_reason) <= 300),
  last_verified_at timestamptz,
  verify_note text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create unique index if not exists external_products_url_idx on public.external_products (user_id, canonical_url) where canonical_url is not null;
create index if not exists external_products_need_idx on public.external_products (user_id, need_id, status);
drop trigger if exists external_products_touch on public.external_products;
create trigger external_products_touch before update on public.external_products for each row execute function public.touch_updated_at();

create table if not exists public.external_product_variants (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  product_id uuid not null references public.external_products(id) on delete cascade,
  size text check (size is null or char_length(size) <= 30),
  color text check (color is null or char_length(color) <= 40),
  sku text check (sku is null or char_length(sku) <= 80),
  availability text not null default 'unknown' check (availability in ('in_stock','limited','out_of_stock','preorder','unknown')),
  price numeric check (price is null or price >= 0),
  checked_at timestamptz not null default now()
);
create index if not exists external_product_variants_product_idx on public.external_product_variants (product_id);

create table if not exists public.product_price_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  product_id uuid not null references public.external_products(id) on delete cascade,
  price numeric check (price is null or price >= 0),
  currency text not null default 'EUR',
  availability text not null default 'unknown',
  source_kind text not null,
  observed_at timestamptz not null default now()
);
create index if not exists product_price_history_product_idx on public.product_price_history (product_id, observed_at desc);

-- ── RLS ──
alter table public.retailers enable row level security;
drop policy if exists "read retailers" on public.retailers;
create policy "read retailers" on public.retailers for select to authenticated using (user_id is null or user_id = (select auth.uid()));
drop policy if exists "own retailers" on public.retailers;
create policy "own retailers" on public.retailers for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

do $$ declare t text; begin
  foreach t in array array['product_sources','product_feed_items','shopping_searches','external_products','external_product_variants','product_price_history'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "own rows" on public.%I', t);
    execute format('create policy "own rows" on public.%I for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))', t);
  end loop;
end $$;
-- Relaciones: solo con filas propias (o tiendas del catálogo común)
drop policy if exists "own rows" on public.product_sources;
create policy "own rows" on public.product_sources for all to authenticated using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()) and (retailer_id is null or exists (select 1 from public.retailers r where r.id = retailer_id and (r.user_id is null or r.user_id = (select auth.uid())))));
drop policy if exists "own rows" on public.product_feed_items;
create policy "own rows" on public.product_feed_items for all to authenticated using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()) and exists (select 1 from public.product_sources s where s.id = source_id and s.user_id = (select auth.uid())));
drop policy if exists "own rows" on public.shopping_searches;
create policy "own rows" on public.shopping_searches for all to authenticated using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()) and (need_id is null or exists (select 1 from public.shopping_needs n where n.id = need_id and n.user_id = (select auth.uid()))));
drop policy if exists "own rows" on public.external_products;
create policy "own rows" on public.external_products for all to authenticated using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid())
    and (need_id is null or exists (select 1 from public.shopping_needs n where n.id = need_id and n.user_id = (select auth.uid())))
    and (search_id is null or exists (select 1 from public.shopping_searches s where s.id = search_id and s.user_id = (select auth.uid())))
    and (source_id is null or exists (select 1 from public.product_sources s where s.id = source_id and s.user_id = (select auth.uid())))
    and (retailer_id is null or exists (select 1 from public.retailers r where r.id = retailer_id and (r.user_id is null or r.user_id = (select auth.uid())))));
drop policy if exists "own rows" on public.external_product_variants;
create policy "own rows" on public.external_product_variants for all to authenticated using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()) and exists (select 1 from public.external_products p where p.id = product_id and p.user_id = (select auth.uid())));
drop policy if exists "own rows" on public.product_price_history;
create policy "own rows" on public.product_price_history for all to authenticated using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()) and exists (select 1 from public.external_products p where p.id = product_id and p.user_id = (select auth.uid())));

-- ── Storage: capturas y fotos de la importación asistida, privadas ──
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('shopping-private', 'shopping-private', false, 10485760, array['image/jpeg','image/webp','image/png'])
on conflict (id) do nothing;
drop policy if exists "own files shopping-private" on storage.objects;
create policy "own files shopping-private" on storage.objects for all to authenticated
  using (bucket_id = 'shopping-private' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'shopping-private' and (storage.foldername(name))[1] = (select auth.uid())::text);
