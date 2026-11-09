-- Fase 3A · Outfit Studio: conjuntos y sus prendas. Ejecutar despues de 0010. Es idempotente.
-- Las listas de los CHECK se corresponden con lib/outfits/taxonomy.ts (una prueba lo verifica).
-- Las fotos NO se duplican: un conjunto enlaza prendas de `garments` y usa sus imagenes (garment_images).
-- El bucket privado `outfits-private` (creado en 0001) queda reservado para fotos del conjunto puesto (evaluacion visual, 3D).

create table if not exists public.outfits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  description text check (description is null or char_length(description) <= 1000),
  occasion text check (occasion is null or occasion in ('dia_a_dia','oficina','reunion_trabajo','entrevista','cita','primera_cita','cena_amigos','comida_familiar','boda','evento_formal','fiesta','evento_nocturno','escapada','viaje','turismo','deporte')),
  formality_level integer check (formality_level is null or formality_level between 1 and 5),
  seasons jsonb not null default '[]',
  tags jsonb not null default '[]',           -- etiquetas libres del usuario
  status text not null default 'draft' check (status in ('draft','saved','archived')),
  is_favorite boolean not null default false,
  source text not null default 'manual' check (source in ('manual','generator','stylist','evaluation')),
  archived_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists outfits_user_status_idx on public.outfits (user_id, status, updated_at desc);
create index if not exists outfits_user_occasion_idx on public.outfits (user_id, occasion);
drop trigger if exists outfits_touch on public.outfits;
create trigger outfits_touch before update on public.outfits for each row execute function public.touch_updated_at();

create table if not exists public.outfit_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  outfit_id uuid not null references public.outfits(id) on delete cascade,
  -- Si la prenda se elimina del armario, el conjunto se conserva con su instantanea (garment_id pasa a null)
  garment_id uuid references public.garments(id) on delete set null,
  item_role text not null check (item_role in ('top_base','mid_layer','third_layer','outer_layer','bottom','full_body','footwear','accessory','other')),
  position integer not null default 0,
  attribute_snapshot jsonb not null,          -- atributos relevantes de la prenda al incluirla
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (outfit_id, garment_id)
);
create index if not exists outfit_items_outfit_idx on public.outfit_items (outfit_id, position);
create index if not exists outfit_items_garment_idx on public.outfit_items (garment_id);
drop trigger if exists outfit_items_touch on public.outfit_items;
create trigger outfit_items_touch before update on public.outfit_items for each row execute function public.touch_updated_at();

alter table public.outfits enable row level security;
alter table public.outfit_items enable row level security;
drop policy if exists "own rows" on public.outfits;
create policy "own rows" on public.outfits for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
-- Una prenda solo puede entrar en un conjunto propio y ser del propio armario
drop policy if exists "own rows" on public.outfit_items;
create policy "own rows" on public.outfit_items for all to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.outfits o where o.id = outfit_id and o.user_id = (select auth.uid()))
    and (garment_id is null or exists (select 1 from public.garments g where g.id = garment_id and g.user_id = (select auth.uid())))
  );
