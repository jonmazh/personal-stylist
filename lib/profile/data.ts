import type { SupabaseClient } from '@supabase/supabase-js'
import { AREAS } from './areas'
import { answered, questionsOf, valueOf } from './questionnaire'

export type Row = Record<string, any>
export interface Bundle {
  profile: Row | null
  measures: Record<string, { value: number; at: string; source: string }>
  photos: Row[]
  color: Row | null
  style: Row | null
  life: Row | null
  fit: Row | null
  goals: Row | null
  validated: Record<string, boolean>
  observations: Row[]
  blueprints: (Row & { findings: Row[] })[]
  garments: Row[]
  references: Row[]
  refRatings: Row[]
  styleRefs: Row[]
  chatValidated: boolean
}

export async function loadBundle(sb: SupabaseClient, uid: string): Promise<Bundle> {
  const q = (t: string) => sb.from(t).select('*')
  const [p, ms, ph, col, sty, life, fit, goals, st, obs, bps, fnd, gar, chat, refs, rr, sr] = await Promise.all([
    q('profiles').eq('id', uid).maybeSingle(),
    q('body_measurements').order('measured_at', { ascending: false }),
    q('body_photos').order('created_at', { ascending: false }),
    q('color_profiles').maybeSingle(), q('style_preferences').maybeSingle(), q('lifestyle_profiles').maybeSingle(),
    q('fit_preferences').maybeSingle(), q('style_goals').maybeSingle(), q('area_states'),
    q('observations').order('created_at', { ascending: false }),
    q('blueprints').order('version'), q('assessment_findings').order('position'), q('garments'),
    sb.from('ai_runs').select('id').eq('kind', 'chat').contains('meta', { validated: true }).limit(1),
    q('reference_garments').order('created_at'), // vacio si aun no se ha ejecutado la migracion 0002
    q('style_reference_ratings'), q('style_references').order('created_at'), // migracion 0004
  ])
  const measures: Bundle['measures'] = {}
  for (const m of ms.data ?? []) if (!measures[m.key]) measures[m.key] = { value: Number(m.value_cm), at: m.measured_at, source: m.source }
  const runId = obs.data?.[0]?.run_id
  const validated: Record<string, boolean> = Object.fromEntries(AREAS.map((a) => [a.id, false]))
  for (const s of st.data ?? []) validated[s.area] = s.validated
  return {
    profile: p.data, measures, photos: ph.data ?? [], color: col.data, style: sty.data, life: life.data, fit: fit.data, goals: goals.data,
    validated, observations: (obs.data ?? []).filter((o) => o.run_id === runId),
    blueprints: (bps.data ?? []).map((b) => ({ ...b, findings: (fnd.data ?? []).filter((f) => f.blueprint_id === b.id) })),
    garments: gar.data ?? [], references: refs.data ?? [], refRatings: rr.data ?? [], styleRefs: sr.data ?? [], chatValidated: (chat.data?.length ?? 0) > 0,
  }
}

export function filled(area: string, b: Bundle): boolean {
  const a = AREAS.find((x) => x.id === area)
  if (!a) return false
  if (area === 'a2' && b.photos.length) return true
  if (area === 'a6' && b.references.length) return true
  if (area === 'a4' && (b.refRatings.length || b.styleRefs.length || (b.style?.influences ?? []).length)) return true
  return questionsOf(a.id).some((q) => answered(q, valueOf(q, b)))
}
export const status = (area: string, b: Bundle): [string, string] =>
  b.validated[area] ? ['Validado por ti', 'ok'] : filled(area, b) ? ['En curso', 'warn'] : ['Por empezar', 'bad']
