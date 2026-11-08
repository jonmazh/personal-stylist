import type { Bundle } from '@/lib/profile/data'
import { buildFindings } from '@/lib/profile/blueprint'
import { carryReviews } from '@/lib/profile/review'

/** Perfil de ejemplo con datos en todas las areas. */
export function sampleBundle(over: Partial<Bundle> = {}): Bundle {
  const at = '2026-11-01T10:00:00Z'
  const measures = Object.fromEntries(
    [['pecho', 104], ['hombros', 47], ['cintura', 84], ['cadera', 98], ['torso', 62], ['entrepierna', 81]].map(([k, v]) => [k, { value: v as number, at, source: 'manual' }]),
  )
  return {
    profile: { age: 34, height_cm: 180, city: 'Madrid', budget_max: 120, fit_pref: 'Regular' },
    measures,
    photos: [],
    color: { temperature: 'Cálida', depth: 'Media', intensity: 'Suave', contrast: 'Medio' },
    style: { dims: { clasico: 70, minimalista: 30, estructurado: 50 }, styles: ['Casual sofisticado'] },
    life: { life: { trabajo: 50, ocio: 30, deporte: 10, eventos: 10 }, constraints: ['Camino mucho'] },
    fit: { prefs: { pantalones: 'Recto', camisas: 'Regular' } },
    goals: { answers: { g2: 'Una imagen limpia y profesional' } },
    validated: { a1: false, a2: true, a3: false, a4: false, a5: true, a6: false, a7: false },
    observations: [],
    blueprints: [],
    garments: [],
    references: [],
    refRatings: [],
    styleRefs: [],
    chatValidated: false,
    ...over,
  }
}

/** Simula generateBlueprint: nueva version a partir del bundle, conservando revisiones. */
export function generate(b: Bundle): Bundle {
  const prev = b.blueprints.at(-1)
  const version = (prev?.version ?? 0) + 1
  const id = `bp${version}`
  const findings = carryReviews(prev?.findings ?? [], buildFindings(b)).map((f, i) => ({ ...f, id: `${id}-${i}`, blueprint_id: id, position: i }))
  return { ...b, blueprints: [...b.blueprints, { id, version, created_at: '2026-11-08', validated_areas: 0, findings }] }
}

/** Simula reviewFinding sobre la ultima version. */
export function review(b: Bundle, title: string, mode: 'confirm' | 'correct', text?: string): Bundle {
  const last = b.blueprints.at(-1)!
  const findings = last.findings.map((f) =>
    f.title !== title ? f : mode === 'correct' ? { ...f, status: 'corrected', corrected_body: text } : { ...f, status: 'confirmed', corrected_body: null })
  return { ...b, blueprints: [...b.blueprints.slice(0, -1), { ...last, findings }] }
}
