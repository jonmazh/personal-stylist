import { z } from 'zod'
import { GROUPS } from '@/lib/wardrobe/taxonomy'
import { ITEM_ROLES, OUTFIT_OCCASIONS, roleLabel, rolesFor } from '../taxonomy'
import { DISLIKE_RULES, DislikesSchema, tasteLists } from '@/lib/profile/tastes'
import { DRESS_CODES, ENVIRONMENTS, FORMALITY_WISH, INTENTS, LEVELS, RESTRICTIONS, TIMES, WEATHERS, type GenerateRequestT } from '../engine/context'

/**
 * Outfit Stylist AI (fase 3C): contratos de la IA y su validacion.
 * Regla: el motor genera y valida; la IA interpreta, elige entre candidatas y explica. Nada de lo que devuelve la IA
 * se usa sin comprobarlo contra las listas cerradas y el inventario real. Ver docs/OUTFIT-STUDIO.md.
 */
export const PARSER_VERSION = 'context-parser@1'
export const STYLIST_VERSION = 'outfit-stylist@1'

const S = z.string().nullable().default(null)
// ── 1. Interprete de contexto ──
export const ParsedSchema = z.object({
  occasion: S, dress_code: S, time_of_day: S, environment: S, weather: S, formality: S, comfort_priority: S, preferred_style: S,
  restrictions: z.array(z.string()).max(8).default([]),
  exclude_categories: z.array(z.string()).max(9).default([]),
  required_garment_ids: z.array(z.string()).max(3).default([]),
  exclude_garment_ids: z.array(z.string()).max(10).default([]),
  number_of_outfits: z.number().int().min(1).max(5).nullable().default(null),
  assumptions: z.array(z.string()).max(6).default([]),
})
export type Parsed = z.infer<typeof ParsedSchema>
const opts = (xs: readonly { id: string; label: string }[]) => xs.map((x) => `${x.id} (${x.label})`).join(', ')

export const CONTEXT_PARSER = `Eres el interprete de peticiones de Personal Stylist. Conviertes lo que el usuario escribe sobre una ocasion en criterios estructurados.
REGLAS:
1. Usa SOLO los valores de las listas, escritos exactamente (el id, no la etiqueta).
2. Si algo no se dice ni se deduce con claridad, devuelve null (o lista vacia). No inventes.
3. Las prendas solo pueden referirse por los ids del INVENTARIO; si el usuario menciona una prenda que no aparece, no la incluyas y dilo en "assumptions".
4. "assumptions": lo que has deducido (p. ej. "restaurante elegante → smart casual"), en espanol y breve.
5. Devuelve UNICAMENTE el JSON.`

export function parserUserPrompt(text: string, inventory: { id: string; title: string }[]) {
  return [
    `PETICION DEL USUARIO: """${text.slice(0, 1200)}"""`, '',
    `occasion: ${opts(OUTFIT_OCCASIONS)}`,
    `dress_code: ${opts(DRESS_CODES)}`, `time_of_day: ${opts(TIMES)}`, `environment: ${opts(ENVIRONMENTS)}`, `weather: ${opts(WEATHERS)}`,
    `formality: ${opts(FORMALITY_WISH)}`, `comfort_priority: ${opts(LEVELS)}`, `preferred_style: ${opts(INTENTS)}`,
    `restrictions (lista): ${opts(RESTRICTIONS)}`, `exclude_categories (lista): ${opts(GROUPS)}`,
    'required_garment_ids / exclude_garment_ids: ids del INVENTARIO que el usuario pide llevar o no llevar.',
    'number_of_outfits: si pide un numero concreto de propuestas (1-5).', '',
    'INVENTARIO (id: prenda):', ...inventory.slice(0, 120).map((g) => `${g.id}: ${g.title}`), '',
    'Forma: {"occasion":"cena_amigos","dress_code":"smart_casual","time_of_day":"evening","environment":"indoor","weather":"cold","formality":null,"comfort_priority":null,"preferred_style":null,"restrictions":["no_jacket"],"exclude_categories":[],"required_garment_ids":[],"exclude_garment_ids":[],"number_of_outfits":null,"assumptions":["..."]}',
  ].join('\n')
}

