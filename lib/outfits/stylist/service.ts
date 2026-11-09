import { configError, MODEL_CHAT, providerId } from '@/lib/ai/client'
import { effectiveModel, generateStructured, newUsage, type Usage } from '@/lib/ai/structured'
import { colorimetry } from '@/lib/profile/blueprint'
import type { Bundle } from '@/lib/profile/data'
import { styleProfileOf } from '@/lib/style/dna'
import { styleName } from '@/lib/style/catalog'
import { WardrobeError, type Sb } from '@/lib/wardrobe/service'
import { GenerateRequest, resolveContext, type GenerateRequestT } from '../engine/context'
import { eligible, generate } from '../engine/generate'
import { scoreEnv, scoreOutfit } from '../engine/scoring'
import { prepareEngine, persistGeneration, saveProposal, type Prepared, type StylistMeta } from '../generate-service'
import { garmentsWithPhotos } from '../service'
import { checkComposition, rolesFor, snapshotOf } from '../taxonomy'
import {
  CONTEXT_PARSER, ChatSchema, OUTFIT_STYLIST, PARSER_VERSION, ParsedSchema, STYLIST_CHAT, STYLIST_VERSION, SelectionSchema, applyChanges, chatPrompt,
  keywordParse, normalizeParsed, parserUserPrompt, selectionPrompt, validateSelection, type CandidateView,
} from './contracts'

/**
 * Outfit Stylist AI (fase 3C): sesiones de conversacion.
 * Flujo: peticion en lenguaje natural → interprete (IA) → motor (3B) → la IA elige y explica entre candidatas validadas
 * → conversacion: la IA propone cambios con ids, el motor los valida y vuelve a puntuar. Sin IA, funciona con
 * palabras clave y los textos del motor.
 */
const dbErr = (m: string) => new WardrobeError(/schema cache|does not exist/i.test(m) ? 'Ejecuta la migración 0013 en Supabase.' : m, 500)
type Row = Record<string, any>
const aiOn = () => !configError()
const model = () => `${providerId()}:${effectiveModel('chat', MODEL_CHAT())}`
const log = (sb: Sb, uid: string, kind: string, meta: Row) => sb.from('ai_runs').insert({ user_id: uid, kind, model: meta.model ?? model(), meta })

/** Resumen corto del perfil para la IA (no se envian datos sensibles como medidas exactas o fotos). */
export function profileSummary(b: Bundle) {
  const p = styleProfileOf(b), c = colorimetry(b)
  return [
    p.identity.influences.length ? `estilo ${p.identity.influences.map((i) => `${styleName(i.style)} ${i.weight}%`).join(', ')} (${p.identity.source})` : 'estilo sin definir',
    c.temp ? `temperatura ${c.temp.toLowerCase()}` : null, b.color?.likes?.length ? `le gustan ${b.color.likes.join(', ')}` : null, b.color?.avoids?.length ? `evita ${b.color.avoids.join(', ')}` : null,
    b.profile?.fit_pref ? `ajuste preferido ${String(b.profile.fit_pref).toLowerCase()}` : null, b.life?.work_formality ? `trabajo ${String(b.life.work_formality).toLowerCase()}` : null,
    p.elements.rejected.length ? `rechaza ${p.elements.rejected.map((e) => e.element).join(', ')}` : null,
  ].filter(Boolean).join('; ')
}
const ctxText = (out: { ctx: Row }) => `${(out.ctx.summary ?? []).join(' · ') || 'sin ocasión concreta'}; formalidad ${out.ctx.formality?.join('–')}/5; temporada ${out.ctx.seasonLabel ?? out.ctx.season}`

