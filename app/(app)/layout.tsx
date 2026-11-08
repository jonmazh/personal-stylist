import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getUser } from '@/lib/supabase/server'
import { Nav } from '@/components/nav'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getUser()
  if (!user) redirect('/login')
  return (
    <>
      <header className="masthead">
        <Link href="/profile" className="brand">Mi <em>estilista</em></Link>
        <Nav />
      </header>
      <div className="tape" aria-hidden="true" />
      {children}
      <footer className="foot">
        <span>Tu estudio de estilismo privado</span>
        <Link href="/estado">Estado técnico</Link>
      </footer>
    </>
  )
}
