import { STYLE_CATALOG, STYLE_GROUPS, elementLabel, styleName } from './catalog'
import { OUTFITS, RATINGS, normRating, outfitSvg, type Outfit } from './references'

/** Datos serializables para el componente de valoracion. */
export const raterItems = (os: Outfit[]) => os.map((o) => ({
  id: o.id, svg: outfitSvg(o), desc: o.desc, style: styleName(o.style), elements: o.elements.map((e) => ({ id: e, label: elementLabel(e) })),
}))
export const raterRatings = () => RATINGS.map((r) => ({ id: r.id, label: r.label }))
export const raterInitial = (rows: Record<string, any>[]) =>
  Object.fromEntries(rows.map((r) => [r.reference_id, { rating: normRating(r.rating), liked: r.liked_elements ?? [] }]))

/** Orden fijo de descubrimiento: un conjunto de cada estilo por ronda, alternando grupos (nunca agrupado por estilo). */
export function discoveryOrder(): Outfit[] {
  const order: Outfit[] = []
  for (const round of [0, 1]) {
    const groups = STYLE_GROUPS.map((g) => STYLE_CATALOG.filter((s) => s.group === g.id).map((s) => OUTFITS.filter((o) => o.style === s.id)[round]).filter(Boolean))
    for (let i = 0; groups.some((x) => x[i]); i++) for (const x of groups) if (x[i]) order.push(x[i])
  }
  return order
}

/**
 * Descubrimiento rapido: tandas de n conjuntos en orden fijo. Se muestra la primera tanda que aun tiene algo sin valorar,
 * asi los conjuntos no cambian de sitio mientras se valoran; al completarla aparece la siguiente.
 */
export function quickDiscovery(rated: Set<string>, n = 12): Outfit[] {
  const order = discoveryOrder()
  for (let i = 0; i < order.length; i += n) {
    const page = order.slice(i, i + n)
    if (page.some((o) => !rated.has(o.id))) return page
  }
  return order.slice(0, n)
}
