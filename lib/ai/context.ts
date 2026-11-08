import type { Bundle } from '@/lib/profile/data'
import { AREAS } from '@/lib/profile/areas'
import { describeArea } from '@/lib/profile/summary'

const section = (title: string, lines: string[], empty = '(nada)') => `${title}:\n${lines.length ? lines.join('\n') : empty}`

/**
 * Contexto que ve el chat. Lo validado va primero y separado de lo provisional:
 *  1. Datos de las areas que el usuario ha validado (fiables).
 *  2. Conclusiones del ultimo Blueprint confirmadas o corregidas por el usuario.
 *  3. Datos declarados sin validar y conclusiones pendientes (hipotesis).
 */
export function buildContext(b: Bundle) {
  const valAreas: string[] = [], provAreas: string[] = [], empty: string[] = []
  for (const a of AREAS) {
    const lines = describeArea(a.id, b)
    if (!lines.length) { empty.push(a.name); continue }
    const block = `## ${a.name}\n${lines.map((l) => `- ${l}`).join('\n')}`
    ;(b.validated[a.id] ? valAreas : provAreas).push(block)
  }

  const fx = b.blueprints.at(-1)?.findings ?? []
  const reviewed = fx.filter((f) => f.status === 'confirmed' || f.status === 'corrected')
  // Las conclusiones vacias ('Sin datos') no aportan: ya se listan en AREAS SIN DATOS.
  const pending = fx.filter((f) => f.status !== 'confirmed' && f.status !== 'corrected' && f.confidence !== 'Sin datos')

  const text = [
    section('PERFIL VALIDADO POR EL USUARIO (datos fiables)', valAreas, '(ninguna área validada todavía)'),
    section('CONCLUSIONES CONFIRMADAS O CORREGIDAS POR EL USUARIO',
      reviewed.map((f) => `- ${f.title}: ${f.status === 'corrected' ? `${f.corrected_body} (corregida por el usuario)` : f.body}`), '(ninguna)'),
    section('DATOS DECLARADOS SIN VALIDAR (úsalos como provisionales)', provAreas),
    section('CONCLUSIONES PROVISIONALES (hipótesis pendientes de revisar)',
      pending.map((f) => `- ${f.title}: ${f.body} (confianza: ${f.confidence}; origen: ${f.origin})`), '(ninguna)'),
    `ÁREAS SIN DATOS: ${empty.join(', ') || 'ninguna'}`,
    section('ARMARIO REAL', b.garments.map((g) => `- ${g.name} (${g.category}, ${g.color ?? 's/c'}, formalidad ${g.formality})`), '(vacío)'),
  ].join('\n\n')

  return { text, hasValidated: valAreas.length > 0 || reviewed.length > 0 }
}
