import { BRAND_UNIVERSES, ELEMENT_IDS, styleById } from './catalog'
import type { Influence, Role } from './dna'

type Form = { getAll(name: string): FormDataEntryValue[] }
const ROLES: Role[] = ['principal', 'secundario', 'influencia']

/**
 * Valida la identidad declarada que envia el formulario «Mi identidad».
 * Filas: inf_style[], inf_role[], inf_weight[], inf_remove[] (ids a quitar); elementos: liked[], rejected[]; marcas: brands[].
 * Los porcentajes son orientativos: se avisa si no suman 100, pero no se fuerzan.
 */
export function buildIdentity(f: Form) {
  const warnings: string[] = []
  const styles = f.getAll('inf_style').map(String), roles = f.getAll('inf_role').map(String), weights = f.getAll('inf_weight').map(String)
  const remove = new Set(f.getAll('inf_remove').map(String))
  const seen = new Set<string>()
  let influences: Influence[] = []
  styles.forEach((s, i) => {
    if (!styleById(s) || remove.has(s) || seen.has(s)) return
    seen.add(s)
    const role = (ROLES.includes(roles[i] as Role) ? roles[i] : 'influencia') as Role
    const n = Number(weights[i])
    influences.push({ style: s, role, weight: Number.isFinite(n) ? Math.max(0, Math.min(100, Math.round(n))) : 0 })
  })
  // Un unico estilo principal: si se marcan varios, se queda el de mas peso.
  const principals = influences.filter((i) => i.role === 'principal').sort((a, z) => z.weight - a.weight)
  if (principals.length > 1) {
    warnings.push(`Solo puede haber un estilo principal: he dejado ${styleById(principals[0].style)!.name} y los demás como secundarios.`)
    influences = influences.map((i) => (i.role === 'principal' && i.style !== principals[0].style ? { ...i, role: 'secundario' } : i))
  }
  if (influences.length && !principals.length) {
    const top = [...influences].sort((a, z) => z.weight - a.weight)[0]
    influences = influences.map((i) => (i === top ? { ...i, role: 'principal' } : i))
    warnings.push(`No había estilo principal: he tomado ${styleById(top.style)!.name}, el de más peso.`)
  }
  const total = influences.reduce((a, i) => a + i.weight, 0)
  if (influences.length && total !== 100) warnings.push(`Tus influencias suman ${total} %. Es orientativo, pero si lo ajustas a 100 % se lee mejor.`)

  let liked = [...new Set(f.getAll('liked').map(String))].filter((e) => ELEMENT_IDS.includes(e))
  let rejected = [...new Set(f.getAll('rejected').map(String))].filter((e) => ELEMENT_IDS.includes(e))
  const both = liked.filter((e) => rejected.includes(e))
  if (both.length) { warnings.push('Has marcado algún elemento como preferido y rechazado a la vez: lo he quitado de los dos.'); liked = liked.filter((e) => !both.includes(e)); rejected = rejected.filter((e) => !both.includes(e)) }
  const brands = [...new Set(f.getAll('brands').map(String))].filter((id) => BRAND_UNIVERSES.some((b) => b.id === id))
  return { influences, liked, rejected, brands, warnings }
}