/** 1-2: interpreta la peticion (IA o palabras clave) y la combina con los ajustes del usuario. */
async function interpret(sb: Sb, uid: string, text: string, prep: Prepared, overrides: Partial<GenerateRequestT>) {
  const inventory = new Set(prep.garments.map((g) => g.id as string))
  let parsed: Partial<GenerateRequestT> = {}, interpretation: Row = { parser: 'palabras clave', assumptions: [], dropped: [] }
  if (aiOn() && text.trim()) {
    try {
      const usage = newUsage()
      const ai = await generateStructured({ kind: 'chat', model: MODEL_CHAT(), schema: ParsedSchema, system: CONTEXT_PARSER, user: parserUserPrompt(text, prep.garments.map((g) => ({ id: g.id, title: g.title }))), usage })
      const n = normalizeParsed(ai, inventory)
      parsed = n.request; interpretation = { parser: PARSER_VERSION, model: model(), assumptions: n.assumptions, dropped: n.dropped }
      await log(sb, uid, 'stylist_parse', { usage, dropped: n.dropped.length })
    } catch (e) { parsed = keywordParse(text); interpretation = { parser: 'palabras clave', assumptions: [], dropped: [], error: e instanceof Error ? e.message.slice(0, 200) : 'error' } }
  } else if (text.trim()) parsed = keywordParse(text)
  const clean = (o: Row) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== null && v !== undefined && !(Array.isArray(v) && !v.length)))
  const merged = { ...clean(parsed), ...clean(overrides) }
  const r = GenerateRequest.safeParse(merged)
  if (!r.success) throw new WardrobeError('No he podido interpretar la petición.')
  return { request: r.data, interpretation }
}

/** 3-5: motor + seleccion explicada por la IA (o el orden del motor si no hay IA). */
async function propose(sb: Sb, uid: string, request: GenerateRequestT, prep: Prepared, textRequest: string) {
  const t0 = Date.now()
  const n = request.number_of_outfits
  const out = generate({ ...request, number_of_outfits: 5 }, prep.garments, prep.evals, prep.bundle)
  const keys = out.proposals.map((_, i) => `C${i + 1}`)
  let chosen: { p: (typeof out.proposals)[number]; stylist?: StylistMeta }[] = out.proposals.slice(0, n).map((p) => ({ p }))
  let intro = '', aiNote: string | null = null, selectionDropped: string[] = []
  if (aiOn() && out.proposals.length) {
    try {
      const usage = newUsage()
      const cands: CandidateView[] = out.proposals.map((p, i) => ({ key: keys[i], intent: p.intent, score: p.score, confidence: p.confidence, items: p.items.map((it) => ({ ...it, color: prep.byId.get(it.garment_id)?.primary_color })), why: p.why, cons: p.criteria.flatMap((c) => c.cons).slice(0, 3) }))
      const sel = await generateStructured({ kind: 'chat', model: MODEL_CHAT(), schema: SelectionSchema, system: OUTFIT_STYLIST, usage, user: selectionPrompt({ request: textRequest || 'petición con filtros', context: ctxText(out), profile: profileSummary(prep.bundle), candidates: cands, n }) })
      const v = validateSelection(sel, keys, n)
      const picked = v.proposals.map((s) => ({ p: out.proposals[keys.indexOf(s.candidate)], stylist: { name: s.name, why: s.why, when: s.when, limitations: s.limitations, model: model(), prompt_version: STYLIST_VERSION } }))
      // Si la IA elige menos de las pedidas, se completan con el orden del motor
      for (const p of out.proposals) { if (picked.length >= n) break; if (!picked.some((x) => x.p === p)) picked.push({ p, stylist: undefined as never }) }
      chosen = picked.map((x) => (x.stylist ? x : { p: x.p }))
      intro = sel.intro
      if (v.dropped.length) selectionDropped = v.dropped
      await log(sb, uid, 'stylist_select', { usage, candidates: keys.length, chosen: chosen.length, dropped: v.dropped })
    } catch (e) { aiNote = `El estilista con IA no ha respondido (${e instanceof Error ? e.message.slice(0, 120) : 'error'}): te muestro el orden del motor.` }
  }
  const gen = await persistGeneration(sb, uid, { ...out, request }, prep, chosen, Date.now() - t0)
  await log(sb, uid, 'outfit_generation', { model: 'reglas', generation_id: gen.id, proposals: chosen.length, evaluated: out.stats.evaluated, ms: Date.now() - t0, cached: false })
  return { gen, out, intro, aiNote, selectionDropped }
}