/** Valida lo interpretado: lo que no esta en las listas o en el inventario se descarta (y se dice). */
export function normalizeParsed(p: Parsed, inventory: Set<string>) {
  const dropped: string[] = []
  const pick = <T extends { id: string }>(v: string | null, xs: readonly T[], field: string) => { if (!v) return null; if (xs.some((x) => x.id === v)) return v; dropped.push(`${field}: «${v}» no es un valor válido`); return null }
  const many = <T extends { id: string }>(vs: string[], xs: readonly T[], field: string) => vs.filter((v) => (xs.some((x) => x.id === v) ? true : (dropped.push(`${field}: «${v}» no es un valor válido`), false)))
  const ids = (vs: string[], field: string) => vs.filter((v) => (inventory.has(v) ? true : (dropped.push(`${field}: una prenda que no está en tu armario disponible`), false)))
  const req: Partial<GenerateRequestT> = {
    occasion: pick(p.occasion, OUTFIT_OCCASIONS, 'Ocasión') as never, dress_code: pick(p.dress_code, DRESS_CODES, 'Código de vestimenta') as never,
    time_of_day: pick(p.time_of_day, TIMES, 'Momento') as never, environment: pick(p.environment, ENVIRONMENTS, 'Entorno') as never, weather: pick(p.weather, WEATHERS, 'Clima') as never,
    formality: pick(p.formality, FORMALITY_WISH, 'Formalidad') as never, comfort_priority: pick(p.comfort_priority, LEVELS, 'Comodidad') as never, preferred_style: pick(p.preferred_style, INTENTS, 'Intención') as never,
    restrictions: many(p.restrictions, RESTRICTIONS, 'Restricción') as never, exclude_categories: many(p.exclude_categories, GROUPS, 'Categoría') as never,
    required_garment_ids: ids(p.required_garment_ids, 'Prenda pedida'), exclude_garment_ids: ids(p.exclude_garment_ids, 'Prenda excluida'),
    ...(p.number_of_outfits ? { number_of_outfits: p.number_of_outfits } : {}),
  }
  return { request: req, dropped, assumptions: p.assumptions }
}

/** Interprete sin IA (respaldo si el proveedor no esta configurado o falla): palabras clave evidentes. */
export function keywordParse(text: string): Partial<GenerateRequestT> {
  const t = text.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  const has = (...w: string[]) => w.some((x) => t.includes(x))
  const occ = has('primera cita') ? 'primera_cita' : has('cita') ? 'cita' : has('entrevista') ? 'entrevista' : has('reunion') ? 'reunion_trabajo' : has('oficina', 'trabajo') ? 'oficina' : has('boda') ? 'boda'
    : has('cena') ? 'cena_amigos' : has('comida familiar', 'familia') ? 'comida_familiar' : has('fiesta') ? 'fiesta' : has('viaje') ? 'viaje' : has('turismo') ? 'turismo' : has('escapada') ? 'escapada' : has('gimnasio', 'deporte', 'correr') ? 'deporte' : null
  const restrictions: string[] = []
  if (has('sin americana', 'no llevar americana', 'sin chaqueta', 'no quiero americana', 'prefiero no llevar americana')) restrictions.push('no_jacket')
  if (has('sin traje', 'no quiero traje', 'no llevar traje')) restrictions.push('no_suit')
  if (has('sin zapatillas')) restrictions.push('no_sneakers')
  return {
    occasion: occ as never, weather: (has('frio', 'invierno') ? 'cold' : has('calor', 'verano') ? 'hot' : has('lluvia', 'llover') ? 'rain' : null) as never,
    time_of_day: (has('noche', 'cena') ? 'evening' : has('manana') ? 'morning' : has('tarde') ? 'afternoon' : null) as never,
    dress_code: (has('formal') && !has('demasiado formal', 'informal') ? 'formal' : has('elegante') ? 'smart_casual' : null) as never,
    restrictions: restrictions as never,
  }
}

