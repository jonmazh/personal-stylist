import type { AreaId } from './areas'
import type { Bundle } from './data'
import { answered, questionsOf, valueOf } from './questionnaire'
import { styleProfileOf } from '@/lib/style/dna'
import { temperatureLabel, temperatureState } from '@/lib/color/temperature'
import { brandById, elementLabel, styleName } from '@/lib/style/catalog'

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
    if (q.external) continue
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
  if (id === 'a3') {
    const t = temperatureState(b.color, b.colorAnalyses)
    if (t.fromUser) out.unshift(`Temperatura cromática: ${temperatureLabel(t.value, t.secondary)} (${t.status === 'validado' ? 'validada por el usuario' : 'declarada, sin validar'}${t.source === 'ia' ? '; estimada por la IA y confirmada' : ''})`)
    else if (t.value) out.unshift(`Temperatura cromática ESTIMADA POR LA IA (sin confirmar): ${temperatureLabel(t.value, t.secondary)}, confianza ${t.confidence}`)
    if (t.aiDiffers) out.push(`La última estimación de la IA (${temperatureLabel(t.latest!.temperature, t.latest!.secondary_tendency)}) difiere del dato validado: manda el del usuario`)
  }
  if (id === 'a4') {
    const p = styleProfileOf(b)
    const fmt = (xs: { style: string; role: string; weight: number }[]) => xs.map((i) => `${styleName(i.style)} ${i.weight} % (${i.role})`).join(', ')
    if (p.declared.influences.length) out.push(`Identidad declarada (versión ${p.declared.version}): ${fmt(p.identity.influences)}. Los % son orientativos, no una restricción.`)
    const el = (xs: { element: string; source: string }[], src: string) => xs.filter((x) => x.source === src).map((x) => elementLabel(x.element)).join(', ')
    if (el(p.elements.liked, 'declarado')) out.push(`Elementos que declara que le gustan: ${el(p.elements.liked, 'declarado')}`)
    if (el(p.elements.rejected, 'declarado')) out.push(`Elementos que declara que rechaza: ${el(p.elements.rejected, 'declarado')}`)
    if (p.declared.brands.length) out.push(`Marcas de referencia (inspiración, no estilos): ${p.declared.brands.map((x) => brandById(x)?.name).join(', ')}`)
    const inf = p.inferred
    if (inf.rated) out.push(`INFERIDO de ${inf.rated} valoraciones (no declarado): ${inf.proposal.length ? `apunta a ${inf.proposal.map((x) => `${styleName(x.style)} ${x.weight} %`).join(', ')}` : 'aún sin patrón'}${inf.patterns.length ? `; patrones: ${inf.patterns.map((x) => `${x.kind} ${x.label.toLowerCase()} (${x.evidence} conjuntos)`).join(', ')}` : ''}${inf.admiredStyles.length ? `; admira sin querer llevarlo: ${inf.admiredStyles.map(styleName).join(', ')}` : ''}${inf.rejectedStyles.length ? `; descarta: ${inf.rejectedStyles.map(styleName).join(', ')}` : ''}`)
  }
  if (id === 'a6') for (const g of b.references) out.push(`Prenda de referencia que le queda bien: ${describeGarment(g)}`)
  return out
}
