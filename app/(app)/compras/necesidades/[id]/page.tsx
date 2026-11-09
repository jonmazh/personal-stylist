import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getUser } from '@/lib/supabase/server'
import { getNeed, listLists } from '@/lib/shopping/service'
import { LEVEL_LABEL, specText } from '@/lib/shopping/priority'
import { NEED_ORIGINS, NEED_STATUSES, NEED_TYPES, NeedSpec, PRIORITIES, label } from '@/lib/shopping/taxonomy'
import { SpecFields } from '@/components/shopping/spec-fields'
import { PendingButton } from '@/components/outfits/pending-button'
import { addToListAction, createListAction, editNeedAction, needPriorityAction, needStatusAction, reassessAction } from '../../actions'

type Row = Record<string, any>
const EVENT: Record<string, (c: Row) => string> = {
  created: (c) => `Creada (${label(NEED_ORIGINS, c?.origin)})`, status: (c) => `Estado: ${label(NEED_STATUSES, c?.from)} → ${label(NEED_STATUSES, c?.to)}${c?.reason ? ` — «${c.reason}»` : ''}`,
  priority: (c) => `Prioridad fijada: ${c?.to ? label(PRIORITIES, c.to) : 'la calcula el estilista'}`, edited: (c) => `Editada: ${(c?.fields ?? []).join(', ')}`, listed: () => 'Añadida a una lista', assessed: () => 'Reevaluada',
}