const summaryLine = (out: { ctx: Row; stats: Row }, n: number) => `${n ? `Te propongo ${n} conjunto${n === 1 ? '' : 's'} con tu ropa` : 'No he encontrado conjuntos completos con tu armario para esto'} (${ctxText(out)}). He evaluado ${out.stats.evaluated} combinaciones de ${out.stats.eligible} prendas disponibles.`

export async function startSession(sb: Sb, uid: string, text: string, overrides: Partial<GenerateRequestT> = {}) {
  if (!text.trim() && !Object.keys(overrides).length) throw new WardrobeError('Cuéntame qué necesitas (la ocasión, el clima, lo que quieres o no quieres llevar).')
  const prep = await prepareEngine(sb, uid)
  const { request, interpretation } = await interpret(sb, uid, text, prep, overrides)
  const { gen, out, intro, aiNote, selectionDropped } = await propose(sb, uid, request, prep, text)
  const current = Object.fromEntries(gen.resultIds.map((id, i) => [String(i + 1), id]))
  const words = text.trim().split(/\s+/), short = words.reduce((a, w) => (a.length + w.length < 60 ? `${a} ${w}`.trim() : a), '')
  const title = out.ctx.summary?.length ? out.ctx.summary.join(' · ') : short ? `${short}${short.length < text.trim().length ? '…' : ''}` : 'Petición con filtros'
  const { data: s, error } = await sb.from('stylist_sessions').insert({ user_id: uid, title, request, interpretation, generation_id: gen.id, current }).select('id').single()
  if (error) throw dbErr(error.message)
  const reply = [intro, summaryLine(out, gen.resultIds.length), ...out.notes, aiNote].filter(Boolean).join(' ')
  await sb.from('stylist_messages').insert([
    { user_id: uid, session_id: s.id, role: 'user', content: text.trim() || 'Petición con filtros' },
    { user_id: uid, session_id: s.id, role: 'assistant', content: reply, payload: { action: 'propose', results: gen.resultIds, generation_id: gen.id, interpretation: { ...interpretation, selection_dropped: selectionDropped } } },
  ])
  return s.id as string
}

/** Propuestas vigentes de la sesion (P1, P2... = ultima version de cada una). */
async function currentProposals(sb: Sb, session: Row) {
  const ids = Object.values(session.current ?? {}) as string[]
  const { data } = ids.length ? await sb.from('outfit_generation_results').select('*').in('id', ids) : { data: [] as Row[] }
  return Object.entries(session.current ?? {}).map(([n, id]) => ({ n: Number(n), r: (data ?? []).find((x) => x.id === id)! })).filter((x) => x.r).sort((a, z) => a.n - z.n)
}

