-- BIS 1 · Ampliacion del estudio de identidad estetica: catalogo de estilos, identidad hibrida y Style DNA.
-- No se crea un sistema paralelo: se amplian las tablas existentes. Ejecutar despues de 0004. Es idempotente.
--   style_preferences        (= «style_profile»): identidad DECLARADA por el usuario.
--   style_reference_ratings  (= «style_feedback»): valoraciones individuales de la galeria.
--   style_references          referencias propias; ai_tags guarda los rasgos que INFIERE la IA.
-- El catalogo de estilos, la galeria y las marcas viven en lib/style/catalog.ts y lib/style/references.ts (datos
-- versionados con el codigo, con ids estables). Lo inferido se recalcula; la instantanea de cada momento se versiona
-- con el Style Blueprint (assessment_findings.details de la conclusion «Style DNA»).

-- Identidad declarada: influencias con rol y peso, elementos visuales preferidos y rechazados, marcas de referencia.
alter table public.style_preferences
  add column if not exists influences jsonb not null default '[]',          -- [{style, role: principal|secundario|influencia, weight 0-100}]
  add column if not exists liked_elements text[] not null default '{}',
  add column if not exists rejected_elements text[] not null default '{}',
  add column if not exists brand_refs text[] not null default '{}',
  add column if not exists identity_version int not null default 0,
  add column if not exists identity_updated_at timestamptz;

-- Nueva escala de valoracion (BIS 1 §5) y elementos sueltos («Me gusta algun elemento, pero no el conjunto»).
alter table public.style_reference_ratings
  add column if not exists liked_elements text[] not null default '{}';
alter table public.style_reference_ratings drop constraint if exists style_reference_ratings_rating_check;
update public.style_reference_ratings set rating = 'represents' where rating = 'aspire';
update public.style_reference_ratings set rating = 'dislike' where rating = 'never';
alter table public.style_reference_ratings add constraint style_reference_ratings_rating_check
  check (rating in ('love','like','represents','admire','dislike','element'));

alter table public.style_references drop constraint if exists style_references_rating_check;
update public.style_references set rating = 'represents' where rating = 'aspire';
update public.style_references set rating = 'dislike' where rating = 'never';
alter table public.style_references add constraint style_references_rating_check
  check (rating is null or rating in ('love','like','represents','admire','dislike','element'));
