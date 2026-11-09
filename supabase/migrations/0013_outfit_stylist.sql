-- Fase 3C · Outfit Stylist AI: conversaciones con el estilista sobre propuestas. Ejecutar despues de 0012. Es idempotente.
-- La IA interpreta la peticion, elige entre las candidatas del motor y propone cambios; el motor valida y puntua.
-- Cada cambio pedido en la conversacion crea una nueva version de la propuesta (parent_result_id) sin perder la anterior.

create table if not exists public.stylist_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title text not null,
  request jsonb not null,                     -- peticion estructurada vigente (interpretada + ajustes del usuario)
  interpretation jsonb,                       -- lo que dedujo la IA: supuestos, valores descartados, version del interprete
  generation_id uuid references public.outfit_generations(id) on delete set null,
  current jsonb not null default '{}',        -- {"1": result_id, "2": ...}: version vigente de cada propuesta
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists stylist_sessions_user_idx on public.stylist_sessions (user_id, updated_at desc);
drop trigger if exists stylist_sessions_touch on public.stylist_sessions;
create trigger stylist_sessions_touch before update on public.stylist_sessions for each row execute function public.touch_updated_at();

create table if not exists public.stylist_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  session_id uuid not null references public.stylist_sessions(id) on delete cascade,
  role text not null check (role in ('user','assistant')),
  content text not null,
  payload jsonb,                              -- accion, propuestas mostradas o modificadas (ids), errores de validacion, uso de IA
  created_at timestamptz default now()
);
create index if not exists stylist_messages_session_idx on public.stylist_messages (session_id, created_at);

alter table public.stylist_sessions enable row level security;
alter table public.stylist_messages enable row level security;
drop policy if exists "own rows" on public.stylist_sessions;
create policy "own rows" on public.stylist_sessions for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
drop policy if exists "own rows" on public.stylist_messages;
create policy "own rows" on public.stylist_messages for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()) and exists (select 1 from public.stylist_sessions s where s.id = session_id and s.user_id = (select auth.uid())));

-- Propuestas: origen (motor o cambio en la conversacion), version anterior y texto del estilista
alter table public.outfit_generation_results add column if not exists origin text not null default 'engine';
alter table public.outfit_generation_results drop constraint if exists outfit_generation_results_origin_check;
alter table public.outfit_generation_results add constraint outfit_generation_results_origin_check check (origin in ('engine','stylist_edit'));
alter table public.outfit_generation_results add column if not exists parent_result_id uuid references public.outfit_generation_results(id) on delete set null;
alter table public.outfit_generation_results add column if not exists stylist jsonb;   -- {name, why, when, limitations, model, prompt_version}
