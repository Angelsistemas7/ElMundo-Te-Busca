# Venezuela te busca — guía para Claude

Plataforma ciudadana sin fines de lucro para **localizar personas desaparecidas**
y **coordinar ayuda** tras el terremoto de Venezuela 2026 (doble sismo M7,2/M7,5,
epicentro ~28 km al SE de Yumare; zona más afectada: La Guaira). El usuario la va
a **publicar**. Prioridad: salvar vidas, bien hecho.

> **Empieza leyendo** este archivo y luego [`docs/ESTADO-DEL-PROYECTO.md`](docs/ESTADO-DEL-PROYECTO.md)
> (qué está hecho y qué falta). El idioma del producto y de la comunicación con el
> usuario es **español**.

## Stack
- **Next.js 15** (App Router, React 19, Server Components + Server Actions), TypeScript.
- **Tailwind CSS v4** (config en `src/app/globals.css` con `@theme`; color de marca `brand-*`).
- **Supabase** (Postgres + Storage + RLS) para producción. Esquema en `supabase/schema.sql`.
- **Cloudflare Turnstile** anti-bot. **Leaflet/react-leaflet** para el mapa. **zod** validación.
- Iconos: `lucide-react`.

## Cómo correr
```bash
npm install
npm run dev          # http://localhost:3000  (modo demostración, datos en memoria)
npm run build        # SIEMPRE compilar tras cambios; es la verificación principal
npm run typecheck
npm test             # pruebas unitarias de src/lib (Vitest, sin red ni base de datos)
npm run test:coverage
```
Al añadir lógica en `src/lib`, añade sus pruebas en `test/` (ver
`docs/investigacion/COBERTURA-PRUEBAS.md`: arnés, qué está cubierto y qué no).
Sin `.env.local`, la app corre en **modo demostración** con datos de ejemplo
(`src/lib/seed.ts`) en memoria. Con Supabase configurado (`.env.example`), usa la
base real. Despliegue paso a paso: `docs/GUIA-DESPLIEGUE.md`. Costos: `docs/COSTOS-Y-DESPLIEGUE.md`.

## Arquitectura (lo importante)
```
src/
  app/
    page.tsx                 # "Se busca": personas CON info (excludeUnidentified) — busco dónde están
    sin-identificar/         # "¿La reconoces?": personas SIN identificar (alguien las vio; foto/rasgos)
    comunidad/               # Feed (posts): necesito/ofrezco/rescate/medico/caravana/...
    ayuda/ , ayuda/[id]/     # Puntos de ayuda (varios recursos) + ficha
    caravanas/ , caravanas/[id]/   # Caravanas benéficas + ficha (WhatsApp)
    hospitales/ , hospitales/[id]/ # Hospitales: capacidad, insumos, pacientes
    mapa/                    # Mapa Leaflet: zonas, ayuda, hospitales, rescates, epicentro
    persona/[id]/            # Ficha de persona  + /gestion (autor con token)
    admin/                   # Panel de moderación (ADMIN_TOKEN)
    actions.ts               # TODAS las Server Actions (validan + Turnstile + escriben)
  components/                # UI (cards, modales, votos, foro, mapa/*)
  lib/
    types.ts                 # Modelo de dominio (fuente de verdad)
    validation.ts            # Esquemas zod (cliente + servidor)
    data.ts                  # CAPA DE DATOS: Supabase O memoria. La UI NUNCA toca la BD directo
    supabase.ts , admin.ts , turnstile.ts , geo.ts , image.ts , upload.ts , seed.ts , utils.ts
supabase/schema.sql          # Esquema Postgres (índices + RLS). Mantener sincronizado con types.ts
scripts/import-data.mjs      # Importador de exports AUTORIZADOS (JSON/CSV)
```

### Patrón clave: capa de datos doble (`src/lib/data.ts`)
Cada función hace `getSupabase()`; si es `null` (sin credenciales) usa el almacén
en memoria `mem` (copias mutables del seed); si no, consulta Supabase. **Toda**
lectura/escritura pasa por aquí — la UI no habla con Supabase directamente.
Mapeadores `rowToX(row)` convierten fila snake_case → tipo camelCase del dominio.