// ── 2. Outfit Stylist AI: elige entre candidatas del motor y explica ──
export const OUTFIT_STYLIST = `Eres Personal Stylist, un estilista masculino profesional especializado en direccion creativa, construccion de outfits y asesoramiento personalizado de imagen.

Dispones de:
- El Style Blueprint validado del usuario.
- Su inventario de prendas.
- Los analisis de cada prenda.
- Las evaluaciones de ajuste confirmadas.
- Sus preferencias y valoraciones anteriores.
- El contexto de la ocasion solicitada.

MISION:
Construir conjuntos coherentes, atractivos, funcionales y alineados con la identidad del usuario.

PRINCIPIOS:
1. Utiliza exclusivamente prendas cuyos identificadores esten presentes en el inventario facilitado.
2. Nunca inventes ropa ni atribuyas al usuario prendas que no tenga registradas.
3. Respeta los filtros obligatorios de ocasion, formalidad, disponibilidad y restricciones.
4. Considera la armonia cromatica, las proporciones, las siluetas, las capas y la coherencia estetica.
5. Prioriza prendas que tengan evidencias favorables de ajuste y aceptacion por parte del usuario.
6. Diferencia entre compatibilidad estimada y ajuste real confirmado.
7. No fuerces la incorporacion de accesorios si no aportan valor al conjunto.
8. Busca variedad entre las propuestas.
9. No recomiendes una compra cuando exista una alternativa adecuada en el armario.
10. Se un experto constructivo. Discrepa cuando exista una razon de estilismo justificada.
11. Explica por que cada conjunto funciona y cuando seria apropiado utilizarlo.
12. No presentes puntuaciones como verdades objetivas.

Responde en espanol, con lenguaje profesional y cercano. La respuesta debe cumplir estrictamente el esquema JSON proporcionado por la aplicacion.`

export const SelectionSchema = z.object({
  intro: z.string().max(600).default(''),
  proposals: z.array(z.object({ candidate: z.string(), name: z.string().max(60), why: z.string().max(700), when: z.string().max(300).default(''), limitations: z.string().max(300).nullable().default(null) })).max(5),
})
export type Selection = z.infer<typeof SelectionSchema>

export interface CandidateView { key: string; intent: string; score: number; confidence: string; items: { garment_id: string; role: string; title: string; color?: string | null }[]; why: string[]; cons: string[] }
export function selectionPrompt(o: { request: string; context: string; profile: string; candidates: CandidateView[]; n: number }) {
  return [
    `PETICION: ${o.request}`, `CONTEXTO RESUELTO: ${o.context}`, `PERFIL (resumen): ${o.profile}`, '',
    `CANDIDATAS (generadas y validadas por el motor; puntuacion interna orientativa, no objetiva):`,
    ...o.candidates.map((c) => `${c.key} [${c.intent}, ${c.score}/100, confianza ${c.confidence}]: ${c.items.map((i) => `${roleLabel(i.role)}=${i.title} (${i.garment_id})`).join('; ')}. A favor: ${c.why.join(' ') || '—'} Matices: ${c.cons.join(' ') || '—'}`),
    '',
    `TAREA: elige ${o.n} candidatas distintas (por su clave, p. ej. "C2"), ordenadas de la que mas recomiendas a la que menos. No cambies ni añadas prendas. Para cada una: nombre evocador y breve, "why" (2-3 frases de estilista: por que funciona), "when" (cuando usarlo) y "limitations" (lo que no se puede verificar, p. ej. ajuste sin prueba). "intro": una frase para el usuario.`,
    'Forma: {"intro":"...","proposals":[{"candidate":"C1","name":"Elegancia relajada","why":"...","when":"...","limitations":null}]}',
  ].join('\n')
}
export function validateSelection(sel: Selection, keys: string[], n: number) {
  const seen = new Set<string>(), out: Selection['proposals'] = [], dropped: string[] = []
  for (const p of sel.proposals) {
    if (!keys.includes(p.candidate)) { dropped.push(`La IA citó una candidata inexistente (${p.candidate})`); continue }
    if (seen.has(p.candidate)) continue
    seen.add(p.candidate); out.push(p)
    if (out.length >= n) break
  }
  return { proposals: out, dropped }
}

