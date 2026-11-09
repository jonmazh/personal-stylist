import { PALETTE_OF } from '@/lib/style/references'
import { OUTFIT_OCCASIONS } from './taxonomy'

/**
 * Aprendizaje a partir del feedback (fase 3D). Principios de la especificacion:
 * - una unica valoracion no cambia nada;
 * - un patron CONSISTENTE (evidencia suficiente) influye de forma suave en el motor;
 * - un patron CONFIRMADO por el usuario influye del todo; uno DESCARTADO, nunca;
 * - nada de esto modifica el Style Blueprint: aprende de ti, no te corrige.
 */
export const MIN_EVIDENCE = 2          // valoraciones distintas para proponer un patron
export const AUTO_EVIDENCE = 3         // a partir de aqui influye (suave) aunque no lo hayas confirmado
export const SOFT = 0.5

type Row = Record<string, any>
export type PatternKind = 'garment_dislike' | 'garment_favorite' | 'too_formal' | 'too_informal' | 'color_pair'
export interface Pattern { key: string; kind: PatternKind; label: string; explanation: string; effect: string; evidence: number; refs: string[]; status: 'detected' | 'confirmed' | 'dismissed'; weight: number }

const pal = (c?: string | null) => (c ? PALETTE_OF[c] ?? c : null)
const occLabel = (id: string) => OUTFIT_OCCASIONS.find((o) => o.id === id)?.label.toLowerCase() ?? id
const inc = (m: Map<string, Set<string>>, k: string, ev: string) => { if (!m.has(k)) m.set(k, new Set()); m.get(k)!.add(ev) }

/** Patrones con su evidencia (ids de valoraciones o usos que los sostienen). */
export function detectPatterns(feedback: Row[], wears: Row[], garments: Map<string, Row>, decisions: Row[] = []): Pattern[] {
  const dislike = new Map<string, Set<string>>(), fav = new Map<string, Set<string>>(), formal = new Map<string, Set<string>>(), informal = new Map<string, Set<string>>(), pairs = new Map<string, Set<string>>()
  for (const f of feedback) {
    const reasons: string[] = f.reasons ?? [], flags: string[] = f.flags ?? []
    if (f.garment_id && reasons.includes('garment')) inc(dislike, f.garment_id, f.id)
    const positive = f.rating === 'love' || f.rating === 'like' || flags.includes('would_repeat') || flags.includes('well_dressed')
    if (positive && f.rating !== 'dislike') for (const g of f.garment_ids ?? []) inc(fav, g, f.id)
    if (f.occasion && reasons.includes('too_formal')) inc(formal, f.occasion, f.id)
    if (f.occasion && reasons.includes('too_informal')) inc(informal, f.occasion, f.id)
    if (reasons.includes('colors')) {
      const cols = [...new Set((f.garment_ids ?? []).map((g: string) => pal(garments.get(g)?.primary_color)).filter(Boolean))].sort() as string[]
      for (let i = 0; i < cols.length; i++) for (let j = i + 1; j < cols.length; j++) inc(pairs, `${cols[i]}|${cols[j]}`, f.id)
    }
  }
  for (const w of wears) for (const g of w.garment_ids ?? []) inc(fav, g, `w:${w.id}`)
  const title = (id: string) => garments.get(id)?.title ?? garments.get(id)?.name ?? 'una prenda'
  const out: Omit<Pattern, 'status' | 'weight'>[] = []
  for (const [g, ev] of dislike) if (ev.size >= MIN_EVIDENCE) out.push({ key: `garment_dislike:${g}`, kind: 'garment_dislike', refs: [g], evidence: ev.size, label: `No te convence «${title(g)}»`, explanation: `La has señalado ${ev.size} veces como la prenda que no te gusta de un conjunto.`, effect: 'Si lo confirmas, el estilista dejará de proponerla; mientras, solo la penaliza un poco.' })
  for (const [g, ev] of fav) if (ev.size >= AUTO_EVIDENCE && !dislike.has(g)) out.push({ key: `garment_favorite:${g}`, kind: 'garment_favorite', refs: [g], evidence: ev.size, label: `«${title(g)}» funciona muy bien en tus conjuntos`, explanation: `Aparece en ${ev.size} conjuntos que te gustaron, repetirías o te pusiste.`, effect: 'El estilista la tendrá más en cuenta (sin repetirla siempre).' })
  for (const [o, ev] of formal) if (ev.size >= MIN_EVIDENCE) out.push({ key: `too_formal:${o}`, kind: 'too_formal', refs: [o], evidence: ev.size, label: `Para ${occLabel(o)} prefieres algo más informal`, explanation: `${ev.size} propuestas para ${occLabel(o)} te parecieron demasiado formales.`, effect: 'Bajará un punto la formalidad objetivo de esa ocasión.' })
  for (const [o, ev] of informal) if (ev.size >= MIN_EVIDENCE) out.push({ key: `too_informal:${o}`, kind: 'too_informal', refs: [o], evidence: ev.size, label: `Para ${occLabel(o)} prefieres algo más arreglado`, explanation: `${ev.size} propuestas para ${occLabel(o)} te parecieron demasiado informales.`, effect: 'Subirá un punto la formalidad objetivo de esa ocasión.' })
  for (const [pk, ev] of pairs) if (ev.size >= MIN_EVIDENCE) { const [a, b] = pk.split('|'); out.push({ key: `color_pair:${pk}`, kind: 'color_pair', refs: [a, b], evidence: ev.size, label: `No te gustan juntos ${a.toLowerCase()} y ${b.toLowerCase()}`, explanation: `${ev.size} conjuntos con esa pareja de colores no te convencieron por los colores.`, effect: 'El estilista penalizará esa combinación de colores.' }) }
  const dec = new Map(decisions.map((d) => [d.key, d.status]))
  return out.map((p) => {
    const status = (dec.get(p.key) ?? 'detected') as Pattern['status']
    return { ...p, status, weight: status === 'confirmed' ? 1 : status === 'dismissed' ? 0 : p.evidence >= AUTO_EVIDENCE ? SOFT : 0 }
  }).sort((a, z) => (a.status === 'detected' ? 0 : 1) - (z.status === 'detected' ? 0 : 1) || z.evidence - a.evidence)
}

