'use client'
import { useState, useTransition } from 'react'
import { rateReference } from '@/app/(app)/profile/actions'

type Item = { id: string; svg: string; desc: string; style: string; elements: { id: string; label: string }[] }
type Rating = { id: string; label: string }
type State = Record<string, { rating: string; liked: string[] }>

/**
 * Valoracion de conjuntos con la primera impresion. Se guarda al momento.
 * «Me gusta algun elemento, pero no el conjunto» deja marcar que elementos concretos gustan.
 */
export function ReferenceRater({ items, ratings, initial, revealStyle = true }: { items: Item[]; ratings: Rating[]; initial: State; revealStyle?: boolean }) {
  const [state, setState] = useState<State>(initial)
  const [err, setErr] = useState('')
  const [, start] = useTransition()
  const done = Object.keys(state).length

  function save(refId: string, next: { rating: string; liked: string[] } | null) {
    const prev = state[refId]
    setState((s) => { const c = { ...s }; if (next) c[refId] = next; else delete c[refId]; return c })
    setErr('')
    start(async () => {
      try { await rateReference(refId, next?.rating ?? null, next?.liked ?? []) }
      catch (e) { setState((s) => { const c = { ...s }; if (prev) c[refId] = prev; else delete c[refId]; return c }); setErr(e instanceof Error ? e.message : 'No se pudo guardar') }
    })
  }
  const rate = (refId: string, r: string) => save(refId, state[refId]?.rating === r ? null : { rating: r, liked: r === 'element' ? state[refId]?.liked ?? [] : [] })
  const toggleEl = (refId: string, el: string) => {
    const cur = state[refId]?.liked ?? []
    save(refId, { rating: 'element', liked: cur.includes(el) ? cur.filter((x) => x !== el) : [...cur, el] })
  }

  return (
    <div>
      <p className="m small" aria-live="polite">{done} de {items.length} valorados{err && <span className="warn"> · {err}</span>}</p>
      <div className="refgrid">
        {items.map((it) => {
          const st = state[it.id]
          return (
            <figure key={it.id} className={`refcard${st ? ' rated' : ''}`}>
              <div className="refart" dangerouslySetInnerHTML={{ __html: it.svg }} />
              <figcaption>
                <span className="m small">{it.desc}</span>
                {st && revealStyle && <span className="state ok">{it.style}</span>}
              </figcaption>
              <div className="refopts" role="group" aria-label={`Tu impresión: ${it.desc}`}>
                {ratings.map((r) => (
                  <button key={r.id} type="button" aria-pressed={st?.rating === r.id} onClick={() => rate(it.id, r.id)}>{r.label}</button>
                ))}
              </div>
              {st?.rating === 'element' && (
                <div className="refels" role="group" aria-label="Qué elementos te gustan">
                  <span className="m small">¿Qué te gusta?</span>
                  {it.elements.map((e) => (
                    <button key={e.id} type="button" aria-pressed={st.liked.includes(e.id)} onClick={() => toggleEl(it.id, e.id)}>{e.label}</button>
                  ))}
                </div>
              )}
            </figure>
          )
        })}
      </div>
    </div>
  )
}
