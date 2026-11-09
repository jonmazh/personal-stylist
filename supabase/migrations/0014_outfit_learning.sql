-- Fase 3D · Evaluacion y aprendizaje: valoraciones, uso real, evaluaciones de conjuntos, formulas de estilo y patrones
-- aprendidos. Ejecutar despues de 0013. Es idempotente. Las listas de los CHECK salen de lib/outfits/feedback.ts.
-- Nada de esto modifica el Style Blueprint: los patrones se proponen y el usuario los confirma o descarta.

-- Valoraciones de un conjunto guardado o de una propuesta del motor/estilista
create table if not exists public.outfit_feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  outfit_id uuid references public.outfits(id) on delete cascade,
  result_id uuid references public.outfit_generation_results(id) on delete cascade,
  rating text check (rating is null or rating in ('love','like','dislike')),
  flags text[] not null default '{}' check (flags <@ array['worn','comfortable','well_dressed','would_repeat']::text[]),
  reasons text[] not null default '{}' check (reasons <@ array['cut','colors','too_formal','too_informal','not_me','uncomfortable','garment','prefer_other']::text[]),
  garment_id uuid references public.garments(id) on delete set null,   -- la prenda que no gusta (motivo «garment»)
  garment_ids uuid[] not null default '{}',                            -- prendas del conjunto en ese momento
  occasion text,
  note text check (note is null or char_length(note) <= 500),
  created_at timestamptz default now(),
  check (outfit_id is not null or result_id is not null),
  check (rating is not null or cardinality(flags) > 0)
);
create index if not exists outfit_feedback_user_idx on public.outfit_feedback (user_id, created_at desc);
create index if not exists outfit_feedback_outfit_idx on public.outfit_feedback (outfit_id);

-- Uso real (diario): de aqui sale la frecuencia de uso de prendas y conjuntos
create table if not exists public.outfit_wear_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  outfit_id uuid not null references public.outfits(id) on delete cascade,
  worn_on date not null default current_date,
  occasion text,
  garment_ids uuid[] not null default '{}',
  comfortable boolean,
  well_dressed boolean,
  note text check (note is null or char_length(note) <= 500),
  created_at timestamptz default now()
);
create index if not exists outfit_wear_events_user_idx on public.outfit_wear_events (user_id, worn_on desc);
create index if not exists outfit_wear_events_outfit_idx on public.outfit_wear_events (outfit_id);

-- Evaluaciones: teorica (prendas seleccionadas) o visual (foto del conjunto puesto, bucket privado outfits-private)
create table if not exists public.outfit_evaluations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  outfit_id uuid references public.outfits(id) on delete set null,
  mode text not null check (mode in ('theoretical','visual')),
  garment_ids uuid[] not null default '{}',
  items jsonb not null default '[]',
  context jsonb,
  score numeric check (score is null or score between 0 and 100),
  breakdown jsonb,
  ai jsonb,                                  -- critica (teorica) o analisis visual de la IA, validados
  photo_path text,                           -- outfits-private/<usuario>/... (null si se borro tras el analisis)
  photo_deleted_at timestamptz,
  model text, prompt_version text, usage jsonb,
  created_at timestamptz default now()
);
create index if not exists outfit_evaluations_user_idx on public.outfit_evaluations (user_id, created_at desc);

-- Formulas de estilo: estructuras repetibles por TIPO de prenda, no por prenda concreta
create table if not exists public.style_formulas (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  description text check (description is null or char_length(description) <= 500),
  source text not null default 'user' check (source in ('stylist','user')),
  status text not null default 'pending' check (status in ('pending','tested','validated','retired')),
  origin_outfit_id uuid references public.outfits(id) on delete set null,
  signature text,                            -- estructura normalizada (para detectar repetidas)
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists style_formulas_user_idx on public.style_formulas (user_id, status);
drop trigger if exists style_formulas_touch on public.style_formulas;
create trigger style_formulas_touch before update on public.style_formulas for each row execute function public.touch_updated_at();

create table if not exists public.style_formula_slots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  formula_id uuid not null references public.style_formulas(id) on delete cascade,
  role text not null check (role in ('top_base','mid_layer','third_layer','outer_layer','bottom','full_body','footwear','accessory','other')),
  subcategories text[] not null default '{}',   -- tipos admitidos (vacio = cualquiera de esa funcion)
  colors text[] not null default '{}',          -- colores admitidos (vacio = cualquiera)
  cuts text[] not null default '{}',
  formality_min integer check (formality_min is null or formality_min between 1 and 5),
  formality_max integer check (formality_max is null or formality_max between 1 and 5),
  optional boolean not null default false,
  position integer not null default 0
);
create index if not exists style_formula_slots_formula_idx on public.style_formula_slots (formula_id, position);

-- Patrones aprendidos que el usuario ha confirmado o descartado (los detectados se calculan en cada consulta)
create table if not exists public.style_learning (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  key text not null,
  label text not null,
  status text not null check (status in ('confirmed','dismissed')),
  evidence jsonb,
  decided_at timestamptz default now(),
  unique (user_id, key)
);

do $$ declare t text; begin
  foreach t in array array['outfit_feedback','outfit_wear_events','outfit_evaluations','style_formulas','style_formula_slots','style_learning'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "own rows" on public.%I', t);
    execute format('create policy "own rows" on public.%I for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))', t);
  end loop;
end $$;
-- Las filas hijas solo pueden colgar de filas propias
drop policy if exists "own rows" on public.style_formula_slots;
create policy "own rows" on public.style_formula_slots for all to authenticated using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()) and exists (select 1 from public.style_formulas f where f.id = formula_id and f.user_id = (select auth.uid())));
drop policy if exists "own rows" on public.outfit_wear_events;
create policy "own rows" on public.outfit_wear_events for all to authenticated using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()) and exists (select 1 from public.outfits o where o.id = outfit_id and o.user_id = (select auth.uid())));

-- Un conjunto creado desde una formula la referencia (al ponertelo, la formula pasa a «probada»)
alter table public.outfits add column if not exists formula_id uuid references public.style_formulas(id) on delete set null;
