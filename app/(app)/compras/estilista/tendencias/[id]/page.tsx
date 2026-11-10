import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getUser } from '@/lib/supabase/server'
import { liveSources } from '@/lib/stylist/trend-service'
import { DIMENSIONS, KINDS, STAGES } from '@/lib/stylist/trends'

/** Fuentes de una señal de tendencia: se consultan en vivo en Brave al abrir esta página y no se guardan. */
export default async function TrendSourcesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const user = (await getUser())!
  const r = await liveSources(user.supabase, user.id, id).catch(() => null)
  if (!r) notFound()
  const s = r.signal
  return (
    <main className="wide shop">
      <p className="eyebrow"><Link href="/compras/estilista#tendencias">Estilista · Tendencias</Link></p>
      <h1 className="display">{s.name}</h1>
      <p className="m small">{DIMENSIONS.find((d) => d.id === s.dimension)?.label} · {KINDS.find((k) => k.id === s.kind)?.label} · {STAGES.find((x) => x.id === s.stage)?.label} · confianza {s.confidence}</p>
      <p>{s.description}</p>
      <p className="m small">Al investigar: {(s.confidence_reasons as string[]).join(' · ')}.</p>
      <section className="osec">
        <h2>Fuentes</h2>
        {r.live && <p className="m small">Consultadas ahora mismo en Brave Search con «{s.search_query}». No se guardan (condiciones de Brave); pueden no coincidir exactamente con las de la investigación.</p>}
        {'message' in r && r.message && <p className="note">{r.message}</p>}
        {!r.sources.length && !('message' in r && r.message) && <p className="verdict">Brave no devuelve ahora fuentes editoriales para esta señal.</p>}
        <ul className="small">{r.sources.map((x: Record<string, any>, i: number) => <li key={i}><a href={x.url} target="_blank" rel="noopener noreferrer nofollow">{x.title}</a> — {x.outlet}{x.published ? ` · ${String(x.published).slice(0, 10)}` : ''}{x.snippet ? <><br /><span className="m">{x.snippet}</span></> : null}</li>)}</ul>
      </section>
    </main>
  )
}
