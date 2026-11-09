import { GARMENT_HEX } from '@/lib/style/references'
import { LIFE } from '@/lib/profile/areas'

/**
 * Taxonomia del armario masculino (Fase 2). UNICA fuente de verdad de categorias, subcategorias y
 * atributos tecnicos por familia de prenda: de aqui salen los formularios, la validacion (lib/wardrobe/schema.ts),
 * los CHECK de la base de datos y, en la fase 2B, el esquema de salida de la IA. Ver docs/ARMARIO.md.
 */
export interface Sub { id: string; label: string; family: Family }
export interface Group { id: string; label: string; primary: boolean; subs: Sub[] }
export type Family = 'top' | 'shirt' | 'jacket' | 'bottom' | 'footwear' | 'accessory' | 'basic'

const s = (id: string, label: string, family: Family): Sub => ({ id, label, family })

export const GROUPS: Group[] = [
  { id: 'top', label: 'Parte superior', primary: true, subs: [
    s('tee', 'Camiseta', 'top'), s('polo', 'Polo', 'top'), s('shirt', 'Camisa', 'shirt'), s('knit', 'Jersey', 'top'),
    s('cardigan', 'Cárdigan', 'top'), s('sweatshirt', 'Sudadera', 'top'), s('hoodie', 'Sudadera con capucha', 'top'), s('turtleneck', 'Cuello alto', 'top'), s('tank', 'Camiseta sin mangas', 'top')] },
  { id: 'outerwear', label: 'Prendas exteriores', primary: true, subs: [
    s('blazer', 'Blazer / americana', 'jacket'), s('jacket', 'Chaqueta o cazadora', 'jacket'), s('denim_jacket', 'Cazadora vaquera', 'jacket'), s('leather_jacket', 'Cazadora de cuero', 'jacket'),
    s('bomber', 'Bomber', 'jacket'), s('overshirt', 'Sobrecamisa', 'shirt'), s('coat', 'Abrigo', 'jacket'), s('trench', 'Gabardina', 'jacket'), s('parka', 'Parka', 'jacket'), s('puffer', 'Plumífero', 'jacket'), s('gilet', 'Chaleco acolchado', 'jacket')] },
  { id: 'bottom', label: 'Parte inferior', primary: true, subs: [
    s('jeans', 'Vaqueros', 'bottom'), s('chinos', 'Chinos', 'bottom'), s('trousers', 'Pantalón de vestir', 'bottom'), s('cargo', 'Pantalón cargo', 'bottom'),
    s('joggers', 'Jogger o chándal', 'bottom'), s('shorts', 'Shorts o bermudas', 'bottom')] },
  { id: 'footwear', label: 'Calzado', primary: true, subs: [
    s('sneakers', 'Zapatillas', 'footwear'), s('loafers', 'Mocasines', 'footwear'), s('boots', 'Botas', 'footwear'), s('derby', 'Zapatos de cordones', 'footwear'), s('sandals', 'Sandalias', 'footwear')] },
  { id: 'accessories', label: 'Complementos', primary: true, subs: [
    s('belt', 'Cinturón', 'accessory'), s('watch', 'Reloj', 'accessory'), s('glasses', 'Gafas', 'accessory'), s('scarf', 'Bufanda', 'accessory'), s('bag', 'Bolso o mochila', 'accessory'),
    s('headwear', 'Gorra o gorro', 'accessory'), s('tie', 'Corbata', 'accessory'), s('jewelry', 'Joyería', 'accessory'), s('other_accessory', 'Otro complemento', 'accessory')] },
  { id: 'tailoring', label: 'Sastrería y ocasiones', primary: true, subs: [
    s('suit', 'Traje', 'jacket'), s('waistcoat', 'Chaleco', 'top'), s('tuxedo', 'Esmoquin', 'jacket'), s('special', 'Prenda especial', 'basic')] },
  { id: 'sport', label: 'Ropa deportiva', primary: false, subs: [s('sport_top', 'Camiseta técnica', 'top'), s('sport_bottom', 'Pantalón deportivo', 'bottom'), s('sport_jacket', 'Chaqueta deportiva', 'jacket')] },
  { id: 'underwear', label: 'Ropa interior', primary: false, subs: [s('underwear', 'Ropa interior', 'basic'), s('socks', 'Calcetines', 'basic')] },
  { id: 'sleepwear', label: 'Descanso y casa', primary: false, subs: [s('pajamas', 'Pijama', 'basic'), s('loungewear', 'Ropa de casa', 'basic')] },
]

export const SUBS = GROUPS.flatMap((g) => g.subs.map((x) => ({ ...x, group: g.id })))
export const groupOf = (id: string) => GROUPS.find((g) => g.id === id)
export const subOf = (id: string | null | undefined) => SUBS.find((x) => x.id === id)
export const familyOf = (sub: string | null | undefined, group?: string): Family => subOf(sub)?.family ?? (group === 'bottom' ? 'bottom' : group === 'footwear' ? 'footwear' : group === 'accessories' ? 'accessory' : group === 'outerwear' ? 'jacket' : group === 'top' ? 'top' : 'basic')

// ── Atributos tecnicos por familia (3.2) ──
export interface AttrDef { key: string; label: string; options: string[] }
const a = (key: string, label: string, options: string[]): AttrDef => ({ key, label, options })

