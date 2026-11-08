# PERSONAL STYLIST

> **Tu sistema personal de imagen y estilo.** Un estilista digital con memoria persistente, criterio profesional y conocimiento de tu armario, tus preferencias y tu estilo de vida.

---

## 1. Propósito de este documento

Este README es el documento de contexto principal del proyecto **Personal Stylist**. Su objetivo es que una persona o un agente de inteligencia artificial pueda comprender el producto, sus objetivos, sus módulos, sus reglas de negocio, su arquitectura propuesta y sus prioridades sin depender de explicaciones dispersas.

### Instrucciones para cualquier IA que trabaje en este proyecto

1. **Lee este documento antes de proponer o modificar funcionalidades.** Úsalo como referencia de producto y de decisiones de diseño.
2. **Distingue la visión del estado real del código.** Este documento describe el producto deseado y una arquitectura recomendada; no demuestra que todas las funciones estén implementadas. Inspecciona el repositorio, los esquemas, las migraciones y las pantallas antes de afirmar que algo existe.
3. **No inventes información del usuario, prendas, productos, medidas, tallas, precios ni disponibilidad.** Cuando falten datos, indícalo y solicita confirmación o trabaja con una hipótesis claramente identificada.
4. **No conviertas una hipótesis visual en un hecho.** El análisis de fotografías tiene incertidumbre; muestra nivel de confianza y permite corregir los resultados.
5. **Trata el perfil personal como contexto compartido.** Las recomendaciones de armario, outfits y compras deben consultar el mismo perfil de estilo y las mismas preferencias.
6. **Separa datos, preferencias y recomendaciones.** Que el sistema recomiende algo no significa que el usuario lo prefiera; que el usuario lo prefiera no significa que sea una conclusión objetiva sobre ajuste o color.
7. **La IA propone; el software valida y ejecuta.** Los cálculos deterministas deben resolverse con código. Las modificaciones importantes de datos deben pasar por validaciones y, cuando corresponda, confirmación del usuario.
8. **Prioriza utilidad real sobre complejidad.** Desarrolla primero el recorrido funcional esencial. No introduzcas microservicios, scraping no autorizado ni probadores virtuales complejos como requisitos del MVP.
9. **Mantén el proyecto modular.** Una nueva tienda, modelo de IA o funcionalidad no debería obligar a rehacer el resto del sistema.
10. **Explica las decisiones.** Las recomendaciones deben incluir el motivo, los datos utilizados, las limitaciones y, cuando sea relevante, qué información falta.

---

## 2. Visión del producto

Personal Stylist es una aplicación personal de estilismo que reproduce el trabajo de un estilista profesional. No debe ser simplemente un chatbot que responde preguntas sobre ropa ni una galería de prendas: debe ser un sistema conectado que conoce al usuario, mantiene un inventario fiable, entiende sus preferencias, propone combinaciones y ayuda a tomar decisiones de compra.

### Objetivo principal

Construir un **estilista personal digital con memoria y criterio**, capaz de:

- Conocer la morfología, las medidas, la colorimetría, la identidad estética y el estilo de vida del usuario.
- Mantener un armario digital estructurado y actualizado.
- Entender qué prendas funcionan de verdad y por qué.
- Crear outfits únicamente con prendas disponibles cuando se trate de looks del armario.
- Detectar necesidades, duplicidades y huecos del armario.
- Recomendar productos reales cuando existan fuentes de información fiables y permitidas.
- Aprender de las valoraciones, usos, compras y decisiones del usuario.
- Mejorar las recomendaciones con el tiempo sin perder de vista las preferencias personales.

### Principio central: un único estilista, no seis herramientas aisladas

La aplicación se divide en seis módulos funcionales, pero todos comparten una base de conocimiento común: el **perfil de estilo** y el historial del usuario.

Ejemplos de comportamiento transversal:

- Si el armario ya contiene varios pantalones que cumplen bien una función, el motor de compras debe evitar recomendar otro prácticamente idéntico salvo que haya una razón clara.
- Si el perfil cromático identifica tonos preferentes, las recomendaciones de outfits y productos deben tenerlos en cuenta.
- Si el usuario marca repetidamente que no le gustan determinados cortes, esa preferencia debe influir en futuras propuestas.
- Si una prenda funciona especialmente bien y se han registrado sus medidas, puede utilizarse como referencia al evaluar otra prenda.

**Todos los módulos deben consultar el mismo contexto personal y respetar las mismas restricciones.**

---

## 3. Los seis módulos principales

| Módulo | Responsabilidad |
|---|---|
| 1. Perfil personal | Conocer al usuario: morfología, medidas, colorimetría, estilo, preferencias y estilo de vida. |
| 2. Armario digital | Inventariar, analizar, valorar, relacionar y depurar las prendas. |
| 3. Dirección creativa | Definir la identidad estética, las referencias visuales, las combinaciones y las fórmulas de estilo. |
| 4. Compras inteligentes | Detectar necesidades y encontrar productos reales que aporten valor al armario. |
| 5. Outfit Studio | Crear, adaptar, guardar y planificar conjuntos para distintas ocasiones y temporadas. |
| 6. Evolución personal | Aprender del uso real, las valoraciones, las compras y las revisiones periódicas. |

Los módulos 1 y 3 construyen el contexto personal; el módulo 2 aporta el inventario real; los módulos 4 y 5 utilizan ambos para proponer decisiones; y el módulo 6 retroalimenta todo el sistema.

---

## 4. Perfil personal y expediente de estilismo

El usuario debe completar un proceso inicial de diagnóstico antes de recibir recomendaciones personalizadas de alta confianza. La aplicación puede permitir explorarla antes, pero debe indicar cuándo todavía no dispone de suficiente contexto.

El resultado es un **expediente de estilismo**, referencia principal para las recomendaciones futuras. Debe poder revisarse y actualizarse.

### 4.1. Estudio morfológico y antropométrico

Hay que distinguir expresamente:

- **Morfología:** estructura y proporciones generales del cuerpo.
- **Ajuste:** comportamiento de una prenda concreta sobre el cuerpo del usuario.

