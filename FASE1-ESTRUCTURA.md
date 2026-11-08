# Mi estilista · Style Profile (fase 1)

Next.js 16 (App Router) + TypeScript + Supabase (Postgres, Auth, Storage, RLS) + IA gratuita configurable (Groq, OpenRouter u Ollama local; Gemini y OpenAI opcionales) + Zod.
Verificado: `tsc` y `next build` pasan. **No se ha probado contra un Supabase ni un proveedor de IA real** (no había credenciales): sigue la guía de abajo y revisa los resultados.

## Puesta en marcha

1. **Supabase**: crea un proyecto en https://supabase.com/dashboard.
2. **Esquema**: pega en *SQL Editor* y ejecuta, por orden, `supabase/migrations/0001_init.sql`, `0002_questionnaire_photos.sql`, `0003_diagnosis_format.sql`, `0004_style_dna_retention.sql`, `0005_style_identity.sql` y `0006_color_temperature.sql` (de la 0002 en adelante se pueden repetir sin riesgo) (o `supabase link` + `supabase db push`). Crea tablas, RLS, 4 buckets privados y sus políticas.
3. **Auth**: en *Authentication > Email Templates > Confirm signup* cambia `{{ .ConfirmationURL }}` por
   `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email` y pon tu URL en *Site URL* (en local, `http://localhost:3000`).
4. **Variables**: copia `.env.example` a `.env.local` y rellénalo (URL y publishable key de *Project Settings > API*; clave **gratuita** de IA, ver abajo).
5. `npm install && npm run dev` → http://localhost:3000.

## IA gratuita (sin pagar OpenAI)

La app habla con cualquier servicio **compatible con la API de OpenAI** usando el mismo SDK (`lib/ai/client.ts`). Se elige con `AI_PROVIDER` en `.env.local`:

| `AI_PROVIDER` | Coste | Clave | Chat (por defecto) | Fotos / visión (por defecto) |
|---|---|---|---|---|
| `gemini` | Prepago en cuentas nuevas desde marzo de 2026 (sin saldo → error 402) | `GEMINI_API_KEY` en https://aistudio.google.com/apikey | `gemini-3.8-flash` | `gemini-3.8-flash` |
| `groq` *(defecto)* | Gratis, sin tarjeta (con límites por minuto y día) | `GROQ_API_KEY` en https://console.groq.com/keys | `openai/gpt-oss-120b` | `qwen/qwen3.8-27b` |
| `openrouter` | Gratis con modelos `:free` | `OPENROUTER_API_KEY` en https://openrouter.ai/keys | `meta-llama/llama-3.3-70b-instruct:free` | `google/gemma-3-27b-it:free` |
| `ollama` | Gratis, en tu PC | ninguna | `llama3.2` | `llama3.2-vision` |
| `openai` | De pago | `OPENAI_API_KEY` | `gpt-4.1` | `gpt-4.1` |

Los modelos se cambian con `AI_MODEL_CHAT` / `AI_MODEL_VISION`. Si el modelo configurado ya no existe (los proveedores gratuitos los retiran a menudo), la app consulta la lista de modelos del proveedor (`/models`), elige uno disponible automáticamente y lo indica en la consola del servidor. Además, y `AI_BASE_URL` permite apuntar a otro servidor compatible (LM Studio, Ollama remoto…).

**Opción recomendada (Groq, 2 minutos, sin tarjeta):** crea una cuenta en https://console.groq.com, genera una clave en https://console.groq.com/keys y pon en `.env.local`:
```
AI_PROVIDER=groq
GROQ_API_KEY=tu_clave
```

**Opción 100 % local y privada (Ollama):** instala https://ollama.com, ejecuta `ollama pull llama3.2` y `ollama pull llama3.2-vision`, y pon `AI_PROVIDER=ollama`. Las fotos no salen de tu ordenador (necesita ~8 GB de RAM para el modelo de visión).

