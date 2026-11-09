# Personal Shopper (Fase 4)

> Documento generado desde `lib/shopping/` con `npm run docs`. No lo edites a mano.

## Estado de la fase

| Subfase | Contenido | Estado |
|---|---|---|
| 4A · Shopping Intelligence y base del Shopping Planner | Necesidades detectadas y propias, 4 tipos, prioridad explicable y configurable, uso esperado, ocasiones, conjuntos nuevos (motor de outfits), redundancia, coste por uso, estados con historial, listas, presupuesto, preferencias | Hecha |
| 4B en adelante | Fuentes autorizadas de tiendas, productos candidatos, comparación | Pendiente |

## Principios

- **Primero la necesidad, después el producto.** En 4A no hay productos, tiendas externas, scraping ni enlaces: solo necesidades. Todo funciona sin ningún producto.
- **El estilista puede decir «no compres».** Si ninguna necesidad abierta supera tu umbral, la interfaz lo dice. Tener presupuesto no obliga a gastarlo.
- **Los deseos son legítimos**, pero se marcan como deseo, puntúan bajo en «necesidad real» y no compiten con las necesidades. El detector nunca crea deseos: solo tú.
- **Sin segundo armario ni segundo motor de outfits.** La prenda buscada se simula como «prenda virtual» con el motor de la fase 3 (`buildCandidates`) y con la similitud de la auditoría (2D); nunca se guarda en `garments`.
- **Memoria.** Una necesidad descartada (con motivo obligatorio) o rechazada en la auditoría no se vuelve a proponer: cada una tiene una clave de detección estable (`occ:`, `cat:`, `season:`, `repl:`, `impr:`), la misma que usa la auditoría.

## Tipos de necesidad

| Tipo | Significado |
|---|---|
| Necesidad (`need`) | Falta una categoría o una función en tu armario. |
| Mejora (`improvement`) | Ya tienes algo parecido, pero una alternativa mejoraría claramente tu vestuario. |
| Sustitución (`replacement`) | Una prenda actual necesita reemplazo. |
| Deseo (`desire`) | Te gustaría tenerla, aunque no sea necesaria. Es legítimo: solo hay que saber que es un deseo. |

## Origen

- `detected`: Detectada por el estilista.
- `audit`: Aprobada en la auditoría.
- `user`: Añadida por ti.

## Estados

| Estado | Significado |
|---|---|
| Detectada (`detected`) | Necesidad identificada. |
| Buscando (`searching`) | Se están buscando alternativas. |
| En lista (`listed`) | Producto candidato guardado. |
| Comparando (`comparing`) | Evaluando alternativas. |
| Aprobada (`approved`) | Has decidido comprar. |
| Comprada (`purchased`) | Adquisición realizada. |
| Descartada (`discarded`) | Has decidido no comprar. |
| En seguimiento (`watching`) | Pendiente de talla, stock o precio. |

Abiertos (cuentan en el diagnóstico): `detected`, `searching`, `listed`, `comparing`, `approved`, `watching`. Cada cambio queda en `shopping_need_events` (creada, estado con motivo, prioridad, edición, lista).

## Prioridad (`shopping-priority@1`)

Es una **prioridad de compra**, no una recomendación de producto. Cada criterio vale de 0 a 1, se multiplica por su peso y la suma da 0-100. Alta ≥ 70, media ≥ 45, baja < 45. Si fijas tú la prioridad, manda la tuya (la calculada se sigue viendo).

| Criterio | Peso por defecto |
|---|---|
| Necesidad real del armario | 30 |
| Frecuencia de uso esperada | 20 |
| Potencial de nuevos outfits | 20 |
| Adecuación al perfil | 15 |
| Urgencia estacional o funcional | 10 |
| Confianza de la información | 5 |

- **Necesidad real:** cobertura de la categoría y de las ocasiones (auditoría 2D); sustituciones según el estado de la prenda; deseos 0,15; redundancia alta resta 0,3 (salvo sustituciones).
- **Frecuencia de uso esperada:** usos al mes en su temporada según el peso de sus ocasiones en tu semana, repartidos con las prendas parecidas que ya rotas; con registro de uso suficiente, se cita.
- **Potencial de nuevos outfits:** conjuntos válidos (≥ 60/100) que el motor de la fase 3 forma con la prenda virtual y tus prendas, simulando su temporada.
- **Adecuación al perfil:** compatibilidad personal (2C) de la prenda virtual y peso de sus ocasiones.
- **Urgencia:** temporada actual > siguiente > lejana; prenda a sustituir dañada; fecha objetivo en 30 días.
- **Confianza:** lo definida que está la prenda buscada y lo completo que está tu perfil.