Datos corporales que se pueden registrar:

| Dato | Utilidad principal |
|---|---|
| Altura | Proporciones y largos. |
| Contorno de pecho | Ajuste de camisas y chaquetas. |
| Anchura de hombros | Estructura superior. |
| Contorno de cintura | Tiro y ajuste de pantalones. |
| Contorno de cadera | Silueta y proporciones. |
| Entrepierna | Largo de pantalones. |
| Largo de torso | Equilibrio visual. |
| Largo de piernas | Proporciones y elección de cortes. |

Se pueden incorporar fotografías opcionales de cuerpo entero: frontal, lateral y espalda. La aplicación debe guiar al usuario para obtener imágenes con iluminación uniforme, postura natural y ropa que facilite observar las proporciones.

#### Medidas de prendas de referencia

El usuario debe poder registrar medidas de prendas que ya sabe que le quedan bien. Esta información puede ser más útil que inferir todas las medidas corporales a partir de fotografías.

Ejemplos ilustrativos:

- Pantalón: cintura 42 cm, tiro 29 cm, bajo 22 cm.
- Camiseta: hombros 48 cm, largo 69 cm.
- Chaqueta: hombros 47 cm, largo 72 cm.

El sistema debe poder comparar las medidas de una prenda potencialmente nueva con las de prendas de referencia, teniendo en cuenta que las medidas de prenda y las medidas corporales no son equivalentes.

### 4.2. Estudio de colorimetría

No limitar el resultado a una clasificación rígida en cuatro estaciones. Construir una ficha cromática con:

- Temperatura: cálida, fría o neutra.
- Intensidad: suave o brillante.
- Profundidad: clara, media u oscura.
- Contraste natural entre piel, ojos y cabello.
- Colores que armonizan con el rostro.
- Colores que pueden funcionar mejor en prendas inferiores.
- Neutros recomendados.
- Colores de acento.
- Combinaciones cromáticas recomendadas.

El resultado es una **paleta digital** que consumen el armario, Outfit Studio y el motor de compras.

**Limitación importante:** las fotografías de móvil pueden alterar los colores por la iluminación, el balance de blancos y el procesado. La colorimetría generada por IA debe presentarse como una hipótesis orientativa, con posibilidad de validación y corrección por el usuario; nunca como una verdad científica absoluta.

### 4.3. Estudio de estilo e identidad: Style DNA

El objetivo es descubrir qué quiere transmitir el usuario, no limitarlo a elegir una etiqueta de estilo.

Se propone un descubrimiento visual en el que el usuario clasifique referencias de conjuntos mediante opciones como:

- Me encanta.
- Me gusta.
- No me lo pondría.
- Me gusta, pero no para mí.
- Me gustaría conseguir algo parecido.

Las decisiones construirán progresivamente un mapa de preferencias.

Estilos de referencia posibles (no excluyentes):

- Minimalista.
- Clásico contemporáneo.
- Smart casual.
- Old money.
- Streetwear.
- Workwear.
- Sporty.
- Casual sofisticado.
- Italiano.
- Escandinavo.

El usuario no está obligado a seleccionar un único estilo. Su identidad puede ser una mezcla y puede evolucionar.

También debe poder guardar referencias visuales procedentes de Pinterest, Instagram u otras fuentes. La IA puede analizarlas para extraer patrones de silueta, color, proporciones, tejidos, calzado y combinaciones. Las referencias son señales de gusto, no prendas que formen parte del armario.

El resultado de este estudio es el **Style DNA**: una descripción estructurada y editable de la dirección estética personal.

### 4.4. Estudio del estilo de vida

El sistema debe comprender para qué situaciones necesita vestirse el usuario. Puede registrar la distribución aproximada de actividades, por ejemplo:

- Trabajo: 40 %.
- Universidad: 0 %.
- Ocio: 30 %.
- Deporte: 10 %.
- Citas y cenas: 10 %.
- Eventos y ocasiones especiales: 10 %.

Los porcentajes son un ejemplo y deben sumar el 100 % cuando se utilicen como distribución completa.

Otros factores relevantes:

- Ciudad y clima habitual.
- Frecuencia de viajes.
- Formalidad del entorno laboral.
- Actividades habituales.
- Presupuesto.
- Frecuencia de lavado.
- Comodidad y movilidad.

La finalidad es evitar un armario visualmente atractivo pero poco útil para la vida real del usuario.

### 4.5. Diagnóstico inicial y plan de estilismo

Una vez reunida información suficiente, la aplicación genera un expediente que incluya, como mínimo:

- Identidad estética y Style DNA.
- Objetivo visual.
- Siluetas y cortes recomendados.
- Paleta cromática.
- Prioridades de armario.
- Necesidades del estilo de vida.
- Datos conocidos, hipótesis y aspectos pendientes de validar.

Ejemplo conceptual de dirección de estilo: clásico contemporáneo con influencia minimalista y casual sofisticada; objetivo de imagen limpia, estructurada, relajada y versátil; pantalón recto o ligeramente amplio, camisetas de estructura media y chaquetas con hombro definido.

El expediente debe actualizarse cuando cambien las medidas, preferencias, actividades, presupuesto o dirección estética.

---

## 5. Armario digital: inventario inteligente

El armario digital es uno de los núcleos del producto. No debe ser una simple galería de fotos: cada prenda tiene una ficha estructurada, historial, evaluación y relaciones con otras prendas.

### 5.1. Incorporación de prendas

Se contemplan dos métodos, ambos deseables:

1. Fotografiar una prenda individual.
2. Fotografiar varias prendas y permitir que la IA las detecte y separe en elementos individuales.

La IA puede proponer automáticamente:

- Tipo o categoría de prenda.
- Color principal y colores secundarios.
- Patrón o estampado.
- Material aparente.
- Corte.
- Silueta.
- Estilo.
- Temporada.
- Formalidad.
- Posibles combinaciones.