export default async function NeedPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const [{ id }, sp] = await Promise.all([params, searchParams])
  const user = (await getUser())!
  const n = await getNeed(user.supabase, id).catch(() => null)
  if (!n) notFound()
  const lists = await listLists(user.supabase).catch(() => [])
  const a: Row | undefined = n.assessments[0]
  const spec = NeedSpec.safeParse(n.spec)
  const here = `/compras/necesidades/${id}`
  const next = NEED_STATUSES.filter((x) => x.id !== n.status && x.id !== 'discarded')

  return (
    <main className="wide shop">
      <p className="eyebrow"><Link href="/compras">Compras</Link> · {label(NEED_TYPES, n.type)}</p>
      <h1 className="display">{n.title}</h1>
      <p className="m">{spec.success ? specText(spec.data) : ''}</p>
      {sp.error && <p className="note warn" role="alert">{sp.error}</p>}
      {sp.created && <p className="note" role="status">Necesidad guardada y evaluada.</p>}
      {sp.saved && <p className="note" role="status">Cambios guardados.</p>}
      {sp.status && <p className="note" role="status">Estado actualizado: {label(NEED_STATUSES, sp.status)}.</p>}
      {sp.listed && <p className="note" role="status">Añadida a la lista.</p>}

      <p className="chips">
        <span className="chip">{label(NEED_STATUSES, n.status)}</span><span className="chip">{label(NEED_ORIGINS, n.origin)}</span>
        <span className={`chip lvl-${n.priority}`}>Prioridad {LEVEL_LABEL[n.priority as 'high'].toLowerCase()}{n.user_priority ? ' (fijada por ti)' : ''}</span>
        {n.target_date && <span className="chip">Antes del {n.target_date}</span>}
      </p>
      {n.type === 'desire' && <p className="verdict">Es un <b>deseo</b>: no cubre un hueco del armario. Está bien quererlo; lo cuento aparte y no compite con las necesidades.</p>}
      {n.status === 'discarded' && <p className="verdict">Descartada{n.discard_reason ? `: «${n.discard_reason}»` : ''}. No volveré a proponerla al analizar el armario.</p>}
      {n.rationale && <p>{n.rationale}</p>}
      {n.garments.length > 0 && <p className="small">Relacionada con: {n.garments.map((g: Row, i: number) => <span key={g.id}>{i ? ', ' : ''}<Link href={`/armario/${g.id}`}>{g.title}</Link>{g.id === n.replaces_garment_id ? ' (a sustituir)' : ''}</span>)}</p>}

      {a ? (<section className="osec">
        <h2>Por qué esta prioridad <span className="m small">· {a.score}/100 · confianza {a.confidence}</span></h2>
        <p className="m small">Es una prioridad de compra, no una recomendación de producto. Calculada con {a.engine_version} el {new Date(a.created_at).toLocaleDateString('es-ES')}.</p>
        {(a.criteria as Row[]).map((c) => (
          <div key={c.key} className="pcrit"><b>{c.label}</b><div><span className="bar"><i style={{ width: `${Math.round(c.value * 100)}%` }} /></span><span className="m small">{c.reasons.join(' ')}</span></div><span>{c.points}/{c.weight}</span></div>
        ))}
        <div className="combos">
          <div className="need"><span className="st">Conjuntos nuevos</span><h3>{a.new_outfits ? `+${a.new_outfits}` : 'Ninguno'}</h3><p className="m small">Con el motor de outfits y tus prendas actuales, simulando la prenda buscada.</p></div>
          <div className="need"><span className="st">Uso previsto</span><h3>~{a.expected_wears_month} al mes</h3><p className="m small">Según tu estilo de vida y cuánto usas prendas parecidas.</p></div>
          <div className="need"><span className="st">Coste por uso (estimado)</span><h3>{a.cost_per_wear?.value != null ? `~${a.cost_per_wear.value} €` : 'Sin precio'}</h3><p className="m small">{a.cost_per_wear?.price != null ? `${a.cost_per_wear.price} € / ~${a.cost_per_wear.uses} usos (${a.cost_per_wear.basis}).` : 'Indica un precio objetivo para estimarlo.'}</p></div>
          <div className="need"><span className="st">Redundancia</span><h3>{a.redundancy?.level === 'alta' ? 'Alta' : a.redundancy?.level === 'media' ? 'Media' : 'Baja'}</h3><p className="m small">{a.redundancy?.garments?.length ? `Parecida a: ${a.redundancy.garments.map((g: Row) => `${g.title} (${g.similarity} %)`).join(', ')}.` : 'No tienes nada muy parecido.'}</p></div>
        </div>
        {(a.occasions as Row[])?.length > 0 && <p className="small">Ocasiones que cubre: {(a.occasions as Row[]).map((o) => `${o.label}${o.newlyCovered ? ' (ahora sin cubrir)' : ''}`).join(', ')}.</p>}
        <form action={reassessAction}><input type="hidden" name="id" value={id} /><PendingButton className="btn small" label="Reevaluar con el armario actual" pending="Reevaluando…" /></form>
      </section>) : <p className="m">Aún sin evaluar.</p>}

      <section className="osec"><h2>Decidir</h2>
        <div className="btns">{next.map((x) => (
          <form key={x.id} action={needStatusAction}><input type="hidden" name="id" value={id} /><input type="hidden" name="status" value={x.id} /><button className="btn small" title={x.help}>{x.label}</button></form>
        ))}</div>
        {n.status !== 'discarded' && <form action={needStatusAction} className="btns">
          <input type="hidden" name="id" value={id} /><input type="hidden" name="status" value="discarded" />
          <label>Motivo para descartar<input name="discard_reason" required maxLength={300} placeholder="Ya no lo necesito, prefiero esperar…" /></label>
          <button className="btn small">Descartar</button>
        </form>}
        <form action={needPriorityAction} className="btns">
          <input type="hidden" name="id" value={id} />
          <label>Prioridad<select name="user_priority" defaultValue={n.user_priority ?? ''}><option value="">Que la calcule el estilista ({LEVEL_LABEL[(n.priority_level ?? 'low') as 'low'].toLowerCase()})</option>{PRIORITIES.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}</select></label>
          <button className="btn small">Fijar</button>
        </form>
      </section>

      <section className="osec"><h2>Listas</h2>
        {n.lists.length > 0 && <p className="small">En: {n.lists.map((l: Row) => l.name).join(', ')}</p>}
        {lists.length > 0 && <form action={addToListAction} className="btns">
          <input type="hidden" name="need_id" value={id} /><input type="hidden" name="back" value={here} />
          <label>Añadir a<select name="list_id">{lists.map((l: Row) => <option key={l.id} value={l.id}>{l.name}</option>)}</select></label><button className="btn small">Añadir</button>
        </form>}
        <form action={createListAction} className="btns">
          <input type="hidden" name="need_id" value={id} /><input type="hidden" name="back" value={here} />
          <label>Nueva lista<input name="name" required maxLength={80} placeholder="Otoño" /></label><button className="btn small">Crear y añadir</button>
        </form>
      </section>

      <details className="howto osec"><summary>Editar la prenda buscada</summary>
        <form action={editNeedAction}>
          <input type="hidden" name="id" value={id} />
          <label>Nombre<input name="title" required maxLength={120} defaultValue={n.title} /></label>
          <SpecFields spec={n.spec} />
          <label>Precio mínimo (€)<input name="price_min" inputMode="decimal" defaultValue={n.price_min ?? ''} /></label>
          <label>Precio máximo (€)<input name="price_max" inputMode="decimal" defaultValue={n.price_max ?? ''} /></label>
          <label>La necesito antes de<input type="date" name="target_date" defaultValue={n.target_date ?? ''} /></label>
          <label>Por qué<input name="rationale" maxLength={600} defaultValue={n.rationale ?? ''} /></label>
          <div className="btns"><button className="btn primary">Guardar y reevaluar</button></div>
        </form>
      </details>

      <section className="osec"><h2>Historial</h2>
        <ul className="small">{n.events.map((e: Row) => <li key={e.id}>{new Date(e.created_at).toLocaleString('es-ES')} — {(EVENT[e.kind] ?? (() => e.kind))(e.changes ?? {})}</li>)}</ul>
        {n.assessments.length > 1 && <p className="m small">Evaluaciones: {n.assessments.map((x: Row) => `${x.score} (${new Date(x.created_at).toLocaleDateString('es-ES')})`).join(' · ')}</p>}
      </section>
    </main>
  )
}
