import type { Bundle } from '@/lib/profile/data'
import { LiveRange } from '@/components/live-range'
import { CONSTRAINTS, DIMS, GOALS, LIFE, MEASURES, PREFS, STYLES } from '@/lib/profile/areas'

export const Radios = ({ name, options, value }: { name: string; options: string[]; value?: string | null }) => (
  <div className="opts" role="radiogroup">{options.map((o) => <label key={o}><input type="radio" name={name} value={o} defaultChecked={value === o} />{o}</label>)}</div>
)
export const Checks = ({ name, options, values }: { name: string; options: string[]; values: string[] }) => (
  <div className="opts">{options.map((o) => <label key={o}><input type="checkbox" name={name} value={o} defaultChecked={values.includes(o)} />{o}</label>)}</div>
)
export const Field = ({ name, label, type = 'text', value }: { name: string; label: string; type?: string; value?: string | number | null }) => (
  <label>{label}<input name={name} type={type} step="any" defaultValue={value ?? ''} /></label>
)

/** Campos de cada capitulo del expediente. */
export function AreaBody({ id, b }: { id: string; b: Bundle }) {
  const p = b.profile ?? {}
  switch (id) {
    case 'a1': return (<>
      <div className="grid"><Field name="age" label="Edad" type="number" value={p.age} /><Field name="height_cm" label="Altura (cm)" type="number" value={p.height_cm} />
        <Field name="weight_kg" label="Peso (kg, opcional)" type="number" value={p.weight_kg} /><Field name="city" label="Ciudad y país" value={p.city} />
        <Field name="sizes" label="Tallas habituales" value={p.sizes} /><Field name="brands" label="Marcas habituales" value={p.brands} />
        <Field name="budget_max" label="Presupuesto máx. por prenda (€)" type="number" value={p.budget_max ?? 80} /></div>
      <h3>Ajuste preferido</h3><Radios name="fit_pref" options={['Ajustado', 'Regular', 'Relajado', 'Amplio']} value={p.fit_pref} />
    </>)
    case 'a2': return (<>
      <h3>Medidas corporales (cm)</h3>
      <div className="grid">{MEASURES.map(([k, l]) => <Field key={k} name={k} label={l} type="number" value={b.measures[k]?.value} />)}</div>
      <p className="m small">Cada medida nueva se guarda con su fecha; las anteriores no se borran.</p>
    </>)
    case 'a3': return (<>
      <h3>Temperatura</h3><Radios name="temperature" options={['Cálida', 'Neutra', 'Fría']} value={b.color?.temperature} />
      <h3>Profundidad</h3><Radios name="depth" options={['Clara', 'Media', 'Oscura']} value={b.color?.depth} />
      <h3>Intensidad</h3><Radios name="intensity" options={['Suave', 'Media', 'Brillante']} value={b.color?.intensity} />
      <h3>Contraste</h3><Radios name="contrast" options={['Bajo', 'Medio', 'Alto']} value={b.color?.contrast} />
    </>)
    case 'a4': return (<>
      <h3>Dónde te sitúas</h3>
      {DIMS.map(([k, l, r]) => (
        <label key={k} className="range-row"><span>{l}</span>
          <input type="range" name={`d_${k}`} min={0} max={100} step={5} defaultValue={b.style?.dims?.[k] ?? 50} aria-label={`${l} o ${r}`} />
          <span>{r}</span></label>
      ))}
      <h3>Estilos que te atraen</h3><Checks name="styles" options={STYLES} values={b.style?.styles ?? []} />
    </>)
    case 'a5': return (<>
      <h3>Qué parte de tu armario dedicas a…</h3>
      {LIFE.map(([k, l]) => <LiveRange key={k} name={`l_${k}`} label={l} value={b.life?.life?.[k] ?? 0} />)}
      <h3>Restricciones prácticas</h3><Checks name="constraints" options={CONSTRAINTS} values={b.life?.constraints ?? []} />
    </>)
    case 'a6': return (<>{Object.entries(PREFS).map(([k, o]) => <div key={k}><h3>{k}</h3><Radios name={`p_${k}`} options={o} value={b.fit?.prefs?.[k]} /></div>)}</>)
    default: return (<>{GOALS.map((q, i) => <Field key={i} name={`g${i}`} label={q} value={b.goals?.answers?.[`g${i}`]} />)}</>)
  }
}
