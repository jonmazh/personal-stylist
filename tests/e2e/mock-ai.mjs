// Servidor de IA simulado (compatible OpenAI) para las pruebas e2e. Guarda la ultima peticion en el fichero indicado.
// - Chat: responde un texto fijo.
// - Temperatura cromatica: foto con aviso de oscura → no apta; si no, «neutra con tendencia calida», confianza alta.
// - Analisis de referencias: etiqueta cada imagen como Workwear contemporáneo (incluye un color y un elemento fuera del vocabulario para probar el filtro).
// - Garment Analyst: propone un pantalon gris (con valores invalidos para probar la normalizacion).
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
