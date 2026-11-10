import Link from 'next/link'
import { getUser } from '@/lib/supabase/server'
import { wardrobeAnalysis } from '@/lib/stylist/service'
import { FINDING_LABEL, type StrategicFinding } from '@/lib/stylist/wardrobe'
import { PendingButton } from '@/components/outfits/pending-button'
import { refreshAnalysisAction } from './actions'

const SIG: Record<string, string> = { Amplia: 'holgada', Ajustada: 'ajustada', Regular: 'regular', Slim: 'slim', Recto: 'recto', Wide: 'amplio', Tapered: 'tapered' }
const sig = (s: string) => { const [a, z] = s.split('|'); return `arriba ${SIG[a] ?? a} · pantalón ${SIG[z] ?? z}` }

/** Personal Shopper 2.0 · Estilista: primero el diagnóstico estratégico del armario (2.0B); después vendrán tendencias, oportunidades y selección. */
export default async function StylistPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams
  const user = (await getUser())!
  let res: Awaited<ReturnType<typeof wardrobeAnalysis>> | null = null, err: string | null = null
  try { res = await wardrobeAnalysis(user.supabase, user.id) } catch (e) { err = (e as Error).message }
  const a = res?.analysis
  const improve = (a?.findings ?? []).filter((f) => f.kind !== 'strength')
  const strengths = (a?.findings ?? []).filter((f) => f.kind === 'strength')
  return (
    <main className="wide shop">
      <p className="eyebrow"><Link href="/compras">Personal Shopper</Link> · Estilista · <Link href="/compras/buscar">Buscar productos</Link></p>
      <h1 className="display">Tu armario, visto por un estilista</h1>
      <p className="m">Antes de proponerte nada, estudio tu armario como un conjunto: qué estética transmite frente a la que buscas, qué siluetas y proporciones repiten tus conjuntos, qué colores te favorecen y qué prendas tienen potencial. Son diagnósticos e hipótesis de estilo, no compras: el armario puede resolver ya parte de lo que buscas.</p>
      {sp.updated && <p className="note" role="status">Diagnóstico recalculado.</p>}
      {err && <p className="note warn" role="alert">{err}</p>}
      {a && (<>
        <section className="osec">
          <h2>Dirección actual</h2>
          <p>{a.summary}</p>
          <p className="m small">{a.counts.active} prendas activas · {a.counts.outfits} conjuntos válidos analizados · {res!.cached ? 'diagnóstico reutilizado (nada ha cambiado)' : 'diagnóstico nuevo'} del {new Date(res!.created_at).toLocaleString('es-ES')}</p>
          {!a.experimentation && <p className="note">Indica cuánto te apetece experimentar (<Link href="/profile/objetivos">Objetivos de imagen</Link>): orienta qué propuestas priorizo.</p>}
          <div className="srcs">
            {a.aesthetic.transmits.map((t) => <span key={t.style}>Transmite: {t.name} ({t.score} %)</span>)}
            {a.aesthetic.identity.map((i) => <span key={i.style} className="m">Tu identidad: {i.name} {i.weight} % · tu armario tiene {i.wardrobe_score} % de sus rasgos</span>)}
          </div>
        </section>
        <section className="osec">
          <h2>Oportunidades detectadas en tu armario</h2>
          {!improve.length && <p className="verdict">Tu armario no muestra carencias estratégicas claras con los datos actuales.</p>}
          <div className="combos">{improve.map((f) => <FindingCard key={f.key} f={f} />)}</div>
        </section>
        {strengths.length > 0 && <section className="osec"><h2>Lo que ya funciona</h2><div className="combos">{strengths.map((f) => <FindingCard key={f.key} f={f} />)}</div></section>}
        <section className="osec">
          <h2>Siluetas y proporciones</h2>
          <p className="small">Pantalones: {Object.entries(a.silhouettes.legs).map(([c, n]) => `${SIG[c] ?? c} ${n}`).join(', ') || '—'}{a.silhouettes.legs_unknown ? ` · sin corte indicado ${a.silhouettes.legs_unknown}` : ''}</p>
          <p className="small">Arriba: {Object.entries(a.silhouettes.tops).map(([c, n]) => `${SIG[c] ?? c} ${n}`).join(', ') || '—'}{a.silhouettes.tops_unknown ? ` · sin silueta indicada ${a.silhouettes.tops_unknown}` : ''}</p>
          {a.proportions.distribution.length > 0 && <p className="small">Proporciones de tus conjuntos: {a.proportions.distribution.slice(0, 4).map((d) => `${sig(d.signature)} (${d.count})`).join(' · ')}</p>}
          <p className="small">Colores: {a.colors.distribution.slice(0, 6).map((c) => `${c.color.toLowerCase()} ${c.count}`).join(', ')} · neutros {a.colors.neutral_share} %</p>
        </section>
        {a.limitations.length > 0 && <section className="osec"><h2>Límites de este diagnóstico</h2><ul className="small">{a.limitations.map((l, i) => <li key={i}>{l}</li>)}</ul></section>}
        <form action={refreshAnalysisAction} className="btns"><PendingButton className="btn small" label="Recalcular el diagnóstico" pending="Analizando tu armario…" /></form>
        <p className="m small">Próximamente: tendencias de moda masculina con fuentes, oportunidades de estilo y una selección de productos reales para cada una.</p>
      </>)}
    </main>
  )
}

function FindingCard({ f }: { f: StrategicFinding }) {
  return (
    <div className="hit">
      <span className="st">{FINDING_LABEL[f.kind]} · confianza {f.confidence}</span>
      <h3>{f.title}</h3>
      <p className="small">{f.diagnosis}</p>
      {f.direction && <p className="small"><b>Hipótesis de estilo:</b> {f.direction}</p>}
      {f.evidence.facts.length > 0 && <p className="m small">{f.evidence.facts.join(' · ')}</p>}
      {f.missing.length > 0 && <p className="m small">Falta: {f.missing.join(', ').toLowerCase()}</p>}
    </div>
  )
}