Cómo funciona: el chat usa Chat Completions; el análisis de fotos descarga las imágenes en el servidor (respetando RLS), las envía como base64, pide JSON y lo valida con el mismo esquema Zod (`lib/ai/structured.ts`), reintentando una vez si el modelo devuelve algo inválido. Las observaciones siguen guardándose como propuesta, nunca como dato confirmado.

> Privacidad: en los planes gratuitos de algunos servicios, el proveedor puede usar los datos para mejorar sus modelos. Si eso te preocupa con fotos corporales, usa `ollama`.

## Pruebas

- `npm test` — pruebas unitarias: revisiones entre versiones del Blueprint, contexto del chat, cuestionario (cada pregunta contra el esquema SQL), control de calidad de fotos, motor de diagnóstico y documentos al día.
- `npm run docs` — regenera `docs/CUESTIONARIO.md`, `docs/PROTOCOLO-FOTOGRAFICO.md`, `docs/MOTOR-DIAGNOSTICO.md` y `docs/STYLE-DNA.md` desde el código.
- Recorridos completos en la app (`tests/e2e/blueprint-review.cjs`, `questionnaire-photos.cjs`, `style-dna-retention.cjs` y `temperature.cjs`): expediente, Blueprint v1→v3, cuestionario, fotos con control de calidad, análisis, temperatura cromática con foto de rostro, catálogo de estilos, identidad híbrida, Style DNA, referencias propias, borrado de fotos y chat. Necesitan Docker:
  1. `npx supabase init` en una carpeta aparte, copiar las migraciones de `supabase/migrations/` a su `supabase/migrations/` y `npx supabase start`.
  2. `.env.local` con la URL y la publishable key locales, `AI_PROVIDER=ollama`, `AI_BASE_URL=http://127.0.0.1:4600/v1`, `AI_MODEL_CHAT=mock`.
  3. `node tests/e2e/mock-ai.mjs /tmp/e2e/lastreq.json &`, `npm run build && npm start -- -p 3100 &` y `node tests/e2e/<prueba>.cjs /tmp/e2e`.

## Cómo comprobar la condición 10 («solo accede el usuario autorizado»)

1. Crea dos cuentas (A y B). Con A: guarda medidas y sube una foto.
2. Entra con B: el perfil debe verse vacío.
3. En *SQL Editor* simula a B (sustituye el UUID):
   ```sql
   begin;
   set local role authenticated;
   select set_config('request.jwt.claims', json_build_object('sub','UUID_DE_B','role','authenticated')::text, true);
   select count(*) from public.body_measurements;   -- debe dar 0
   select count(*) from storage.objects where bucket_id = 'profile-private';  -- debe dar 0
   rollback;
   ```
4. Si todo da 0, pon `RLS_VERIFIED=1` en `.env.local`: el panel de estado marcará el punto 10.

## Estructura

- `proxy.ts` + `lib/supabase/*` — sesión por cookies (`@supabase/ssr`), `getClaims()` para verificar identidad.
- `supabase/migrations/0001_init.sql` — tablas, RLS, buckets privados.
- `lib/profile/*` — áreas, carga de datos, estados (pendiente/recopilada/validada) y generador del Style Blueprint.
- `lib/ai/*` — cliente multiproveedor compatible OpenAI (`client.ts`), salida estructurada portable (`structured.ts`), esquema Zod, prompts y contexto del chat.
- `app/(app)/profile` — expediente, fotos privadas, análisis IA, Blueprint versionado, confirmar/corregir.
- `app/api/ai/*` — `analyze-photos` (fotos en base64 + JSON validado con Zod) y `chat` (solo con tus datos).

## Fuera de esta fase

Armario con interfaz (la tabla `garments` ya existe), outfits, compras, chat con historial persistente, referencias visuales de estilo, pgvector, shadcn/ui y React Hook Form.
Consulta `docs/DOCUMENTACION.md` para las decisiones y la documentación recopilada.
