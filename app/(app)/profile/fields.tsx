import type { Bundle } from '@/lib/profile/data'
import type { AreaId } from '@/lib/profile/areas'
import { questionsOf, valueOf, type Question } from '@/lib/profile/questionnaire'
import { PercentGroup } from '@/components/percent-group'

function Input({ q, v }: { q: Question; v: any }) {
  const label = `${q.label}${q.unit && q.kind !== 'percent' && q.kind !== 'measure' ? ` (${q.unit})` : ''}`
  switch (q.kind) {
    case 'single': return (
      <fieldset className="q"><legend>{q.label}</legend>{q.help && <p className="m small">{q.help}</p>}
        <div className="opts">{q.options!.map((o) => <label key={o}><input type="radio" name={q.id} value={o} defaultChecked={v === o} />{o}</label>)}</div>
      </fieldset>)
    case 'multi': return (
      <fieldset className="q"><legend>{q.label}{q.max ? <span className="m"> · máximo {q.max}</span> : null}</legend>
        <div className="opts">{q.options!.map((o) => <label key={o}><input type="checkbox" name={q.id} value={o} defaultChecked={(v ?? []).includes(o)} />{o}</label>)}</div>
      </fieldset>)
    case 'slider': return (
      <label className="range-row"><span>{q.ends![0]}</span>
        <input type="range" name={q.id} min={0} max={100} step={5} defaultValue={v ?? 50} aria-label={q.label} />
        <span>{q.ends![1]}</span></label>)
    case 'textarea': return <label>{q.label}<textarea name={q.id} rows={2} defaultValue={v ?? ''} /></label>
    case 'number': case 'measure': return <label>{label}<input name={q.id} type="number" inputMode="decimal" step="any" min={0} defaultValue={v ?? ''} /></label>
    default: return <label>{label}<input name={q.id} type="text" defaultValue={v ?? ''} placeholder={q.help} /></label>
  }
}

/** Campos de un capitulo, agrupados tal como los define el cuestionario. */
export function AreaBody({ id, b }: { id: AreaId; b: Bundle }) {
  const qs = questionsOf(id).filter((q) => !q.external)
  const groups = [...new Set(qs.map((q) => q.group))]
  return (<>{groups.map((g) => {
    const items = qs.filter((q) => q.group === g)
    const grid = items.every((q) => q.kind === 'number' || q.kind === 'measure' || q.kind === 'text')
    return (
      <section key={g} className="qgroup">
        <h3>{g}</h3>
        {items[0].kind === 'percent'
          ? <PercentGroup items={items.map((q) => ({ id: q.id, label: q.label, value: valueOf(q, b) ?? 0 }))} />
          : grid ? <div className="grid">{items.map((q) => <Input key={q.id} q={q} v={valueOf(q, b)} />)}</div>
          : items.map((q) => <Input key={q.id} q={q} v={valueOf(q, b)} />)}
        {id === 'a2' && g.startsWith('Medidas') && <p className="m small">Mídete con cinta métrica, sobre ropa interior, sin apretar. Cada medida nueva se guarda con su fecha; las anteriores no se borran.</p>}
      </section>
    )
  })}</>)
}
