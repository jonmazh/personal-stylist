import type OpenAI from 'openai'
import type { z } from 'zod'
import { ai } from './client'

type Msg = OpenAI.Chat.Completions.ChatCompletionMessageParam

/** Extrae el primer objeto JSON de un texto (por si el modelo lo envuelve en ```json o prosa). */
function extractJson(text: string): unknown {
  const clean = text.replace(/```(?:json)?/gi, '').trim()
  try { return JSON.parse(clean) } catch {}
  const a = clean.indexOf('{'), b = clean.lastIndexOf('}')
  if (a >= 0 && b > a) return JSON.parse(clean.slice(a, b + 1))
  throw new Error('La respuesta no contiene JSON')
}

async function complete(model: string, messages: Msg[], json: boolean) {
  try {
    const r = await ai().chat.completions.create({
      model, messages, temperature: 0.3,
      ...(json ? { response_format: { type: 'json_object' as const } } : {}),
    })
    return r.choices[0]?.message?.content ?? ''
  } catch (e) {
    // Algunos modelos gratuitos no aceptan response_format: se reintenta sin el.
    if (json && e instanceof Error && /response_format|json/i.test(e.message)) return complete(model, messages, false)
    // Los proveedores retiran modelos con frecuencia: se explica como cambiarlo sin tocar codigo.
    if (e instanceof Error && /^404\b|model.*(not found|no longer available|does not exist)/i.test(e.message))
      throw new Error(`El modelo "${model}" no esta disponible en tu proveedor. Cambialo con AI_MODEL_CHAT / AI_MODEL_VISION en .env.local. Detalle: ${e.message.slice(0, 300)}`)
    throw e
  }
}

/**
 * Salida estructurada portable: pide JSON, lo valida con Zod y, si falla,
 * reintenta una vez indicando el error al modelo. Funciona con cualquier
 * proveedor compatible OpenAI (Gemini, Groq, OpenRouter, Ollama...).
 */
export async function generateStructured<T extends z.ZodType>(opts: {
  model: string
  schema: T
  system: string
  user: OpenAI.Chat.Completions.ChatCompletionUserMessageParam['content']
}): Promise<z.infer<T>> {
  const messages: Msg[] = [
    { role: 'system', content: opts.system },
    { role: 'user', content: opts.user },
  ]
  let lastErr = ''
  for (let attempt = 0; attempt < 2; attempt++) {
    const text = await complete(opts.model, messages, true)
    try {
      const parsed = opts.schema.safeParse(extractJson(text))
      if (parsed.success) return parsed.data
      lastErr = parsed.error.message
    } catch (e) {
      lastErr = e instanceof Error ? e.message : String(e)
    }
    messages.push({ role: 'assistant', content: text })
    messages.push({ role: 'user', content: `Tu respuesta no es valida (${lastErr.slice(0, 500)}). Devuelve SOLO el JSON corregido, sin texto adicional.` })
  }
  throw new Error(`La IA no devolvio un resultado valido: ${lastErr.slice(0, 200)}`)
}

/** Respuesta de texto libre (chat). */
export async function generateText(model: string, system: string, history: { role: 'user' | 'assistant'; content: string }[]) {
  return complete(model, [{ role: 'system', content: system }, ...history], false)
}
