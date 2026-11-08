/**
 * Protocolo fotografico: UNICA fuente de verdad (UI, prompt de la IA y docs/PROTOCOLO-FOTOGRAFICO.md).
 * Que fotos hacen falta, como hacerlas, como se valida su calidad y que puede analizar realmente la IA.
 */
export const COMMON_RULES = [
  'Luz natural difusa: de frente a una ventana o en exterior a la sombra. Sin flash ni luz amarilla de bombilla.',
  'Fondo liso y claro, sin objetos ni espejos.',
  'Sin filtros, retoques ni modo retrato. Si puedes, desactiva el «embellecimiento» de la cámara.',
  'Otra persona hace la foto o usas el temporizador con el móvil apoyado: los selfies en el espejo deforman las proporciones.',
]

export interface PhotoSpec {
  kind: 'frontal' | 'lateral' | 'espalda' | 'rostro'
  title: string
  short: string             // texto del hueco vacio
  vertical: boolean         // se exige foto vertical
  how: string[]             // instrucciones especificas
  clothing: string
  canAnalyze: string[]      // lo que la IA puede observar con esta foto
  cannotAnalyze: string[]   // lo que no debe afirmar
}

export const PHOTO_PROTOCOL: PhotoSpec[] = [
  {
    kind: 'frontal', title: 'Frontal, cuerpo entero', short: 'De frente, cuerpo entero', vertical: true,
    how: ['Cámara a la altura de la cintura, a 2–3 m, en vertical.', 'De pie, peso repartido en las dos piernas, brazos ligeramente separados del cuerpo.', 'Que se vea de la cabeza a los pies, con algo de margen.'],
    clothing: 'Ropa ajustada y lisa (camiseta y pantalón ceñidos o ropa deportiva), descalzo o con calzado plano.',
    canAnalyze: ['Proporción relativa entre hombros, cintura y cadera', 'Relación visual entre largo de torso y de piernas', 'Simetría y caída de hombros', 'Cómo te queda la ropa que llevas'],
    cannotAnalyze: ['Medidas en centímetros', 'Peso, grasa corporal o edad', 'Tallas'],
  },
  {
    kind: 'lateral', title: 'Lateral, cuerpo entero', short: 'De perfil, cuerpo entero', vertical: true,
    how: ['Misma distancia y altura de cámara que la frontal.', 'De perfil, mirando al frente, brazos relajados sin tapar la silueta.'],
    clothing: 'La misma ropa ajustada que en la frontal.',
    canAnalyze: ['Postura (hombros adelantados, curvatura de la espalda)', 'Volumen del perfil de pecho y abdomen', 'Caída de prendas por delante y por detrás'],
    cannotAnalyze: ['Medidas en centímetros', 'Diagnósticos posturales o de salud'],
  },
  {
    kind: 'espalda', title: 'Espalda, cuerpo entero', short: 'De espaldas, cuerpo entero', vertical: true,
    how: ['Misma distancia y altura de cámara que la frontal.', 'De espaldas, brazos ligeramente separados.'],
    clothing: 'La misma ropa ajustada que en la frontal.',
    canAnalyze: ['Anchura relativa de espalda y hombros', 'Inclinación de hombros', 'Ajuste de la ropa en la espalda'],
    cannotAnalyze: ['Medidas en centímetros'],
  },
  {
    kind: 'rostro', title: 'Rostro con luz natural', short: 'Rostro con luz natural', vertical: false,
    how: ['De frente a una ventana, a mediodía si puedes; sin sombras duras en la cara.', 'Pelo y barba visibles tal como los llevas.', 'Sostén un folio blanco bajo la barbilla: sirve de referencia de color.'],
    clothing: 'Camiseta blanca o gris, sin estampados cerca de la cara.',
    canAnalyze: ['Contraste entre piel, pelo y ojos', 'Hipótesis de temperatura (cálida, fría o neutra)', 'Profundidad e intensidad aparentes'],
    cannotAnalyze: ['Subtono definitivo: la cámara del móvil altera el color', 'Edad o rasgos de salud de la piel'],
  },
]

export const photoSpec = (kind: string) => PHOTO_PROTOCOL.find((p) => p.kind === kind)
