/**
 * Product Discovery (fase 4B): vocabulario del catálogo de productos candidatos. Es DATOS: la migración 0017 usa estas
 * listas en sus CHECK (una prueba lo verifica) y docs/PERSONAL-SHOPPER.md se genera desde aquí.
 */
export const SOURCE_KINDS = [
  { id: 'api', label: 'API autorizada', help: 'Integración estructurada concedida por la tienda o un proveedor autorizado.' },
  { id: 'feed', label: 'Feed autorizado', help: 'Catálogo en CSV, JSON o XML que te da un programa de afiliación o la propia marca.' },
  { id: 'search', label: 'Buscador de productos', help: 'Encuentra páginas de producto y las enlaza; no descarga su contenido.' },
  { id: 'url', label: 'Importación por URL', help: 'Lees tú una página concreta: solo sus metadatos públicos, si la tienda y robots.txt lo permiten.' },
  { id: 'manual', label: 'Importación asistida', help: 'Los datos y capturas que aportas tú.' },
] as const
export type SourceKind = (typeof SOURCE_KINDS)[number]['id']

/** Procedencia de cada dato de un producto (separada siempre: tienda, fotos, IA y tú). */
export const FIELD_ORIGINS = [
  { id: 'store', label: 'Tienda', help: 'Publicado por la tienda en la página del producto.' },
  { id: 'feed', label: 'Feed', help: 'Viene del feed autorizado.' },
  { id: 'search', label: 'Buscador', help: 'Resumen del buscador: hay que confirmarlo en la tienda.' },
  { id: 'channel3', label: 'Channel3', help: 'Datos de la tienda recopilados por el catálogo de Channel3 (precio y stock se vuelven a consultar antes de mostrarlos).' },
  { id: 'derived', label: 'Deducido', help: 'Deducido por reglas del nombre o la descripción de la tienda (p. ej. el tipo de prenda).' },
  { id: 'photo', label: 'Foto', help: 'Extraído de fotografías.' },
  { id: 'ai', label: 'IA', help: 'Inferencia de la IA, sin confirmar.' },
  { id: 'user', label: 'Tú', help: 'Introducido o confirmado por ti.' },
] as const
export type FieldOrigin = (typeof FIELD_ORIGINS)[number]['id']

export const AVAILABILITY = [
  { id: 'in_stock', label: 'Disponible' }, { id: 'limited', label: 'Pocas unidades' }, { id: 'out_of_stock', label: 'Agotado' },
  { id: 'preorder', label: 'Reserva' }, { id: 'unknown', label: 'Sin comprobar' },
] as const
export type Availability = (typeof AVAILABILITY)[number]['id']
export const PRODUCT_STATUSES = [
  { id: 'candidate', label: 'Candidato' }, { id: 'saved', label: 'Guardado' }, { id: 'discarded', label: 'Descartado' },
] as const
export const URL_POLICIES = [
  { id: 'metadata', label: 'Solo metadatos públicos', help: 'Una página, a petición tuya, si robots.txt lo permite.' },
  { id: 'manual_only', label: 'Solo enlace y tus datos', help: 'Sus condiciones no permiten la extracción automatizada.' },
] as const
export const FEED_FORMATS = ['csv', 'json', 'xml'] as const

/** Un precio o una talla se consideran caducados pasados estos días: hay que volver a verificarlos antes de decidir. */
export const STALE_DAYS = 3
/** Límites de la importación por URL. */
export const FETCH_LIMITS = { timeoutMs: 8000, maxBytes: 2_000_000, maxRedirects: 3, feedMaxBytes: 4_000_000, feedMaxItems: 5000 } as const
export const USER_AGENT = 'PersonalStylistBot/1.0 (importación de una página a petición del usuario; respeta robots.txt)'
export const ROBOTS_AGENT = 'PersonalStylistBot'
export const label = (xs: readonly { id: string; label: string }[], id?: string | null) => xs.find((x) => x.id === id)?.label ?? id ?? '—'
