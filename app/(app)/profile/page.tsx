import { getUser } from '@/lib/supabase/server'
import { loadBundle, filled, status, type Bundle } from '@/lib/profile/data'
import { AREAS, CONSTRAINTS, DIMS, GOALS, LIFE, MEASURES, PHOTO_KINDS, PREFS, STYLES } from '@/lib/profile/areas'
import { confClass } from '@/lib/profile/blueprint'
import { deletePhoto, generateBlueprint, reviewFinding, saveArea, toggleValidated } from './actions'
import { PhotoSlot } from './photo-slot'
import { AnalyzeButton } from './analyze-button'

const Radios = ({ name, options, value }: { name: string; options: string[]; value?: string | null }) => (
  <div className="opts">{options.map((o) => <label key={o}><input type="radio" name={name} value={o} defaultChecked={value === o} />{o}</label>)}</div>
)
const Checks = ({ name, options, values }: { name: string; options: string[]; values: string[] }) => (
  <div className="opts">{options.map((o) => <label key={o}><input type="checkbox" name={name} value={o} defaultChecked={values.includes(o)} />{o}</label>)}</div>
)
const Field = ({ name, label, type = 'text', value }: { name: string; label: string; type?: string; value?: string | number | null }) => (
  <label>{label}<input name={name} type={type} step="any" defaultValue={value ?? ''} /></label>
)

function AreaBody({ id, b }: { id: string; b: Bundle }) {
  const p = b.profile ?? {}
  switch (id) {
    case 'a1': return (<>
      <div className="grid"><Field name="age" label="Edad" type="number" value={p.age} /><Field name="height_cm" label="Altura (cm)" type="number" value={p.height_cm} />
        <Field name="weight_kg" label="Peso (kg, opcional)" type="number" value={p.weight_kg} /><Field name="city" label="Ciudad y país" value={p.city} />
        <Field name="sizes" label="Tallas habituales" value={p.sizes} /><Field name="brands" label="Marcas habituales" value={p.brands} />
        <Field name="budget_max" label="Presupuesto máx. por prenda (€)" type="number" value={p.budget_max ?? 80} /></div>
      <label>Ajuste preferido</label><Radios name="fit_pref" options={['Ajustado', 'Regular', 'Relajado', 'Amplio']} value={p.fit_pref} />
    </>)
    case 'a2': return (<>
      <p className="m">Cada medida nueva se guarda con fecha y origen; las anteriores no se borran. No estimo medidas desde fotos.</p>
      <div className="grid">{MEASURES.map(([k, l]) => <Field key={k} name={k} label={`${l} (cm)`} type="number" value={b.measures[k]?.value} />)}</div>
    </>)
    case 'a3': return (<>
      <label>Temperatura</label><Radios name="temperature" options={['Cálida', 'Neutra', 'Fría']} value={b.color?.temperature} />
      <label>Profundidad</label><Radios name="depth" options={['Clara', 'Media', 'Oscura']} value={b.color?.depth} />
      <label>Intensidad</label><Radios name="intensity" options={['Suave', 'Media', 'Brillante']} value={b.color?.intensity} />
      <label>Contraste</label><Radios name="contrast" options={['Bajo', 'Medio', 'Alto']} value={b.color?.contrast} />
    </>)
    case 'a4': return (<>
      {DIMS.map(([k, l, r]) => <label key={k}>{l} ↔ {r}<input type="range" name={`d_${k}`} min={0} max={100} step={5} defaultValue={b.style?.dims?.[k] ?? 50} /></label>)}
      <h3>Estilos que te atraen</h3><Checks name="styles" options={STYLES} values={b.style?.styles ?? []} />
    </>)
    case 'a5': return (<>
      {LIFE.map(([k, l]) => <label key={k}>{l} (% del armario)<input type="range" name={`l_${k}`} min={0} max={100} step={5} defaultValue={b.life?.life?.[k] ?? 0} /></label>)}
      <h3>Restricciones prácticas</h3><Checks name="constraints" options={CONSTRAINTS} values={b.life?.constraints ?? []} />
    </>)
    case 'a6': return (<>{Object.entries(PREFS).map(([k, o]) => <div key={k}><label>{k[0].toUpperCase() + k.slice(1)}</label><Radios name={`p_${k}`} options={o} value={b.fit?.prefs?.[k]} /></div>)}</>)
    default: return (<>{GOALS.map((q, i) => <Field key={i} name={`g${i}`} label={q} value={b.goals?.answers?.[`g${i}`]} />)}</>)
  }
}