export async function sendMessage(sb: Sb, uid: string, sessionId: string, text: string) {
  const msg = text.trim().slice(0, 1000)
  if (!msg) throw new WardrobeError('Escribe un mensaje.')
  const { data: session } = await sb.from('stylist_sessions').select('*').eq('id', sessionId).maybeSingle()
  if (!session) throw new WardrobeError('Conversación no encontrada', 404)
  await sb.from('stylist_messages').insert({ user_id: uid, session_id: sessionId, role: 'user', content: msg })
  const say = async (content: string, payload: Row) => { await sb.from('stylist_messages').insert({ user_id: uid, session_id: sessionId, role: 'assistant', content, payload }); await sb.from('stylist_sessions').update({ updated_at: new Date().toISOString() }).eq('id', sessionId) }
  if (!aiOn()) { await say('Para conversar sobre las propuestas necesito el estilista con IA configurado. Mientras, puedes editar cualquier propuesta después de guardarla.', { action: 'answer', error: 'sin IA' }); return }

  const prep = await prepareEngine(sb, uid)
  const request = GenerateRequest.parse(session.request)
  const ctx = resolveContext(request)
  const pool = eligible(prep.garments, ctx).ok
  const available = new Map(pool.map((g) => [g.id as string, g]))
  const props = await currentProposals(sb, session)
  // Las prendas que ya estan en las propuestas siguen siendo validas aunque el filtro de hoy las deje fuera
  for (const { r } of props) for (const i of r.items as Row[]) { const g = prep.byId.get(i.garment_id); if (g && !available.has(g.id)) available.set(g.id, g) }
  const { data: hist } = await sb.from('stylist_messages').select('role, content').eq('session_id', sessionId).order('created_at').limit(40)
  const usage: Usage = newUsage()
  let out
  try {
    out = await generateStructured({ kind: 'chat', model: MODEL_CHAT(), schema: ChatSchema, system: STYLIST_CHAT, usage, user: chatPrompt({
      context: `${request.occasion ?? 'sin ocasión'}; ${ctx.summary.join(' · ')}; formalidad ${ctx.formality.join('–')}/5`, profile: profileSummary(prep.bundle),
      proposals: props.map(({ n, r }) => ({ n, name: r.name, score: Math.round(Number(r.score)), items: r.items })),
      available: [...available.values()].map((g) => ({ id: g.id, title: g.title, roles: rolesFor(g), color: g.primary_color, formality: g.formality_level })),
      history: (hist ?? []).slice(0, -1), message: msg,
    }) })
  } catch (e) { await say('No he podido responder ahora mismo. Inténtalo de nuevo en un momento.', { action: 'error', error: e instanceof Error ? e.message.slice(0, 200) : 'error' }); return }
  await log(sb, uid, 'stylist_chat', { usage, action: out.action, session_id: sessionId })
  const target = out.target ? props.find((p) => p.n === out.target) : undefined

  if (out.action === 'modify') {
    if (!target) { await say(`${out.reply} (No sé a qué propuesta te refieres: dime su número.)`, { action: 'answer' }); return }
    const { items, errors } = applyChanges((target.r.items as Row[]).map((i) => ({ garment_id: i.garment_id, role: i.role })), out.changes, available)
    const same = JSON.stringify(items) === JSON.stringify((target.r.items as Row[]).map((i) => ({ garment_id: i.garment_id, role: i.role })))
    const comp = checkComposition(items, available).filter((p) => p.level === 'error')
    if (same || comp.length) {
      await say(`${errors.length || comp.length ? 'No he podido aplicar ese cambio: ' : ''}${[...errors, ...comp.map((c) => c.text)].join(' ') || 'No he identificado qué cambiar.'} ${errors.length || comp.length ? 'Dime qué prenda de tu armario prefieres.' : out.reply}`.trim(), { action: 'rejected', target: target.n, errors: [...errors, ...comp.map((c) => c.text)] })
      return
    }
    const env = scoreEnv(ctx, prep.bundle, prep.evals, request.weights)
    const slots = items.map((i) => ({ role: i.role, g: available.get(i.garment_id)! }))
    const sc = scoreOutfit(slots, env)
    const titles = new Map(slots.map((s) => [s.g.id as string, s.g.title as string]))
    const { data: nr, error } = await sb.from('outfit_generation_results').insert({
      user_id: uid, generation_id: target.r.generation_id, rank: target.n, intent: target.r.intent, name: target.r.name, template: target.r.template, score: sc.total, confidence: sc.confidence,
      garment_ids: items.map((i) => i.garment_id), items: items.map((i) => ({ ...i, title: titles.get(i.garment_id), snapshot: snapshotOf(available.get(i.garment_id)!, titles.get(i.garment_id)!) })),
      breakdown: { criteria: sc.criteria, confidenceWhy: sc.confidenceWhy }, why: sc.criteria.filter((c) => c.value >= 0.75).map((c) => c.reasons.find((x) => !c.cons.includes(x))).filter(Boolean).slice(0, 3),
      cons: sc.criteria.flatMap((c) => c.cons).slice(0, 4), warnings: [...sc.warnings, ...errors], alternatives: [], origin: 'stylist_edit', parent_result_id: target.r.id,
      stylist: { name: target.r.name, why: out.reply, when: '', limitations: null, model: model(), prompt_version: STYLIST_VERSION },
    }).select('id').single()
    if (error) throw dbErr(error.message)
    await sb.from('stylist_sessions').update({ current: { ...session.current, [String(target.n)]: nr.id } }).eq('id', sessionId)
    const delta = sc.total - Math.round(Number(target.r.score))
    await say(`${out.reply}${errors.length ? ` (${errors.join(' ')})` : ''} Según el motor: compatibilidad ${Math.round(Number(target.r.score))} → ${sc.total} (${delta >= 0 ? '+' : ''}${delta}).`, { action: 'modify', target: target.n, result_id: nr.id, parent_id: target.r.id, delta, errors })
    return
  }
  if (out.action === 'regenerate') {
    const n = normalizeParsed(ParsedSchema.parse({ ...(out.new_context ?? {}) }), new Set(prep.garments.map((g) => g.id as string)))
    const clean = Object.fromEntries(Object.entries(n.request).filter(([, v]) => v !== null && v !== undefined && !(Array.isArray(v) && !v.length)))
    const next = GenerateRequest.parse({ ...request, ...clean })
    const { gen, out: eo, intro, aiNote, selectionDropped } = await propose(sb, uid, next, prep, msg)
    const current = Object.fromEntries(gen.resultIds.map((id, i) => [String(i + 1), id]))
    await sb.from('stylist_sessions').update({ request: next, generation_id: gen.id, current }).eq('id', sessionId)
    await say([out.reply, intro, summaryLine(eo, gen.resultIds.length), ...eo.notes, aiNote].filter(Boolean).join(' '), { action: 'propose', results: gen.resultIds, generation_id: gen.id, interpretation: { parser: PARSER_VERSION, assumptions: n.assumptions, dropped: n.dropped, selection_dropped: selectionDropped } })
    return
  }
  if (out.action === 'save') {
    if (!target) { await say(`${out.reply} (Dime el número de la propuesta que quieres guardar.)`, { action: 'answer' }); return }
    const sv = await saveProposal(sb, uid, target.r.id)
    await say(`${out.reply} Guardado en tus conjuntos.`, { action: 'save', target: target.n, outfit_id: sv.id })
    return
  }
  await say(out.reply, { action: 'answer', target: target?.n ?? null })
}

