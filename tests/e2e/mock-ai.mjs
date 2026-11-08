// Servidor de IA simulado (compatible OpenAI) para las pruebas e2e. Guarda la ultima peticion en el fichero indicado.
// - Chat: responde un texto fijo.
// - Temperatura cromatica: foto con aviso de oscura → no apta; si no, «neutra con tendencia calida», confianza alta.
// - Analisis de referencias: etiqueta cada imagen como Workwear contemporáneo (incluye un color y un elemento fuera del vocabulario para probar el filtro).
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
