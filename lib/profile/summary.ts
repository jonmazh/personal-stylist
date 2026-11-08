import type { AreaId } from './areas'
import type { Bundle } from './data'
import { answered, questionsOf, valueOf } from './questionnaire'

export const GARMENT_FIELDS: Record<string, [string, string][]> = {
  pantalon: [['cintura', 'Cintura'], ['tiro', 'Tiro'], ['largo', 'Largo'], ['bajo', 'Bajo']],
  camiseta: [['hombros', 'Hombros'], ['pecho', 'Pecho'], ['largo', 'Largo']],
  camisa: [['hombros', 'Hombros'], ['pecho', 'Pecho'], ['largo', 'Largo'], ['manga', 'Manga']],
  chaqueta: [['hombros', 'Hombros'], ['pecho', 'Pecho'], ['largo', 'Largo'], ['manga', 'Manga']],
  abrigo: [['hombros', 'Hombros'], ['pecho', 'Pecho'], ['largo', 'Largo'], ['manga', 'Manga']],
}
export const GARMENT_LABEL: Record<string, string> = { pantalon: 'Pantalón', camiseta: 'Camiseta', camisa: 'Camisa', chaqueta: 'Chaqueta', abrigo: 'Abrigo' }

/** Una prenda de referencia en texto: "Pantalón · Chino azul: cintura 42 cm, tiro 29 cm". */
export function describeGarment(g: Record<string, any>) {
  const m: Record<string, number> = g.measurements ?? {}
  const parts = (GARMENT_FIELDS[g.category] ?? []).filter(([k]) => m[k]).map(([k, l]) => `${l.toLowerCase()} ${m[k]} cm`)
  return `${GARMENT_LABEL[g.category] ?? g.category} · ${g.name}${parts.length ? `: ${parts.join(', ')}` : ''}${g.notes ? ` (${g.notes})` : ''}`
}

/** Datos concretos de un area en texto legible, para el contexto del chat. Vacio si no hay datos. */
export function describeArea(id: AreaId, b: Bundle): string[] {
  const out: string[] = []
  const percents: string[] = []
  for (const q of questionsOf(id)) {
    const v = valueOf(q, b)
    if (!answered(q, v)) continue
    switch (q.kind) {
      case 'measure': {
        const m = b.measures[q.store.key!]
        out.push(`${q.label}: ${m.value} cm (${m.source === 'manual' ? 'medida por el usuario' : 'estimada'}, ${m.at.slice(0, 10)})`)
        break
      }
      case 'percent': percents.push(`${q.label} ${v} %`); break
      case 'slider': {
        const [l, r] = q.ends!
        out.push(`${q.label}: ${v}/100 (tira a ${(v > 50 ? r : l).toLowerCase()})`)
        break
      }
      case 'multi': out.push(`${q.label}: ${v.join(', ')}`); break
      case 'textarea': out.push(`${q.label} → ${v}`); break
      default: out.push(`${q.label}: ${v}${q.unit ? ` ${q.unit}` : ''}`)
    }
  }
  if (percents.length) out.unshift(`Reparto del armario: ${percents.join(', ')}`)
  if (id === 'a2' && b.photos.length) {
    const desc = b.photos.map((p) => `${p.kind}${p.quality?.ai?.usable === false ? ' (no utilizable según la IA)' : ''}`)
    out.push(`Fotos subidas: ${desc.join(', ')}. Las observaciones de la IA van en las conclusiones.`)
  }
  if (id === 'a6') for (const g of b.references) out.push(`Prenda de referencia que le queda bien: ${describeGarment(g)}`)
  return out
}