export const ATTRIBUTES: Record<Family, AttrDef[]> = {
  bottom: [
    a('rise', 'Tiro', ['Bajo', 'Medio', 'Alto']),
    a('leg', 'Pernera', ['Estrecha', 'Regular', 'Amplia']),
    a('hem', 'Bajo', ['Estrecho', 'Recto', 'Amplio']),
    a('pleats', 'Pinzas', ['Sí', 'No']),
    a('crease', 'Raya o pliegue marcado', ['Sí', 'No']),
    a('waist', 'Cintura', ['Estructurada', 'Elástica', 'Ajustable']),
    a('length', 'Largo', ['Corto', 'Regular', 'Largo']),
    a('structure', 'Estructura del tejido', ['Ligera', 'Media', 'Rígida']),
  ],
  jacket: [
    a('shoulder', 'Hombro', ['Natural', 'Construido', 'Caído', 'Raglán']),
    a('structure', 'Estructura', ['Desestructurada', 'Media', 'Estructurada']),
    a('length', 'Largo', ['Corto', 'A la cadera', 'Medio', 'Largo']),
    a('lapel', 'Solapa', ['De muesca', 'De pico', 'Chal', 'Sin solapa']),
    a('buttons', 'Botones', ['Uno', 'Dos', 'Tres', 'Cruzado', 'Sin botones']),
    a('closure', 'Cierre', ['Botones', 'Cremallera', 'Broches', 'Abierto']),
    a('sleeve_width', 'Anchura de manga', ['Estrecha', 'Regular', 'Amplia']),
    a('collar', 'Cuello', ['Solapa', 'Camisero', 'Alto', 'Capucha', 'Sin cuello']),
  ],
  shirt: [
    a('collar', 'Cuello', ['Italiano', 'Inglés', 'Button-down', 'Mao', 'Cubano', 'Cutaway']),
    a('shoulder', 'Construcción del hombro', ['Costura en el hombro', 'Costura caída']),
    a('sleeve', 'Manga', ['Corta', 'Larga']),
    a('length', 'Largo', ['Corto', 'Regular', 'Largo']),
    a('cuff', 'Puño', ['Simple', 'Doble', 'De botón', 'Sin puño']),
    a('texture', 'Textura', ['Lisa', 'Oxford', 'Popelín', 'Franela', 'Lino', 'Sarga', 'Pana']),
  ],
  top: [
    a('neckline', 'Cuello', ['Redondo', 'De pico', 'Polo', 'Alto', 'Capucha', 'Henley']),
    a('sleeve', 'Manga', ['Sin mangas', 'Corta', 'Larga']),
    a('length', 'Largo', ['Corto', 'Regular', 'Largo']),
    a('weight', 'Grosor', ['Ligero', 'Medio', 'Grueso']),
  ],
  footwear: [
    a('toe', 'Puntera', ['Redonda', 'Almendrada', 'Cuadrada']),
    a('sole', 'Suela', ['Fina', 'Media', 'Gruesa']),
    a('closure', 'Cierre', ['Cordones', 'Sin cordones', 'Hebilla', 'Velcro', 'Cremallera']),
    a('height', 'Altura', ['Baja', 'Media caña', 'Alta']),
  ],
  accessory: [
    a('size', 'Tamaño', ['Pequeño', 'Mediano', 'Grande']),
    a('hardware', 'Metales', ['Plateado', 'Dorado', 'Negro', 'Sin metales']),
  ],
  basic: [],
}

/** Corte (columna `cut`): opciones segun familia. */
export const CUTS: Record<Family, string[]> = {
  bottom: ['Slim', 'Tapered', 'Recto', 'Wide'],
  jacket: ['Entallado', 'Regular', 'Relajado', 'Oversize'],
  shirt: ['Entallado', 'Regular', 'Relajado', 'Oversize'],
  top: ['Ajustado', 'Regular', 'Relajado', 'Oversize'],
  footwear: [], accessory: [], basic: ['Ajustado', 'Regular', 'Relajado'],
}

// ── Valores generales ──
export const SILHOUETTES = ['Ajustada', 'Regular', 'Amplia']
export const PATTERNS = ['Liso', 'Rayas', 'Cuadros', 'Estampado', 'Gráfico', 'Textura', 'Otro']
export const SEASONS = [{ id: 'primavera', label: 'Primavera' }, { id: 'verano', label: 'Verano' }, { id: 'otono', label: 'Otoño' }, { id: 'invierno', label: 'Invierno' }]
export const CONDITIONS = [{ id: 'nuevo', label: 'Nuevo' }, { id: 'bueno', label: 'Buen estado' }, { id: 'usado', label: 'Usado' }, { id: 'desgastado', label: 'Desgastado' }, { id: 'danado', label: 'Dañado' }, { id: 'desconocido', label: 'Sin indicar' }]
export const STATUSES = [{ id: 'draft', label: 'Borrador' }, { id: 'active', label: 'En el armario' }, { id: 'archived', label: 'Archivada' }]
export const OCCASIONS = LIFE.map(([id, label]) => ({ id, label }))
export const COMPOSITION_SOURCES = [{ id: 'etiqueta', label: 'Etiqueta' }, { id: 'ficha', label: 'Ficha comercial' }, { id: 'usuario', label: 'Introducida por mí' }]
export const IMAGE_ROLES = [
  { id: 'front', label: 'Vista frontal' }, { id: 'back', label: 'Vista posterior' }, { id: 'detail', label: 'Detalle del tejido' },
  { id: 'label', label: 'Etiqueta (composición y talla)' }, { id: 'worn', label: 'Llevándola puesta' }, { id: 'other', label: 'Otra' },
]
/** Colores: los de la paleta de la app y los textiles habituales (con su muestra). */
export const GARMENT_COLORS = [...Object.keys(GARMENT_HEX), 'Verde', 'Amarillo', 'Naranja', 'Multicolor']
export const COLOR_SWATCH: Record<string, string> = { ...GARMENT_HEX, Verde: '#3F6B48', Amarillo: '#E2C044', Naranja: '#D9772E', Multicolor: 'conic-gradient(#B0282E, #E2C044, #3F6B48, #1F2A44, #B0282E)' }
