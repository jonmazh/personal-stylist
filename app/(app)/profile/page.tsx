import Link from 'next/link'
import { getUser } from '@/lib/supabase/server'
import { loadBundle, status } from '@/lib/profile/data'
import { AREAS } from '@/lib/profile/areas'

export default async function ExpedientePage() {
  const user = (await getUser())!
  const b = await loadBundle(user.supabase, user.id)
  const validated = AREAS.filter((a) => b.validated[a.id]).length
  const next = AREAS.find((a) => !b.validated[a.id])

  return (
    <main>
      <p className="eyebrow">Tu expediente de estilismo</p>
      <h1 className="display">Conocerte antes de vestirte</h1>
      <p className="lead">
        Siete capítulos sobre ti. Cuando confirmas uno, pasa a ser la referencia de todas mis recomendaciones.
        {validated < AREAS.length ? ' Hasta entonces, trabajo con hipótesis y te lo digo.' : ''}
      </p>
      <p className="m small">{validated} de {AREAS.length} capítulos validados por ti</p>

      <ol className="chapters">
        {AREAS.map((a, i) => {
          const [label, cls] = status(a.id, b)
          return (
            <li key={a.id}>
              <Link href={`/profile/${a.slug}`}>
                <span className="ch-num">{String(i + 1).padStart(2, '0')}</span>
                <span className="ch-title">{a.name}</span>
                <span className={`state ${cls}`}>{label}</span>
                <span className="ch-intro">{a.intro}</span>
              </Link>
            </li>
          )
        })}
      </ol>

      <div className="btns">
        {next && <Link className="btn primary" href={`/profile/${next.slug}`}>Continuar: {next.name}</Link>}
        <Link className="btn" href="/blueprint">Ver mi diagnóstico</Link>
      </div>
    </main>
  )
}