Los pesos se configuran en el planificador y se normalizan a 100 (si todos son 0, vuelven al defecto). Cada evaluación se guarda en `shopping_need_assessments` con su versión, sus pesos, los criterios con razones y datos usados, y se puede reevaluar.

## Coste por uso (estimado)

Precio objetivo (máximo, si no mínimo; si no hay, tu presupuesto máximo por prenda del perfil) ÷ usos esperados en su vida útil (usos al mes × meses de vida por categoría × fracción del año en temporada). Sin precio, no se estima.

## Presupuesto

- Mensual (`monthly`): ventanas de 1 mes desde la fecha de inicio.
- Trimestral (`quarterly`): ventanas de 3 meses desde la fecha de inicio.
- Por temporada (`season`): ventanas de 6 meses desde la fecha de inicio.

- Un solo presupuesto activo; el anterior queda en el historial.
- Comprometido = precio de las necesidades aprobadas o compradas en la ventana. Avisos si lo aprobado supera el presupuesto, si lo prioritario supera lo disponible o si falta precio.
- Sin compras prioritarias: «No hay ninguna compra prioritaria: no hace falta gastar este presupuesto.»

## Preferencias

Tiendas preferidas y excluidas (no ambas a la vez), calidad frente a precio, umbral para proponer compra (por defecto 45) y pesos. Tiendas disponibles: Zara, Massimo Dutti, Pull&Bear, Bershka, Stradivarius, COS, ARKET, Uniqlo, Mango Man, Selected Homme. En 4A no se consulta ninguna tienda.

## Datos (migración `0016_shopping_intelligence.sql`)

| Tabla | Contenido |
|---|---|
| `shopping_needs` | Necesidad: título, tipo, origen, clave de detección, estado, especificación (jsonb), razón, prenda a sustituir, prendas relacionadas, precios, tiendas, fecha objetivo, prioridad calculada y la tuya, motivo de descarte |
| `shopping_need_assessments` | Evaluaciones versionadas: pesos, criterios, puntuación, confianza, uso esperado, conjuntos nuevos, redundancia, coste por uso, ocasiones |
| `shopping_need_events` | Historial de cambios |
| `shopping_lists` / `shopping_list_items` | Listas de compra y sus necesidades (sin duplicados) |
| `shopping_budgets` | Presupuestos (uno activo) |
| `shopping_preferences` | Preferencias de compra |

RLS «own rows» en las 7 tablas; además, una evaluación, un evento o un elemento de lista solo pueden apuntar a necesidades y listas propias, y la prenda a sustituir debe ser tuya.

## API

| Método y ruta | Uso |
|---|---|
| `POST /api/shopping/needs/analyze` | Detecta necesidades y reevalúa las abiertas |
| `GET /api/shopping/needs?status=open\|all\|<estado>` | Lista por prioridad |
| `POST /api/shopping/needs` | Crea una necesidad o un deseo |
| `GET /api/shopping/needs/:id` | Ficha con evaluaciones, historial, listas y prendas |
| `PATCH /api/shopping/needs/:id` | Edita, fija prioridad o cambia de estado (descartar exige motivo) |
| `POST /api/shopping/needs/:id/assess` | Reevalúa |
| `GET/POST /api/shopping/lists`, `DELETE /api/shopping/lists/:id` | Listas |
| `POST/DELETE /api/shopping/lists/:id/items` | Añadir o quitar una necesidad |
| `GET/PUT /api/shopping/budgets` | Presupuesto activo |
| `GET/PUT /api/shopping/preferences` | Preferencias |
| `GET /api/shopping/planner` | Vista del planificador |

## Interfaz

- `/compras` — Shopping Intelligence: analizar, veredicto («merece la pena comprar» o «no necesitas comprar nada»), necesidades por prioridad, alta de necesidades y deseos.
- `/compras/necesidades/:id` — desglose de la prioridad, conjuntos nuevos, uso, coste por uso, redundancia, ocasiones, estados, prioridad manual, listas, edición e historial.
- `/compras/plan` — Shopping Planner: qué merece la pena y qué puede esperar, presupuesto, listas y preferencias.

## Pruebas

- `tests/shopping.test.ts`: pesos y niveles, explicabilidad, deseo redundante, sustitución, coste por uso, urgencia, detección, presupuesto, migración y RLS.
- `tests/e2e/shopping.cjs`: recorrido completo en móvil, integración con la auditoría, estados, listas, presupuesto, preferencias y aislamiento entre dos usuarios (app y RLS directa).
