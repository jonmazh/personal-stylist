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
