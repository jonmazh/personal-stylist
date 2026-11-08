import { DIMS, GOALS, LIFE, MEASURES, PREFS, type AreaId } from './areas'
import type { Bundle } from './data'

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

/** Datos concretos de un area en texto legible, para el contexto del chat. Vacio si no hay datos. */
export function describeArea(id: AreaId, b: Bundle): string[] {
  const out: string[] = []
  const add = (label: string, v: unknown, unit = '') => { if (v !== null && v !== undefined && v !== '') out.push(`${label}: ${v}${unit}`) }
  switch (id) {
    case 'a1': {
      const p = b.profile ?? {}
      add('Edad', p.age); add('Altura', p.height_cm, ' cm'); add('Peso', p.weight_kg, ' kg'); add('Ciudad', p.city)
      add('Tallas habituales', p.sizes); add('Marcas habituales', p.brands); add('Presupuesto máx. por prenda', p.budget_max, ' €')
      add('Ajuste preferido', p.fit_pref)
      break
    }
    case 'a2':
      for (const [k, l] of MEASURES) {
        const m = b.measures[k]
        if (m) out.push(`${l}: ${m.value} cm (${m.source === 'manual' ? 'medida por el usuario' : 'estimada'}, ${m.at.slice(0, 10)})`)
      }
      break
    case 'a3': {
      const c = b.color ?? {}
      add('Temperatura', c.temperature); add('Profundidad', c.depth); add('Intensidad', c.intensity); add('Contraste', c.contrast)
      break
    }
    case 'a4': {
      const dims: Record<string, number> = b.style?.dims ?? {}
      for (const [k, l, r] of DIMS) {
        const v = dims[k]
        if (typeof v !== 'number' || v === 50) continue // 50 = sin preferencia
        out.push(`${l} ↔ ${r}: ${v}/100 (tira a ${(v > 50 ? r : l).toLowerCase()})`)
      }
      const styles: string[] = b.style?.styles ?? []
      if (styles.length) out.push(`Estilos que le atraen: ${styles.join(', ')}`)
      break
    }
    case 'a5': {
      const life: Record<string, number> = b.life?.life ?? {}
      const parts = LIFE.filter(([k]) => life[k] > 0).map(([k, l]) => `${l} ${life[k]} %`)
      if (parts.length) out.push(`Reparto del armario: ${parts.join(', ')}`)
      const cons: string[] = b.life?.constraints ?? []
      if (cons.length) out.push(`Restricciones: ${cons.join(', ')}`)
      break
    }
    case 'a6': {
      const prefs: Record<string, string> = b.fit?.prefs ?? {}
      for (const k of Object.keys(PREFS)) if (prefs[k]) out.push(`${cap(k)}: ${prefs[k]}`)
      break
    }
    case 'a7': {
      const ans: Record<string, string> = b.goals?.answers ?? {}
      GOALS.forEach((q, i) => { if (ans[`g${i}`]) out.push(`${q} → ${ans[`g${i}`]}`) })
      break
    }
  }
  return out
}
