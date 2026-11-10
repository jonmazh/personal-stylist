'use server'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { getUser } from '@/lib/supabase/server'
import { wardrobeAnalysis } from '@/lib/stylist/service'

export async function refreshAnalysisAction() {
  const user = await getUser(); if (!user) redirect('/login')
  await wardrobeAnalysis(user.supabase, user.id, { force: true })
  redirect('/compras/estilista?updated=1')
}

export async function researchTrendsAction() {
  const user = await getUser(); if (!user) redirect('/login')
  const { trendResearch } = await import('@/lib/stylist/trend-service')
  await trendResearch(user.supabase, user.id, { force: true })
  redirect('/compras/estilista?trends=1#tendencias')
}

export async function opportunityStatusAction(form: FormData) {
  const user = await getUser(); if (!user) redirect('/login')
  const { setOpportunityStatus } = await import('@/lib/stylist/service')
  await setOpportunityStatus(user.supabase, String(form.get('id')), String(form.get('status')))
  revalidatePath('/compras/estilista')
  redirect(`/compras/estilista?op=${Date.now()}#oportunidades`)
}
export async function refreshStrategyAction() {
  const user = await getUser(); if (!user) redirect('/login')
  const { styleStrategy } = await import('@/lib/stylist/service')
  await styleStrategy(user.supabase, user.id, { force: true })
  redirect('/compras/estilista?strategy=1#oportunidades')
}

export async function searchOpportunityAction(form: FormData) {
  const user = await getUser(); if (!user) redirect('/login')
  const { searchForOpportunity } = await import('@/lib/shopping/catalog-service')
  let id: string
  try { id = (await searchForOpportunity(user.supabase, user.id, String(form.get('id')), { force: form.get('force') === '1' })).id }
  catch (e) { redirect(`/compras/estilista?error=${encodeURIComponent((e as Error).message)}#oportunidades`) }
  redirect(`/compras/buscar?s=${id}`)
}

/** Valoración de un producto, una oportunidad o una tendencia (los campos «ctx_*» describen a qué se refiere). */
export async function feedbackAction(form: FormData) {
  const user = await getUser(); if (!user) redirect('/login')
  const { addFeedback } = await import('@/lib/stylist/service')
  const context = Object.fromEntries([...form.entries()].filter(([k, v]) => k.startsWith('ctx_') && String(v)).map(([k, v]) => [k.slice(4), String(v)]))
  try { await addFeedback(user.supabase, user.id, { target_kind: String(form.get('target_kind')), target_ref: String(form.get('target_ref')), reason: String(form.get('reason')), context }) }
  catch (e) { redirect(`/compras/estilista?error=${encodeURIComponent((e as Error).message)}`) }
  revalidatePath('/compras/estilista')
  redirect(`/compras/estilista?fb=${Date.now()}${form.get('back') ? `#${form.get('back')}` : ''}`)
}
export async function undoFeedbackAction(form: FormData) {
  const user = await getUser(); if (!user) redirect('/login')
  const { deleteFeedback } = await import('@/lib/stylist/service')
  await deleteFeedback(user.supabase, String(form.get('id')))
  revalidatePath('/compras/estilista')
  redirect(`/compras/estilista?fb=${Date.now()}#aprendido`)
}