export interface Signals { exclude: Set<string>; garment: Map<string, number>; pairs: { a: string; b: string; weight: number }[]; formalityShift: Map<string, number>; notes: string[] }
export const emptySignals = (): Signals => ({ exclude: new Set(), garment: new Map(), pairs: [], formalityShift: new Map(), notes: [] })

/** Lo que el motor usa: exclusiones confirmadas, bonus/penalizacion por prenda, parejas de color y ajuste de formalidad. */
export function toSignals(patterns: Pattern[]): Signals {
  const s = emptySignals()
  for (const p of patterns) {
    if (!p.weight) continue
    if (p.kind === 'garment_dislike') { if (p.status === 'confirmed') s.exclude.add(p.refs[0]); else s.garment.set(p.refs[0], (s.garment.get(p.refs[0]) ?? 0) - p.weight) }
    if (p.kind === 'garment_favorite') s.garment.set(p.refs[0], (s.garment.get(p.refs[0]) ?? 0) + p.weight)
    if (p.kind === 'color_pair') s.pairs.push({ a: p.refs[0], b: p.refs[1], weight: p.weight })
    if (p.kind === 'too_formal' || p.kind === 'too_informal') s.formalityShift.set(p.refs[0], (s.formalityShift.get(p.refs[0]) ?? 0) + (p.kind === 'too_formal' ? -1 : 1) * p.weight)
    s.notes.push(`${p.label} (${p.status === 'confirmed' ? 'confirmado por ti' : `${p.evidence} valoraciones`})`)
  }
  return s
}

/** Métricas de la especificación: cuántos te gustan, cuántos te pones y cuántos repetirías. */
export function metrics(feedback: Row[], wears: Row[], outfits: Row[]) {
  const rated = feedback.filter((f) => f.rating)
  const byOutfit = new Map<string, number>()
  for (const w of wears) byOutfit.set(w.outfit_id, (byOutfit.get(w.outfit_id) ?? 0) + 1)
  const fromEngine = outfits.filter((o) => o.source === 'generator' || o.source === 'stylist')
  const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : null)
  return {
    outfits: outfits.length, rated: rated.length,
    liked: rated.filter((f) => f.rating !== 'dislike').length, likedPct: pct(rated.filter((f) => f.rating !== 'dislike').length, rated.length),
    wornOutfits: byOutfit.size, wears: wears.length, wornPct: pct(byOutfit.size, outfits.length),
    repeat: feedback.filter((f) => (f.flags ?? []).includes('would_repeat')).length,
    proposalsSaved: fromEngine.length, proposalsWorn: fromEngine.filter((o) => byOutfit.has(o.id)).length,
  }
}
