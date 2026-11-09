import type OpenAI from 'openai'
import type { z } from 'zod'
import { ai } from './client'

type Msg = OpenAI.Chat.Completions.ChatCompletionMessageParam
export type ModelKind = 'chat' | 'vision'

const isModelMissing = (e: unknown) =>
  e instanceof Error && /^404\b|model.*(not found|no longer available|does not exist|decommissioned)/i.test(e.message)

// ── Auto-descubrimiento de modelos ──────────────────────────────────
// Los proveedores gratuitos retiran modelos a menudo. Si el configurado no existe,
// se consulta /models (estandar OpenAI) y se elige uno disponible, sin tocar codigo.
const NOT_LLM = /whisper|tts|speech|audio|embed|guard|moderation|orpheus|playai|rerank|image-gen|dall|imagen|veo|compound|distil/i
const VISION_HINT = /vision|[-/]vl|vl[-:]|qwen3\.\d|qwen2\.5-vl|llama-4|scout|maverick|gemma-?3|pixtral|gemini|llava|gpt-4o|gpt-4\.1|gpt-5/i
const CHAT_PREF = [/gpt-oss-120b/i, /qwen3\.\d/i, /llama-4/i, /70b/i, /gemini.*flash/i, /gpt-oss/i, /qwen/i, /llama/i, /gemma/i, /mistral|mixtral/i]

const resolved: Partial<Record<ModelKind, string>> = {}

/** Modelo que se esta usando realmente (el configurado o el elegido automaticamente). */
export const effectiveModel = (kind: ModelKind, configured: string) => resolved[kind] ?? configured

async function pickAvailable(kind: ModelKind, failed: string): Promise<string | null> {
  let ids: string[] = []
  try {
    for await (const m of ai().models.list()) ids.push(m.id)
  } catch { return null }
  ids = ids.filter((id) => id !== failed && !NOT_LLM.test(id))
  if (kind === 'vision') ids = ids.filter((id) => VISION_HINT.test(id))
  for (const re of CHAT_PREF) {
    const hit = ids.find((id) => re.test(id))
    if (hit) return hit
  }
  return ids[0] ?? null
}

/** Quita el razonamiento <think>...</think> que algunos modelos (Qwen, DeepSeek) incluyen en el texto. */
const stripThinking = (t: string) => t.replace(/<think>[\s\S]*?<\/think>/gi, '').trim()

/** Extrae el primer objeto JSON de un texto (por si el modelo lo envuelve en ```json o prosa). */
function extractJson(text: string): unknown {
  const clean = stripThinking(text).replace(/```(?:json)?/gi, '').trim()
  try { return JSON.parse(clean) } catch {}
  const a = clean.indexOf('{'), b = clean.lastIndexOf('}')
  if (a >= 0 && b > a) return JSON.parse(clean.slice(a, b + 1))
  throw new Error('La respuesta no contiene JSON')
}

/** Consumo acumulado de una operacion: llamadas, tokens (si el proveedor los devuelve) y tiempo. */
export interface Usage { calls: number; prompt: number; completion: number; ms: number }
export const newUsage = (): Usage => ({ calls: 0, prompt: 0, completion: 0, ms: 0 })

async function complete(kind: ModelKind, configured: string, messages: Msg[], json: boolean, triedFallback = false, usage?: Usage): Promise<string> {
  const model = effectiveModel(kind, configured)
  try {
    const t0 = Date.now()
    const r = await ai().chat.completions.create({
      model, messages, temperature: 0.3,
      ...(json ? { response_format: { type: 'json_object' as const } } : {}),
    })
    if (usage) { usage.calls++; usage.prompt += r.usage?.prompt_tokens ?? 0; usage.completion += r.usage?.completion_tokens ?? 0; usage.ms += Date.now() - t0 }
    return stripThinking(r.choices[0]?.message?.content ?? '')
  } catch (e) {
    if (isModelMissing(e)) {
      const alt = triedFallback ? null : await pickAvailable(kind, model)
      if (alt) {
        console.warn(`[ai] El modelo "${model}" no esta disponible; se usa "${alt}". Fijalo con AI_MODEL_${kind.toUpperCase()} en .env.local.`)
        resolved[kind] = alt
        return complete(kind, configured, messages, json, true, usage)
      }
      throw new Error(`El modelo "${model}" no esta disponible en tu proveedor y no se encontro otro compatible. Indica uno con AI_MODEL_${kind.toUpperCase()} en .env.local. Detalle: ${(e as Error).message.slice(0, 300)}`)
    }
    // Algunos modelos gratuitos no aceptan response_format: se reintenta sin el.
    if (json && e instanceof Error && /response_format|json/i.test(e.message)) return complete(kind, configured, messages, false, triedFallback, usage)
    if (e instanceof Error && /^(402|429)\b|credits|quota|billing|RESOURCE_EXHAUSTED/i.test(e.message))
      throw new Error(`Tu proveedor de IA ha rechazado la peticion por saldo o cuota agotados. Usa uno gratuito (AI_PROVIDER=groq u ollama en .env.local) o espera a que se renueve la cuota. Detalle: ${e.message.slice(0, 300)}`)
    throw e
  }
}

/**
 * Salida estructurada portable: pide JSON, lo valida con Zod y, si falla,
 * reintenta una vez indicando el error al modelo. Funciona con cualquier
 * proveedor compatible OpenAI (Groq, OpenRouter, Ollama, Gemini...).
 */
export async function generateStructured<T extends z.ZodType>(opts: {
  kind: ModelKind
  model: string
  schema: T
  system: string
  user: OpenAI.Chat.Completions.ChatCompletionUserMessageParam['content']
  usage?: Usage
}): Promise<z.infer<T>> {
  const messages: Msg[] = [
    { role: 'system', content: opts.system },
    { role: 'user', content: opts.user },
  ]
  let lastErr = ''
  for (let attempt = 0; attempt < 2; attempt++) {
    const text = await complete(opts.kind, opts.model, messages, true, false, opts.usage)
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
  return complete('chat', model, [{ role: 'system', content: system }, ...history], false)
}
