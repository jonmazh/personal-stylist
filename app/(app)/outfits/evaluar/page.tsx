import Link from 'next/link'
import { getUser } from '@/lib/supabase/server'
import { listGarments } from '@/lib/wardrobe/service'
import { garmentTitle } from '@/lib/wardrobe/display'
import { GROUPS } from '@/lib/wardrobe/taxonomy'
import { DRESS_CODES, WEATHERS } from '@/lib/outfits/engine/context'
import { OUTFIT_OCCASIONS, defaultRole, roleLabel, rolesFor } from '@/lib/outfits/taxonomy'
import { listOutfits } from '@/lib/outfits/service'
import { VisualEval } from '@/components/outfits/visual-eval'
import { PendingButton } from '@/components/outfits/pending-button'
import { evaluateTheoreticalAction } from '../learn-actions'

/** Outfit Evaluator: modo A (seleccionas prendas) y modo B (foto del conjunto puesto). */
export default async function EvaluatePage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams
  const user = (await getUser())!
  const [garments, outfits] = await Promise.all([listGarments(user.supabase, { status: 'active', sort: 'category' }).catch(() => []), listOutfits(user.supabase).catch(() => [])])
  return (
    <main className="wide">
      <p className="eyebrow"><Link href="/outfits">Outfit Studio</Link> · Evaluar</p>
      <h1 className="display">¿Qué opinas de este conjunto?</h1>
      {sp.error && <p className="note warn" role="alert">{sp.error}</p>}
      <h2>A · Evaluación teórica</h2>
      <p className="m">Elige prendas de tu armario: el motor puntúa la combinación (colores, volúmenes, ocasión, coherencia con tu identidad) y el estilista te da su opinión. No hace falta foto.</p>
      <form action={evaluateTheoreticalAction} className="evalform">
        {GROUPS.filter((g) => garments.some((x) => x.category === g.id)).map((grp) => (
          <fieldset key={grp.id} className="q"><legend>{grp.label}</legend>
            {garments.filter((g) => g.category === grp.id).map((g) => (
              <div key={g.id} className="evrow">
                <label className="chk"><input type="checkbox" name="garment" value={g.id} /> {garmentTitle(g)}</label>
                <select name={`role_${g.id}`} defaultValue={defaultRole(g)} aria-label={`Función de ${garmentTitle(g)}`}>{rolesFor(g).map((r) => <option key={r} value={r}>{roleLabel(r)}</option>)}</select>
              </div>
            ))}
          </fieldset>
        ))}
        <div className="grid">
          <label>Ocasión<select name="occasion" defaultValue=""><option value="">Sin indicar</option>{OUTFIT_OCCASIONS.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}</select></label>
          <label>Código de vestimenta<select name="dress_code" defaultValue=""><option value="">Sin indicar</option>{DRESS_CODES.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}</select></label>
          <label>Clima<select name="weather" defaultValue=""><option value="">Sin indicar</option>{WEATHERS.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}</select></label>
        </div>
        <div className="btns"><PendingButton label="Evaluar la combinación" pending="Evaluando…" /></div>
      </form>
      <h2>B · Evaluación visual</h2>
      <p className="m">Sube una foto tuya con el conjunto puesto: integración de las prendas, proporciones reales, largos, caída, capas y armonía.</p>
      <VisualEval uid={user.id} outfits={outfits.map((o) => ({ id: o.id, name: o.name }))} />
    </main>
  )
}
