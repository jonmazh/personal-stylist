import Link from 'next/link'
import { getUser } from '@/lib/supabase/server'
import { OutfitBuilder } from '@/components/outfits/builder'
import { pickableGarments } from '@/components/outfits/pick-data'

export default async function NewOutfitPage() {
  const user = (await getUser())!
  const garments = await pickableGarments(user.supabase)
  return (
    <main className="wide">
      <p className="eyebrow"><Link href="/outfits">Outfit Studio</Link> · Nuevo conjunto</p>
      <h1 className="display">Crear un conjunto</h1>
      <p className="m">Elige prendas reales de tu armario y la función de cada una. Nada se inventa: solo puedes usar lo que tienes registrado.</p>
      {garments.length === 0 ? <p className="note">Tu armario está vacío. <Link href="/armario/nueva">Añade prendas</Link> para crear conjuntos.</p> : <OutfitBuilder garments={garments} />}
    </main>
  )
}
