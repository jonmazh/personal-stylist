import OpenAI from 'openai'

// La clave solo existe en el servidor. Los modelos son configuracion, no codigo.
let _client: OpenAI | null = null
export const openai = () => (_client ??= new OpenAI({ apiKey: process.env.OPENAI_API_KEY }))
export const MODEL_VISION = () => process.env.OPENAI_MODEL_VISION ?? 'gpt-4.1'
export const MODEL_CHAT = () => process.env.OPENAI_MODEL_CHAT ?? 'gpt-4.1'
