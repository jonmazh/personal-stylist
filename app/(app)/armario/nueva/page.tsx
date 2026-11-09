import Link from 'next/link'
import { getUser } from '@/lib/supabase/server'
import { IMAGE_ROLES } from '@/lib/wardrobe/taxonomy'
import { STYLE_CATALOG } from '@/lib/style/catalog'
import { NewGarmentForm } from '@/components/wardrobe/new-garment-form'

export default async function NewGarmentPage() {
  const user = (await getUser())!
  return (
    <main>
      <p className="eyebrow">Armario digital · Incorporación</p>
      <h1 className="display">Añadir prenda</h1>
      <p className="lead">Haz una foto o elige varias de la galería, indica qué muestra cada una y completa lo que sepas. Todo se puede corregir después.</p>
      <NewGarmentForm uid={user.id} roles={IMAGE_ROLES} styles={STYLE_CATALOG.map((s) => ({ id: s.id, name: s.name }))} />
      <p className="m small" style={{ marginTop: 28 }}><Link href="/armario">← Volver al armario</Link></p>
    </main>
  )
}
