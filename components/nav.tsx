'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

const LINKS = [['/profile', 'Expediente'], ['/blueprint', 'Diagnóstico'], ['/stylist', 'Estilista']] as const

export function Nav() {
  const path = usePathname()
  return (
    <nav className="tabs" aria-label="Principal">
      {LINKS.map(([href, label]) => (
        <Link key={href} href={href} aria-current={path.startsWith(href) ? 'page' : undefined}>{label}</Link>
      ))}
      <form action="/auth/signout" method="post"><button>Salir</button></form>
    </nav>
  )
}
