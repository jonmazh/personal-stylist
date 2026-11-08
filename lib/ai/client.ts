import OpenAI from 'openai'

/**
 * Proveedor de IA configurable. Todos estos servicios exponen una API compatible con
 * OpenAI (Chat Completions), asi que se usa el mismo SDK cambiando baseURL y modelo.
 *
 *  - gemini     → Google AI Studio. Clave GRATIS, con vision. (por defecto)
 *  - groq       → Groq Cloud. Clave GRATIS, muy rapido, con vision (Llama 4).
 *  - openrouter → OpenRouter. Modelos ":free" sin coste.
 *  - ollama     → Modelos locales en tu ordenador. Gratis, sin clave y sin enviar datos fuera.
 *  - openai     → OpenAI de pago (opcional, por si algun dia lo quieres usar).
 *
 * Todo se configura con variables de entorno (ver .env.example); no hay que tocar codigo.
 */
export type ProviderId = 'gemini' | 'groq' | 'openrouter' | 'ollama' | 'openai'

type Preset = { baseURL?: string; keyEnv?: string; chat: string; vision: string; label: string }

const PRESETS: Record<ProviderId, Preset> = {
  gemini: {
    label: 'Google Gemini (gratis)',
    baseURL: 'https://generativelanguage.googleapis.com/v1beta/openai/',
    keyEnv: 'GEMINI_API_KEY',
    chat: 'gemini-2.5-flash',
    vision: 'gemini-2.5-flash',
  },
  groq: {
    label: 'Groq (gratis)',
    baseURL: 'https://api.groq.com/openai/v1',
    keyEnv: 'GROQ_API_KEY',
    chat: 'llama-3.3-70b-versatile',
    vision: 'meta-llama/llama-4-scout-17b-16e-instruct',
  },
  openrouter: {
    label: 'OpenRouter (modelos :free)',
    baseURL: 'https://openrouter.ai/api/v1',
    keyEnv: 'OPENROUTER_API_KEY',
    chat: 'meta-llama/llama-3.3-70b-instruct:free',
    vision: 'google/gemma-3-27b-it:free',
  },
  ollama: {
    label: 'Ollama (local, gratis)',
    baseURL: 'http://localhost:11434/v1',
    chat: 'llama3.2',
    vision: 'llama3.2-vision',
  },
  openai: {
    label: 'OpenAI (de pago)',
    keyEnv: 'OPENAI_API_KEY',
    chat: 'gpt-4.1',
    vision: 'gpt-4.1',
  },
}

export function providerId(): ProviderId {
  const p = (process.env.AI_PROVIDER ?? 'gemini').toLowerCase() as ProviderId
  return p in PRESETS ? p : 'gemini'
}

const preset = () => PRESETS[providerId()]

export const PROVIDER_LABEL = () => preset().label
export const MODEL_CHAT = () => process.env.AI_MODEL_CHAT || preset().chat
export const MODEL_VISION = () => process.env.AI_MODEL_VISION || preset().vision

/** Devuelve un mensaje si falta configuracion; null si todo esta listo. */
export function configError(): string | null {
  const p = preset()
  if (p.keyEnv && !process.env.AI_API_KEY && !process.env[p.keyEnv])
    return `Falta la clave de ${p.label}: define ${p.keyEnv} en .env.local (ver README).`
  return null
}

let _client: OpenAI | null = null
let _for: ProviderId | null = null

/** Cliente unico (compatible OpenAI) para el proveedor elegido. Solo se usa en servidor. */
export function ai(): OpenAI {
  const id = providerId()
  if (_client && _for === id) return _client
  const p = PRESETS[id]
  _client = new OpenAI({
    baseURL: process.env.AI_BASE_URL || p.baseURL,
    // Ollama no necesita clave, pero el SDK exige una cadena no vacia.
    apiKey: process.env.AI_API_KEY || (p.keyEnv ? process.env[p.keyEnv] : undefined) || 'ollama',
    maxRetries: 2,
    timeout: 120_000,
  })
  _for = id
  return _client
}
