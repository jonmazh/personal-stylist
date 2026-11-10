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
