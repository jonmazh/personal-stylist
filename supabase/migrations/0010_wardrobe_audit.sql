-- Fase 2D · Auditoria del armario: informes versionados y hallazgos que el usuario aprueba o rechaza.
-- Ejecutar despues de 0009. Es idempotente. Ninguna auditoria elimina, archiva ni decide nada por si sola.

create table if not exists public.wardrobe_audits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  version integer not null,
  garments_count integer not null default 0,
  summary jsonb not null,                    -- estados, cobertura por categoria y ocasion, temporadas, organizacion, comparacion
  created_at timestamptz default now(),
  unique (user_id, version)
);
alter table public.wardrobe_audits enable row level security;
drop policy if exists "own rows" on public.wardrobe_audits;
create policy "own rows" on public.wardrobe_audits for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create table if not exists public.wardrobe_audit_findings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  audit_id uuid not null references public.wardrobe_audits(id) on delete cascade,
  key text not null,                         -- estable entre auditorias (recuerda lo aprobado o rechazado)
  kind text not null check (kind in ('review','alteration','replace','duplicate','gap','need','condition')),
  title text not null,
  body text not null,
  why jsonb not null default '[]',
  data_used jsonb not null default '[]',
  garment_ids uuid[] not null default '{}',
  recommendation jsonb,                      -- {decision?, garment_id?, need?}
  priority integer not null default 3,
  status text not null default 'proposed' check (status in ('proposed','accepted','rejected')),
  carried boolean not null default false,    -- la decision viene de una auditoria anterior
  decided_at timestamptz,
  created_at timestamptz default now()
);
create index if not exists wardrobe_audit_findings_audit_idx on public.wardrobe_audit_findings (audit_id, priority);
alter table public.wardrobe_audit_findings enable row level security;
drop policy if exists "own rows" on public.wardrobe_audit_findings;
create policy "own rows" on public.wardrobe_audit_findings for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
