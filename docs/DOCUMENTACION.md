# Documentación recopilada

## 1. Decisiones del proyecto (de tus dos documentos)

| Decisión | Aplicado en esta fase |
|---|---|
| Monolito modular Next.js, sin LangChain ni multiagente | Sí: `app/`, `lib/profile`, `lib/ai`, `lib/supabase` |
| Supabase: Postgres, Auth, Storage privado, RLS | Sí: `supabase/migrations/0001_init.sql` |
| IA con salida estructurada validada con Zod; modelo en variable de entorno | Sí: `lib/ai/schemas.ts`, `.env.example` |
| La IA propone, tú confirmas: observaciones ≠ confirmaciones ≠ recomendaciones ≠ medidas | Sí: tablas `observations`, `area_states`/`assessment_findings.status`, `blueprints`, `body_measurements` |
| Medidas con fecha y origen, sin sobrescribir | Sí: `body_measurements` solo recibe `insert` |
| Cada área: pendiente / recopilada / validada | Sí: `lib/profile/data.ts` + `area_states` |
| Style Blueprint versionado, cada conclusión con origen, confianza y justificación | Sí: `blueprints` + `assessment_findings` |
| 4 buckets privados y URLs firmadas de duración limitada | Sí: `profile-private` (en uso) y los otros tres creados |
| El chat consulta el perfil validado y no se limita a darte la razón | Sí: `lib/ai/context.ts`, `lib/ai/prompts.ts` |
| Tailwind + shadcn/ui, React Hook Form, Gemini, pgvector | Tailwind instalado (estilos propios en CSS); IA gratuita (Groq por defecto, OpenRouter, Ollama; Gemini y OpenAI de pago) vía `lib/ai/client.ts`; el resto, pendiente |

## 2. Documentación oficial consultada y dónde se usa

- **Supabase + Next.js (tutorial)** — https://supabase.com/docs/guides/getting-started/tutorials/with-nextjs
  Clientes `client.ts`/`server.ts`, `proxy.ts` con `updateSession`, login con email y contraseña, ruta `/auth/confirm` con `token_hash`, ruta de cierre de sesión. Usa `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (no la antigua anon key).
- **Quickstart Next.js** — https://supabase.com/docs/guides/getting-started/quickstarts/nextjs
- **Creación de clientes SSR** — https://supabase.com/docs/guides/auth/server-side/creating-a-client
- **`getClaims`** — https://supabase.com/docs/reference/javascript/auth-getclaims
  Se usa para verificar identidad y proteger páginas y datos (`getUser()` en `lib/supabase/server.ts`). `getSession` no se usa para autorizar.
- **API keys** — https://supabase.com/docs/guides/getting-started/api-keys
- **Row Level Security** — https://supabase.com/docs/guides/database/postgres/row-level-security
- **Storage** — https://supabase.com/docs/guides/storage
- **Migraciones locales** — https://supabase.com/docs/guides/local-development/database-migrations
- **Next.js Proxy** (sustituye a `middleware` en Next 16) — https://nextjs.org/docs/app/getting-started/proxy
- **Gemini, compatibilidad con OpenAI** — https://ai.google.dev/gemini-api/docs/openai
- **Groq, compatibilidad con OpenAI** — https://console.groq.com/docs/openai
- **OpenRouter** — https://openrouter.ai/docs
- **Ollama, compatibilidad con OpenAI** — https://ollama.com/blog/openai-compatibility
  Todos aceptan Chat Completions con `image_url` (data URL base64). Se usa el SDK `openai` cambiando `baseURL` (`lib/ai/client.ts`).
- **Supabase AI & Vectors** (pgvector, fases futuras) — https://supabase.com/docs/guides/ai

## 3. Patrones tomados de fuentes no oficiales

- **Storage privado**: bucket privado, política sobre `storage.objects` con `(storage.foldername(name))[1] = auth.uid()::text` y `createSignedUrl(s)` en lugar de `getPublicUrl` (artículos de la comunidad sobre Supabase Storage; coinciden entre sí).
- **Salida estructurada portable**: `response_format: json_object` + validación Zod + un reintento con el error (`lib/ai/structured.ts`). Sustituye a `responses.parse`, que solo existe en OpenAI.
Ambos patrones compilan con las versiones instaladas, pero no se han ejecutado contra los servicios reales.

## 4. Versiones instaladas al montar el proyecto (noviembre de 2026)

next 16.4.5 · react 19.3.1 · @supabase/supabase-js 2.119.0 · @supabase/ssr 0.12.7 · openai 7.53.0 · zod 4.6.7 · typescript 5.9.x · tailwindcss 4.3.5
(`package-lock.json` las fija.)

## 5. Límites conocidos

- Sin credenciales no se ha probado el flujo real: migración, login, subida de fotos, análisis y chat.
- El historial del chat vive en el navegador; solo se guarda en `ai_runs` que hubo una consulta y si usó datos validados.
- Los datos del prototipo web anterior (en `localStorage`) no se migran.
- Las fotos se envían al proveedor de IA configurado al analizar (salvo con Ollama, que es local); en los planes gratuitos el proveedor puede usar los datos para entrenar.
