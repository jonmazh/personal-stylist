import { DIMS, PREFS, GOALS } from './areas'
import type { Bundle } from './data'

export interface Finding { title: string; body: string; origin: string; confidence: string; justification: string }

// [nombre, esNeutro, temperatura c|f|n]
const COLORS: [string, boolean, string][] = [
  ['Negro', true, 'n'], ['Blanco', true, 'n'], ['Gris', true, 'n'], ['Azul marino', true, 'n'], ['Beige', true, 'c'], ['Camel', true, 'c'],
  ['Marrón', true, 'c'], ['Oliva', false, 'c'], ['Burdeos', false, 'c'], ['Azul claro', false, 'f'], ['Verde bosque', false, 'n'],
  ['Rojo', false, 'c'], ['Rosa', false, 'f'], ['Lila', false, 'f'], ['Mostaza', false, 'c'],
]
/** Muestra aproximada de cada color de la paleta, para dibujarla en el informe. */
export const COLOR_HEX: Record<string, string> = {
  Negro: '#1C1C1C', Blanco: '#F8F7F3', Gris: '#8D8D8A', 'Azul marino': '#1F2A44', Beige: '#D9C7A7', Camel: '#B08D57',
  Marrón: '#5C4033', Oliva: '#6B6B3A', Burdeos: '#6D1F2A', 'Azul claro': '#9DB8D6', 'Verde bosque': '#2F4A36',
  Rojo: '#B0282E', Rosa: '#D9A3AE', Lila: '#B39DC4', Mostaza: '#C99A2E',
}
const TEMP: Record<string, string> = { Cálida: 'c', Fría: 'f', Neutra: 'n' }
export const confClass = (c: string) => (/^(Confirm|Alta)/.test(c) ? 'ok' : /^(Sin|Insuf)/.test(c) ? 'bad' : 'warn')
export const IA_CONF: Record<string, string> = { alta: 'Media: hipótesis visual', media: 'Hipótesis visual pendiente de validar', baja: 'Insuficiente: hipótesis débil' }

export function buildFindings(b: Bundle): Finding[] {
  const out: Finding[] = []
  const add = (title: string, body: string, origin: string, confidence: string, justification: string) =>
    out.push({ title, body, origin, confidence, justification })
  const v = b.validated, num = Object.keys(b.measures).length
  const dims: Record<string, number> = b.style?.dims ?? {}, styles: string[] = b.style?.styles ?? []

  const dm = DIMS.map(([k, l, r]) => (dims[k] >= 65 ? r.toLowerCase() : dims[k] <= 35 ? l.toLowerCase() : '')).filter(Boolean)
  const hs = dm.length + styles.length > 0
  add('Identidad estética', hs ? [...dm, ...styles].join(', ') + '.' : 'Sin preferencias marcadas todavía.', 'Declarado por ti',
    v.a4 ? 'Confirmada' : hs ? 'Media: declarada por ti' : 'Sin datos', 'Sale de tus deslizadores y estilos; las referencias visuales las analiza la IA aparte.')

  const m = (k: string) => b.measures[k]?.value, dr = (m('pecho') ?? 0) - (m('cintura') ?? 0)
  const latest = Object.values(b.measures).map((x) => x.at).sort().at(-1)?.slice(0, 10)
  add('Proporciones',
    num < 6 ? `Solo tengo ${num} de 10 medidas: no puedo valorar tus proporciones con fiabilidad.`
      : dr > 0 ? `Pecho − cintura = ${dr} cm: ${dr >= 22 ? 'silueta marcada en V' : dr >= 12 ? 'silueta equilibrada' : 'silueta recta'}.`
      : 'Faltan pecho o cintura para interpretar la silueta.',
    'Medición manual', num < 6 ? 'Insuficiente' : v.a2 ? 'Alta: medición manual validada' : 'Media: medición manual',
    `Medidas introducidas por ti${latest ? ` (última: ${latest})` : ''}; no se estiman desde fotos.`)

  const c = b.color ?? {}, t = TEMP[c.temperature ?? ''] ?? null
  add('Colorimetría',
    t ? `Subtono ${({ c: 'cálido', f: 'frío', n: 'neutro' } as Record<string, string>)[t]}${['depth', 'intensity', 'contrast'].filter((k) => c[k]).map((k) => `, ${({ depth: 'profundidad', intensity: 'intensidad', contrast: 'contraste' } as Record<string, string>)[k]} ${String(c[k]).toLowerCase()}`).join('')}.` : 'Sin definir.',
    'Declarado por ti', v.a3 ? 'Confirmada' : t ? 'Hipótesis pendiente de validar' : 'Sin datos', 'Las fotos de móvil alteran el color: valídalo con luz natural.')
  if (t) add('Paleta', COLORS.filter(([, neu, ct]) => neu || ct === 'n' || t === 'n' || ct === t).map(([n]) => n).join(', ') + '.',
    'Declarado por ti', v.a3 ? 'Confirmada' : 'Hipótesis pendiente de validar', 'Derivada de tu subtono; ningún color está prohibido, algunos van mejor lejos de la cara.')

  const prefs: Record<string, string> = b.fit?.prefs ?? {}
  const pr = Object.keys(PREFS).filter((k) => prefs[k]).map((k) => `${k}: ${prefs[k].toLowerCase()}`)
  add('Cortes que funcionan', pr.length ? pr.join('; ') + (b.profile?.fit_pref ? `. Ajuste general ${String(b.profile.fit_pref).toLowerCase()}.` : '.') : 'Sin datos de preferencias.',
    'Declarado por ti', pr.length ? (v.a6 ? 'Confirmada' : 'Media: declarada por ti') : 'Sin datos', 'Son tus preferencias; se contrastan con tus medidas cuando están completas.')
  add('Cortes con precaución',
    prefs.pantalones === 'Amplio' && (prefs.camisas === 'Oversize' || prefs.camisetas === 'Relaxed')
      ? 'Volumen amplio arriba y abajo: pruébalo con cuidado y equilíbralo con una pieza más ajustada.' : 'Con los datos actuales no veo alertas.',
    'Calculado a partir de tus datos', 'Media', 'Regla de proporción: un volumen se equilibra con una línea limpia.')

  const life: Record<string, number> = b.life?.life ?? {}, cons: string[] = b.life?.constraints ?? []
  const top = Object.entries(life).filter(([, x]) => x > 0).sort((a, z) => z[1] - a[1]).slice(0, 2).map(([k, x]) => `${k[0].toUpperCase() + k.slice(1)} ${x} %`)
  if (top.length) add('Necesidades de vida', top.join(', ') + (cons.length ? `. Restricciones: ${cons.join(', ').toLowerCase()}.` : '.'),
    'Declarado por ti', v.a5 ? 'Confirmada' : 'Media: declarada por ti', 'El armario debe servir sobre todo a estos ámbitos.')

  const ans: Record<string, string> = b.goals?.answers ?? {}, go = GOALS.map((_, i) => ans[`g${i}`]).filter(Boolean)
  add('Objetivos', go.length ? go.join(' · ') : 'Sin objetivos definidos.', 'Declarado por ti', go.length ? 'Media: declarados por ti' : 'Sin datos', 'Se revisan en cada actualización del perfil.')

  for (const o of b.observations)
    add(`IA · ${o.title}`, o.body, `IA · foto ${o.source_photo ?? '—'}`, IA_CONF[o.confidence] ?? IA_CONF.media, o.justification ?? '')
  return out
}
