'use server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { getUser } from '@/lib/supabase/server'
import { WardrobeError } from '@/lib/wardrobe/service'
import { addToList, analyzeNeeds, archiveList, createList, createNeed, reassessNeed, removeFromList, setBudget, setPreferences, updateNeed } from '@/lib/shopping/service'
import { DEFAULT_PRIORITY_WEIGHTS } from '@/lib/shopping/priority'

/** Acciones de Compras (fase 4A). */
async function me() { const u = await getUser(); if (!u) redirect('/login'); return u }
const msg = (e: unknown) => (e instanceof WardrobeError || e instanceof Error ? e.message : 'Error')
const done = () => revalidatePath('/compras', 'layout')
const s = (f: FormData, k: string) => { const v = f.get(k); return typeof v === 'string' && v.trim() ? v.trim() : null }
const n = (f: FormData, k: string) => { const v = s(f, k); return v == null ? null : Number(v.replace(',', '.')) }
const go = (url: string, q: string) => redirect(`${url}${url.includes('?') ? '&' : '?'}${q}`)
const err = (url: string, e: unknown) => go(url, `error=${encodeURIComponent(msg(e))}`)

function specFrom(f: FormData) {
  return {
    category: s(f, 'category') ?? '', subcategory: s(f, 'subcategory'), colors: f.getAll('colors').map(String), cut: s(f, 'cut'), silhouette: s(f, 'silhouette'),
    formality_min: n(f, 'formality_min'), formality_max: n(f, 'formality_max'), seasons: f.getAll('seasons').map(String), occasions: f.getAll('occasions').map(String),
    materials: s(f, 'materials'), details: s(f, 'details'),
  }
}

export async function analyzeAction() {
  const { supabase, id } = await me()
  let r = { created: 0, reassessed: 0 }
  try { r = await analyzeNeeds(supabase, id) } catch (e) { err('/compras', e) }
  done(); go('/compras', `analyzed=${r.created}&reassessed=${r.reassessed}`)
}

export async function createNeedAction(f: FormData) {
  const { supabase, id } = await me()
  let nid = ''
  try {
    nid = await createNeed(supabase, id, {
      title: s(f, 'title') ?? '', type: s(f, 'type') ?? 'need', spec: specFrom(f), rationale: s(f, 'rationale'), price_min: n(f, 'price_min'), price_max: n(f, 'price_max'),
      target_date: s(f, 'target_date'), replaces_garment_id: s(f, 'replaces_garment_id'), user_priority: s(f, 'user_priority'),
    })
  } catch (e) { err('/compras', e) }
  done(); redirect(`/compras/necesidades/${nid}?created=1`)
}

export async function editNeedAction(f: FormData) {
  const { supabase, id } = await me()
  const nid = String(f.get('id'))
  try { await updateNeed(supabase, id, nid, { title: s(f, 'title') ?? '', spec: specFrom(f), price_min: n(f, 'price_min'), price_max: n(f, 'price_max'), target_date: s(f, 'target_date'), rationale: s(f, 'rationale') }) }
  catch (e) { err(`/compras/necesidades/${nid}`, e) }
  done(); go(`/compras/necesidades/${nid}`, 'saved=1')
}

export async function needStatusAction(f: FormData) {
  const { supabase, id } = await me()
  const nid = String(f.get('id')), back = s(f, 'back') ?? `/compras/necesidades/${nid}`
  try { await updateNeed(supabase, id, nid, { status: s(f, 'status'), discard_reason: s(f, 'discard_reason') }) } catch (e) { err(back, e) }
  done(); go(back, `status=${f.get('status')}`)
}

export async function needPriorityAction(f: FormData) {
  const { supabase, id } = await me()
  const nid = String(f.get('id'))
  try { await updateNeed(supabase, id, nid, { user_priority: s(f, 'user_priority') }) } catch (e) { err(`/compras/necesidades/${nid}`, e) }
  done(); go(`/compras/necesidades/${nid}`, 'saved=1')
}

export async function reassessAction(f: FormData) {
  const { supabase, id } = await me()
  const nid = String(f.get('id'))
  try { await reassessNeed(supabase, id, nid) } catch (e) { err(`/compras/necesidades/${nid}`, e) }
  done(); go(`/compras/necesidades/${nid}`, 'assessed=1')
}

// ── Listas ──
export async function createListAction(f: FormData) {
  const { supabase, id } = await me()
  try { const lid = await createList(supabase, id, { name: s(f, 'name') ?? '', description: s(f, 'description'), target_date: s(f, 'target_date') }); const nid = s(f, 'need_id'); if (nid) await addToList(supabase, id, lid, nid) }
  catch (e) { err(s(f, 'back') ?? '/compras/plan', e) }
  done(); go(s(f, 'back') ?? '/compras/plan', 'list=1')
}
export async function addToListAction(f: FormData) {
  const { supabase, id } = await me()
  const back = s(f, 'back') ?? '/compras/plan'
  try { await addToList(supabase, id, String(f.get('list_id')), String(f.get('need_id')), s(f, 'note')) } catch (e) { err(back, e) }
  done(); go(back, 'listed=1')
}
export async function removeFromListAction(f: FormData) {
  const { supabase } = await me()
  await removeFromList(supabase, String(f.get('list_id')), String(f.get('need_id')))
  done(); go('/compras/plan', 'removed=1')
}
export async function archiveListAction(f: FormData) {
  const { supabase } = await me()
  try { await archiveList(supabase, String(f.get('list_id'))) } catch (e) { err('/compras/plan', e) }
  done(); go('/compras/plan', 'archived=1')
}

// ── Presupuesto y preferencias ──
export async function budgetAction(f: FormData) {
  const { supabase, id } = await me()
  try { await setBudget(supabase, id, f.get('clear') ? null : { period: s(f, 'period'), amount: n(f, 'amount') ?? NaN, currency: s(f, 'currency') ?? 'EUR', starts_on: s(f, 'starts_on') ?? undefined }) }
  catch (e) { err('/compras/plan', e) }
  done(); go('/compras/plan', 'budget=1')
}
export async function preferencesAction(f: FormData) {
  const { supabase, id } = await me()
  const weights = Object.fromEntries(Object.keys(DEFAULT_PRIORITY_WEIGHTS).map((k) => [k, n(f, `w_${k}`) ?? 0]))
  try {
    await setPreferences(supabase, id, {
      preferred_retailers: f.getAll('preferred').map(String), excluded_retailers: f.getAll('excluded').map(String), priority_weights: f.get('reset_weights') ? null : weights,
      min_priority_to_suggest: n(f, 'min_priority_to_suggest') ?? 45, quality_over_price: f.get('quality_over_price') === 'on', notes: s(f, 'notes'),
    })
  } catch (e) { err('/compras/plan', e) }
  done(); go('/compras/plan', 'prefs=1')
}
