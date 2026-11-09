'use server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { getUser } from '@/lib/supabase/server'
import { WardrobeError } from '@/lib/wardrobe/service'
import { addFeedback, decidePattern, registerWear } from '@/lib/outfits/feedback-service'
import { acceptSuggestion, createFormula, deleteFormula, formulaFromOutfit, saveFormulaCombo, setFormulaStatus } from '@/lib/outfits/formula-service'
import { evaluateTheoretical, evaluateVisual, deleteEvaluationPhoto } from '@/lib/outfits/evaluator-service'

/** Acciones de la fase 3D: valoraciones, uso, aprendizaje, fórmulas y evaluaciones. */
async function me() { const u = await getUser(); if (!u) redirect('/login'); return u }
const msg = (e: unknown) => (e instanceof WardrobeError || e instanceof Error ? e.message : 'Error')
const done = () => { revalidatePath('/outfits', 'layout'); revalidatePath('/armario', 'layout') }
const s = (f: FormData, k: string) => { const v = f.get(k); return typeof v === 'string' && v ? v : null }
const back = (f: FormData, fallback: string) => s(f, 'back') ?? fallback
const go = (url: string, q: string) => redirect(`${url}${url.includes('?') ? '&' : '?'}${q}`)

export async function feedbackAction(f: FormData) {
  const { supabase, id } = await me()
  const to = back(f, '/outfits')
  try {
    await addFeedback(supabase, id, {
      outfit_id: s(f, 'outfit_id') ?? undefined, result_id: s(f, 'result_id') ?? undefined, rating: s(f, 'rating'),
      flags: f.getAll('flags').map(String), reasons: s(f, 'rating') === 'dislike' ? f.getAll('reasons').map(String) : [], garment_id: s(f, 'garment_id'), note: s(f, 'note'),
    })
  } catch (e) { go(to, `error=${encodeURIComponent(msg(e))}`) }
  done(); go(to, 'rated=1')
}

export async function wearAction(f: FormData) {
  const { supabase, id } = await me()
  const oid = String(f.get('outfit_id'))
  try { await registerWear(supabase, id, oid, { worn_on: s(f, 'worn_on') ?? undefined, comfortable: f.get('comfortable') === 'on' ? true : null, well_dressed: f.get('well_dressed') === 'on' ? true : null, note: s(f, 'note') }) }
  catch (e) { go(`/outfits/${oid}`, `error=${encodeURIComponent(msg(e))}`) }
  done(); go(`/outfits/${oid}`, 'worn=1')
}

export async function patternAction(f: FormData) {
  const { supabase, id } = await me()
  try { await decidePattern(supabase, id, String(f.get('key')), String(f.get('action')) as 'confirm' | 'dismiss' | 'reset') } catch (e) { go('/outfits/aprendizaje', `error=${encodeURIComponent(msg(e))}`) }
  done(); go('/outfits/aprendizaje', `decided=${f.get('action')}`)
}

// ── Fórmulas ──
export async function formulaFromOutfitAction(f: FormData) {
  const { supabase, id } = await me()
  let fid = ''
  try { fid = await formulaFromOutfit(supabase, id, String(f.get('outfit_id'))) } catch (e) { go(`/outfits/${f.get('outfit_id')}`, `error=${encodeURIComponent(msg(e))}`) }
  done(); redirect(`/outfits/formulas/${fid}?created=1`)
}
export async function createFormulaAction(f: FormData) {
  const { supabase, id } = await me()
  const slots = [0, 1, 2, 3, 4, 5].map((i) => ({ role: s(f, `role_${i}`), sub: s(f, `sub_${i}`), cut: s(f, `cut_${i}`), fmin: Number(f.get(`fmin_${i}`)) || null, fmax: Number(f.get(`fmax_${i}`)) || null, optional: f.get(`opt_${i}`) === 'on' }))
    .filter((x) => x.role).map((x) => ({ role: x.role, subcategories: x.sub ? [x.sub] : [], colors: [], cuts: x.cut ? [x.cut] : [], formality_min: x.fmin, formality_max: x.fmax, optional: x.optional }))
  let fid = ''
  try { fid = await createFormula(supabase, id, { name: s(f, 'name') ?? '', description: s(f, 'description'), slots }) } catch (e) { go('/outfits/formulas', `error=${encodeURIComponent(msg(e))}`) }
  done(); redirect(`/outfits/formulas/${fid}?created=1`)
}
export async function acceptFormulaAction(f: FormData) {
  const { supabase, id } = await me()
  let fid = ''
  try { fid = await acceptSuggestion(supabase, id, String(f.get('signature')), s(f, 'name') ?? '') } catch (e) { go('/outfits/formulas', `error=${encodeURIComponent(msg(e))}`) }
  done(); redirect(`/outfits/formulas/${fid}?created=1`)
}
export async function formulaStatusAction(f: FormData) {
  const { supabase } = await me()
  const fid = String(f.get('id'))
  try { if (f.get('status') === 'delete') { await deleteFormula(supabase, fid); done(); redirect('/outfits/formulas?deleted=1') } await setFormulaStatus(supabase, fid, String(f.get('status'))) } catch (e) { if (e instanceof WardrobeError) go(`/outfits/formulas/${fid}`, `error=${encodeURIComponent(msg(e))}`); throw e }
  done(); go(`/outfits/formulas/${fid}`, 'status=1')
}
export async function saveFormulaComboAction(f: FormData) {
  const { supabase, id } = await me()
  const fid = String(f.get('formula_id'))
  let oid = ''
  try { oid = (await saveFormulaCombo(supabase, id, fid, JSON.parse(String(f.get('items'))))).id } catch (e) { go(`/outfits/formulas/${fid}`, `error=${encodeURIComponent(msg(e))}`) }
  done(); redirect(`/outfits/${oid}?saved=1`)
}

// ── Evaluaciones ──
export async function evaluateTheoreticalAction(f: FormData) {
  const { supabase, id } = await me()
  const outfit = s(f, 'outfit_id')
  const items = f.getAll('garment').map(String).map((gid) => ({ garment_id: gid, role: s(f, `role_${gid}`) ?? '' }))
  let eid = ''
  try { eid = await evaluateTheoretical(supabase, id, outfit ? { outfit_id: outfit } : { items, occasion: s(f, 'occasion'), dress_code: s(f, 'dress_code'), weather: s(f, 'weather') }) }
  catch (e) { go(outfit ? `/outfits/${outfit}` : '/outfits/evaluar', `error=${encodeURIComponent(msg(e))}`) }
  done(); redirect(`/outfits/evaluaciones/${eid}`)
}
/** La foto ya se ha subido desde el navegador a outfits-private/<usuario>/…; aquí se analiza (y se borra si no la conservas). */
export async function evaluateVisualAction(input: { photo_path: string; outfit_id?: string | null; keep_photo: boolean }): Promise<{ id?: string; error?: string }> {
  const { supabase, id } = await me()
  try { const eid = await evaluateVisual(supabase, id, input); done(); return { id: eid } } catch (e) { return { error: msg(e) } }
}
export async function deleteEvaluationPhotoAction(f: FormData) {
  const { supabase } = await me()
  const eid = String(f.get('id'))
  await deleteEvaluationPhoto(supabase, eid)
  done(); redirect(`/outfits/evaluaciones/${eid}?photo_deleted=1`)
}
