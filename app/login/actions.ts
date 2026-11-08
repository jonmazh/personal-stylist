'use server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'

const Creds = z.object({ email: z.email(), password: z.string().min(8) })

async function auth(mode: 'in' | 'up', formData: FormData) {
  const parsed = Creds.safeParse({ email: formData.get('email'), password: formData.get('password') })
  if (!parsed.success) redirect('/login?error=' + encodeURIComponent('Email valido y contrasena de 8+ caracteres'))
  const supabase = await createClient()
  const { error } =
    mode === 'in' ? await supabase.auth.signInWithPassword(parsed.data) : await supabase.auth.signUp(parsed.data)
  if (error) redirect('/login?error=' + encodeURIComponent(error.message))
  revalidatePath('/', 'layout')
  redirect(mode === 'up' ? '/login?info=' + encodeURIComponent('Revisa tu email para confirmar la cuenta') : '/profile')
}
export const login = async (f: FormData) => auth('in', f)
export const signup = async (f: FormData) => auth('up', f)