export async function getSession(sb: Sb, id: string) {
  const { data: s, error } = await sb.from('stylist_sessions').select('*').eq('id', id).maybeSingle()
  if (error) throw dbErr(error.message)
  if (!s) throw new WardrobeError('Conversación no encontrada', 404)
  const { data: msgs } = await sb.from('stylist_messages').select('*').eq('session_id', id).order('created_at')
  const ids = [...new Set((msgs ?? []).flatMap((m) => [...(m.payload?.results ?? []), m.payload?.result_id].filter(Boolean)))] as string[]
  const { data: results } = ids.length ? await sb.from('outfit_generation_results').select('*').in('id', ids) : { data: [] as Row[] }
  const photos = await garmentsWithPhotos(sb, (results ?? []).flatMap((r) => r.garment_ids))
  const enriched = new Map((results ?? []).map((r) => [r.id as string, {
    ...r,
    items: (r.items as Row[]).map((i) => { const g = photos.get(i.garment_id); return { ...i, thumb_url: g?.thumb_url ?? null, state: !g ? 'missing' : g.wardrobe_status === 'active' ? 'active' : g.wardrobe_status } }),
    alternatives: (r.alternatives as Row[]).map((a) => ({ ...a, thumb_url: photos.get(a.garment_id)?.thumb_url ?? null })),
  }]))
  const currentIds = new Set(Object.values(s.current ?? {}) as string[])
  const numberOf = new Map(Object.entries(s.current ?? {}).map(([n, rid]) => [rid as string, Number(n)]))
  return { ...s, messages: msgs ?? [], results: enriched, currentIds, numberOf }
}
export type SessionView = Awaited<ReturnType<typeof getSession>>

export async function listSessions(sb: Sb, limit = 10) {
  const { data, error } = await sb.from('stylist_sessions').select('id, title, request, updated_at').order('updated_at', { ascending: false }).limit(limit)
  if (error) { if (/schema cache|does not exist/i.test(error.message)) return []; throw dbErr(error.message) }
  return data ?? []
}
