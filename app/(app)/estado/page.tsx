import { getUser } from '@/lib/supabase/server'
import { loadBundle, filled } from '@/lib/profile/data'
import { AREAS } from '@/lib/profile/areas'

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
  return (
    <main>
      <p className="eyebrow">Panel técnico</p>
      <h1 className="display">Estado de la fase 1</h1>
      <p className="lead">{dod.filter((d) => d[1]).length} de {dod.length} condiciones comprobadas con tus datos.</p>
      <ul className="checklist">{dod.map(([t, ok]) => <li key={t}><span className={ok ? 'ok' : 'm'}>{ok ? '✓' : '○'}</span>{t}</li>)}</ul>
    </main>
  )
}
