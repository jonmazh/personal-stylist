import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export async function createClient() {
  const cookieStore = await cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll(list) {
          try {
            list.forEach(({ name, value, options }) => cookieStore.set(name, value, options))
          } catch {
            // Server Component: el proxy ya refresca la sesion.
          }
        },
      },
    }
  )
}

/** Usuario verificado (getClaims valida el JWT). Devuelve null si no hay sesion. */
export async function getUser() {
  const supabase = await createClient()
  const { data } = await supabase.auth.getClaims()
  const claims = data?.claims
  return claims?.sub ? { id: claims.sub as string, email: (claims.email as string | undefined) ?? '', supabase } : null
}
