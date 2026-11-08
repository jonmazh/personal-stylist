import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getUser } from '@/lib/supabase/server'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getUser()
  if (!user) redirect('/login')
  return (
    <>
      <header className="top">
        <h1 className="display">Mi estilista</h1>
        <div className="tape" />
        <nav className="tabs">
          <Link href="/profile">Perfil</Link>
          <Link href="/stylist">Estilista</Link>
          <form action="/auth/signout" method="post"><button>Salir</button></form>
        </nav>
      </header>
      {children}
    </>
  )
}