El reconocimiento visual no siempre puede determinar características ocultas o ambiguas. Por ejemplo, una fotografía puede mostrar una camisa blanca, pero no demostrar si está hecha de lino, algodón Oxford o poliéster. Por ello:

- La IA debe diferenciar lo observado de lo inferido.
- Debe registrar confianza cuando corresponda.
- El usuario debe poder confirmar o corregir los atributos.
- No se debe guardar una composición textil como hecho si no está respaldada por una etiqueta, ficha de producto o confirmación del usuario.

### 5.2. Ficha individual de prenda

Cada prenda debe contar con una ficha que pueda contener:

- Identificador único.
- Fotografías.
- Categoría y subcategoría.
- Colores.
- Patrón.
- Material y procedencia del dato.
- Corte y silueta.
- Tiro, largo y medidas relevantes.
- Estilo y nivel de formalidad.
- Temporadas y contextos de uso.
- Marca, talla y precio de compra, si se conocen.
- Estado físico y calidad percibida.
- Fecha de incorporación y estado actual.
- Etiquetas, notas y observaciones del usuario.
- Combinaciones y outfits relacionados.
- Historial de uso, valoraciones y decisiones.

Ejemplo de diagnóstico ilustrativo: un pantalón beige recto de tiro medio-alto, estilo smart casual y formalidad media puede obtener valoraciones independientes de color, corte, proporción, combinabilidad y estado. La recomendación podría ser conservarlo si encaja con el Style DNA y combina con varios neutros del armario.

### 5.3. Evaluación multidimensional

No asignar una nota global que aparente medir objetivamente cuánto favorece una prenda a partir de una sola fotografía. Utilizar inicialmente esta ponderación propuesta:

| Criterio | Peso inicial |
|---|---:|
| Ajuste y caída | 25 % |
| Proporción y silueta | 20 % |
| Armonía cromática | 15 % |
| Encaje con el estilo | 15 % |
| Combinabilidad | 15 % |
| Estado y calidad | 10 % |
| **Total** | **100 %** |

La puntuación es una ayuda para decidir, no una sentencia sobre el aspecto del usuario. Debe poder explicarse y mostrar las dimensiones que la componen. Las valoraciones con información insuficiente deben marcarse como provisionales.

Distinguir estos conceptos:

- **Favorecedora:** funciona especialmente bien sobre el usuario.
- **Encaja con el estilo:** representa su identidad estética.
- **Funcional:** cubre una necesidad real.
- **Prescindible:** tiene alternativas mejores o redundantes.
- **Problemática:** requiere arreglo, revisión o sustitución.

Una prenda no debe descartarse solo por no ser especialmente favorecedora si es necesaria y útil en la vida cotidiana.

### 5.4. Evaluación del ajuste mediante fotografías

Flujo propuesto:

1. La aplicación solicita una fotografía del usuario llevando la prenda.
2. Indica una postura y unas condiciones de fotografía adecuadas.
3. Analiza caída, largos, proporciones y posibles problemas de ajuste.
4. Compara las observaciones con el perfil antropométrico y las referencias disponibles.
5. Devuelve hallazgos, incertidumbres y posibles arreglos.
6. Permite que el usuario corrija o valore el resultado.

Ejemplos de observaciones: largo de pantalón ligeramente excesivo, acumulación de tejido sobre el calzado, cintura aparentemente correcta, corte recto compatible con las proporciones o mejora potencial mediante un arreglo de sastrería.

El usuario debe poder guardar las prendas que mejor le quedan como **referencias de ajuste**. El sistema aprenderá de sus medidas y patrones, sin asumir que una sola imagen permite conocer el tallaje con precisión.

### 5.5. Motor de decisiones sobre prendas

Estados de decisión propuestos:

| Decisión | Significado |
|---|---|
| Conservar | Funciona bien y tiene utilidad. |
| Modificar | Un arreglo puede mejorarla. |
| Revisar | Hace falta una prueba o más información. |
| Sustituir | Existe una alternativa más adecuada para el armario. |
| Donar / vender | Ya no encaja con las necesidades actuales. |

Cuando recomiende sustituir una prenda, el sistema debe explicar:

- Qué problema resuelve la sustitución.
- Qué características debe tener la sustituta.
- Qué prendas existentes combinarán con ella.
- Qué opciones concretas se pueden comprar, si hay fuentes fiables.
- Qué presupuesto sería razonable según el perfil del usuario.

No basta con decir «deshazte de estos pantalones». Hay que describir la alternativa y el valor que aportaría al conjunto del armario.

---

## 6. Compras inteligentes: personal shopper

El motor de compras debe convertir necesidades detectadas en recomendaciones de **productos concretos**, no limitarse a sugerencias genéricas.

Una recomendación de producto debe mostrar, cuando los datos estén disponibles:

- Producto y fotografía.
- Marca y tienda.
- Precio y moneda.
- Composición declarada.
- Tallas y disponibilidad consultables.
- Enlace a la fuente.
- Motivo de compatibilidad con el perfil.
- Prendas del armario con las que combina.
- Posibles ocasiones de uso.
- Duplicidades o solapamientos con prendas existentes.
- Incertidumbres o datos que no se hayan podido verificar.

### 6.1. Tiendas prioritarias

Orden de prioridad inicial propuesto:

1. Zara.
2. Massimo Dutti.
3. Bershka.
4. Pull&Bear.
5. Stradivarius.
6. H&M.

La arquitectura debe permitir incorporar otras marcas según preferencias y presupuesto sin acoplar la lógica de compras a una tienda concreta.

### 6.2. Flujo del motor de compras

Cuando el sistema detecta que el usuario necesita una chaqueta, por ejemplo, debe:

1. Consultar el perfil de estilo y el Style DNA.
2. Identificar cortes y siluetas recomendados.
3. Consultar la paleta cromática.
4. Revisar qué chaquetas ya existen en el armario.
5. Detectar el hueco o necesidad real.
6. Buscar productos en fuentes seleccionadas y permitidas.
7. Filtrar productos que incumplan criterios o presupuesto.
8. Evaluar compatibilidad con el armario completo.
9. Ordenar y explicar una selección final.