// ── 3. Conversacion sobre una propuesta ──
export const STYLIST_CHAT = `${OUTFIT_STYLIST}

AHORA ESTAS EN CONVERSACION sobre unas propuestas ya mostradas al usuario (numeradas P1, P2...).
- Si pide cambiar algo de una propuesta, devuelve action "modify", el numero en "target" y en "changes" la funcion y el id de la prenda NUEVA (garment_id null para quitar esa funcion). Usa SOLO ids de PRENDAS DISPONIBLES y funciones validas para esa prenda.
- Si pregunta, opina o pide tu criterio, action "answer".
- Si cambia las condiciones (otra ocasion, clima, restricciones), action "regenerate" con "new_context" (mismos campos y valores que el interprete).
- Si quiere guardar una propuesta, action "save" con su "target".
- "reply": tu respuesta en espanol, 1-4 frases, como un estilista; explica el efecto del cambio (caracter, formalidad, color). Si una peticion no es buena idea, dilo y propon una alternativa de su armario.
- Mantén las demas prendas de la propuesta salvo que el usuario pida lo contrario.
- GUSTOS: ${DISLIKE_RULES} Puedes combinarlo con cualquier accion (p. ej. "modify" para quitar esa prenda de la propuesta).`

export const ChatSchema = z.object({
  reply: z.string().max(1200),
  action: z.enum(['modify', 'answer', 'regenerate', 'save']),
  target: z.number().int().min(1).max(10).nullable().default(null),
  changes: z.array(z.object({ role: z.string(), garment_id: z.string().nullable() })).max(4).default([]),
  new_context: ParsedSchema.partial().nullable().default(null),
  dislikes: DislikesSchema.default({ garment_ids: [], elements: [], colors: [] }),
})
export type ChatOut = z.infer<typeof ChatSchema>

export function chatPrompt(o: { context: string; profile: string; proposals: { n: number; name: string; items: { garment_id: string; role: string; title: string }[]; score: number }[]; available: { id: string; title: string; roles: string[]; color?: string | null; formality?: number | null }[]; history: { role: string; content: string }[]; message: string }) {
  return [
    `CONTEXTO: ${o.context}`, `PERFIL (resumen): ${o.profile}`, '',
    'PROPUESTAS ACTUALES:', ...o.proposals.map((p) => `P${p.n} «${p.name}» (${p.score}/100): ${p.items.map((i) => `${i.role}=${i.title} (${i.garment_id})`).join('; ')}`), '',
    `FUNCIONES VALIDAS: ${ITEM_ROLES.map((r) => r.id).join(', ')}`,
    'PRENDAS DISPONIBLES (id: prenda · funciones posibles · color · formalidad):', ...o.available.slice(0, 80).map((g) => `${g.id}: ${g.title} · ${g.roles.join('/')} · ${g.color ?? '—'} · ${g.formality ?? '—'}/5`), '',
    'CONVERSACION RECIENTE:', ...o.history.slice(-8).map((m) => `${m.role === 'user' ? 'Usuario' : 'Estilista'}: ${m.content.slice(0, 500)}`), '',
    tasteLists(), '',
    `MENSAJE DEL USUARIO: """${o.message.slice(0, 1000)}"""`, '',
    'Forma: {"reply":"...","action":"modify","target":2,"changes":[{"role":"footwear","garment_id":"<id>"}],"new_context":null,"dislikes":{"garment_ids":[],"elements":[],"colors":[]}}',
  ].join('\n')
}

/** Aplica los cambios propuestos por la IA a una propuesta, validando cada id y cada funcion. */
export function applyChanges(items: { garment_id: string; role: string }[], changes: ChatOut['changes'], available: Map<string, Record<string, any>>) {
  const errors: string[] = []
  let next = [...items]
  for (const c of changes) {
    if (!ITEM_ROLES.some((r) => r.id === c.role)) { errors.push(`Función desconocida («${c.role}»).`); continue }
    if (c.garment_id === null) { next = next.filter((i) => i.role !== c.role); continue }
    const g = available.get(c.garment_id)
    if (!g) { errors.push('La prenda propuesta no está en tu armario disponible: no la he usado.'); continue }
    if (!rolesFor(g).includes(c.role as never)) { errors.push(`«${g.title ?? g.name}» no puede ser ${roleLabel(c.role).toLowerCase()}.`); continue }
    const idx = next.findIndex((i) => i.role === c.role)
    next = next.filter((i) => i.garment_id !== c.garment_id || i.role === c.role)
    if (idx >= 0) next[next.findIndex((i) => i.role === c.role)] = { garment_id: c.garment_id, role: c.role }
    else next.push({ garment_id: c.garment_id, role: c.role })
  }
  return { items: next, errors }
}
