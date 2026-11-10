import Link from 'next/link'
import { getUser } from '@/lib/supabase/server'
import { styleStrategy } from '@/lib/stylist/service'
import { MODES } from '@/lib/stylist/strategy'
import { FINDING_LABEL, type StrategicFinding } from '@/lib/stylist/wardrobe'
import { PendingButton } from '@/components/outfits/pending-button'
import { opportunityStatusAction, searchOpportunityAction, refreshAnalysisAction, refreshStrategyAction, researchTrendsAction } from './actions'
import { latestTrends } from '@/lib/stylist/trend-service'
import { DIMENSIONS, KINDS, STAGES } from '@/lib/stylist/trends'

const SIG: Record<string, string> = { Amplia: 'holgada', Ajustada: 'ajustada', Regular: 'regular', Slim: 'slim', Recto: 'recto', Wide: 'amplio', Tapered: 'tapered' }
const sig = (s: string) => { const [a, z] = s.split('|'); return `arriba ${SIG[a] ?? a} · pantalón ${SIG[z] ?? z}` }

/** Personal Shopper 2.0 · Estilista: primero el diagnóstico estratégico del armario (2.0B); después vendrán tendencias, oportunidades y selección. */
export default async function StylistPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams
  const user = (await getUser())!
  let st: Awaited<ReturnType<typeof styleStrategy>> | null = null, err: string | null = null
  try { st = await styleStrategy(user.supabase, user.id) } catch (e) { err = (e as Error).message }
  const res = st?.wardrobe
  const a = res?.analysis
  const trends = st?.trends ?? await latestTrends(user.supabase).catch(() => null)
  const improve = (a?.findings ?? []).filter((f) => f.kind !== 'strength')
  const strengths = (a?.findings ?? []).filter((f) => f.kind === 'strength')
  return (
    <main className="wide shop">
      <p className="eyebrow"><Link href="/compras">Personal Shopper</Link> · Estilista · <Link href="/compras/buscar">Buscar productos</Link></p>
      <h1 className="display">Tu estilista</h1>
      <p className="m">Antes de proponerte nada, estudio tu armario como un conjunto, tu identidad y lo que está pasando en la moda masculina. Después decido qué merece la pena incorporar —y si no hace falta comprar nada, te lo digo— y solo entonces buscaré productos.</p>
      {sp.strategy && <p className="note" role="status">Estrategia recalculada.</p>}
      {sp.error && <p className="note warn" role="alert">{sp.error}</p>}
      {st && <StrategyView st={st} />}
      {sp.updated && <p className="note" role="status">Diagnóstico recalculado.</p>}
      {err && <p className="note warn" role="alert">{err}</p>}
      {a && (<>
        <section className="osec">
          <h2>Diagnóstico del armario</h2>
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
      </>)}
      <section className="osec" id="tendencias">
        <h2>Tendencias de moda masculina</h2>
        <p className="m small">Investigo direcciones de la moda masculina (siluetas, proporciones, color, materiales, lavados, calzado, prendas exteriores, capas, estéticas) en fuentes editoriales. La IA solo resume lo que dicen esas fuentes y el sistema valida cada conclusión: una sola fuente es una propuesta, no una tendencia, y estar en catálogos tampoco lo es. Si te encajan o no lo decidiré después, al cruzarlas con tu perfil.</p>
        {sp.trends && <p className="note" role="status">Investigación actualizada.</p>}
        {!trends && <p className="verdict">Aún no he investigado las tendencias de esta semana.</p>}
        {trends && <TrendsView t={trends} />}
        <form action={researchTrendsAction} className="btns"><PendingButton className="btn small" label={trends ? 'Investigar de nuevo' : 'Investigar tendencias'} pending="Investigando fuentes editoriales…" /></form>
      </section>
      {a && (<>
        <p className="m small">Próximamente: una selección de productos reales para cada oportunidad, comprobando tu talla y su disponibilidad.</p>
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

const MODE: Record<string, string> = { editorial_comercial: 'Evidencia editorial (Brave) y presencia comercial (Channel3)', editorial: 'Evidencia editorial (Brave)', comercial: 'Solo presencia comercial (Channel3): sin investigación editorial', sin_fuentes: 'Sin fuentes configuradas' }
function TrendsView({ t }: { t: { research: Record<string, any>; signals: Record<string, any>[] } }) {
  const r = t.research
  const trends = t.signals.filter((s) => s.kind === 'tendencia_editorial'), isolated = t.signals.filter((s) => s.kind === 'propuesta_editorial')
  const card = (s: Record<string, any>) => (
    <div className="hit" key={s.id}>
      <span className="st">{DIMENSIONS.find((d) => d.id === s.dimension)?.label} · {STAGES.find((x) => x.id === s.stage)?.label} · confianza {s.confidence}</span>
      <h3>{s.name}</h3>
      <p className="small">{s.description}</p>
      <p className="m small">Evidencia editorial: {(s.confidence_reasons as string[]).join(' · ')}{s.validity ? ` · ${s.validity}` : ''}</p>
      {(s.brands as string[]).length > 0 && <p className="m small">Marcas citadas por las fuentes: {(s.brands as string[]).join(', ')}</p>}
      {s.presence && <p className="m small">Presencia comercial en España (Channel3): {s.presence.products} productos de {s.presence.brands} marcas en {s.presence.websites} tiendas. Es un dato de mercado, no prueba que sea tendencia.</p>}
      {(s.validation as string[]).length > 0 && <p className="m small">Validación: {(s.validation as string[]).join(' ')}</p>}
      <div className="btns"><a className="btn small" href={`/compras/estilista/tendencias/${s.id}`}>Ver fuentes</a></div>
    </div>)
  return (<>
    <p className="m small">{MODE[r.mode]} · temporada {r.season} · {new Date(r.created_at).toLocaleString('es-ES')} · {r.stats?.evidence ?? 0} fuentes editoriales válidas de {r.stats?.retrieved ?? 0} resultados{r.stats?.brave?.requests ? ` · ${r.stats.brave.requests} consultas a Brave` : ''}{r.stats?.channel3?.credits ? ` · ${r.stats.channel3.credits} créditos de Channel3` : ''}</p>
    {trends.length > 0 && <><h3>{KINDS[0].label}</h3><div className="combos">{trends.map(card)}</div></>}
    {isolated.length > 0 && <details className="howto"><summary>{KINDS[1].label} ({isolated.length})</summary><div className="combos">{isolated.map(card)}</div></details>}
    {(r.hypotheses as Record<string, any>[]).length > 0 && <><h3>Hipótesis de tu armario en el mercado</h3><ul className="small">{(r.hypotheses as Record<string, any>[]).map((h) => <li key={h.key}>{h.title}: {h.presence.products} productos de {h.presence.brands} marcas en España (Channel3). Hipótesis estilística con presencia comercial, no una tendencia.</li>)}</ul></>}
    {(r.limitations as string[]).length > 0 && <ul className="m small">{(r.limitations as string[]).map((l, i) => <li key={i}>{l}</li>)}</ul>}
  </>)
}

const STATUS: Record<string, string> = { me_interesa: 'Te interesa', descartada: 'Descartada' }
function StrategyView({ st }: { st: Awaited<ReturnType<typeof styleStrategy>> }) {
  const s = st.strategy, ops = st.opportunities as Record<string, any>[]
  const card = (o: Record<string, any>) => (
    <div className={`hit ${o.status === 'descartada' ? 'v-skip' : ''}`} key={o.id}>
      <span className="st">{MODES.find((m) => m.id === o.mode)?.label} · prioridad {o.priority} · confianza {o.confidence}{STATUS[o.status] ? ` · ${STATUS[o.status]}` : ''}</span>
      <h3>{o.title}</h3>
      <p className="small"><b>Diagnóstico:</b> {o.diagnosis}</p>
      <p className="small"><b>Propuesta:</b> {o.proposal}</p>
      {o.profile_relation?.length > 0 && <p className="small"><b>Por qué encaja contigo:</b> {o.profile_relation.join(' ')}</p>}
      <p className="small"><b>Mercado:</b> {o.market ? `${o.market.kind === 'tendencia_editorial' ? 'tendencia con evidencia editorial' : 'propuesta editorial aislada'} «${o.market.name}» (confianza ${o.market.confidence})${o.market.presence ? ` · presencia comercial: ${o.market.presence.products} productos de ${o.market.presence.brands} marcas en España` : ''}` : 'sin respaldo de mercado: es una mejora de estilo, no una tendencia'}</p>
      <p className="m small">Relevancia de moda {o.scores.fashion_relevance ?? '—'} · idoneidad personal {o.scores.personal_suitability} · impacto en tu estilo {o.scores.stylistic_impact}</p>
      {o.benefits?.length > 0 && <p className="small"><b>Qué aporta:</b> {o.benefits.join(' · ')}</p>}
      {o.drawbacks?.length > 0 && <p className="m small">Inconvenientes: {o.drawbacks.join(' · ')}</p>}
      {o.purchase && o.target && <p className="m small">Buscaría: {o.target.label}{o.target.colors_ok?.length ? ` (${o.target.colors_ok.map((c: string) => c.toLowerCase()).join(' o ')})` : ''}</p>}
      <div className="btns">
        {o.purchase && o.target && o.status !== 'descartada' && <form action={searchOpportunityAction}><input type="hidden" name="id" value={o.id} /><PendingButton className="btn small primary" label="Buscar productos" pending="Investigando tiendas…" /></form>}
        {(['me_interesa', 'descartada'] as const).map((x) => <form key={x} action={opportunityStatusAction}><input type="hidden" name="id" value={o.id} /><input type="hidden" name="status" value={o.status === x ? 'propuesta' : x} /><button className="btn small">{o.status === x ? 'Deshacer' : x === 'me_interesa' ? 'Me interesa' : 'No es para mí'}</button></form>)}
      </div>
    </div>)
  const buys = ops.filter((o) => o.purchase), free = ops.filter((o) => !o.purchase)
  return (<>
    <section className="osec" id="direccion">
      <h2>Dirección de estilo</h2>
      <p>{s.direction}</p>
      {s.no_purchase_needed && <p className="verdict"><b>No necesitas comprar nada ahora.</b> Tu armario ya resuelve lo que buscas; abajo tienes cómo sacarle más partido.</p>}
      <p className="m small">{st.trends ? `Con las tendencias investigadas el ${new Date(st.trends.research.created_at).toLocaleDateString('es-ES')}` : 'Sin investigación de tendencias todavía: la estrategia se basa en tu armario y tu perfil'} · {st.cached ? 'estrategia reutilizada (nada ha cambiado)' : 'estrategia nueva'}</p>
    </section>
    <section className="osec" id="oportunidades">
      <h2>Oportunidades para elevar tu estilo</h2>
      {!buys.length && <p className="m">No encuentro incorporaciones que merezcan la pena con tus datos actuales.</p>}
      {MODES.map((m) => { const xs = buys.filter((o) => o.mode === m.id); return xs.length ? <div key={m.id}><h3>{m.label}</h3><p className="m small">{m.help}</p><div className="combos">{xs.map(card)}</div></div> : null })}
      {free.length > 0 && <><h3>Sin comprar nada</h3><div className="combos">{free.map(card)}</div></>}
      {(s.rejected as Record<string, any>[]).length > 0 && <details className="howto"><summary>Ideas descartadas ({(s.rejected as Record<string, any>[]).length})</summary><ul className="small">{(s.rejected as Record<string, any>[]).map((r) => <li key={r.key}><b>{r.title}:</b> {r.reason}</li>)}</ul></details>}
      <form action={refreshStrategyAction} className="btns"><PendingButton className="btn small" label="Recalcular la estrategia" pending="Pensando tu estrategia…" /></form>
    </section>
  </>)
}
