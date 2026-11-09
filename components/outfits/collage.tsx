import type { OutfitItemView } from '@/lib/outfits/service'

/** Collage con las fotos reales de las prendas (miniaturas firmadas del armario; no se guardan copias). */
export function Collage({ items, max = 4, big }: { items: OutfitItemView[]; max?: number; big?: boolean }) {
  const shown = items.slice(0, max)
  return (
    <div className={`collage n${Math.min(shown.length, 4)}${big ? ' big' : ''}`} aria-hidden="true">
      {shown.map((i) => <span key={i.id}>{(big ? i.photo_url ?? i.thumb_url : i.thumb_url) ? <img src={(big ? i.photo_url ?? i.thumb_url : i.thumb_url)!} alt="" /> : <em>{i.title}</em>}</span>)}
      {!shown.length && <span><em>Sin prendas</em></span>}
    </div>
  )
}