Ejemplo de razones positivas: color compatible con la paleta, corte adecuado según referencias de ajuste, coherencia con la dirección estética, combinación con cinco prendas existentes y capacidad de cubrir ocasiones diferentes.

Una compra debe aportar valor incremental: no recomendar un producto solo porque sea bonito o tenga una puntuación estética alta.

### 6.3. Coste por uso y valor de compra

El sistema debe ayudar a medir el valor real de una compra teniendo en cuenta precio y frecuencia de uso prevista.

Fórmula básica:

`coste_por_uso = precio_de_compra / número_de_usos_estimados`

También puede mostrar escenarios de uso a lo largo de un periodo, siempre indicando las hipótesis. Ejemplo: una prenda de 80 € utilizada dos veces al mes durante doce meses tendría 24 usos estimados y un coste de **3,33 € por uso**. No debe etiquetarse como 3,33 € al mes: esa cifra resulta de dividir el precio entre los usos estimados.

Otros factores de valor:

- Número de combinaciones potenciales.
- Frecuencia de uso prevista.
- Durabilidad y estado esperado, si hay información.
- Necesidad que cubre.
- Duplicidad con prendas existentes.
- Impacto en el presupuesto por categoría.

### 6.4. Fuentes de datos y restricciones de scraping

**No diseñar el proyecto suponiendo que se puede scrapear libremente Zara u otras webs.** El material de referencia advierte de restricciones de Inditex sobre bots, crawlers, scrapers y usos de contenido sin autorización.

Orden de preferencia:

1. APIs, feeds o acuerdos de acceso autorizados, si están disponibles.
2. Enlaces de producto aportados manualmente por el usuario.
3. Análisis de información e imágenes aportadas por el usuario, respetando sus condiciones de uso.
4. Proveedores y catálogos cuyas condiciones permitan expresamente la extracción o consulta.
5. Guardar las fichas de productos seleccionados sin replicar masivamente catálogos.

Herramientas de automatización como Apify no convierten en autorizado el scraping de una web que lo prohíbe.

El motor de compras debe ser **independiente de la fuente**: cada proveedor se integra mediante una interfaz común y la lógica de compatibilidad no depende del proveedor concreto.

---

## 7. Outfit Studio: el estilista cotidiano

Outfit Studio es el módulo de uso diario. Tiene dos modos principales: generador de outfits y estilista bajo demanda.

### 7.1. Generador de outfits

Analiza las prendas disponibles y crea combinaciones teniendo en cuenta:

- Compatibilidad cromática.
- Equilibrio de proporciones.
- Compatibilidad de estilos.
- Formalidad.
- Temporada.
- Clima.
- Ocasión.
- Preferencias personales.
- Historial de conjuntos valorados positivamente.

Cada outfit debe tener una ficha propia:

- Identificador y nombre.
- Prendas que lo componen.
- Ocasiones recomendadas.
- Temporada y condiciones de uso.
- Descripción del estilo.
- Valoración y feedback del usuario.
- Explicación de por qué funciona.
- Fecha de creación y usos registrados.

**Regla crítica de integridad:** si el outfit se presenta como una combinación del armario del usuario, cada elemento debe estar vinculado a una prenda real del inventario. No se pueden inventar prendas ni presentar una imagen conceptual como si fuese una fotografía de las prendas reales.

Las imágenes generadas o de referencia deben identificarse claramente como conceptuales.

### 7.2. Feedback de outfits

El usuario puede clasificar un conjunto como:

- Me encanta.
- Me gusta.
- No me convence.
- Me lo he puesto.
- No volvería a repetirlo.

Estos eventos deben guardarse para que el sistema aprenda. Siempre que tenga sentido, se debe recoger el motivo del rechazo o aceptación, sin obligar a responder en cada ocasión.

### 7.3. Estilista bajo demanda

El usuario puede describir una situación en lenguaje natural. Ejemplo: «Esta noche tengo una cena en un restaurante con gente del trabajo. Quiero ir bien vestido, pero sin parecer demasiado formal».

El sistema debe:

1. Interpretar ocasión, entorno, formalidad deseada y restricciones.
2. Consultar el armario disponible.
3. Consultar el expediente de estilismo y preferencias.
4. Tener en cuenta el clima cuando exista información fiable.
5. Proponer hasta tres outfits diferenciados.
6. Explicar diferencias y compromisos.
7. Recomendar el más adecuado y justificarlo.
8. Permitir iteraciones: cambiar zapatos, chaqueta, formalidad, complementos o adaptación al frío.

El sistema no debe afirmar que conoce el clima actual si no ha consultado una fuente de tiempo ni inventar la disponibilidad de una prenda.

### 7.4. Fórmulas de estilo

Además de guardar outfits individuales, se guardan **estructuras repetibles** que permiten crear variaciones.

Ejemplos:

| Fórmula | Composición orientativa |
|---|---|
| Casual sofisticado | Polo de punto + pantalón recto + mocasines. |
| Smart casual | Camisa + pantalón de sastre + zapatillas. |
| Minimalista | Camiseta lisa + pantalón amplio + calzado limpio. |
| Invierno elegante | Abrigo + jersey + pantalón estructurado. |
| Verano relajado | Camisa de lino + pantalón ligero + sandalias. |

La aplicación debe detectar las fórmulas que mejor funcionan para el usuario y proponerlas como posibles uniformes personales, sin imponerlas.

### 7.5. Calendario de outfits

Planificador semanal para asignar conjuntos a días, actividades y ocasiones. Ejemplo de categorías: trabajo, trabajo y cena, día informal, cena, ocio y día libre.

A futuro puede sugerir qué ponerse cada mañana según tiempo y planes, siempre que tenga acceso a esos datos.

---

## 8. Evolución personal y memoria a largo plazo

El sistema debe mejorar a partir del uso real, no solo acumular conversaciones.

### 8.1. Diario de outfits

Cada uso puede registrar:

- Fotografía opcional.
- Prendas utilizadas.
- Ocasión.
- Comodidad.
- Confianza con el conjunto.
- Si lo repetiría.
- Fecha de uso.

