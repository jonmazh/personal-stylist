import { emeStudiosProductSource, EME_STUDIOS } from './eme-studios'
import { ucpSource, type UcpRetailer } from './ucp'

/** Registro de conectores UCP: cada tienda puede tener su conector propio; si no, el genérico. */
export function connectorSource(r: UcpRetailer) {
  return r.slug === EME_STUDIOS.slug ? emeStudiosProductSource(r) : ucpSource(r)
}
