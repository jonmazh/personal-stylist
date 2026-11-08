import type { SupabaseClient } from '@supabase/supabase-js'
import { AREAS } from './areas'

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
  chatValidated: boolean
}

export async function loadBundle(sb: SupabaseClient, uid: string): Promise<Bundle> {
  const q = (t: string) => sb.from(t).select('*')
  const [p, ms, ph, col, sty, life, fit, goals, st, obs, bps, fnd, gar, chat] = await Promise.all([
    q('profiles').eq('id', uid).maybeSingle(),
    q('body_measurements').order('measured_at', { ascending: false }),
    q('body_photos').order('created_at', { ascending: false }),
    q('color_profiles').maybeSingle(), q('style_preferences').maybeSingle(), q('lifestyle_profiles').maybeSingle(),
    q('fit_preferences').maybeSingle(), q('style_goals').maybeSingle(), q('area_states'),
    q('observations').order('created_at', { ascending: false }),
    q('blueprints').order('version'), q('assessment_findings').order('position'), q('garments'),
    sb.from('ai_runs').select('id').eq('kind', 'chat').contains('meta', { validated: true }).limit(1),
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
    garments: gar.data ?? [], chatValidated: (chat.data?.length ?? 0) > 0,
  }
}

export function filled(area: string, b: Bundle): boolean {
  switch (area) {
    case 'a1': return !!(b.profile?.age || b.profile?.height_cm || b.profile?.city)
    case 'a2': return Object.keys(b.measures).length > 0
    case 'a3': return !!(b.color && (b.color.temperature || b.color.depth || b.color.intensity || b.color.contrast))
    case 'a4': return !!(b.style && (Object.keys(b.style.dims ?? {}).length || (b.style.styles ?? []).length))
    case 'a5': return !!b.life
    case 'a6': return !!(b.fit && Object.keys(b.fit.prefs ?? {}).length)
    case 'a7': return !!(b.goals && Object.values(b.goals.answers ?? {}).some(Boolean))
  }
  return false
}
export const status = (area: string, b: Bundle): [string, string] =>
  b.validated[area] ? ['Validado por ti', 'ok'] : filled(area, b) ? ['En curso', 'warn'] : ['Por empezar', 'bad']