Esto permite identificar las prendas más utilizadas y las que permanecen olvidadas.

### 8.2. Historial de compras

Cada compra puede guardar:

- Fecha.
- Precio.
- Motivo.
- Número de usos.
- Satisfacción.
- Si sustituyó otra prenda.
- Relación con la recomendación original, si la hubo.

El sistema puede detectar patrones: por ejemplo, comprar pantalones que apenas se utilizan porque no combinan con el calzado habitual.

### 8.3. Revisión estacional

En cada cambio de temporada, auditar:

- Prendas utilizadas y no utilizadas.
- Prendas que necesitan reparación.
- Necesidades aún no cubiertas.
- Compras que ya no tienen sentido.
- Tendencias compatibles con el Style DNA.
- Cambios en actividades, preferencias o clima.

### 8.4. Wishlist inteligente

El usuario puede guardar prendas que le interesan. Antes de recomendar su compra, la IA debe comprobar:

- Si cubren una necesidad real.
- Si encajan con el Style DNA y la paleta.
- Si combinan con el inventario actual.
- Si duplican prendas existentes.
- Si respetan el presupuesto.
- Qué outfits nuevos desbloquean.

Ejemplo de criterio: no recomendar otra chaqueta que cumpla la misma función que dos ya existentes; priorizar una categoría que aporte más valor al armario.

---

## 9. Funcionalidades complementarias

Estas funcionalidades amplían el producto y deben priorizarse después de que el recorrido principal funcione:

| Funcionalidad | Aportación |
|---|---|
| Detector de duplicados | Identifica prendas demasiado similares o con la misma función. |
| Analizador de huecos | Detecta categorías o usos que el armario no cubre. |
| Calculadora de versatilidad | Estima cuántos looks aporta cada prenda. |
| Asistente de sastrería | Sugiere arreglos y modificaciones. |
| Organizador de maletas | Prepara conjuntos según destino, duración y clima. |
| Asistente de eventos | Adapta las propuestas al dress code. |
| Cuidado de prendas | Sugiere lavado, mantenimiento y conservación según material conocido. |
| Control de presupuesto | Evita compras innecesarias y excesos por categoría. |
| Detector de tendencias | Filtra tendencias que encajan con la identidad del usuario. |
| Comparador de prendas | Compara dos artículos antes de comprarlos. |
| Gestión de temporadas | Clasifica prendas de invierno, verano y entretiempo. |
| Registro de tallas | Guarda tallas por marca y tipo de prenda. |
| Simulador de compras | Incorpora virtualmente un producto y calcula qué combinaciones nuevas desbloquea. |

### Probador inteligente (funcionalidad experimental)

No es una prioridad inicial. Se contemplan tres niveles:

| Nivel | Funcionalidad | Dificultad orientativa |
|---|---|---|
| 1 | Mostrar outfits mediante imágenes de referencia. | Baja. |
| 2 | Crear una visualización aproximada sobre una fotografía del usuario. | Media-alta. |
| 3 | Simular de forma fiable caída, tallaje y ajuste real. | Muy alta. |

Una simulación visual no equivale a una prueba real. Los modelos pueden alterar proporciones, cortes, estampados y detalles. Para el tercer nivel podrían necesitarse tecnologías especializadas de virtual try-on e información adicional sobre medidas y patrón de las prendas.

---

## 10. Arquitectura tecnológica propuesta

### 10.1. Enfoque general

Construir una aplicación web moderna, responsive y adaptable a móvil y escritorio. Para empezar, se recomienda una **arquitectura modular monolítica**, no una infraestructura empresarial con microservicios o Kubernetes.

Stack propuesto:

| Capa | Tecnología | Responsabilidad |
|---|---|---|
| Frontend | Next.js + React | Interfaz web. |
| Lenguaje | TypeScript | Tipado y lógica de aplicación. |
| Estilos | Tailwind CSS | Sistema de estilos. |
| Componentes | shadcn/ui | Componentes de interfaz. |
| Backend | Next.js API / Server Actions | Lógica, validación y operaciones de servidor. |
| Base de datos | PostgreSQL mediante Supabase | Persistencia de perfiles, prendas, outfits y relaciones. |
| Autenticación | Supabase Auth | Identidad y sesiones. |
| Imágenes | Supabase Storage | Fotografías de prendas, referencias y outfits. |
| IA principal | OpenAI API | Razonamiento, visión, conversación y salidas estructuradas. |
| IA secundaria opcional | Gemini API | Segunda opinión y análisis visual comparativo. |
| Búsqueda semántica | pgvector | Recuperación por similitud cuando sea útil. |
| Automatizaciones | Python / n8n | Procesos programados o integraciones. |
| Control de versiones | GitHub | Código fuente y colaboración. |
| Despliegue | Vercel | Publicación de la aplicación. |

La selección es una recomendación de arquitectura, no una afirmación sobre dependencias ya instaladas. Antes de cambiar el stack, comprobar el estado real del repositorio.

### 10.2. Aplicación web antes que app nativa

Empezar con una web responsive que pueda instalarse en el móvil como PWA. No desarrollar inicialmente apps nativas independientes para iOS y Android. Si después se necesitan capacidades avanzadas de cámara, notificaciones o integración nativa, valorar Expo/React Native.

### 10.3. Capas del sistema

1. **Interfaz:** Next.js y React; dashboard, perfil, armario, compras, outfits, wishlist y chat.
2. **Capa de aplicación:** API, validaciones, autorización, operaciones de negocio y orquestación.
3. **Motor de inteligencia:** visión artificial, razonamiento, motor de estilismo y motor de compras.
4. **Datos y almacenamiento:** Supabase, PostgreSQL, Storage y pgvector.
5. **Fuentes externas:** tiendas y catálogos autorizados, clima y referencias visuales.

### 10.4. La IA no modifica directamente la base de datos

La IA debe operar a través de una capa intermedia con herramientas y operaciones explícitas. Esa capa determina:

