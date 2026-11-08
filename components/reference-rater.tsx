'use client'
import { useState, useTransition } from 'react'
import { rateReference } from '@/app/(app)/profile/actions'

type Item = { id: string; svg: string; desc: string; style: string }
type Rating = { id: string; label: string }

/** Descubrimiento visual: valora cada conjunto con tu primera impresion. Se guarda al momento. */
export function ReferenceRater({ items, ratings, initial }: { items: Item[]; ratings: Rating[]; initial: Record<string, string> }) {
  const [state, setState] = useState(initial)
  const [err, setErr] = useState('')
  const [, start] = useTransition()
  const done = Object.keys(state).length

  function rate(refId: string, r: string) {
    const prev = state[refId]
    const next = prev === r ? null : r // pulsar de nuevo la misma opcion la quita
    setState((s) => { const c = { ...s }; if (next) c[refId] = next; else delete c[refId]; return c })
    setErr('')
    start(async () => {
      try { await rateReference(refId, next) }
      catch (e) { setState((s) => { const c = { ...s }; if (prev) c[refId] = prev; else delete c[refId]; return c }); setErr(e instanceof Error ? e.message : 'No se pudo guardar') }
    })
  }

  return (
    <div>
      <p className="m small" aria-live="polite">{done} de {items.length} valorados{err && <span className="warn"> · {err}</span>}</p>
      <div className="refgrid">
        {items.map((it) => (
          <figure key={it.id} className={`refcard${state[it.id] ? ' rated' : ''}`}>
            <div className="refart" dangerouslySetInnerHTML={{ __html: it.svg }} />
            <figcaption>
              <span className="m small">{it.desc}</span>
              {state[it.id] && <span className="state ok">{it.style}</span>}
            </figcaption>
            <div className="refopts" role="group" aria-label={`Tu impresión: ${it.desc}`}>
              {ratings.map((r) => (
                <button key={r.id} type="button" aria-pressed={state[it.id] === r.id} onClick={() => rate(it.id, r.id)}>{r.label}</button>
              ))}
            </div>
          </figure>
        ))}
      </div>
    </div>
  )
}
