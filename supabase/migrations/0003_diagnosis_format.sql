-- Fase 1 · Motor de diagnostico (C) y Style Blueprint (D): formato completo de cada conclusion.
-- Ejecutar en Supabase > SQL Editor despues de 0002. Es idempotente.
alter table public.assessment_findings
  add column if not exists key text,             -- identificador estable (conserva tus revisiones entre versiones)
  add column if not exists section text,         -- direccion | cuerpo | color | vida | plan
  add column if not exists why text,             -- «Por qué»
  add column if not exists action text,          -- «Qué haría un estilista»
  add column if not exists data_used text[] not null default '{}',
  add column if not exists missing text[] not null default '{}',
  add column if not exists details jsonb;        -- p. ej. grupos de la paleta