- Qué datos puede consultar el modelo.
- Qué acciones puede proponer.
- Qué campos se pueden modificar.
- Qué validaciones deben ejecutarse.
- Qué operaciones exigen confirmación del usuario.

Ejemplo: al generar un outfit, el motor consulta las prendas disponibles, pero no puede borrar prendas ni modificar el perfil sin autorización. Una salida del modelo debe validarse contra el esquema y las reglas de negocio antes de persistirla.

---

## 11. Organización propuesta del código

La siguiente estructura es una guía modular inicial. Debe adaptarse a la estructura real del repositorio, sin duplicar carpetas ni mover código innecesariamente:

```text
personal-stylist/
├── app/
│   ├── dashboard/
│   ├── profile/
│   ├── wardrobe/
│   ├── outfits/
│   ├── shopping/
│   ├── wishlist/
│   ├── stylist/
│   └── api/
├── components/
│   ├── wardrobe/
│   ├── outfits/
│   ├── profile/
│   ├── shopping/
│   └── shared/
├── modules/
│   ├── colorimetry/
│   ├── morphology/
│   ├── garment-analysis/
│   ├── outfit-engine/
│   ├── wardrobe-audit/
│   ├── shopping-engine/
│   └── style-profile/
├── lib/
│   ├── ai/
│   ├── database/
│   ├── storage/
│   └── integrations/
├── types/
└── supabase/
    ├── migrations/
    └── functions/
```

Responsabilidades recomendadas:

- `app/`: rutas y composición de páginas.
- `components/`: componentes visuales reutilizables.
- `modules/`: lógica de dominio independiente de la interfaz.
- `lib/ai/`: clientes, prompts, esquemas, orquestación y adaptadores de modelos.
- `lib/database/`: acceso tipado y operaciones de persistencia.
- `lib/storage/`: carga, acceso y eliminación de archivos.
- `lib/integrations/`: adaptadores de tiendas, clima y otros proveedores.
- `types/`: tipos compartidos y contratos.
- `supabase/`: migraciones, políticas y funciones de base de datos.

No introducir lógica de negocio compleja directamente en componentes de interfaz o prompts.

---

## 12. Inteligencia artificial y motor de decisión

No utilizar un único modelo para absolutamente todas las tareas. La aplicación debe tener un coordinador que seleccione el servicio adecuado y una capa de reglas deterministas.

### 12.1. OpenAI: motor principal

Funciones previstas:

- Analizar fotografías de prendas.
- Interpretar fotografías de outfits.
- Ayudar a construir y actualizar el perfil de estilo.
- Razonar sobre combinaciones.
- Explicar recomendaciones.
- Evaluar alternativas de compra.
- Mantener conversaciones con contexto recuperado de la base de datos.
- Generar informes de estilismo.

Cuando la salida de la IA tenga que almacenarse, utilizar respuestas estructuradas y validar el resultado. Ejemplo conceptual de atributos devueltos al analizar una camisa:

```json
{
  "category": "shirt",
  "color": "white",
  "fit": "relaxed",
  "pattern": "solid",
  "style": "smart_casual",
  "season": ["spring", "summer"],
  "confidence": 0.91
}
```

El ejemplo ilustra el formato, no un esquema definitivo. El modelo debe distinguir atributos observables, inferencias y datos confirmados por el usuario.

### 12.2. Gemini: segunda opinión opcional

Puede incorporarse más adelante para comparar resultados en tareas como reconocimiento de prendas, patrones, tejidos aparentes, análisis de conjuntos o diferencias entre fotografías.

No enviar todas las imágenes a dos proveedores por defecto. Primero evaluar con casos reales si la segunda opinión mejora suficientemente la calidad como para justificar coste, latencia y tratamiento adicional de datos.

### 12.3. Generación de imágenes

Dos usos diferenciados:

- **Inspiración de outfits:** generar imágenes conceptuales para visualizar estilos y combinaciones.
- **Visualización personalizada:** intentar representar cómo podría quedar una combinación sobre una persona.

La visualización personalizada es más compleja y puede alterar detalles de las prendas o del cuerpo. No debe utilizarse como prueba de ajuste. La fotografía real y las pruebas físicas siguen siendo la referencia para evaluar cómo queda una prenda.

### 12.4. Motor de reglas deterministas

No delegar al modelo cálculos que puede hacer el software. Utilizar código tradicional para:

- Número de outfits posibles.
- Compatibilidad definida entre prendas.
- Porcentaje de utilización del armario.
- Coste por uso.
- Detección de duplicidades.
- Cumplimiento del presupuesto.
- Coincidencia con la paleta cromática, según reglas definidas.
- Validación de referencias y existencia de prendas.

**Principio de diseño:** la IA interpreta y propone; el software calcula, valida y ejecuta.

---

## 13. Datos y memoria persistente

La aplicación no debe depender de que un modelo recuerde conversaciones anteriores. La memoria relevante debe persistir en la base de datos, con relaciones explícitas y acceso controlado.

### 13.1. Entidades principales propuestas

| Entidad / tabla | Contenido |
|---|---|
| `user_profile` | Datos personales y medidas generales. |
| `style_profile` | Identidad estética, Style DNA y preferencias. |
| `color_profile` | Características cromáticas y paleta. |
| `body_profile` | Morfología, proporciones y medidas. |
| `garments` | Prendas del armario. |
| `garment_photos` | Fotografías de las prendas. |
| `garment_fit_reviews` | Evaluaciones de cómo quedan. |
| `outfits` | Conjuntos creados. |
| `outfit_items` | Prendas que componen cada conjunto. |
| `outfit_reviews` | Valoraciones personales de los conjuntos. |
| `brands` | Marcas y tiendas. |
| `products` | Productos externos y sus datos de origen. |
| `shopping_list` | Necesidades de compra. |
| `wishlist` | Productos o prendas de interés. |
| `wear_history` | Historial de uso de prendas y outfits. |
| `style_references` | Inspiraciones visuales guardadas. |
| `style_feedback` | Feedback para aprendizaje de preferencias. |

