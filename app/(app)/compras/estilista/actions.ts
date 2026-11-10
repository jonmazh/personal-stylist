'use server'
import { redirect } from 'next/navigation'
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
