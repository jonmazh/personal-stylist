import { type EmailOtpType } from '@supabase/supabase-js'
import { type NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const token_hash = searchParams.get('token_hash')
  const type = searchParams.get('type') as EmailOtpType | null
  const redirectTo = request.nextUrl.clone()
  redirectTo.pathname = '/profile'
  redirectTo.search = ''
  if (token_hash && type) {
    const supabase = await createClient()
    const { error } = await supabase.auth.verifyOtp({ type, token_hash })
    if (!error) return NextResponse.redirect(redirectTo)
  }
  redirectTo.pathname = '/login'
  redirectTo.searchParams.set('error', 'El enlace no es valido o ha caducado')
  return NextResponse.redirect(redirectTo)
}
