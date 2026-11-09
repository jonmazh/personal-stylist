import { getUser } from '@/lib/supabase/server'
import { loadBundle, filled } from '@/lib/profile/data'
import { AREAS } from '@/lib/profile/areas'
import { aiUsageSummary } from '@/lib/ai/usage'

/** Panel tecnico de la Definition of Done de la fase 1. No forma parte de la experiencia del usuario. */
export default async function EstadoPage() {
  const user = (await getUser())!
  const b = await loadBundle(user.supabase, user.id)
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
    ['Datos solo accesibles por el usuario (RLS verificada con dos cuentas)', process.env.RLS_VERIFIED === '1'],
  ]
  const usage = await aiUsageSummary(user.supabase)
  return (
    <main>
      <p className="eyebrow">Panel técnico</p>
      <h1 className="display">Estado de la fase 1</h1>
      <p className="lead">{dod.filter((d) => d[1]).length} de {dod.length} condiciones comprobadas con tus datos.</p>
      <ul className="checklist">{dod.map(([t, ok]) => <li key={t}><span className={ok ? 'ok' : 'm'}>{ok ? '✓' : '○'}</span>{t}</li>)}</ul>

      <h2>Consumo de IA · últimos 30 días</h2>
      <p className="m small">Proveedor: {usage.provider}. {usage.priced ? `Coste estimado con AI_PRICE_IN/AI_PRICE_OUT (€ por millón de tokens).` : 'Proveedor gratuito o sin precios configurados: coste 0 €.'} Los tokens solo constan cuando el proveedor los devuelve.</p>
      <div className="tscroll"><table className="usage">
        <thead><tr><th>Operación</th><th>Veces</th><th>Reutilizadas</th><th>Tokens (entrada / salida)</th><th>Tiempo medio</th><th>Coste</th></tr></thead>
        <tbody>{usage.rows.map((r) => (
          <tr key={r.kind}><td>{r.label}</td><td>{r.count}</td><td>{r.cached || '—'}</td><td>{r.prompt || r.completion ? `${r.prompt.toLocaleString('es-ES')} / ${r.completion.toLocaleString('es-ES')}` : '—'}</td><td>{r.avgMs ? `${(r.avgMs / 1000).toFixed(1)} s` : '—'}</td><td>{r.cost.toFixed(4)} €</td></tr>
        ))}{!usage.rows.length && <tr><td colSpan={6} className="m">Sin operaciones de IA todavía.</td></tr>}</tbody>
      </table></div>
    </main>
  )
}