export default async function ProfilePage({ searchParams }: { searchParams: Promise<{ v?: string }> }) {
  const user = (await getUser())!
  const { v } = await searchParams
  const b = await loadBundle(user.supabase, user.id)

  const { data: signed } = b.photos.length
    ? await user.supabase.storage.from('profile-private').createSignedUrls(b.photos.map((p) => p.storage_path), 300)
    : { data: [] as { path: string | null; signedUrl: string }[] }
  const urlOf = new Map((signed ?? []).map((s) => [s.path, s.signedUrl]))

  const last = b.blueprints.at(-1)
  const shown = b.blueprints.find((x) => String(x.version) === v) ?? last
  const allFindings = b.blueprints.flatMap((x) => x.findings)
  const dod: [string, boolean][] = [
    ['Completar y guardar el perfil progresivamente', AREAS.some((a) => filled(a.id, b))],
    ['Introducir y actualizar medidas', Object.keys(b.measures).length > 0],
    ['Subir fotografías de forma privada', b.photos.length > 0],
    ['La IA analiza fotos y genera observaciones estructuradas', b.observations.length > 0],
    ['Conclusiones con origen y nivel de confianza', allFindings.length > 0],
    ['Corregir y confirmar cada conclusión', allFindings.some((f) => f.status !== 'pending')],
    ['Generar el Style Blueprint', b.blueprints.length > 0],
    ['Consultar versiones anteriores', b.blueprints.length > 1],
    ['El chat consulta el perfil validado', b.chatValidated],
    ['Datos solo accesibles por el usuario (RLS verificada con dos cuentas; ver README)', process.env.RLS_VERIFIED === '1'],
  ]

  return (
    <main>
      <details><summary><b>Estado de la primera fase: {dod.filter((d) => d[1]).length}/10</b></summary>
        {dod.map(([t, ok]) => <p key={t}>{ok ? '✓' : '○'} {t}</p>)}
      </details>

      <h2>Tu expediente de estilismo</h2>
      <p className="m">Cada área pasa de pendiente a recopilada y, cuando tú la confirmas, a validada. El perfil es preliminar hasta validar las siete.</p>

      {AREAS.map((a) => {
        const [label, cls] = status(a.id, b)
        return (
          <details key={a.id}>
            <summary><b>{a.name}</b> <span className={`pill ${cls}`}>{label}</span></summary>
            <form action={saveArea}>
              <input type="hidden" name="area" value={a.id} />
              <AreaBody id={a.id} b={b} />
              <div className="btns"><button className="btn primary">Guardar</button></div>
            </form>
            {a.id === 'a2' && (<>
              <h3>Fotos (bucket privado)</h3>
              <div className="photos">
                {PHOTO_KINDS.map((k) => {
                  const ph = b.photos.find((p) => p.kind === k)
                  return ph ? (
                    <div key={k}><img src={urlOf.get(ph.storage_path) ?? ''} alt={k} />
                      <form action={deletePhoto}><input type="hidden" name="id" value={ph.id} /><button className="btn">Quitar {k}</button></form></div>
                  ) : <PhotoSlot key={k} uid={user.id} kind={k} />
                })}
              </div>
              <p className="m">Al analizar, las fotos se envían a OpenAI con una URL firmada de 2 minutos. La IA describe lo visible: no mide ni diagnostica.</p>
              <AnalyzeButton disabled={b.photos.length === 0} />
              {b.observations.length > 0 && <ul>{b.observations.map((o) => <li key={o.id}><b>{o.title}</b>: {o.body} <span className="m">({o.confidence})</span></li>)}</ul>}
            </>)}
            <form action={toggleValidated}>
              <input type="hidden" name="area" value={a.id} /><input type="hidden" name="next" value={b.validated[a.id] ? '0' : '1'} />
              <div className="btns"><button className="btn">{b.validated[a.id] ? 'Quitar validación' : 'Validar esta área'}</button></div>
            </form>
          </details>
        )
      })}

      <h3 id="blueprint">Style Blueprint</h3>
      <form action={generateBlueprint}><button className="btn primary">Generar diagnóstico</button></form>
      {!shown ? <p className="m">Aún no hay diagnóstico. Genéralo con lo que tengas: te diré también lo que no sé.</p> : (<>
        <div className="opts">{b.blueprints.map((x) => <a key={x.id} href={`/profile?v=${x.version}#blueprint`} className="btn">{`v${x.version} · ${x.created_at.slice(0, 10)}`}</a>)}</div>
        <div className="card">
          <div className="row"><b>Versión {shown.version}{shown !== last ? ' (solo lectura)' : ''}</b>
            <span className={`pill ${shown.validated_areas === 7 ? 'ok' : 'warn'}`}>{shown.validated_areas === 7 ? 'Perfil completo' : `Perfil preliminar · ${shown.validated_areas}/7 validadas`}</span></div>
          {shown.findings.map((f) => (
            <div key={f.id} className="find">
              <b>{f.title}</b>{' '}
              <span className={`pill ${f.status !== 'pending' ? 'ok' : confClass(f.confidence)}`}>{f.status === 'corrected' ? 'Corregida por ti' : f.status === 'confirmed' ? 'Confirmada por ti' : f.confidence}</span><br />
              {f.status === 'corrected' ? f.corrected_body : f.body}<br />
              <span className="m">Origen: {f.origin} · {f.justification}</span>
              {shown === last && (
                <form action={reviewFinding} className="btns">
                  <input type="hidden" name="id" value={f.id} />
                  <button className="btn" name="mode" value="confirm">Confirmar</button>
                  <input name="corrected" placeholder="Tu corrección" defaultValue={f.corrected_body ?? ''} style={{ flex: 1, minWidth: 140 }} />
                  <button className="btn" name="mode" value="correct">Corregir</button>
                </form>
              )}
            </div>
          ))}
        </div>
      </>)}
    </main>
  )
}
