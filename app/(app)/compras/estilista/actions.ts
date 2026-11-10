'use server'
import { redirect } from 'next/navigation'
import { getUser } from '@/lib/supabase/server'
import { wardrobeAnalysis } from '@/lib/stylist/service'

export async function refreshAnalysisAction() {
  const user = await getUser(); if (!user) redirect('/login')
  await wardrobeAnalysis(user.supabase, user.id, { force: true })
  redirect('/compras/estilista?updated=1')
}
