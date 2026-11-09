import Link from 'next/link'
import { getUser } from '@/lib/supabase/server'
import { plannerView } from '@/lib/shopping/service'
import { DEFAULT_PRIORITY_WEIGHTS, LEVEL_LABEL, PRIORITY_LABEL, normalizePriorityWeights, type PriorityKey } from '@/lib/shopping/priority'
import { BUDGET_PERIODS, NEED_STATUSES, NEED_TYPES, RETAILERS, label } from '@/lib/shopping/taxonomy'
import { archiveListAction, budgetAction, createListAction, preferencesAction, removeFromListAction } from '../actions'

type Row = Record<string, any>

/** Shopping Planner: qué merece la pena comprar, qué puede esperar, presupuesto, listas y preferencias. */
export default async function PlannerPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams
  const user = (await getUser())!
  const v = await plannerView(user.supabase)
  const b = v.budget, bs = v.budgetStatus
  const w = normalizePriorityWeights(v.prefs?.priority_weights)
  const pref = (k: string, r: string) => (v.prefs?.[k] ?? []).includes(r)
  const item = (n: Row) => <li key={n.id}><Link href={`/compras/necesidades/${n.id}`}>{n.title}</Link> <span className="m small">· {label(NEED_TYPES, n.type).toLowerCase()} · {n.priority_score ?? '—'}/100{n.price_max != null ? ` · hasta ${n.price_max} €` : ''}</span></li>

  return (
    <main className="wide shop">
      <p className="eyebrow"><Link href="/compras">Compras</Link> · Planificador</p>
      <h1 className="display">Plan de compras</h1>
      <p className="m">Tener presupuesto no obliga a gastarlo: solo sirve para decidir mejor cuando de verdad hace falta algo.</p>
      {sp.error && <p className="note warn" role="alert">{sp.error}</p>}
      {(sp.budget || sp.prefs || sp.list || sp.archived || sp.removed) && <p className="note" role="status">Guardado.</p>}

      <section className="osec"><h2>Merece la pena comprar</h2>
        {v.worth.length ? <ul>{v.worth.map(item)}</ul> : <p className="verdict"><b>Nada por ahora.</b> Ninguna necesidad abierta supera tu umbral de {v.threshold}/100.</p>}
        {v.canWait.length > 0 && (<><h3>Puede esperar</h3><ul>{v.canWait.map(item)}</ul></>)}
      </section>

      <section className="osec"><h2>Presupuesto</h2>
        {bs ? (<>
          <p><b>{bs.available.toFixed(2)} {bs.currency}</b> disponibles de {bs.amount.toFixed(2)} ({label(BUDGET_PERIODS, b?.period).toLowerCase()}, del {bs.from} al {bs.to}). Comprometido: {bs.committed.toFixed(2)} ({bs.committedCount} aprobada{bs.committedCount === 1 ? '' : 's'} o comprada{bs.committedCount === 1 ? '' : 's'}).</p>
          <span className="bar" aria-label={`Usado ${bs.usedPct} %`}><i style={{ width: `${bs.usedPct}%` }} /></span>
          {bs.warnings.map((x) => <p key={x} className="note warn">{x}</p>)}
          {bs.advice && <p className="verdict">{bs.advice}</p>}
        </>) : <p className="m">Sin presupuesto. Es opcional.</p>}
        <form action={budgetAction} className="btns">
          <label>Periodo<select name="period" defaultValue={b?.period ?? 'monthly'}>{BUDGET_PERIODS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}</select></label>
          <label>Importe<input name="amount" inputMode="decimal" required defaultValue={b?.amount ?? ''} /></label>
          <label>Moneda<input name="currency" maxLength={3} defaultValue={b?.currency ?? 'EUR'} /></label>
          <label>Desde<input type="date" name="starts_on" defaultValue={b?.starts_on ?? ''} /></label>
          <button className="btn small primary">Guardar presupuesto</button>
        </form>
        {b && <form action={budgetAction}><input type="hidden" name="clear" value="1" /><button className="btn small">Quitar presupuesto</button></form>}
      </section>

      <section className="osec"><h2>Listas</h2>
        {!v.lists.length && <p className="m">Sin listas. Crea una (p. ej. «Otoño») y añade necesidades desde su ficha.</p>}
        <div className="combos">{v.lists.map((l: Row) => (
          <div key={l.id} className="need">
            <span className="st">{l.items.length} necesidad{l.items.length === 1 ? '' : 'es'}{l.target_date ? ` · antes del ${l.target_date}` : ''}</span>
            <h3>{l.name}</h3>{l.description && <p className="m small">{l.description}</p>}
            <ul className="small">{l.items.map((i: Row) => i.shopping_needs && (
              <li key={i.id}><Link href={`/compras/necesidades/${i.need_id}`}>{i.shopping_needs.title}</Link> <span className="m">· {label(NEED_STATUSES, i.shopping_needs.status).toLowerCase()} · {LEVEL_LABEL[(i.shopping_needs.user_priority ?? i.shopping_needs.priority_level ?? 'low') as 'low'].toLowerCase()}</span>
                <form action={removeFromListAction} style={{ display: 'inline' }}><input type="hidden" name="list_id" value={l.id} /><input type="hidden" name="need_id" value={i.need_id} /> <button className="btn small" aria-label={`Quitar ${i.shopping_needs.title}`}>Quitar</button></form></li>))}</ul>
            <form action={archiveListAction}><input type="hidden" name="list_id" value={l.id} /><button className="btn small">Archivar lista</button></form>
          </div>))}</div>
        <form action={createListAction} className="btns">
          <label>Nueva lista<input name="name" required maxLength={80} placeholder="Otoño" /></label>
          <label>Antes de (opcional)<input type="date" name="target_date" /></label>
          <button className="btn small">Crear lista</button>
        </form>
      </section>

      <section className="osec"><h2>Preferencias de compra</h2>
        <form action={preferencesAction}>
          <fieldset className="chk-row"><legend>Tiendas preferidas</legend>{RETAILERS.map((r) => <label key={r.id} className="chk"><input type="checkbox" name="preferred" value={r.id} defaultChecked={pref('preferred_retailers', r.id)} /> {r.name}</label>)}</fieldset>
          <fieldset className="chk-row"><legend>Tiendas que no quieres</legend>{RETAILERS.map((r) => <label key={r.id} className="chk"><input type="checkbox" name="excluded" value={r.id} defaultChecked={pref('excluded_retailers', r.id)} /> {r.name}</label>)}</fieldset>
          <p className="m small">Las tiendas se usarán al buscar productos (fase 4B). Ahora mismo no se consulta ninguna tienda.</p>
          <label className="chk"><input type="checkbox" name="quality_over_price" defaultChecked={v.prefs?.quality_over_price ?? true} /> Prefiero calidad a precio</label>
          <label>Umbral para proponer compra (0-100)<input name="min_priority_to_suggest" inputMode="numeric" defaultValue={v.threshold} /></label>
          <fieldset className="chk-row"><legend>Peso de cada criterio de prioridad (se normalizan a 100)</legend>
            {(Object.keys(DEFAULT_PRIORITY_WEIGHTS) as PriorityKey[]).map((k) => <label key={k}>{PRIORITY_LABEL[k]}<input name={`w_${k}`} inputMode="numeric" defaultValue={w[k]} style={{ width: 70 }} /></label>)}
          </fieldset>
          <label className="chk"><input type="checkbox" name="reset_weights" /> Volver a los pesos por defecto</label>
          <label>Notas<input name="notes" maxLength={500} defaultValue={v.prefs?.notes ?? ''} /></label>
          <div className="btns"><button className="btn primary">Guardar preferencias</button></div>
          <p className="m small">Al cambiar los pesos, pulsa «Analizar mi armario» para recalcular las prioridades.</p>
        </form>
      </section>
    </main>
  )
}
