import type { Bundle } from '@/lib/profile/data'
import { AREAS } from '@/lib/profile/areas'

/** Contexto que ve el chat: lo validado va primero y separado de lo provisional. */
export function buildContext(b: Bundle) {
  const last = b.blueprints.at(-1)
  const fx = last?.findings ?? []
  const val = fx.filter((f) => f.status !== 'pending')
  const prov = fx.filter((f) => f.status === 'pending')
  const areas = AREAS.filter((a) => b.validated[a.id]).map((a) => a.name)
  const text = [
    `AREAS VALIDADAS: ${areas.join(', ') || 'ninguna'}`,
    `CONCLUSIONES VALIDADAS:\n${val.map((f) => `- ${f.title}: ${f.status === 'corrected' ? f.corrected_body : f.body}`).join('\n') || '(ninguna)'}`,
    `CONCLUSIONES PROVISIONALES:\n${prov.map((f) => `- ${f.title}: ${f.body} (${f.confidence})`).join('\n') || '(ninguna)'}`,
    `ARMARIO REAL:\n${b.garments.map((g) => `- ${g.name} (${g.category}, ${g.color ?? 's/c'}, formalidad ${g.formality})`).join('\n') || '(vacio)'}`,
  ].join('\n\n')
  return { text, hasValidated: val.length > 0 || areas.length > 0 }
}
