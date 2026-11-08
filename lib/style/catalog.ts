/**
 * Catalogo de identidad estetica (BIS 1): estilos, elementos visuales y universos de marca.
 * Es DATOS, desacoplado de la interfaz: añadir o relacionar un estilo es añadir una entrada aqui
 * (los ids son estables porque las valoraciones y la identidad del usuario los referencian).
 * Ver docs/STYLE-DNA.md (npm run docs).
 */

// ── Elementos visuales: el vocabulario comun de conjuntos, estilos, marcas y referencias propias ──
export const ELEMENT_GROUPS = ['Silueta', 'Prendas', 'Calzado', 'Complementos', 'Color', 'Construcción'] as const
export type ElementGroup = (typeof ELEMENT_GROUPS)[number]

export const ELEMENTS = [
  { id: 'top-oversize', group: 'Silueta', label: 'Parte de arriba oversize' },
  { id: 'top-fitted', group: 'Silueta', label: 'Parte de arriba ajustada' },
  { id: 'leg-slim', group: 'Silueta', label: 'Pantalón slim' },
  { id: 'leg-straight', group: 'Silueta', label: 'Pantalón recto' },
  { id: 'leg-wide', group: 'Silueta', label: 'Pantalón amplio (wide leg)' },
  { id: 'leg-baggy', group: 'Silueta', label: 'Pantalón baggy' },
  { id: 'leg-jogger', group: 'Silueta', label: 'Pantalón de chándal o jogger' },
  { id: 'graphic-tee', group: 'Prendas', label: 'Camiseta gráfica' },
  { id: 'basic-tee', group: 'Prendas', label: 'Camiseta básica' },
  { id: 'hoodie', group: 'Prendas', label: 'Sudadera' },
  { id: 'tracksuit', group: 'Prendas', label: 'Chándal o chaqueta técnica' },
  { id: 'puffer', group: 'Prendas', label: 'Plumífero' },
  { id: 'leather', group: 'Prendas', label: 'Cazadora de cuero' },
  { id: 'denim-jacket', group: 'Prendas', label: 'Cazadora vaquera' },
  { id: 'varsity', group: 'Prendas', label: 'Cazadora varsity' },
  { id: 'blazer', group: 'Prendas', label: 'Americana' },
  { id: 'long-coat', group: 'Prendas', label: 'Abrigo largo' },
  { id: 'overshirt', group: 'Prendas', label: 'Sobrecamisa' },
  { id: 'knit', group: 'Prendas', label: 'Punto' },
  { id: 'shirt', group: 'Prendas', label: 'Camisa' },
  { id: 'polo', group: 'Prendas', label: 'Polo' },
  { id: 'turtleneck', group: 'Prendas', label: 'Cuello alto' },
  { id: 'flannel', group: 'Prendas', label: 'Camisa de cuadros' },
  { id: 'cardigan', group: 'Prendas', label: 'Cárdigan' },
  { id: 'cargo', group: 'Prendas', label: 'Pantalón cargo' },
  { id: 'denim', group: 'Prendas', label: 'Vaquero' },
  { id: 'tailoring', group: 'Prendas', label: 'Pantalón de sastrería' },
  { id: 'sneaker', group: 'Calzado', label: 'Zapatilla limpia' },
  { id: 'chunky', group: 'Calzado', label: 'Zapatilla chunky' },
  { id: 'runner', group: 'Calzado', label: 'Zapatilla de running' },
  { id: 'skate', group: 'Calzado', label: 'Zapatilla de skate' },
  { id: 'loafer', group: 'Calzado', label: 'Mocasín' },
  { id: 'derby', group: 'Calzado', label: 'Zapato de cordones' },
  { id: 'boot', group: 'Calzado', label: 'Bota' },
  { id: 'cap', group: 'Complementos', label: 'Gorra' },
  { id: 'beanie', group: 'Complementos', label: 'Gorro' },
  { id: 'chain', group: 'Complementos', label: 'Cadena' },
  { id: 'crossbody', group: 'Complementos', label: 'Bandolera' },
  { id: 'sunglasses', group: 'Complementos', label: 'Gafas de sol' },
  { id: 'monochrome', group: 'Color', label: 'Monocromo' },
  { id: 'tonal', group: 'Color', label: 'Tonos tierra o tonal' },
  { id: 'contrast', group: 'Color', label: 'Contraste claro-oscuro' },
  { id: 'accent', group: 'Color', label: 'Un color de acento' },
  { id: 'layers', group: 'Construcción', label: 'Capas y superposiciones' },
  { id: 'clean-lines', group: 'Construcción', label: 'Líneas limpias' },
  { id: 'vintage', group: 'Construcción', label: 'Vintage o retro' },
  { id: 'technical', group: 'Construcción', label: 'Tejidos técnicos' },
] as const satisfies readonly { id: string; group: ElementGroup; label: string }[]
export type ElementId = (typeof ELEMENTS)[number]['id']
export const ELEMENT_IDS = ELEMENTS.map((e) => e.id) as string[]
export const elementLabel = (id: string) => ELEMENTS.find((e) => e.id === id)?.label ?? id

