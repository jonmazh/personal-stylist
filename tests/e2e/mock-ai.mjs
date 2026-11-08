// Servidor de IA simulado (compatible OpenAI) para las pruebas e2e: responde un texto fijo y guarda la ultima peticion en el fichero indicado.
import http from 'node:http'; import fs from 'node:fs'
const out = process.argv[2]
http.createServer((req,res)=>{let b='';req.on('data',d=>b+=d);req.on('end',()=>{res.setHeader('content-type','application/json')
 if (req.url.endsWith('/models')) return res.end(JSON.stringify({object:'list',data:[{id:'mock',object:'model',created:0,owned_by:'x'}]}))
 fs.writeFileSync(out, b)
 res.end(JSON.stringify({id:'x',object:'chat.completion',created:0,model:'mock',choices:[{index:0,finish_reason:'stop',message:{role:'assistant',content:'Respuesta simulada del estilista'}}]}))})}).listen(4600)
