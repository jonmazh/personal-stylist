import Link from 'next/link'
import { getUser } from '@/lib/supabase/server'
import { getGeneration, listGenerations } from '@/lib/outfits/generate-service'
import { DRESS_CODES, ENVIRONMENTS, FORMALITY_WISH, INTENTS, LEVELS, RESTRICTIONS, TIMES, WEATHERS } from '@/lib/outfits/engine/context'
import { CRITERIA_LABEL, DEFAULT_WEIGHTS } from '@/lib/outfits/engine/scoring'
import { OUTFIT_OCCASIONS, occasionLabel, roleLabel } from '@/lib/outfits/taxonomy'
import { GROUPS } from '@/lib/wardrobe/taxonomy'
import { listGarments, WardrobeError } from '@/lib/wardrobe/service'
import { garmentTitle } from '@/lib/wardrobe/display'
import { ProposalCard } from '@/components/outfits/proposal-card'
import { generateAction } from '../actions'

const fmt = (iso: string) => new Date(iso).toLocaleString('es-ES', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
type Row = Record<string, any>
const Sel = ({ name, label, opts, def }: { name: string; label: string; opts: readonly { id: string; label: string }[]; def?: string | null }) => (
  <label>{label}<select name={name} defaultValue={def ?? ''}><option value="">Sin indicar</option>{opts.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}</select></label>
)

/** Generador de outfits (3B): petición estructurada → propuestas con prendas reales, puntuadas y explicadas. Sin IA. */
export default async function GeneratePage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams
  const user = (await getUser())!
  let gen: Awaited<ReturnType<typeof getGeneration>> | null = null
  let error = sp.error ?? ''
  if (sp.g) try { gen = await getGeneration(user.supabase, sp.g) } catch (e) { error = e instanceof WardrobeError ? e.message : 'No se pudo cargar la generación' }
  const [history, garments] = await Promise.all([listGenerations(user.supabase, 8).catch(() => []), listGarments(user.supabase, { status: 'active', sort: 'category' }).catch(() => [])])
  const req = (gen?.request ?? {}) as Row
  const ctx = (gen?.context ?? {}) as Row, stats = (gen?.stats ?? {}) as Row
  const ctxLine = gen ? [...(ctx.summary ?? []), `formalidad ${ctx.formality?.[0] === ctx.formality?.[1] ? ctx.formality?.[0] : `${ctx.formality?.[0]}–${ctx.formality?.[1]}`}/5`, ctx.seasonLabel].filter(Boolean).join(' · ') : ''
  return (
    <main className="wide">
      <p className="eyebrow"><Link href="/outfits">Outfit Studio</Link> · Generar propuestas</p>
      <h1 className="display">¿Qué necesitas hoy?</h1>
      <p className="m">Indica la ocasión y las condiciones: el motor combina solo prendas activas de tu armario, las puntúa con criterios explicables y te propone interpretaciones distintas. La conversación en lenguaje natural con el estilista llegará en la siguiente fase.</p>
      {error && <p className="note warn" role="alert">{error}</p>}
      {sp.dismissed && <p className="note" role="status">Propuesta descartada.</p>}
      {garments.length < 3 && <p className="note warn">Tienes {garments.length} prendas activas: añade al menos una parte superior, una inferior y un calzado a tu <Link href="/armario">armario</Link>.</p>}

      <form action={generateAction} className="genform">
        <div className="grid">
          <label>Ocasión<select name="occasion" defaultValue={req.occasion ?? ''}><option value="">Sin indicar</option>{OUTFIT_OCCASIONS.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}</select></label>
          <Sel name="dress_code" label="Código de vestimenta" opts={DRESS_CODES} def={req.dress_code} />
          <Sel name="time_of_day" label="Momento" opts={TIMES} def={req.time_of_day} />
          <Sel name="weather" label="Clima" opts={WEATHERS} def={req.weather} />
        </div>
        <details className="howto"><summary>Más condiciones (opcional)</summary>
          <div className="grid">
            <Sel name="environment" label="Entorno" opts={ENVIRONMENTS} def={req.environment} />
            <Sel name="formality" label="Formalidad deseada" opts={FORMALITY_WISH} def={req.formality} />
            <Sel name="comfort_priority" label="Prioridad de comodidad" opts={LEVELS} def={req.comfort_priority} />
            <Sel name="preferred_style" label="Intención estética" opts={INTENTS} def={req.preferred_style} />
            <label>Número de propuestas<select name="number_of_outfits" defaultValue={String(req.number_of_outfits ?? 3)}>{[1, 2, 3, 4, 5].map((n) => <option key={n}>{n}</option>)}</select></label>
          </div>
          <fieldset className="q"><legend>Restricciones</legend><div className="opts">{RESTRICTIONS.map((r) => <label key={r.id}><input type="checkbox" name="restrictions" value={r.id} defaultChecked={(req.restrictions ?? []).includes(r.id)} />{r.label}</label>)}</div></fieldset>
          <fieldset className="q"><legend>No usar estas categorías</legend><div className="opts">{GROUPS.filter((g) => g.primary).map((g) => <label key={g.id}><input type="checkbox" name="exclude_categories" value={g.id} defaultChecked={(req.exclude_categories ?? []).includes(g.id)} />{g.label}</label>)}</div></fieldset>
          {garments.length > 0 && <label>Quiero llevar esta prenda<select name="required_garment_ids" defaultValue={req.required_garment_ids?.[0] ?? ''}><option value="">Cualquiera</option>{garments.map((g) => <option key={g.id} value={g.id}>{garmentTitle(g)}</option>)}</select></label>}
          <p className="m small">Pesos de la puntuación: {Object.entries(DEFAULT_WEIGHTS).map(([k, v]) => `${CRITERIA_LABEL[k as keyof typeof DEFAULT_WEIGHTS].toLowerCase()} ${v}`).join(' · ')} (configurables por la API).</p>
        </details>
        <div className="btns"><button className="btn primary">Generar propuestas</button></div>
      </form>

      {gen && (
        <section className="genresults">
          <h2>Tus propuestas</h2>
          <p className="m small">{ctxLine}. Formalidad según {ctx.formalitySource}; temporada según {ctx.seasonSource}{(ctx.forbiddenRoles ?? []).length ? `; sin ${ctx.forbiddenRoles.map((r: string) => roleLabel(r).toLowerCase()).join(', ')}` : ''}.</p>
          <p className="m small">He considerado {stats.eligible} de tus {stats.garments} prendas activas, evaluado {stats.evaluated} combinaciones y descartado {stats.rejected} por reglas de estilismo{stats.ms != null ? ` (${stats.ms} ms)` : ''}.</p>
          {(stats.excluded ?? []).length > 0 && <details className="howto"><summary>Prendas que no he usado ({stats.excluded.length})</summary><ul className="m small">{(stats.excluded as Row[]).map((x, i) => <li key={i}>{x.garment}: {x.reason}</li>)}</ul></details>}
          {(gen.notes as string[]).map((n, i) => <p key={i} className="note warn">{n}</p>)}
          <div className="props">{gen.results.map((r: Row) => <ProposalCard key={r.id} r={r} context={ctxLine} />)}</div>
        </section>
      )}

      {history.length > 0 && (<>
        <h3>Peticiones recientes</h3>
        <ul className="events">{history.map((h: Row) => (
          <li key={h.id}><Link href={`/outfits/generar?g=${h.id}`}>{h.request?.occasion ? occasionLabel(h.request.occasion) : 'Sin ocasión'}{h.context?.summary?.length > 1 ? ` · ${h.context.summary.slice(1).join(' · ')}` : ''}</Link> <span className="m small">· {fmt(h.created_at)} · {(h.outfit_generation_results ?? []).length} propuestas{(h.outfit_generation_results ?? []).some((x: Row) => x.status === 'saved') ? ', alguna guardada' : ''}</span></li>
        ))}</ul>
      </>)}
    </main>
  )
}