// ── Estilos ──
export const STYLE_GROUPS = [
  { id: 'urbano', name: 'Urbanos y contemporáneos' },
  { id: 'minimal', name: 'Minimalistas y modernos' },
  { id: 'clasico', name: 'Clásicos y sofisticados' },
  { id: 'alternativo', name: 'Alternativos y de inspiración editorial' },
] as const
export type StyleGroupId = (typeof STYLE_GROUPS)[number]['id']

export interface StyleDef {
  id: string
  name: string
  group: StyleGroupId
  description: string
  traits: string[]          // caracteristicas principales
  silhouettes: string[]     // siluetas habituales
  garments: string[]        // prendas caracteristicas
  footwear: string[]        // calzado y complementos habituales
  palette: string[]         // colores frecuentes (de la paleta de la app)
  related: string[]         // ids de estilos relacionados
  elements: ElementId[]     // elementos visuales que lo definen
  legacy?: string           // nombre del estilo en versiones anteriores de la app
}

const S = (d: StyleDef) => d
export const STYLE_CATALOG: StyleDef[] = [
  // A · Urbanos y contemporaneos
  S({ id: 'urban-casual', name: 'Urban casual', group: 'urbano', description: 'Ropa de calle cómoda y combinable: básicos urbanos sin estridencias.', traits: ['Básicos con algún detalle', 'Comodidad ante todo', 'Fácil de combinar'], silhouettes: ['Arriba regular u holgado', 'Pantalón recto'], garments: ['Sudadera', 'Camiseta', 'Vaquero recto', 'Cazadora ligera'], footwear: ['Zapatilla limpia', 'Gorra'], palette: ['Gris', 'Negro', 'Blanco', 'Azul marino'], related: ['contemporary-casual', 'clean-streetwear', 'modern-basics'], elements: ['hoodie', 'basic-tee', 'denim', 'leg-straight', 'sneaker'] }),
  S({ id: 'streetwear-contemporaneo', name: 'Streetwear contemporáneo', group: 'urbano', description: 'La calle como pasarela: volúmenes amplios, gráficas y zapatillas protagonistas.', traits: ['Volumen', 'Gráficas y logos', 'Zapatilla como pieza clave'], silhouettes: ['Oversize arriba', 'Pantalón amplio o cargo'], garments: ['Sudadera oversize', 'Camiseta gráfica', 'Cargo', 'Bomber'], footwear: ['Zapatilla chunky o de running', 'Gorra', 'Bandolera'], palette: ['Negro', 'Gris', 'Blanco', 'Verde bosque'], related: ['clean-streetwear', 'retro-streetwear', 'hip-hop-inspired'], elements: ['top-oversize', 'hoodie', 'graphic-tee', 'cargo', 'leg-wide', 'chunky', 'runner'], legacy: 'Streetwear contemporáneo' }),
  S({ id: 'clean-streetwear', name: 'Clean streetwear', group: 'urbano', description: 'Streetwear depurado: volúmenes urbanos con paleta neutra y sin ruido gráfico.', traits: ['Neutros', 'Pocas gráficas', 'Proporciones cuidadas'], silhouettes: ['Arriba holgado y limpio', 'Pantalón recto o amplio'], garments: ['Sudadera lisa', 'Camiseta pesada', 'Pantalón amplio', 'Sobrecamisa'], footwear: ['Zapatilla limpia', 'Gorro'], palette: ['Blanco', 'Gris', 'Negro', 'Beige'], related: ['streetwear-contemporaneo', 'urban-minimalism', 'clean-cani'], elements: ['top-oversize', 'hoodie', 'leg-wide', 'sneaker', 'clean-lines', 'monochrome'] }),
  S({ id: 'clean-cani', name: 'Clean cani', group: 'urbano', description: 'La estética cani de barrio pasada por un filtro limpio: chándal conjuntado, monocromo y cuidado al detalle.', traits: ['Chándal o prenda técnica conjuntada', 'Monocromo', 'Detalle cuidado (cadena, bandolera)'], silhouettes: ['Arriba ajustado o regular', 'Pantalón de chándal o recto'], garments: ['Chaqueta de chándal', 'Pantalón de chándal', 'Plumífero corto', 'Camiseta ajustada'], footwear: ['Zapatilla de running', 'Cadena', 'Bandolera', 'Gorra'], palette: ['Negro', 'Blanco', 'Gris'], related: ['modern-cani', 'sporty-urban', 'clean-streetwear'], elements: ['tracksuit', 'leg-jogger', 'runner', 'chain', 'crossbody', 'monochrome', 'top-fitted'] }),
  S({ id: 'modern-cani', name: 'Modern cani', group: 'urbano', description: 'El código cani actualizado con piezas técnicas, plumíferos y siluetas actuales.', traits: ['Técnico', 'Plumífero', 'Zapatilla de running'], silhouettes: ['Arriba voluminoso (plumífero)', 'Pantalón de chándal ajustado al tobillo'], garments: ['Plumífero', 'Chándal técnico', 'Cuello alto técnico'], footwear: ['Zapatilla de running', 'Bandolera', 'Gorra', 'Cadena'], palette: ['Negro', 'Gris', 'Blanco', 'Azul marino'], related: ['clean-cani', 'sporty-urban', 'streetwear-contemporaneo'], elements: ['puffer', 'tracksuit', 'leg-jogger', 'runner', 'technical', 'crossbody'] }),
  S({ id: 'urban-minimalism', name: 'Urban minimalism', group: 'urbano', description: 'Ciudad y minimalismo: negros y grises, cortes amplios y nada que sobre.', traits: ['Monocromo oscuro', 'Volumen controlado', 'Sin logos'], silhouettes: ['Arriba amplio', 'Pantalón amplio'], garments: ['Abrigo largo', 'Camiseta pesada', 'Pantalón amplio'], footwear: ['Zapatilla limpia negra o bota'], palette: ['Negro', 'Gris', 'Blanco'], related: ['clean-streetwear', 'minimalismo-contemporaneo', 'contemporary-essentials'], elements: ['monochrome', 'clean-lines', 'leg-wide', 'long-coat', 'top-oversize'] }),
  S({ id: 'skate-inspired', name: 'Skate inspired', group: 'urbano', description: 'Funcional y despreocupado: pantalón amplio, gráficas y zapatilla de skate.', traits: ['Holgura', 'Gráficas', 'Ropa que aguanta'], silhouettes: ['Arriba holgado', 'Pantalón baggy o amplio'], garments: ['Camiseta gráfica', 'Camisa de cuadros', 'Vaquero baggy', 'Sudadera'], footwear: ['Zapatilla de skate', 'Gorro'], palette: ['Azul marino', 'Beige', 'Negro', 'Rojo'], related: ['retro-streetwear', 'urban-vintage', 'streetwear-contemporaneo'], elements: ['graphic-tee', 'leg-baggy', 'skate', 'flannel', 'beanie', 'denim'] }),
  S({ id: 'sporty-urban', name: 'Sporty urban', group: 'urbano', description: 'Prendas deportivas fuera del gimnasio, combinadas con intención.', traits: ['Técnico', 'Deportivo', 'Cómodo'], silhouettes: ['Arriba regular', 'Jogger o pantalón técnico'], garments: ['Chaqueta técnica', 'Jogger', 'Sudadera', 'Camiseta técnica'], footwear: ['Zapatilla de running', 'Gorra'], palette: ['Negro', 'Gris', 'Blanco', 'Azul marino'], related: ['clean-cani', 'modern-cani', 'urban-casual'], elements: ['tracksuit', 'leg-jogger', 'runner', 'technical', 'cap'] }),
  S({ id: 'hip-hop-inspired', name: 'Hip-hop inspired', group: 'urbano', description: 'Volumen generoso, denim amplio y complementos con presencia.', traits: ['Muy holgado', 'Denim', 'Complementos visibles'], silhouettes: ['Oversize marcado', 'Vaquero baggy'], garments: ['Camiseta XL', 'Varsity', 'Vaquero baggy', 'Sudadera'], footwear: ['Zapatilla chunky', 'Cadena', 'Gorra'], palette: ['Negro', 'Blanco', 'Azul marino', 'Rojo'], related: ['streetwear-contemporaneo', 'retro-streetwear', 'skate-inspired'], elements: ['top-oversize', 'leg-baggy', 'denim', 'chain', 'cap', 'chunky', 'varsity'] }),
  S({ id: 'contemporary-casual', name: 'Contemporary casual', group: 'urbano', description: 'Casual actual: prendas del momento combinadas con sencillez.', traits: ['Actual', 'Sencillo', 'Versátil'], silhouettes: ['Arriba regular o relajado', 'Pantalón recto'], garments: ['Sobrecamisa', 'Camiseta', 'Vaquero recto', 'Punto'], footwear: ['Zapatilla limpia'], palette: ['Azul marino', 'Blanco', 'Beige', 'Gris'], related: ['urban-casual', 'elevated-casual', 'modern-basics'], elements: ['overshirt', 'basic-tee', 'denim', 'leg-straight', 'sneaker'] }),
  // B · Minimalistas y modernos
  S({ id: 'minimalismo-contemporaneo', name: 'Minimalismo contemporáneo', group: 'minimal', description: 'Menos prendas, mejor elegidas: líneas puras y paleta corta.', traits: ['Líneas limpias', 'Paleta corta', 'Calidad sobre cantidad'], silhouettes: ['Regular o algo amplio', 'Pantalón recto'], garments: ['Punto fino', 'Pantalón de sastrería', 'Abrigo sin adornos'], footwear: ['Zapato de cordones', 'Zapatilla limpia'], palette: ['Negro', 'Blanco', 'Gris', 'Beige'], related: ['scandinavian-minimalism', 'clean-aesthetic', 'urban-minimalism'], elements: ['clean-lines', 'monochrome', 'knit', 'tailoring', 'leg-straight'] }),
  S({ id: 'clean-aesthetic', name: 'Clean aesthetic', group: 'minimal', description: 'Pulcro y luminoso: blancos, cremas y prendas impecables.', traits: ['Pulcritud', 'Tonos claros', 'Ajuste exacto'], silhouettes: ['Regular', 'Pantalón recto'], garments: ['Camiseta blanca', 'Camisa', 'Chino claro', 'Punto'], footwear: ['Zapatilla blanca', 'Mocasín'], palette: ['Blanco', 'Beige', 'Gris', 'Azul claro'], related: ['minimalismo-contemporaneo', 'modern-basics', 'quiet-luxury'], elements: ['clean-lines', 'basic-tee', 'sneaker', 'leg-straight', 'tonal'] }),
  S({ id: 'modern-basics', name: 'Modern basics', group: 'minimal', description: 'Un armario de básicos actuales que se combinan todos entre sí.', traits: ['Básicos', 'Versatilidad', 'Sin estridencias'], silhouettes: ['Regular', 'Recto'], garments: ['Camiseta', 'Sudadera lisa', 'Chino', 'Vaquero'], footwear: ['Zapatilla limpia'], palette: ['Azul marino', 'Gris', 'Blanco', 'Negro'], related: ['contemporary-essentials', 'clean-aesthetic', 'urban-casual'], elements: ['basic-tee', 'leg-straight', 'sneaker', 'clean-lines'] }),
  S({ id: 'scandinavian-minimalism', name: 'Scandinavian minimalism', group: 'minimal', description: 'Minimalismo nórdico: funcional, sobrio y con texturas naturales.', traits: ['Funcional', 'Texturas naturales', 'Sobriedad'], silhouettes: ['Regular', 'Abrigo largo'], garments: ['Abrigo de lana', 'Punto grueso', 'Pantalón recto', 'Sobrecamisa'], footwear: ['Bota', 'Zapatilla limpia'], palette: ['Gris', 'Negro', 'Blanco', 'Beige'], related: ['minimalismo-contemporaneo', 'contemporary-essentials', 'urban-minimalism'], elements: ['long-coat', 'knit', 'clean-lines', 'monochrome', 'boot'], legacy: 'Minimalismo escandinavo' }),
  S({ id: 'elevated-casual', name: 'Elevated casual', group: 'minimal', description: 'Casual subido de nivel: prendas cómodas con tejido y ajuste de calidad.', traits: ['Casual bien hecho', 'Tejidos con presencia', 'Ajuste cuidado'], silhouettes: ['Regular', 'Pantalón recto'], garments: ['Sobrecamisa', 'Punto', 'Vaquero oscuro', 'Camisa'], footwear: ['Zapatilla limpia', 'Zapato de cordones'], palette: ['Azul marino', 'Camel', 'Blanco', 'Gris'], related: ['contemporary-casual', 'smart-casual', 'quiet-luxury'], elements: ['overshirt', 'knit', 'denim', 'sneaker', 'layers'], legacy: 'Casual sofisticado' }),
  S({ id: 'contemporary-essentials', name: 'Contemporary essentials', group: 'minimal', description: 'Los imprescindibles de hoy en versión actual: algo más amplios y limpios.', traits: ['Esenciales', 'Volumen actual', 'Neutros'], silhouettes: ['Algo amplio arriba', 'Pantalón amplio'], garments: ['Camiseta pesada', 'Pantalón amplio', 'Abrigo'], footwear: ['Zapatilla limpia'], palette: ['Beige', 'Gris', 'Negro', 'Blanco'], related: ['modern-basics', 'urban-minimalism', 'scandinavian-minimalism'], elements: ['basic-tee', 'leg-wide', 'clean-lines', 'tonal'] }),
  // C · Clasicos y sofisticados
  S({ id: 'old-money', name: 'Old money', group: 'clasico', description: 'Elegancia heredada: punto, sastrería relajada y nada de logos.', traits: ['Sin logos', 'Punto y sastrería', 'Tonos crema y marino'], silhouettes: ['Regular o amplio', 'Pantalón de pinzas'], garments: ['Jersey de punto', 'Camisa', 'Pantalón de pinzas', 'Americana'], footwear: ['Mocasín'], palette: ['Beige', 'Azul marino', 'Blanco', 'Camel'], related: ['quiet-luxury', 'preppy-contemporaneo', 'classic-contemporary'], elements: ['knit', 'shirt', 'tailoring', 'loafer', 'tonal'], legacy: 'Old money' }),
  S({ id: 'quiet-luxury', name: 'Quiet luxury', group: 'clasico', description: 'Lujo que no se anuncia: tejido excelente, corte perfecto y paleta silenciosa.', traits: ['Tejido de calidad', 'Corte exacto', 'Paleta silenciosa'], silhouettes: ['Regular', 'Pantalón recto'], garments: ['Punto fino', 'Abrigo', 'Pantalón de sastrería', 'Polo de punto'], footwear: ['Mocasín', 'Zapato de cordones'], palette: ['Camel', 'Beige', 'Gris', 'Azul marino'], related: ['old-money', 'classic-contemporary', 'clean-aesthetic'], elements: ['knit', 'tailoring', 'loafer', 'tonal', 'clean-lines'] }),
  S({ id: 'classic-contemporary', name: 'Classic contemporary', group: 'clasico', description: 'Lo clásico con cortes de hoy: americana, camisa y pantalón bien ajustados.', traits: ['Estructura', 'Clásico actualizado', 'Formalidad media-alta'], silhouettes: ['Regular', 'Pantalón recto'], garments: ['Americana', 'Camisa', 'Pantalón de vestir', 'Abrigo'], footwear: ['Mocasín', 'Zapato de cordones'], palette: ['Azul marino', 'Gris', 'Blanco', 'Camel'], related: ['smart-casual', 'old-money', 'casual-tailoring'], elements: ['blazer', 'shirt', 'tailoring', 'loafer', 'derby'], legacy: 'Clásico contemporáneo' }),
  S({ id: 'italian-casual', name: 'Italian casual', group: 'clasico', description: 'Sprezzatura: elegancia relajada, colores cálidos y prendas que respiran.', traits: ['Relajado pero cuidado', 'Colores cálidos', 'Tejidos ligeros'], silhouettes: ['Regular', 'Pantalón de pinzas amplio'], garments: ['Americana desestructurada', 'Polo de punto', 'Pantalón de pinzas', 'Camisa'], footwear: ['Mocasín', 'Gafas de sol'], palette: ['Beige', 'Azul claro', 'Oliva', 'Marrón'], related: ['casual-tailoring', 'quiet-luxury', 'old-money'], elements: ['polo', 'tailoring', 'loafer', 'tonal', 'sunglasses'], legacy: 'Elegancia italiana' }),
  S({ id: 'smart-casual', name: 'Smart casual', group: 'clasico', description: 'Entre la oficina y el fin de semana: arreglado sin traje.', traits: ['Arreglado sin traje', 'Versátil', 'Formalidad media'], silhouettes: ['Regular', 'Chino o recto'], garments: ['Americana', 'Camisa oxford', 'Chino', 'Punto'], footwear: ['Zapato de cordones', 'Zapatilla limpia'], palette: ['Azul marino', 'Blanco', 'Beige', 'Gris'], related: ['classic-contemporary', 'elevated-casual', 'casual-tailoring'], elements: ['blazer', 'shirt', 'leg-straight', 'derby', 'sneaker'] }),
  S({ id: 'casual-tailoring', name: 'Casual tailoring', group: 'clasico', description: 'Sastrería sin rigidez: americana con camiseta, pantalón de pinzas y zapatilla.', traits: ['Sastrería relajada', 'Mezcla formal-informal', 'Volumen suave'], silhouettes: ['Regular o amplio', 'Pantalón de pinzas'], garments: ['Americana desestructurada', 'Camiseta', 'Pantalón de pinzas'], footwear: ['Zapatilla limpia', 'Mocasín'], palette: ['Gris', 'Beige', 'Azul marino', 'Blanco'], related: ['smart-casual', 'italian-casual', 'editorial-casual'], elements: ['blazer', 'basic-tee', 'tailoring', 'leg-wide', 'sneaker'] }),
  S({ id: 'preppy-contemporaneo', name: 'Preppy contemporáneo', group: 'clasico', description: 'El universitario americano puesto al día: oxford, punto y chino.', traits: ['Capas de punto sobre camisa', 'Colores de colegio', 'Pulcro'], silhouettes: ['Regular', 'Chino recto'], garments: ['Camisa oxford', 'Jersey', 'Chino', 'Polo', 'Varsity'], footwear: ['Mocasín', 'Zapatilla blanca'], palette: ['Azul marino', 'Blanco', 'Beige', 'Burdeos'], related: ['old-money', 'smart-casual', 'retro-streetwear'], elements: ['knit', 'shirt', 'polo', 'loafer', 'layers'], legacy: 'Preppy / Ivy League' }),
  // D · Alternativos y de inspiracion editorial
  S({ id: 'vintage-contemporary', name: 'Vintage contemporary', group: 'alternativo', description: 'Prendas con aire de otra época mezcladas con básicos actuales.', traits: ['Mezcla de épocas', 'Texturas gastadas', 'Tonos tierra'], silhouettes: ['Regular o amplio', 'Recto o amplio'], garments: ['Cazadora de cuero', 'Camisa de cuadros', 'Vaquero lavado', 'Punto'], footwear: ['Bota', 'Zapatilla retro'], palette: ['Marrón', 'Camel', 'Oliva', 'Azul marino'], related: ['urban-vintage', 'retro-streetwear', 'indie-aesthetic'], elements: ['vintage', 'leather', 'denim', 'tonal', 'boot'] }),
  S({ id: 'retro-streetwear', name: 'Retro streetwear', group: 'alternativo', description: 'El streetwear de los 90 y 2000 recuperado: varsity, denim y zapatilla retro.', traits: ['Referencias de los 90', 'Color', 'Gráficas'], silhouettes: ['Holgado', 'Vaquero amplio'], garments: ['Varsity', 'Camiseta gráfica', 'Vaquero amplio', 'Chaqueta de chándal retro'], footwear: ['Zapatilla retro', 'Gorra'], palette: ['Burdeos', 'Blanco', 'Azul marino', 'Verde bosque'], related: ['streetwear-contemporaneo', 'vintage-contemporary', 'hip-hop-inspired'], elements: ['varsity', 'graphic-tee', 'vintage', 'leg-wide', 'accent', 'sneaker'] }),
  S({ id: 'indie-aesthetic', name: 'Indie aesthetic', group: 'alternativo', description: 'Guitarras y fanzines: ajustado, capas y un punto descuidado a propósito.', traits: ['Ajustado', 'Capas', 'Descuidado con intención'], silhouettes: ['Ajustado arriba', 'Pantalón slim'], garments: ['Camisa de cuadros', 'Cazadora vaquera', 'Camiseta', 'Vaquero slim'], footwear: ['Bota', 'Zapatilla de lona'], palette: ['Negro', 'Burdeos', 'Azul marino', 'Gris'], related: ['grunge-moderno', 'vintage-contemporary', 'urban-vintage'], elements: ['top-fitted', 'leg-slim', 'flannel', 'denim-jacket', 'boot', 'layers'] }),
  S({ id: 'grunge-moderno', name: 'Grunge moderno', group: 'alternativo', description: 'El grunge actualizado: negro, cuero, cuadros y capas.', traits: ['Negro dominante', 'Cuero y cuadros', 'Capas'], silhouettes: ['Arriba holgado', 'Pantalón recto o amplio'], garments: ['Cazadora de cuero', 'Camisa de cuadros', 'Camiseta', 'Vaquero negro'], footwear: ['Bota', 'Cadena'], palette: ['Negro', 'Gris', 'Burdeos'], related: ['indie-aesthetic', 'vintage-contemporary', 'urban-minimalism'], elements: ['leather', 'flannel', 'layers', 'boot', 'monochrome', 'chain'] }),
  S({ id: 'workwear-contemporaneo', name: 'Workwear contemporáneo', group: 'alternativo', description: 'Ropa de trabajo con estética actual: lona, bolsillos y botas.', traits: ['Resistencia', 'Bolsillos y costuras', 'Tonos tierra'], silhouettes: ['Regular o amplio', 'Pantalón recto o cargo'], garments: ['Chaqueta de trabajo', 'Sobrecamisa', 'Cargo', 'Vaquero crudo'], footwear: ['Bota', 'Gorro'], palette: ['Oliva', 'Marrón', 'Azul marino', 'Beige'], related: ['vintage-contemporary', 'urban-vintage', 'contemporary-casual'], elements: ['overshirt', 'cargo', 'denim', 'boot', 'tonal'], legacy: 'Workwear' }),
  S({ id: 'urban-vintage', name: 'Urban vintage', group: 'alternativo', description: 'Segunda mano con criterio: denim, gráficas desgastadas y capas urbanas.', traits: ['Segunda mano', 'Gráficas gastadas', 'Capas'], silhouettes: ['Holgado', 'Vaquero amplio'], garments: ['Cazadora vaquera', 'Camiseta gráfica', 'Sudadera', 'Vaquero amplio'], footwear: ['Zapatilla retro', 'Gorro'], palette: ['Azul marino', 'Marrón', 'Beige', 'Gris'], related: ['vintage-contemporary', 'skate-inspired', 'retro-streetwear'], elements: ['vintage', 'denim-jacket', 'graphic-tee', 'leg-wide', 'layers'] }),
  S({ id: 'editorial-casual', name: 'Editorial casual', group: 'alternativo', description: 'Casual con mirada de revista: proporciones estudiadas y una pieza inesperada.', traits: ['Proporciones estudiadas', 'Pieza inesperada', 'Paleta pensada'], silhouettes: ['Juego de volúmenes', 'Pantalón amplio'], garments: ['Cuello alto', 'Abrigo largo', 'Pantalón amplio', 'Cárdigan'], footwear: ['Mocasín', 'Bota'], palette: ['Camel', 'Negro', 'Gris', 'Burdeos'], related: ['casual-tailoring', 'minimalismo-contemporaneo', 'vintage-contemporary'], elements: ['turtleneck', 'long-coat', 'leg-wide', 'cardigan', 'accent'] }),
]

