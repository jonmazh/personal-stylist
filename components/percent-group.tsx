'use client'
import { useState } from 'react'

/** Reparto en porcentajes con el total en vivo: debe sumar 100 %. */
export function PercentGroup({ items }: { items: { id: string; label: string; value: number }[] }) {
  const [vals, setVals] = useState(() => Object.fromEntries(items.map((i) => [i.id, i.value])))
  const total = Object.values(vals).reduce((a, b) => a + b, 0)
  return (
    <div>
      {items.map((i) => (
        <label key={i.id} className="range-row"><span>{i.label}</span>
          <input type="range" name={i.id} min={0} max={100} step={5} value={vals[i.id]} aria-label={`${i.label}, porcentaje del armario`}
            onChange={(e) => setVals({ ...vals, [i.id]: Number(e.target.value) })} />
          <span>{vals[i.id]} %</span></label>
      ))}
      <p className={`state ${total === 100 ? 'ok' : 'warn'}`} aria-live="polite">Total: {total} %{total === 100 ? '' : ' · debe sumar 100 %'}</p>
    </div>
  )
}
