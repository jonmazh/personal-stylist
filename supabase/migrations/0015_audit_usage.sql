-- Frecuencia de uso en la auditoria del armario: nuevo tipo de hallazgo «unused» (prendas sin usar o que hace tiempo
-- que no usas, segun el registro de uso de Outfit Studio). Ejecutar despues de 0014. Es idempotente.
alter table public.wardrobe_audit_findings drop constraint if exists wardrobe_audit_findings_kind_check;
alter table public.wardrobe_audit_findings add constraint wardrobe_audit_findings_kind_check
  check (kind in ('review','alteration','replace','duplicate','gap','need','condition','unused'));