export const styleById = (id: string) => STYLE_CATALOG.find((s) => s.id === id)
export const styleName = (id: string) => styleById(id)?.name ?? id
/** Traduce nombres de estilo de versiones anteriores (o el propio nombre) a su id. */
export const styleIdFromName = (name: string) => STYLE_CATALOG.find((s) => s.legacy === name || s.name === name || s.id === name)?.id

// ── Universos de marca: inspiracion, NO estilos ──
export interface BrandUniverse { id: string; name: string; description: string; elements: ElementId[]; styles: Record<string, number> }
export const BRAND_UNIVERSES: BrandUniverse[] = [
  { id: 'urban-outfitters', name: 'Urban Outfitters', description: 'Mezcla de vintage y contemporáneo: oversize, denim, gráficas, capas y calzado urbano de aire retro.', elements: ['top-oversize', 'vintage', 'denim', 'graphic-tee', 'layers', 'sneaker'], styles: { 'urban-vintage': 1, 'retro-streetwear': 1, 'skate-inspired': 0.5, 'contemporary-casual': 0.5 } },
  { id: 'zara', name: 'Zara', description: 'Tendencia rápida y muy variada: desde sastrería actual hasta streetwear limpio, según la línea.', elements: ['clean-lines', 'leg-wide', 'tailoring', 'monochrome'], styles: { 'contemporary-casual': 1, 'casual-tailoring': 0.5, 'clean-streetwear': 0.5 } },
  { id: 'massimo-dutti', name: 'Massimo Dutti', description: 'Clásico cuidado: punto, camisa, sastrería relajada y tonos tierra.', elements: ['knit', 'shirt', 'tailoring', 'loafer', 'tonal'], styles: { 'smart-casual': 1, 'quiet-luxury': 0.5, 'italian-casual': 0.5 } },
  { id: 'cos', name: 'COS', description: 'Minimalismo arquitectónico: volúmenes amplios, líneas limpias y paleta neutra.', elements: ['clean-lines', 'top-oversize', 'leg-wide', 'monochrome'], styles: { 'minimalismo-contemporaneo': 1, 'urban-minimalism': 0.5, 'contemporary-essentials': 0.5 } },
  { id: 'weekday', name: 'Weekday', description: 'Denim y streetwear escandinavo: cortes amplios, básicos con actitud y mucho negro.', elements: ['denim', 'leg-wide', 'leg-baggy', 'monochrome', 'basic-tee'], styles: { 'clean-streetwear': 1, 'urban-minimalism': 0.5, 'contemporary-essentials': 0.5 } },
  { id: 'bershka', name: 'Bershka', description: 'Urbano juvenil y de tendencia: baggy, gráficas, chándal y zapatilla protagonista.', elements: ['leg-baggy', 'graphic-tee', 'tracksuit', 'chunky', 'top-oversize'], styles: { 'streetwear-contemporaneo': 1, 'modern-cani': 0.5, 'hip-hop-inspired': 0.5 } },
  { id: 'pull-and-bear', name: 'Pull&Bear', description: 'Casual urbano relajado con guiños al surf y al skate.', elements: ['graphic-tee', 'hoodie', 'denim', 'skate', 'leg-straight'], styles: { 'urban-casual': 1, 'skate-inspired': 0.5, 'contemporary-casual': 0.5 } },
]
export const brandById = (id: string) => BRAND_UNIVERSES.find((b) => b.id === id)