También se recomiendan entidades o registros para recomendaciones, auditorías, fuentes de datos, medidas de prendas de referencia y movimientos de estado. El esquema definitivo debe diseñarse a partir de los flujos reales y las necesidades de consulta.

### 13.2. Tres tipos de conocimiento que nunca deben confundirse

1. **Datos objetivos o declarados:** medidas, prendas, colores confirmados, precios, tallas, fechas y usos registrados.
2. **Preferencias personales:** qué le gusta al usuario, qué rechaza y con qué se siente cómodo.
3. **Criterios del estilista:** qué cortes, colores, combinaciones o decisiones recomienda el sistema.

Ejemplo: que la IA considere que un pantalón favorece al usuario no significa que al usuario le guste llevarlo. Ambas señales deben conservarse separadas.

### 13.3. Aprendizaje por feedback

Cuando el usuario acepte o rechace una recomendación, guardar el evento y, si es relevante, el motivo:

- No me gusta el color.
- No me convence el corte.
- No me veo con ese estilo.
- No me gusta el precio.
- Me gusta, pero no me siento cómodo.
- Ya tengo algo parecido.

No interpretar todos los rechazos como desagrado por la prenda. Puede existir una razón contextual, económica, funcional o de duplicidad.

### 13.4. Trazabilidad de recomendaciones

Guardar qué recomendó la IA, cuándo, con qué contexto, qué razones dio y qué decidió el usuario. Esto permite explicar decisiones, corregir errores y evaluar la evolución del sistema.

---

## 14. Cómo debe razonar el estilista

El criterio de la aplicación se construye con cuatro capas complementarias:

### Capa 1. Conocimiento profesional

Biblioteca estructurada y consultable que incluya:

- Principios de proporción y silueta.
- Tipos de patronaje.
- Cortes y ajustes.
- Colorimetría.
- Tejidos y sus comportamientos.
- Combinaciones cromáticas.
- Códigos de vestimenta.
- Construcción de armarios.
- Historia y estilos de moda.
- Sastrería y modificaciones.

No se plantea entrenar un modelo desde cero. Se propone preparar conocimiento estructurado con fuentes fiables que el sistema pueda consultar.

### Capa 2. Conocimiento personal

Información propia del usuario: morfología, medidas, colorimetría, estilo, preferencias, prendas, valoraciones, compras y experiencias.

Este contexto debe tener prioridad sobre recomendaciones genéricas, respetando siempre las preferencias explícitas del usuario.

### Capa 3. Motor de decisión

Aplica objetivos, restricciones y compensaciones. Ejemplos:

- Un producto con alta compatibilidad estética, pero por encima del presupuesto, no debe presentarse como compra viable.
- Una camisa puede encajar con el estilo, pero aportar poco valor si el usuario ya tiene cuatro muy similares.
- Una prenda puede ser favorecedora, pero no ser funcional para las actividades habituales.

Los criterios y pesos de decisión deben ser explícitos, configurables y explicables. No inventar ponderaciones no definidas por el producto.

### Capa 4. Aprendizaje por feedback

Actualizar preferencias a partir de las decisiones y experiencias del usuario. Cuando el motivo de una decisión sea ambiguo y afecte a recomendaciones futuras, preguntar de forma contextual y no intrusiva.

---

## 15. Privacidad y seguridad

El sistema puede almacenar fotografías personales, medidas corporales y preferencias. La privacidad debe formar parte de la arquitectura desde el inicio.

Requisitos y recomendaciones:

- Almacenar fotografías en buckets privados.
- No exponer URLs públicas de imágenes personales.
- Aplicar políticas de acceso de Supabase y aislamiento de datos por usuario.
- Mantener claves de API exclusivamente en el servidor.
- Permitir eliminar fotografías y datos personales.
- No utilizar fotografías del usuario para entrenar modelos.
- Enviar a proveedores de IA únicamente las imágenes necesarias para cada tarea.
- Revisar las políticas de retención y tratamiento de cada proveedor.
- Separar fotografías corporales de fotografías de prendas.
- Valorar un modo en el que las imágenes corporales se eliminen después del análisis y se conserven solo resultados estructurados, si el usuario lo elige.

La autorización debe comprobarse en servidor para cada operación; ocultar elementos de la interfaz no es una medida de seguridad suficiente.

---

## 16. Experiencia visual y diseño

La interfaz debe sentirse como una revista de moda o un estudio de estilismo digital, no como un panel tecnológico lleno de estadísticas.

Dirección visual propuesta:

- Fondo blanco roto o marfil.
- Negro y grises cálidos.
- Tonos tierra como acentos.
- Tipografía serif para titulares editoriales.
- Tipografía sans serif para información y controles.
- Fotografías grandes y protagonistas.
- Tarjetas limpias y jerarquía visual clara.
- Espacios amplios.
- Pocas gráficas; priorizar las prendas, las combinaciones y las referencias visuales.

La interfaz debe transmitir la sensación de tener un estilista privado: elegante, clara, personal y funcional.

---

## 17. Roadmap de desarrollo

La arquitectura puede contemplar el producto completo desde el principio, pero el desarrollo debe realizarse por fases.

### Fase 1. Fundamentos

- Crear el proyecto y la base de datos.
- Construir la interfaz principal.
- Implementar el perfil personal.
- Crear el cuestionario de estilismo.
- Generar el primer Style DNA.

**Objetivo:** que la aplicación conozca al usuario.

### Fase 2. Armario digital

- Subida de fotografías.
- Reconocimiento automático de prendas.
- Fichas individuales.
- Clasificación y búsqueda.
- Valoraciones y decisiones sobre prendas.

**Objetivo:** disponer de un inventario digital útil y corregible.

### Fase 3. Motor de estilismo

- Generador de outfits.
- Compatibilidad entre prendas.
- Fórmulas de estilo.
- Recomendaciones por ocasión.
- Feedback y aprendizaje.

**Objetivo:** conseguir que el estilista tenga criterio y proponga looks reales.

### Fase 4. Personal shopper

