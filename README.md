# Mi estilista · Style Profile (fase 1)

Next.js 16 (App Router) + TypeScript + Supabase (Postgres, Auth, Storage, RLS) + OpenAI (Responses API) + Zod.
Verificado: `tsc` y `next build` pasan. **No se ha probado contra un Supabase ni un OpenAI reales** (no había credenciales): sigue la guía de abajo y revisa los resultados.

## Puesta en marcha

1. **Supabase**: crea un proyecto en https://supabase.com/dashboard.
2. **Esquema**: pega `supabase/migrations/0001_init.sql` en *SQL Editor* y ejecútalo (o `supabase link` + `supabase db push`). Crea tablas, RLS, 4 buckets privados y sus políticas.
3. **Auth**: en *Authentication > Email Templates > Confirm signup* cambia `{{ .ConfirmationURL }}` por
   `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email` y pon tu URL en *Site URL* (en local, `http://localhost:3000`).
4. **Variables**: copia `.env.example` a `.env.local` y rellénalo (URL y publishable key de *Project Settings > API*; clave de OpenAI).
5. `npm install && npm run dev` → http://localhost:3000.

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
- `lib/ai/*` — cliente OpenAI (modelos por variable de entorno), esquema Zod de salida, prompts y contexto del chat.
- `app/(app)/profile` — expediente, fotos privadas, análisis IA, Blueprint versionado, confirmar/corregir.
- `app/api/ai/*` — `analyze-photos` (URLs firmadas de 2 min + Structured Outputs) y `chat` (solo con tus datos).

## Fuera de esta fase

Armario con interfaz (la tabla `garments` ya existe), outfits, compras, chat con historial persistente, referencias visuales de estilo, pgvector, shadcn/ui y React Hook Form.
Consulta `docs/DOCUMENTACION.md` para las decisiones y la documentación recopilada.
