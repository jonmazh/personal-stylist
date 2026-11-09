-- Fase 4C · Product Analyzer & Purchase Evaluator: análisis versionados de productos candidatos, evaluaciones de compra
-- explicables, guías de medidas y medidas de prendas de referencia. Se puede ejecutar varias veces.

-- Atributos que completa el análisis (siempre con su procedencia en field_sources: tienda, foto, IA o tú)
alter table public.external_products
  add column if not exists formality_level int check (formality_level is null or formality_level between 1 and 5),
  add column if not exists seasons text[] not null default '{}',
  add column if not exists style_tags text[] not null default '{}',
  add column if not exists attributes jsonb not null default '{}';

-- Guía de medidas publicada por talla (cm), con su procedencia
alter table public.external_product_variants
  add column if not exists measurements jsonb not null default '{}',
  add column if not exists measurements_source text check (measurements_source is null or measurements_source in ('store','feed','user'));

-- ── Análisis del producto (IA sobre descripción + fotos permitidas) ──
create table if not exists public.product_analyses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  product_id uuid not null references public.external_products(id) on delete cascade,
  prompt_version text not null,
  schema_version text not null,
  model_id text not null,
  input_key text not null,
  images_used jsonb not null default '[]',       -- [{origin: user|feed, ref}]
  status text not null default 'ok' check (status in ('ok','failed')),
  result jsonb,                                  -- respuesta validada de la IA
  normalized jsonb,                              -- campos ajustados a la taxonomía con procedencia y confianza
  quality jsonb,                                 -- {documented[], apparent[], unknown[]}
  overall_confidence numeric,
  usage jsonb,
  error text,
  created_at timestamptz default now()
);
create index if not exists product_analyses_product_idx on public.product_analyses (product_id, created_at desc);

-- ── Evaluación de compra (reglas, versionada) ──
create table if not exists public.purchase_evaluations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  product_id uuid not null references public.external_products(id) on delete cascade,
  need_id uuid references public.shopping_needs(id) on delete set null,
  engine_version text not null,
  weights jsonb not null,
  score numeric not null check (score between 0 and 100),
  confidence text not null check (confidence in ('alta','media','baja')),
  criteria jsonb not null,
  indicators jsonb not null,
  redundancy jsonb not null,
  size jsonb,
  verdict text not null check (verdict in ('buy','consider','wait','skip')),
  verdict_text text not null,
  reasons jsonb not null default '[]',
  risks jsonb not null default '[]',
  limitations jsonb not null default '[]',
  created_at timestamptz default now()
);
create index if not exists purchase_evaluations_product_idx on public.purchase_evaluations (product_id, created_at desc);

-- ── Medidas de una prenda que te queda bien (referencia para elegir talla) ──
create table if not exists public.garment_measurements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  garment_id uuid not null references public.garments(id) on delete cascade,
  measurements jsonb not null,                   -- {cintura: 82, cadera: 102, ...} en cm, medidas en plano
  fits_well boolean not null default true,
  note text check (note is null or char_length(note) <= 300),
  measured_at timestamptz not null default now(),
  unique (garment_id)
);

do $$ declare t text; begin
  foreach t in array array['product_analyses','purchase_evaluations','garment_measurements'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "own rows" on public.%I', t);
    execute format('create policy "own rows" on public.%I for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))', t);
  end loop;
end $$;
drop policy if exists "own rows" on public.product_analyses;
create policy "own rows" on public.product_analyses for all to authenticated using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()) and exists (select 1 from public.external_products p where p.id = product_id and p.user_id = (select auth.uid())));
drop policy if exists "own rows" on public.purchase_evaluations;
create policy "own rows" on public.purchase_evaluations for all to authenticated using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()) and exists (select 1 from public.external_products p where p.id = product_id and p.user_id = (select auth.uid()))
    and (need_id is null or exists (select 1 from public.shopping_needs n where n.id = need_id and n.user_id = (select auth.uid()))));
drop policy if exists "own rows" on public.garment_measurements;
create policy "own rows" on public.garment_measurements for all to authenticated using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()) and exists (select 1 from public.garments g where g.id = garment_id and g.user_id = (select auth.uid())));
