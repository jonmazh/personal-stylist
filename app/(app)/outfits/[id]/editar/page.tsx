import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getUser } from '@/lib/supabase/server'
import { getOutfit } from '@/lib/outfits/service'
import { WardrobeError } from '@/lib/wardrobe/service'
import { OutfitBuilder, type PickG } from '@/components/outfits/builder'
import { pickableGarments } from '@/components/outfits/pick-data'

export default async function EditOutfitPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const user = (await getUser())!
  let o: Awaited<ReturnType<typeof getOutfit>>
  try { o = await getOutfit(user.supabase, id) } catch (e) { if (e instanceof WardrobeError && e.status === 404) notFound(); throw e }
  const garments = await pickableGarments(user.supabase)
  // Las prendas que ya estaban (aunque ahora esten archivadas) siguen disponibles para mantenerlas en el conjunto
  const extra: PickG[] = o.items.filter((i) => i.garment && !garments.some((g) => g.id === i.garment_id)).map((i) => ({
    id: i.garment_id, title: i.title, subtitle: '', category: i.garment!.category, subcategory: i.garment!.subcategory, primary_color: i.garment!.primary_color, thumb_url: i.thumb_url, wardrobe_status: i.garment!.wardrobe_status, decision: i.garment!.decision ?? null,
  }))
  return (
    <main className="wide">
      <p className="eyebrow"><Link href="/outfits">Outfit Studio</Link> · <Link href={`/outfits/${id}`}>{o.name}</Link> · Editar</p>
      <h1 className="display">Editar conjunto</h1>
      <OutfitBuilder garments={[...garments, ...extra.map((x) => ({ ...x }))].filter((g, i, a) => a.findIndex((y) => y.id === g.id) === i)} initial={{
        id,
        meta: { name: o.name, description: o.description ?? '', occasion: o.occasion ?? '', formality_level: o.formality_level ? String(o.formality_level) : '', seasons: o.seasons ?? [], tags: (o.tags ?? []).join(', ') },
        items: o.items.map((i) => ({ id: i.id, garment_id: i.garment_id, role: i.role, title: i.title, thumb_url: i.thumb_url, missing: i.state === 'missing' })),
      }} />
    </main>
  )
}
