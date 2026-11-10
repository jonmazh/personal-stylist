// Servidor de IA simulado (compatible OpenAI) para las pruebas e2e. Guarda la ultima peticion en el fichero indicado.
// - Chat: responde un texto fijo.
// - Temperatura cromatica: foto con aviso de oscura → no apta; si no, «neutra con tendencia calida», confianza alta.
// - Analisis de referencias: etiqueta cada imagen como Workwear contemporáneo (incluye un color y un elemento fuera del vocabulario para probar el filtro).
// - Fit Assessor: ajuste bueno salvo el largo del pantalon (arreglable) y una dimension no observable.
// - Garment Analyst: propone un pantalon gris (con valores invalidos para probar la normalizacion).
// - Product Analyst (4C): ficha de un pantalon gris con trampas: estilo fuera del catalogo, calidad «documentada» sin cita y composicion inventada.
// - Analisis de fotos (peticion con imagenes): marca "lateral" como no utilizable y devuelve una observacion por foto.
import http from 'node:http'; import fs from 'node:fs'
const out = process.argv[2]
http.createServer((req, res) => {
  let b = ''; req.on('data', (d) => (b += d)); req.on('end', () => {
    res.setHeader('content-type', 'application/json')
    if (req.url.endsWith('/models')) return res.end(JSON.stringify({ object: 'list', data: [{ id: 'mock', object: 'model', created: 0, owned_by: 'x' }] }))
    fs.writeFileSync(out, b)
    const body = JSON.parse(b)
    const user = body.messages.find((m) => m.role === 'user')
    let content = 'Respuesta simulada del estilista'
    const sys = body.messages.find((m) => m.role === 'system')?.content ?? ''
    if (sys.includes('TEMPERATURA CROMATICA') && Array.isArray(user?.content)) {
      const dark = /oscura/i.test(user.content[0].text)
      content = JSON.stringify(dark
        ? { image_quality: { suitable: false, issues: ['Iluminación insuficiente: la piel apenas se distingue'] }, temperature: 'calida', secondary_tendency: null, confidence: 'alta', observations: [], explanation: 'La foto está demasiado oscura.', limitations: ['Con poca luz el color de la piel no es fiable'] }
        : { image_quality: { suitable: true, issues: [] }, temperature: 'neutra', secondary_tendency: 'calida', confidence: 'alta', observations: ['Matices ligeramente dorados en mejillas y frente'], explanation: 'Se aprecian matices ligeramente dorados, aunque sin una predominancia cálida marcada.', limitations: ['La luz y el procesado del móvil influyen en el color aparente'] })
      res.end(JSON.stringify({ id: 'x', object: 'chat.completion', created: 0, model: 'mock', choices: [{ index: 0, finish_reason: 'stop', message: { role: 'assistant', content } }] }))
      return
    }
    const reply = (obj) => res.end(JSON.stringify({ id: 'x', object: 'chat.completion', created: 0, model: 'mock', usage: { prompt_tokens: 700, completion_tokens: 150, total_tokens: 850 }, choices: [{ index: 0, finish_reason: 'stop', message: { role: 'assistant', content: JSON.stringify(obj) } }] }))
    const utext = typeof user?.content === 'string' ? user.content : ''
    const tasteFrom = (msg, text) => {
      const lines = text.split('\n').filter((l) => /^[0-9a-f-]{36}: /.test(l))
      const garment_ids = lines.filter((l) => { const t = l.slice(38).split(' · ')[0].toLowerCase(); return t && msg.includes(t) }).map((l) => l.slice(0, 36))
      const elements = [...(msg.includes('pitillo') ? ['leg-slim'] : []), ...(msg.includes('gráfica') || msg.includes('grafica') ? ['graphic-tee'] : []), ...(msg.includes('anchos') || msg.includes('amplios') ? ['leg-wide'] : [])]
      const colors = ['Rosa', 'Mostaza', 'Burdeos', 'Lila', 'Verde bosque'].filter((c) => msg.includes(c.toLowerCase()))
      const cuts = msg.includes('pantalones anchos') ? [{ key: 'pantalones', value: 'Amplio' }] : []
      const empty = { garment_ids: [], elements: [], colors: [], cuts: [] }
      const negative = /no me gust|odio|no soporto|nunca me/.test(msg)
      return negative ? { likes: empty, dislikes: { garment_ids, elements, colors, cuts: [] } } : { likes: { garment_ids, elements, colors, cuts }, dislikes: empty }
    }
    // Analista de tendencias (2.0C): agrupa las evidencias por palabras clave. Incluye trampas para la validación por
    // código: una cita a una evidencia inexistente, una marca que no aparece y una cifra de ventas.
    if (sys.includes('ANALISTA DE TENDENCIAS')) {
      const ev = [...utext.matchAll(/\[(E\d+)\] ([^\n]*)\nTítulo: ([^\n]*)\nFragmentos: ([^\n]*)/g)].map((m) => ({ id: m[1], text: `${m[3]} ${m[4]}`.toLowerCase() }))
      const ids = (re) => ev.filter((e) => re.test(e.text)).map((e) => e.id)
      const signals = []
      const wide = ids(/wide|baggy|relaxed|loose|amplio/)
      if (wide.length) signals.push({ name: 'Pantalón amplio con caída', dimension: 'silhouette', description: 'Pantalones de pierna amplia y caída fluida, llevados con prendas superiores más limpias. Las ventas crecieron un 40 % este año.', evidence_ids: [...wide, 'E99'], brands: ['Auralee', 'Gucci'], season_mentioned: 'autumn winter', decline_evidence_ids: [], search_query_en: "men's wide leg trousers" })
      const suede = ids(/suede|ante/)
      if (suede.length) signals.push({ name: 'Ante en prendas exteriores', dimension: 'material', description: 'Chaquetas y sobrecamisas de ante como pieza de textura sobre bases neutras.', evidence_ids: suede, brands: [], season_mentioned: '', decline_evidence_ids: [], search_query_en: "men's suede jacket" })
      const brown = ids(/brown|chocolate|marr/)
      if (brown.length) signals.push({ name: 'Marrón chocolate como neutro', dimension: 'color', description: 'El marrón chocolate sustituye al negro como base de los conjuntos.', evidence_ids: brown, brands: [], season_mentioned: '', decline_evidence_ids: [], search_query_en: "menswear chocolate brown" })
      signals.push({ name: 'Sin fuentes', dimension: 'garment', description: 'Una señal que no cita ninguna evidencia real.', evidence_ids: ['E99'], brands: [], season_mentioned: '', decline_evidence_ids: [], search_query_en: 'x' })
      return reply({ signals })
    }
    if (sys.includes('EXTRACTOR DE GUSTOS')) {
      const m = (utext.match(/MENSAJE: \"\"\"([\s\S]*?)\"\"\"/)?.[1] ?? '').toLowerCase()
      return reply(tasteFrom(m, utext))
    }
    if (sys.includes('EVALUACION DE UN CONJUNTO')) {
      // Critica teorica: una sugerencia valida (otra prenda de calzado) y otra con un id inventado (debe descartarse)
      const avail = utext.split('\n').filter((l) => /^[0-9a-f-]{36}: /.test(l))
      const shoe = avail.find((l) => l.includes('footwear') && !utext.split('CONJUNTO:')[1]?.split('PUNTUACION')[0]?.includes(l.slice(0, 36)))?.slice(0, 36)
      return reply({ verdict: 'Es un conjunto coherente: la base neutra deja que la parte superior respire.', strengths: ['Colores en armonía'], risks: ['El calzado endurece el conjunto'],
        suggestions: [...(shoe ? [{ role: 'footwear', garment_id: shoe, reason: 'Más equilibrado con el resto' }] : []), { role: 'footwear', garment_id: '00000000-0000-4000-8000-0000000000ff', reason: 'Inventada' }] })
    }
    if (sys.includes('evaluando una FOTOGRAFIA') && Array.isArray(user?.content)) {
      const planned = /CONJUNTO PREVISTO/.test(user.content[0].text)
      return reply({ photo_quality: { suitable: true, issues: [] },
        aspects: [{ key: 'integration', observation: 'Las prendas se integran con naturalidad', score: 8, visible: true }, { key: 'proportions', observation: 'La chaqueta equilibra el torso', score: 8, visible: true }, { key: 'lengths', observation: 'El bajo del pantalón no se ve: el encuadre corta los tobillos', score: null, visible: false }, { key: 'harmony', observation: 'Armonía cromática cuidada', score: 9, visible: true }, { key: 'inventado', observation: 'x', score: 2, visible: true }],
        matches_plan: { value: planned ? 'si' : 'desconocido', notes: '' }, not_visible: ['El largo del pantalón y el calzado'], summary: 'El conjunto funciona sobre ti; falta ver el bajo.', suggestions: ['Haz la foto de cuerpo entero para valorar el largo'] })
    }
    if (sys.includes('interprete de peticiones')) {
      // Interprete: deduce lo evidente, mete un valor invalido y un id inventado (la app debe descartarlos)
      const q = (utext.match(/PETICION DEL USUARIO: \"\"\"([\s\S]*?)\"\"\"/)?.[1] ?? '').toLowerCase()
      const inv = (name) => utext.split('\n').find((l) => /^[0-9a-f-]{36}: /.test(l) && l.toLowerCase().includes(name))?.slice(0, 36)
      return reply({
        occasion: q.includes('cena') ? 'cena_amigos' : q.includes('reunión') || q.includes('reunion') ? 'reunion_trabajo' : null,
        dress_code: q.includes('elegante') ? 'smart_casual' : null, time_of_day: q.includes('cena') || q.includes('noche') ? 'evening' : null, environment: 'indoor',
        weather: q.includes('frío') || q.includes('frio') ? 'cold' : null, formality: null, comfort_priority: null, preferred_style: 'gotico',
        restrictions: q.includes('americana') ? ['no_jacket'] : [], exclude_categories: [],
        required_garment_ids: q.includes('pantalón gris') ? [inv('pantalón gris')].filter(Boolean) : [], exclude_garment_ids: ['00000000-0000-4000-8000-999999999999'],
        number_of_outfits: null, assumptions: ['Restaurante bastante elegante → smart casual', 'Hará frío: conviene abrigo'],
      })
    }
    if (sys.includes('Eres Personal Stylist') && !sys.includes('AHORA ESTAS EN CONVERSACION')) {
      // Seleccion: cita una candidata inexistente (C9) y elige en orden distinto al del motor
      const n = Number(utext.match(/TAREA: elige (\d+)/)?.[1] ?? 3)
      const keys = [...utext.matchAll(/^(C\d+) \[/gm)].map((m) => m[1])
      const order = ['C9', ...keys.slice(1), keys[0]].slice(0, n + 1)
      const names = ['Elegancia relajada', 'Minimalismo cálido', 'Noche sin corbata', 'Casual con carácter', 'Fondo de armario']
      return reply({ intro: 'He elegido estas opciones pensando en una cena cuidada sin llegar al traje.', proposals: order.map((c, i) => ({ candidate: c, name: names[i] ?? `Propuesta ${i + 1}`, why: `Funciona porque equilibra estructura y comodidad (${c}).`, when: 'Cenas de otoño en interior.', limitations: 'No hay prueba de ajuste de todas las prendas.' })) })
    }
    if (sys.includes('AHORA ESTAS EN CONVERSACION')) {
      const m = (utext.match(/MENSAJE DEL USUARIO: \"\"\"([\s\S]*?)\"\"\"/)?.[1] ?? '').toLowerCase()
      const target = Number(m.match(/p(\d)/)?.[1] ?? (m.includes('segund') ? 2 : m.includes('primer') ? 1 : 2))
      const avail = utext.split('\n').filter((l) => /^[0-9a-f-]{36}: /.test(l))
      const line = (t) => avail.find((l) => l.includes(t))?.slice(0, 36)
      const prop = utext.split('\n').find((l) => l.startsWith(`P${target} `)) ?? ''
      const curShoe = prop.match(/footwear=[^(]*\(([0-9a-f-]{36})\)/)?.[1]
      if (m.includes('no me gusta') || ((m.includes('me gustan') || m.includes('me encanta')) && !/p\d|segund|primer/.test(m))) return reply({ reply: 'Entendido, lo tendré en cuenta a partir de ahora.', action: 'answer', target: null, changes: [], new_context: null, ...tasteFrom(m, utext) })
      if (m.includes('cowboy')) return reply({ reply: 'Te pongo unas botas camperas.', action: 'modify', target, changes: [{ role: 'footwear', garment_id: '00000000-0000-4000-8000-123456789abc' }], new_context: null })
      if (m.includes('zapatillas')) return reply({ reply: 'También funciona con las zapatillas blancas, aunque cambia el carácter del look: más relajado.', action: 'modify', target, changes: [{ role: 'footwear', garment_id: line('Zapatillas') }], new_context: null })
      if (m.includes('zapatos')) { const alt = avail.filter((l) => l.includes('footwear') && !l.includes('Zapatillas') && !l.startsWith(curShoe ?? '-'))[0]?.slice(0, 36); return reply({ reply: 'Mantendría el pantalón y la parte superior y cambiaría los zapatos: algo menos informal y con más coherencia cromática.', action: 'modify', target, changes: [{ role: 'footwear', garment_id: alt }], new_context: null }) }
      if (m.includes('guarda')) return reply({ reply: 'Perfecto, la guardo.', action: 'save', target, changes: [], new_context: null })
      if (m.includes('lluvia')) return reply({ reply: 'Con lluvia lo replanteo con abrigo.', action: 'regenerate', target: null, changes: [], new_context: { weather: 'rain' } })
      return reply({ reply: 'La segunda es la más versátil: los neutros te dejan repetir prendas en otros conjuntos.', action: 'answer', target: 2, changes: [], new_context: null })
    }
    if (sys.includes('Fit Assessor') && Array.isArray(user?.content)) {
      // Ajuste: la primera dimension bien, el largo del pantalon mejorable y arreglable, una no observable y una clave inventada.
      const keys = [...user.content[0].text.matchAll(/^- (\w+): /gm)].map((m) => m[1])
      content = JSON.stringify({
        photo_quality: { suitable: true, issues: [] },
        dimensions: [...keys.map((k, i) => ({ key: k, score: k === 'trouser_length' ? 5 : k === 'stacking' ? null : 8 + (i % 2), observation: k === 'trouser_length' ? 'El bajo acumula tela sobre el zapato' : k === 'stacking' ? 'El zapato no se ve en la foto' : 'Correcto', fixable: k === 'trouser_length', confidence: k === 'stacking' ? 0.2 : 0.8 })), { key: 'shoulders', score: 3, observation: 'x', fixable: true, confidence: 0.9 }],
        limitations: ['Los pliegues pueden deberse a la postura'], summary: 'Buen ajuste general; el largo es mejorable.',
      })
      res.end(JSON.stringify({ id: 'x', object: 'chat.completion', created: 0, model: 'mock', usage: { prompt_tokens: 900, completion_tokens: 200, total_tokens: 1100 }, choices: [{ index: 0, finish_reason: 'stop', message: { role: 'assistant', content } }] }))
      return
    }
    if (sys.includes('Eres Product Analyst')) {
      const text = Array.isArray(user?.content) ? user.content[0].text : utext
      const imgs = Array.isArray(user?.content) ? user.content.length - 1 : 0
      const trousers = /Nombre: [^\n]*pantal/i.test(text)
      return reply({
        category: { value: trousers ? 'bottom' : 'top', confidence: 0.95 }, subcategory: { value: trousers ? 'trousers' : 'shirt', confidence: 0.9 },
        primary_color: { value: 'Gris', confidence: 0.8 }, secondary_colors: [], pattern: { value: 'Liso', confidence: 0.9 },
        cut: { value: 'Recto', confidence: 0.8 }, silhouette: { value: 'Regular', confidence: 0.7 }, apparent_material: { value: 'Lana peinada con caída', confidence: 0.6 },
        composition: { value: '80% lana 20% cachemir', confidence: 0.9, source: 'label' }, label: null, attributes: [{ key: 'rise', value: 'Medio', confidence: 0.7 }],
        formality: { value: 4, confidence: 0.85 }, seasons: ['otono', 'invierno'], observations: ['Pernera recta sin pinzas'], inferences: ['Apto para oficina'],
        unknown: [{ field: 'composition', reason: 'No se ve la etiqueta', photo: 'label' }], additional_photos_requested: [],
        field_origins: { subcategory: 'text', category: 'text', primary_color: imgs ? 'photo' : 'text', cut: 'inference', silhouette: 'photo', formality_level: 'inference' },
        style_tags: [{ id: 'smart-casual', confidence: 0.8 }, { id: 'estilo-inventado', confidence: 0.9 }],
        quality: { documented: ['«100% lana» según la tienda', 'Tejido premium de gran durabilidad'], apparent: ['Tejido con buena caída'], unknown: ['Calidad de las costuras'] },
        model_photos: imgs > 0,
      })
    }
    if (sys.includes('Garment Analyst') && Array.isArray(user?.content)) {
      // Pantalon: valores validos, uno fuera de taxonomia, un atributo de otra familia, silueta con poca confianza.
      // Composicion y marca solo si hay foto de etiqueta (la app debe descartarlas si no la hay).
      const label = /Hay foto de etiqueta/.test(user.content[0].text)
      content = JSON.stringify({
        category: { value: 'bottom', confidence: 0.97 }, subcategory: { value: 'trousers', confidence: 0.9 },
        primary_color: { value: 'Gris', confidence: 0.88 }, secondary_colors: [{ value: 'Fucsia neón', confidence: 0.3 }],
        pattern: { value: 'Liso', confidence: 0.95 }, cut: { value: 'Recto', confidence: 0.8 }, silhouette: { value: 'Regular', confidence: 0.4 },
        apparent_material: { value: 'Sarga de aspecto lanoso', confidence: 0.6 },
        composition: { value: '98 % lana, 2 % elastano', confidence: 0.9, source: 'label' },
        label: { brand: 'Marca Leída', size: '48', confidence: 0.85 },
        attributes: [{ key: 'rise', value: 'Medio', confidence: 0.7 }, { key: 'pleats', value: 'No', confidence: 0.9 }, { key: 'shoulder', value: 'Natural', confidence: 0.9 }, { key: 'leg', value: 'Campana', confidence: 0.5 }],
        formality: { value: 4, confidence: 0.85 }, seasons: ['otono', 'invierno', 'verano-tropical'],
        observations: ['Pantalón de color gris liso con raya marcada'], inferences: ['Por el aspecto del tejido, probablemente para otoño e invierno'],
        unknown: label ? [] : [{ field: 'composition', reason: 'No hay etiqueta visible', photo: 'label' }],
        additional_photos_requested: label ? [] : ['label'],
      })
      res.end(JSON.stringify({ id: 'x', object: 'chat.completion', created: 0, model: 'mock', usage: { prompt_tokens: 1200, completion_tokens: 300, total_tokens: 1500 }, choices: [{ index: 0, finish_reason: 'stop', message: { role: 'assistant', content } }] }))
      return
    }
    const refs = Array.isArray(user?.content) && user.content[0].text.match(/Referencias en este orden: (\d+)/)
    if (refs) {
      content = JSON.stringify({ references: Array.from({ length: Number(refs[1]) }, (_, i) => ({
        index: i + 1, style: 'Workwear contemporáneo', fit: 'amplio', structure: 'relajado', formality: 2, colors: ['Oliva', 'Fucsia'], elements: ['overshirt', 'cargo', 'boot', 'inventado'], garments: ['sobrecamisa'], patterns: 'Capas de algodón grueso y botas',
      })) })
    } else if (Array.isArray(user?.content)) {
      const kinds = (user.content[0].text.match(/Fotos en este orden: ([^.]+)\./)?.[1] ?? '').split(', ')
      content = JSON.stringify({
        photo_quality: kinds.map((k) => ({ source_photo: k, usable: k !== 'lateral', issues: k === 'lateral' ? ['No se ve el cuerpo entero'] : [] })),
        observations: kinds.map((k) => ({ area: 'antropometria', title: `Observación ${k}`, body: `Algo visible en la foto ${k}`, confidence: 'media', justification: 'Se ve en la imagen', source_photo: k })),
      })
    }
    res.end(JSON.stringify({ id: 'x', object: 'chat.completion', created: 0, model: 'mock', choices: [{ index: 0, finish_reason: 'stop', message: { role: 'assistant', content } }] }))
  })
}).listen(Number(process.env.PORT || 4600))
