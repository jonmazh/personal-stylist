import { loadBundle } from '@/lib/profile/data'
import { garmentTitle } from '@/lib/wardrobe/display'
import { evaluationsForList } from '@/lib/wardrobe/eval-service'
import { WardrobeError, listGarments, type Sb } from '@/lib/wardrobe/service'
import { GenerateRequest } from './engine/context'
import { generate, type GenerationResult } from './engine/generate'
import { createOutfit, garmentsWithPhotos } from './service'
import { snapshotOf } from './taxonomy'

/** Outfit Engine (3B) con persistencia: se guarda la peticion, el contexto, los pesos, lo descartado y cada propuesta. */
const dbErr = (m: string) => new WardrobeError(/schema cache|does not exist/i.test(m) ? 'Ejecuta la migración 0012 en Supabase.' : m, 500)

/** Prepara lo que necesita el motor: armario activo (con titulo), perfil y evaluaciones de 2C. */
export async function prepareEngine(sb: Sb, uid: string) {
  const [rows, bundle] = await Promise.all([listGarments(sb, { status: 'active' }), loadBundle(sb, uid)])
  const garments = rows.map((g) => ({ ...g, title: garmentTitle(g) }))
  const evals = await evaluationsForList(sb, uid, garments, bundle)
  return { garments, bundle, evals, byId: new Map(garments.map((g) => [g.id as string, g])) }
}
export type Prepared = Awaited<ReturnType<typeof prepareEngine>>
export type StylistMeta = { name: string; why: string; when: string; limitations: string | null; model?: string; prompt_version?: string }

/** Guarda la peticion y las propuestas elegidas (con el texto del estilista si lo hay). */
export async function persistGeneration(sb: Sb, uid: string, out: GenerationResult, prep: Prepared, chosen: { p: GenerationResult['proposals'][number]; stylist?: StylistMeta }[], ms: number) {
  const { data: gen, error } = await sb.from('outfit_generations').insert({
    user_id: uid, engine_version: out.engine, request: out.request, context: out.ctx, weights: out.weights, stats: { ...out.stats, ms }, notes: out.notes,
  }).select('*').single()
  if (error) throw dbErr(error.message)
  let ids: string[] = []
  if (chosen.length) {
    const { data, error: re } = await sb.from('outfit_generation_results').insert(chosen.map(({ p: x, stylist }, i) => ({
      user_id: uid, generation_id: gen.id, rank: i + 1, intent: x.intent, name: stylist?.name || x.name, template: x.template, score: x.score, confidence: x.confidence,
      garment_ids: x.items.map((it) => it.garment_id), items: x.items.map((it) => ({ ...it, snapshot: snapshotOf(prep.byId.get(it.garment_id)!, it.title) })),
      breakdown: { criteria: x.criteria, confidenceWhy: x.confidenceWhy }, why: x.why, cons: x.criteria.flatMap((c) => c.cons).slice(0, 4), warnings: x.warnings, alternatives: x.alternatives,
      stylist: stylist ?? null,
    }))).select('id, rank')
    if (re) throw dbErr(re.message)
    ids = (data ?? []).sort((a, z) => a.rank - z.rank).map((r) => r.id as string)
  }
  return { id: gen.id as string, resultIds: ids }
}

export async function runGeneration(sb: Sb, uid: string, raw: unknown) {
  const p = GenerateRequest.safeParse(raw ?? {})
  if (!p.success) throw new WardrobeError(`Petición no válida: ${p.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`)
  const t0 = Date.now()
  const prep = await prepareEngine(sb, uid)
  const out = generate(p.data, prep.garments, prep.evals, prep.bundle)
  const gen = await persistGeneration(sb, uid, out, prep, out.proposals.map((x) => ({ p: x })), Date.now() - t0)
  await sb.from('ai_runs').insert({ user_id: uid, kind: 'outfit_generation', model: 'reglas', meta: { generation_id: gen.id, proposals: out.proposals.length, evaluated: out.stats.evaluated, ms: Date.now() - t0, cached: false } })
  return gen.id
}

export async function getGeneration(sb: Sb, id: string) {
  const { data: gen, error } = await sb.from('outfit_generations').select('*').eq('id', id).maybeSingle()
  if (error) throw dbErr(error.message)
  if (!gen) throw new WardrobeError('Generación no encontrada', 404)
  const { data: results } = await sb.from('outfit_generation_results').select('*').eq('generation_id', id).order('rank')
  const photos = await garmentsWithPhotos(sb, (results ?? []).flatMap((r) => r.garment_ids))
  return {
    ...gen,
    results: (results ?? []).map((r) => ({
      ...r,
      items: (r.items as { garment_id: string; role: string; title: string }[]).map((i) => { const g = photos.get(i.garment_id); return { ...i, thumb_url: g?.thumb_url ?? null, state: !g ? 'missing' : g.wardrobe_status === 'active' ? 'active' : g.wardrobe_status } }),
      alternatives: (r.alternatives as { garment_id: string }[]).map((a) => ({ ...a, thumb_url: photos.get(a.garment_id)?.thumb_url ?? null })),
    })),
  }
}
export type GenerationView = Awaited<ReturnType<typeof getGeneration>>

export async function listGenerations(sb: Sb, limit = 10) {
  const { data, error } = await sb.from('outfit_generations').select('id, request, context, created_at, stats, outfit_generation_results(id, status)').order('created_at', { ascending: false }).limit(limit)
  if (error) { if (/schema cache|does not exist/i.test(error.message)) return []; throw dbErr(error.message) }
  return data ?? []
}

/** Guardar una propuesta como conjunto propio (origen «generator», con su puntuacion y confianza). */
export async function saveProposal(sb: Sb, uid: string, resultId: string, name?: string | null) {
  const { data: r } = await sb.from('outfit_generation_results').select('*, outfit_generations(request, context)').eq('id', resultId).maybeSingle()
  if (!r) throw new WardrobeError('Propuesta no encontrada', 404)
  if (r.saved_outfit_id) return { id: r.saved_outfit_id as string, warnings: [] as string[], already: true }
  const req = r.outfit_generations?.request ?? {}, ctx = r.outfit_generations?.context ?? {}
  const items = r.items as { garment_id: string; role: string; snapshot?: { formality_level?: number } }[]
  const fs = items.map((i) => i.snapshot?.formality_level).filter(Boolean) as number[]
  const res = await createOutfit(sb, uid, {
    name: (name?.trim() || r.name).slice(0, 120), occasion: req.occasion ?? null, formality_level: fs.length ? Math.round(fs.reduce((a, b) => a + b, 0) / fs.length) : null,
    seasons: ctx.season ? [ctx.season] : [], description: (r.why as string[]).join(' ').slice(0, 1000) || null, status: 'saved',
  }, items.map((i) => ({ garment_id: i.garment_id, role: i.role })), { source: 'generator', score: Number(r.score), confidence: r.confidence, resultId })
  await sb.from('outfit_generation_results').update({ status: 'saved', saved_outfit_id: res.id }).eq('id', resultId)
  return { ...res, already: false }
}

export async function dismissProposal(sb: Sb, resultId: string) {
  const { data } = await sb.from('outfit_generation_results').update({ status: 'dismissed' }).eq('id', resultId).eq('status', 'proposed').select('id').maybeSingle()
  if (!data) throw new WardrobeError('Propuesta no encontrada o ya guardada', 404)
}
