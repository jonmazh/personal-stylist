# Mi estilista · Style Profile (fase 1)

Next.js 16 (App Router) + TypeScript + Supabase (Postgres, Auth, Storage, RLS) + IA gratuita configurable (Gemini, Groq, OpenRouter u Ollama local; OpenAI opcional) + Zod.
Verificado: `tsc` y `next build` pasan. **No se ha probado contra un Supabase ni un proveedor de IA real** (no había credenciales): sigue la guía de abajo y revisa los resultados.

## Puesta en marcha

1. **Supabase**: crea un proyecto en https://supabase.com/dashboard.
2. **Esquema**: pega `supabase/migrations/0001_init.sql` en *SQL Editor* y ejecútalo (o `supabase link` + `supabase db push`). Crea tablas, RLS, 4 buckets privados y sus políticas.
3. **Auth**: en *Authentication > Email Templates > Confirm signup* cambia `{{ .ConfirmationURL }}` por
   `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email` y pon tu URL en *Site URL* (en local, `http://localhost:3000`).
4. **Variables**: copia `.env.example` a `.env.local` y rellénalo (URL y publishable key de *Project Settings > API*; clave **gratuita** de IA, ver abajo).
5. `npm install && npm run dev` → http://localhost:3000.

## IA gratuita (sin pagar OpenAI)

La app habla con cualquier servicio **compatible con la API de OpenAI** usando el mismo SDK (`lib/ai/client.ts`). Se elige con `AI_PROVIDER` en `.env.local`:

| `AI_PROVIDER` | Coste | Clave | Chat (por defecto) | Fotos / visión (por defecto) |
|---|---|---|---|---|
| `gemini` *(defecto)* | Gratis (con límites diarios) | `GEMINI_API_KEY` en https://aistudio.google.com/apikey | `gemini-2.5-flash` | `gemini-2.5-flash` |
| `groq` | Gratis (con límites) | `GROQ_API_KEY` en https://console.groq.com/keys | `llama-3.3-70b-versatile` | `meta-llama/llama-4-scout-17b-16e-instruct` |
| `openrouter` | Gratis con modelos `:free` | `OPENROUTER_API_KEY` en https://openrouter.ai/keys | `meta-llama/llama-3.3-70b-instruct:free` | `google/gemma-3-27b-it:free` |
| `ollama` | Gratis, en tu PC | ninguna | `llama3.2` | `llama3.2-vision` |
| `openai` | De pago | `OPENAI_API_KEY` | `gpt-4.1` | `gpt-4.1` |

Los modelos se cambian con `AI_MODEL_CHAT` / `AI_MODEL_VISION`, y `AI_BASE_URL` permite apuntar a otro servidor compatible (LM Studio, Ollama remoto…).

**Opción recomendada (Gemini, 2 minutos):** entra en https://aistudio.google.com/apikey con tu cuenta de Google, pulsa *Create API key* y pon en `.env.local`:
```
AI_PROVIDER=gemini
GEMINI_API_KEY=tu_clave
```

**Opción 100 % local y privada (Ollama):** instala https://ollama.com, ejecuta `ollama pull llama3.2` y `ollama pull llama3.2-vision`, y pon `AI_PROVIDER=ollama`. Las fotos no salen de tu ordenador (necesita ~8 GB de RAM para el modelo de visión).

Cómo funciona: el chat usa Chat Completions; el análisis de fotos descarga las imágenes en el servidor (respetando RLS), las envía como base64, pide JSON y lo valida con el mismo esquema Zod (`lib/ai/structured.ts`), reintentando una vez si el modelo devuelve algo inválido. Las observaciones siguen guardándose como propuesta, nunca como dato confirmado.

> Privacidad: en los planes gratuitos de Gemini y otros servicios, el proveedor puede usar los datos para mejorar sus modelos. Si eso te preocupa con fotos corporales, usa `ollama`.

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
