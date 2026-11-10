-- Personal Shopper 2.0 · 2.0H: valoraciones de productos, oportunidades y tendencias (idempotente).
-- No modifican el Style Blueprint: el aprendizaje se calcula a partir de ellas y se deshace borrándolas.
create table if not exists public.style_feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  target_kind text not null check (target_kind in ('producto','oportunidad','tendencia')),
  target_ref text not null check (char_length(target_ref) <= 300),
  reason text not null check (reason in ('me_gusta','no_me_gusta','interesa_no_ahora','no_mi_estilo','prenda_si_corte_no','tendencia_si_producto_no','demasiado_arriesgado','ya_tengo_parecido')),
  context jsonb not null default '{}',
  note text check (note is null or char_length(note) <= 300),
  created_at timestamptz default now()
);
create index if not exists style_feedback_user_idx on public.style_feedback (user_id, created_at desc);
alter table public.style_feedback enable row level security;
drop policy if exists "own rows" on public.style_feedback;
create policy "own rows" on public.style_feedback for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