### Patrón clave: dos modelos de control
- **Personas → AUTORIDAD.** El estado oficial (localizado / "Confirmado sin vida")
  lo cambia solo el **autor** (enlace privado `/persona/[id]/gestion?token=…`,
  token en tabla `person_owners` sin lectura pública) o un **moderador** (`/admin`).
  Cualquier otro solo deja un *reporte* visible al instante como "sin verificar".
- **Recursos (puntos de ayuda, hospitales) → CONSENSO.** La comunidad vota:
  puntos "✅ Sí hay / ❌ Se acabó" (cambia `available` solo); hospitales
  "¿Tiene insumos? Sí/No" (insignia de consenso). Votos/likes deduplicados por
  dispositivo con `localStorage`.
- **Autor de recursos (puntos de ayuda, caravanas y posts de comunidad) → enlace de
  gestión.** Además del consenso, quien publicó puede **editar/eliminar** su recurso
  con un enlace privado (`/ayuda/[id]/gestion`, `/caravanas/[id]/gestion`,
  `/comunidad/[id]/gestion`). El token vive en la tabla genérica
  `resource_owners(entity_type, entity_id, token)` con `entity_type ∈ {aid_point,
  march, post}` (sin lectura pública); se verifica con `verifyResourceOwner(...)`.
  Personas usan su propia `person_owners`. NO toca votos/reacciones (eso es consenso).

### Patrón clave: dos intenciones al publicar una persona
Al publicar (`RegisterPersonButton`) el primer paso es **"¿Qué quieres hacer?"**:
- 🔍 **Busco a una persona** (`isUnidentified=false`) → tengo sus datos, no sé dónde
  está; el **nombre es obligatorio**. Aparece en "Se busca" (`/`).
- 📍 **Vi / encontré a una persona** (`isUnidentified=true`) → sé dónde está pero no
  sé bien quién es; el **nombre es opcional** (puede ser solo foto). Aparece en
  "¿La reconoces?" (`/sin-identificar`). Debe traer al menos foto, descripción o lugar.
La validación de `personSchema` exige nombre solo si `!isUnidentified` (superRefine);
`createPerson`/`updatePersonFields` ponen "Sin identificar" si el nombre va vacío
(la BD exige `first_name` no nulo). Al editar por el autor se reenvía `isUnidentified`.

### Convenciones al añadir una función
1. Añade el tipo en `types.ts`; el esquema zod en `validation.ts`.
2. Añade la(s) función(es) en `data.ts` con **ambas** ramas (memoria + Supabase) y su mapeador.
3. Crea la Server Action en `app/actions.ts` (valida con zod, verifica Turnstile en formularios públicos, `revalidatePath`).
4. Añade columnas a `supabase/schema.sql` (+ RLS: lectura pública, inserción pública; updates sensibles via service role) y datos a `seed.ts`.
5. UI: reutiliza `Modal`, `FormControls` (`Field/Input/Select/Textarea`), `CommentSection`, `LikeButton`, `Turnstile`. Sube fotos con `compressImage` → `uploadPhoto`.
6. **Compila** (`npm run build`) y haz prueba de humo con `npm run start` + `curl`.

### Notas
- Modales: el cuerpo scrollable necesita `min-h-0` (ya está en `Modal.tsx`) para no cortar el encabezado.
- Mapa: Leaflet se carga client-only vía `next/dynamic({ ssr:false })` (`components/map/CrisisMap.tsx`).
- Comentarios soportan foto (`comments.photo_url`), **respuestas en hilo de un nivel**
  (`comments.parent_id` → raíz; responder a una respuesta cuelga de la misma raíz),
  **"me gusta"** por comentario (`comments.likes`, dedup por dispositivo) y aplican a
  entidades: person, post, aid_point, march, hospital.
- No commitear (.env). El usuario decide cuándo desplegar.