- Buscador de productos.
- Integración de fuentes autorizadas.
- Comparador de prendas.
- Sustituciones.
- Wishlist y presupuesto.

**Objetivo:** recomendar compras concretas que aporten valor.

### Fase 5. Experiencia avanzada

- Calendario de outfits.
- Planificación estacional.
- Seguimiento de uso.
- Organización de viajes.
- Probador virtual experimental.

**Objetivo:** convertirlo en un estilista cotidiano.

### 17.1. Primer recorrido funcional recomendado

El primer recorrido completo debe ser pequeño, pero demostrar el valor central:

1. El usuario crea su perfil y completa el cuestionario.
2. La IA construye la primera dirección de estilo.
3. El usuario fotografía entre 20 y 30 prendas.
4. La IA las clasifica y crea fichas que el usuario puede corregir.
5. El usuario sube fotografías llevando algunas prendas.
6. El estilista evalúa el ajuste con las limitaciones indicadas y registra preferencias.
7. Genera los primeros 10 outfits usando prendas reales.
8. Detecta los primeros cinco huecos del armario, si los datos lo permiten.
9. Propone compras para cubrir esos huecos, inicialmente incluso mediante productos introducidos manualmente.

**Resultado esperado:** un estilista funcional que conoce al usuario y parte de su ropa, empieza a ayudarle a decidir qué ponerse y detecta oportunidades de mejora. Este recorrido no necesita scraping, generación de imágenes ni probador virtual.

---

## 18. Criterios de calidad y reglas no negociables

Toda implementación debe respetar estas reglas:

1. **No inventar prendas.** Los outfits del armario se construyen con identificadores reales de prendas existentes.
2. **No inventar productos ni disponibilidad.** Una recomendación comercial debe proceder de una fuente identificable y mostrar cuándo faltan datos.
3. **No afirmar materiales, composición o tallas sin evidencia.** Distinguir inferencias visuales de datos confirmados.
4. **No tratar la colorimetría como certeza absoluta.** Es una orientación sujeta a condiciones de captura y validación.
5. **No presentar simulaciones como pruebas reales.** Una imagen generada no demuestra ajuste ni tallaje.
6. **No permitir escrituras descontroladas de la IA.** Validar toda salida y aplicar autorización antes de cambiar datos.
7. **No mezclar datos y preferencias.** Guardar por separado hechos, opiniones del usuario y recomendaciones del sistema.
8. **No recomendar compras sin considerar el armario.** Evaluar duplicidad, necesidad, compatibilidad, presupuesto y utilidad marginal.
9. **No basar el producto en scraping no autorizado.** Usar fuentes permitidas y adaptadores intercambiables.
10. **No dar puntuaciones con falsa precisión.** Explicar dimensiones, incertidumbre y datos que faltan.
11. **No sacrificar utilidad por sofisticación.** Completar primero los flujos fundamentales.
12. **Respetar la privacidad.** Minimizar datos enviados a proveedores y mantener controles de acceso y eliminación.

### Comportamiento cuando falta información

- Indicar qué dato falta y por qué importa.
- Ofrecer una conclusión provisional solo cuando sea razonable.
- No sustituir datos desconocidos por valores inventados.
- Reducir el nivel de confianza de la recomendación.
- Pedir al usuario que confirme o aporte información cuando afecte de forma material a la decisión.

---

## 19. Decisiones pendientes y aspectos que no están definidos

Este documento define la visión y las recomendaciones iniciales, pero no fija todos los detalles de implementación. La IA que trabaje en el proyecto debe identificar estos puntos y no asumir respuestas sin comprobar el código o acordarlas con el usuario:

- Estado real de implementación de cada módulo y ruta.
- Esquema definitivo de base de datos, claves, relaciones e índices.
- Sistema definitivo de autenticación y políticas RLS.
- Campos obligatorios y opcionales de cada ficha.
- Taxonomía cerrada de categorías, cortes, estilos, colores y temporadas.
- Fórmulas definitivas para compatibilidad y puntuación de outfits.
- Umbrales para detectar duplicados y huecos del armario.
- Criterios y pesos para ordenar recomendaciones de compra.
- Proveedores concretos de clima y fuentes comerciales autorizadas.
- Política de conservación, borrado y retención de imágenes.
- Presupuesto operativo y límites de uso de APIs.
- Necesidad real de Gemini tras realizar pruebas comparativas.
- Alcance exacto del calendario, automatizaciones y funciones avanzadas.

Cuando una decisión sea necesaria para continuar, la IA debe presentar las opciones y sus consecuencias, en vez de fingir que ya existe una decisión tomada.

---

## 20. Resumen ejecutivo para agentes de IA

**Personal Stylist es una aplicación web de estilismo personal, con memoria persistente, cuyo valor está en conectar perfil, armario, estilo, outfits, compras y aprendizaje en un único sistema coherente.**

Su arquitectura recomendada es Next.js + React + TypeScript + Tailwind + shadcn/ui, con backend en Next.js, Supabase/PostgreSQL/Storage, OpenAI como IA principal, Gemini como posible segunda opinión, pgvector para búsqueda semántica cuando aporte valor y Vercel para despliegue. Se recomienda un monolito modular y una web responsive/PWA al inicio.

El sistema debe conocer al usuario antes de personalizar, mantener fichas corregibles de cada prenda, evaluar el ajuste con cautela, construir outfits con inventario real, recomendar compras que cubran huecos y aprender del feedback y del uso. La IA interpreta y propone; el código calcula y valida. Los datos objetivos, las preferencias del usuario y los criterios del estilista deben mantenerse separados. Las fotografías y medidas requieren privacidad estricta. Las fuentes comerciales deben ser autorizadas: no depender de scraping prohibido.

**Prioridad de desarrollo:** perfil y Style DNA → armario digital → motor de outfits → personal shopper → planificación y funciones avanzadas.

**La medida del éxito no es cuántas funciones de IA tiene la aplicación, sino si ayuda al usuario a vestirse mejor, comprar con criterio y construir un armario más útil y coherente con su vida.**

---
