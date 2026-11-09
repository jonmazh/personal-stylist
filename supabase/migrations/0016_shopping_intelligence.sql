-- Fase 4A · Shopping Intelligence y base del Shopping Planner. Ejecutar despues de 0015. Es idempotente.
-- Las listas de los CHECK salen de lib/shopping/taxonomy.ts (una prueba lo verifica).
-- No hay productos externos todavia (4B): una necesidad describe la prenda que falta, no un producto.
-- No se duplica el perfil: presupuesto maximo por prenda y marcas habituales siguen en profiles; aqui solo lo propio de compras.

create table if not exists public.shopping_needs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 120),
  type text not null check (type in ('need','improvement','replacement','desire')),
  origin text not null default 'user' check (origin in ('detected','audit','user')),
  detection_key text,                         -- estable: recuerda lo detectado (y lo descartado) entre analisis
  status text not null default 'detected' check (status in ('detected','searching','listed','comparing','approved','purchased','discarded','watching')),
  spec jsonb not null,                        -- prenda buscada: categoria, tipo, colores, corte, formalidad, temporadas, ocasiones...
  rationale text,                             -- por que hace falta (justificacion del estilista)
  replaces_garment_id uuid references public.garments(id) on delete set null,
  related_garment_ids uuid[] not null default '{}',   -- prendas que motivan la necesidad (redundancia, sustitucion, mejora)
  price_min numeric check (price_min is null or price_min >= 0),
  price_max numeric check (price_max is null or price_max >= 0),
  preferred_retailers text[] not null default '{}',
  target_date date,
  priority_score numeric check (priority_score is null or priority_score between 0 and 100),   -- ultima evaluacion
  priority_level text check (priority_level is null or priority_level in ('high','medium','low')),
  user_priority text check (user_priority is null or user_priority in ('high','medium','low')), -- prioridad que fijas tu (manda)
  discard_reason text check (discard_reason is null or char_length(discard_reason) <= 300),
  status_changed_at timestamptz default now(),
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  check (price_min is null or price_max is null or price_min <= price_max)
);
create unique index if not exists shopping_needs_key_idx on public.shopping_needs (user_id, detection_key) where detection_key is not null;
create index if not exists shopping_needs_user_status_idx on public.shopping_needs (user_id, status, priority_score desc);
drop trigger if exists shopping_needs_touch on public.shopping_needs;
create trigger shopping_needs_touch before update on public.shopping_needs for each row execute function public.touch_updated_at();

-- Evaluaciones versionadas de prioridad: trazabilidad de cada puntuacion y su justificacion
create table if not exists public.shopping_need_assessments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  need_id uuid not null references public.shopping_needs(id) on delete cascade,
  engine_version text not null,
  weights jsonb not null,
  score numeric not null check (score between 0 and 100),
  level text not null check (level in ('high','medium','low')),
  criteria jsonb not null,                    -- por criterio: peso, valor, puntos, razones, datos usados
  confidence text not null check (confidence in ('alta','media','baja')),
  expected_wears_month numeric,
  new_outfits integer,                        -- combinaciones validas que permitiria, segun el Outfit Engine
  redundancy jsonb,                           -- {level, garments: [{id, title, similarity}]}
  cost_per_wear jsonb,                        -- {price, uses, value}: estimado
  occasions jsonb not null default '[]',
  created_at timestamptz default now()
);
create index if not exists shopping_need_assessments_need_idx on public.shopping_need_assessments (need_id, created_at desc);

-- Historial de estados (quien y por que)
create table if not exists public.shopping_need_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  need_id uuid not null references public.shopping_needs(id) on delete cascade,
  kind text not null check (kind in ('created','status','priority','edited','assessed','listed')),
  changes jsonb,
  created_at timestamptz default now()
);
create index if not exists shopping_need_events_need_idx on public.shopping_need_events (need_id, created_at desc);

create table if not exists public.shopping_lists (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  description text check (description is null or char_length(description) <= 300),
  target_date date,
  status text not null default 'active' check (status in ('active','archived')),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
drop trigger if exists shopping_lists_touch on public.shopping_lists;
create trigger shopping_lists_touch before update on public.shopping_lists for each row execute function public.touch_updated_at();

-- En 4A un elemento de lista es una necesidad; en 4B podra llevar ademas un producto candidato
create table if not exists public.shopping_list_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  list_id uuid not null references public.shopping_lists(id) on delete cascade,
  need_id uuid not null references public.shopping_needs(id) on delete cascade,
  position integer not null default 0,
  note text check (note is null or char_length(note) <= 300),
  created_at timestamptz default now(),
  unique (list_id, need_id)
);
create index if not exists shopping_list_items_list_idx on public.shopping_list_items (list_id, position);

create table if not exists public.shopping_budgets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  period text not null check (period in ('monthly','quarterly','season')),
  amount numeric not null check (amount >= 0 and amount <= 100000),
  currency text not null default 'EUR' check (currency ~ '^[A-Z]{3}$'),
  starts_on date not null default current_date,
  active boolean not null default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create unique index if not exists shopping_budgets_active_idx on public.shopping_budgets (user_id) where active;
drop trigger if exists shopping_budgets_touch on public.shopping_budgets;
create trigger shopping_budgets_touch before update on public.shopping_budgets for each row execute function public.touch_updated_at();

-- Preferencias de compra propias (las marcas habituales y el presupuesto por prenda del perfil se leen de profiles)
create table if not exists public.shopping_preferences (
  user_id uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  preferred_retailers text[] not null default '{}',
  excluded_retailers text[] not null default '{}',
  priority_weights jsonb,                     -- pesos configurables del motor de prioridades
  min_priority_to_suggest numeric not null default 45 check (min_priority_to_suggest between 0 and 100),
  quality_over_price boolean not null default true,
  notes text check (notes is null or char_length(notes) <= 500),
  updated_at timestamptz default now()
);

do $$ declare t text; begin
  foreach t in array array['shopping_needs','shopping_need_assessments','shopping_need_events','shopping_lists','shopping_list_items','shopping_budgets','shopping_preferences'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "own rows" on public.%I', t);
    execute format('create policy "own rows" on public.%I for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))', t);
  end loop;
end $$;
-- Filas hijas solo de filas propias; una necesidad solo puede sustituir o citar prendas propias
drop policy if exists "own rows" on public.shopping_needs;
create policy "own rows" on public.shopping_needs for all to authenticated using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()) and (replaces_garment_id is null or exists (select 1 from public.garments g where g.id = replaces_garment_id and g.user_id = (select auth.uid()))));
drop policy if exists "own rows" on public.shopping_need_assessments;
create policy "own rows" on public.shopping_need_assessments for all to authenticated using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()) and exists (select 1 from public.shopping_needs n where n.id = need_id and n.user_id = (select auth.uid())));
drop policy if exists "own rows" on public.shopping_need_events;
create policy "own rows" on public.shopping_need_events for all to authenticated using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()) and exists (select 1 from public.shopping_needs n where n.id = need_id and n.user_id = (select auth.uid())));
drop policy if exists "own rows" on public.shopping_list_items;
create policy "own rows" on public.shopping_list_items for all to authenticated using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid())
    and exists (select 1 from public.shopping_lists l where l.id = list_id and l.user_id = (select auth.uid()))
    and exists (select 1 from public.shopping_needs n where n.id = need_id and n.user_id = (select auth.uid())));
