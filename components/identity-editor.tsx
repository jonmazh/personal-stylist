'use client'
import { useState } from 'react'

type Row = { style: string; role: string; weight: number }
type StyleOpt = { id: string; name: string; group: string }

/** Editor de influencias: rol y peso orientativo de cada estilo; el total se muestra en vivo y no se fuerza. */
export function IdentityEditor({ styles, groups, initial }: { styles: StyleOpt[]; groups: { id: string; name: string }[]; initial: Row[] }) {
  const [rows, setRows] = useState<Row[]>(initial)
  const [add, setAdd] = useState('')
  const total = rows.reduce((a, r) => a + (Number(r.weight) || 0), 0)
  const name = (id: string) => styles.find((s) => s.id === id)?.name ?? id
  const set = (i: number, patch: Partial<Row>) => setRows(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)))
  const equal = () => { const n = rows.length; if (!n) return; const base = Math.floor(100 / n / 5) * 5; setRows(rows.map((r, i) => ({ ...r, weight: i === 0 ? 100 - base * (n - 1) : base }))) }

  return (
    <div className="identity">
      {rows.length === 0 && <p className="m">Aún no has elegido estilos. Añade uno abajo o adopta la propuesta de tus valoraciones.</p>}
      {rows.map((r, i) => (
        <div key={r.style} className="inf-row">
          <input type="hidden" name="inf_style" value={r.style} />
          <b>{name(r.style)}</b>
          <select name="inf_role" value={r.role} onChange={(e) => set(i, { role: e.target.value })} aria-label={`Papel de ${name(r.style)}`}>
            <option value="principal">Principal</option><option value="secundario">Secundario</option><option value="influencia">Influencia</option>
          </select>
          <input type="range" min={0} max={100} step={5} value={r.weight} onChange={(e) => set(i, { weight: Number(e.target.value) })} aria-label={`Peso de ${name(r.style)}`} />
          <input type="number" name="inf_weight" min={0} max={100} step={5} value={r.weight} onChange={(e) => set(i, { weight: Number(e.target.value) })} aria-label={`Porcentaje de ${name(r.style)}`} />
          <button type="button" className="btn quiet small" onClick={() => setRows(rows.filter((_, j) => j !== i))}>Quitar</button>
        </div>
      ))}
      <p className={`state ${total === 100 || !rows.length ? 'ok' : 'warn'}`} aria-live="polite">Total: {total} %{rows.length && total !== 100 ? ' · orientativo: no tiene por qué ser exacto' : ''}</p>
      <div className="btns" style={{ marginTop: 8 }}>
        <select value={add} onChange={(e) => setAdd(e.target.value)} aria-label="Añadir un estilo">
          <option value="">Añadir un estilo…</option>
          {groups.map((g) => (
            <optgroup key={g.id} label={g.name}>
              {styles.filter((s) => s.group === g.id && !rows.some((r) => r.style === s.id)).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </optgroup>
          ))}
        </select>
        <button type="button" className="btn" disabled={!add} onClick={() => { setRows([...rows, { style: add, role: rows.length ? 'influencia' : 'principal', weight: Math.max(0, 100 - total) || 10 }]); setAdd('') }}>Añadir</button>
        {rows.length > 1 && <button type="button" className="btn quiet" onClick={equal}>Repartir a partes iguales</button>}
      </div>
    </div>
  )
}
