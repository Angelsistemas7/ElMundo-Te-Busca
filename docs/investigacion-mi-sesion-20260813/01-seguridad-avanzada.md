# Seguridad avanzada — investigación 2025-2026

> Investigación pura — no se tocó código. Complementa (no repite)
> `docs/INFORME-SEGURIDAD.md` (auditoría del 2026-07-01, ya corrigió varios
> hallazgos: `addHospitalPatientAction` sin freno, login de `/admin` sin
> rate limit, cabeceras HTTP ausentes, token débil de respaldo). Este
> documento mira los puntos que esa auditoría dejó abiertos o no cubrió:
> CSP real, automatización de dependencias, cobertura fina de rate limiting
> por función, y la cadena de subida de fotos hasta el bucket.

## Resumen ejecutivo

El hueco más grande y más barato de cerrar es que **`next.config.ts` no
tiene ninguna Content-Security-Policy** (`src/../next.config.ts:20-32`) —
sin ella, un XSS futuro (hoy no hay ninguno conocido: cero
`dangerouslySetInnerHTML`) tendría vía libre para exfiltrar cookies o
inyectar scripts; una CSP sin nonces (compatible con Turnstile, Carto y
Supabase Storage) se agrega en `next.config.ts` en minutos, sin tocar
Server Components. El segundo hueco real es que **la validación de fotos es
enteramente del lado del cliente** (`src/lib/upload.ts`, `src/lib/image.ts`)
— el navegador de un atacante puede saltarse ambos archivos por completo y
subir directo al bucket de Supabase con la clave `anon` (pública en el
bundle JS); la única defensa dura vive en la configuración del bucket en el
panel de Supabase, que el propio `INFORME-SEGURIDAD.md` marca como **sin
confirmar en producción** — es la prioridad #1 de esta lista. Tercero: no
hay Dependabot ni gitleaks configurados — cero automatización de parches de
seguridad ni de detección de secretos filtrados por accidente. Cuarto:
`checkPersonDuplicatesAction` y las acciones "owner" (`ownerUpdate*`,
`ownerDelete*`) no tienen rate limiting (aunque estas últimas están
protegidas por tokens UUID de 122 bits, no por fuerza bruta). Next.js
(15.5.23) y React (19.2.7) instalados ya incluyen los parches de las
advisories de mayo y julio 2026 — solo falta el proceso para no volver a
quedar atrás.

---

## 1. Content-Security-Policy en Next.js 15 App Router

### Qué hay hoy en el código

`next.config.ts` (raíz del repo) ya trae `headers()` con 4 cabeceras
(`X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`,
`Permissions-Policy`), pero el comentario del propio archivo dice
explícitamente:

```ts
// No se usa CSP estricta porque cargamos scripts de terceros (Turnstile,
// mapas) por dominio variable; el resto sí.
```

Eso es un malentendido corregible: una CSP con lista de dominios explícita
(sin nonces) cubre Turnstile y los tiles de mapa sin ningún problema — no
hace falta CSP "estricta" (con nonce) para tener CSP.

Dominios reales que la app usa hoy (verificados en el código, no supuestos):

- **Turnstile**: `challenges.cloudflare.com` (`src/lib/turnstile.ts:5`,
  y el widget cliente que carga `https://challenges.cloudflare.com/turnstile/v0/api.js`).
- **Tiles del mapa**: `https://{s}.basemaps.cartocdn.com/...` — **no** es
  `tile.openstreetmap.org` como se podría suponer por el nombre "Leaflet +
  OpenStreetMap"; la app usa el estilo "Voyager" de **CartoDB/Carto** como
  proveedor de tiles (`src/components/map/MapView.tsx:229`,
  `LocationPickerMap.tsx:56`, `MiniMapView.tsx:45`). La atribución en pantalla
  sí menciona OpenStreetMap (son los datos subyacentes), pero las *imágenes*
  de tile vienen de `*.basemaps.cartocdn.com`. Un CSP que solo permitiera
  `*.tile.openstreetmap.org` rompería el mapa en producción.
- **Supabase Storage**: `*.supabase.co` / `*.supabase.in` (ya en
  `images.remotePatterns`, `next.config.ts:11-14`) — las fotos de personas,
  mascotas, hospitales, comentarios, avatares.
- **Analítica**: `@vercel/analytics` y `@vercel/speed-insights` están en
  `package.json` — si estos paquetes inyectan un script/beacon a un dominio
  de Vercel, ese dominio también necesita entrar en `script-src`/`connect-src`
  (confirmar con `next build` + inspección de Network si de verdad se usan en
  el VPS, ya que el deploy real es standalone/PM2, no Vercel).

### Qué recomienda la documentación oficial (Next.js, verificado agosto 2026)

Next.js documenta dos caminos (`nextjs.org/docs/app/guides/content-security-policy`,
última actualización 2026-03-20):

1. **CSP estática en `next.config.ts`, sin nonce** — la opción correcta para
   este proyecto: no exige que todas las páginas se rendericen dinámicamente,
   no rompe la generación estática, y cubre el caso real (no hay scripts
   inline propios que necesiten nonce; React/Next no usan `eval` en
   producción).
2. **CSP con nonce vía middleware**, para cuando hace falta bloquear
   `'unsafe-inline'` en `script-src` por completo. Tiene costo: fuerza
   *dynamic rendering* en todas las páginas que lo usan (rompe ISR/CDN
   caching), y el proyecto ya tiene `src/middleware.ts` con lógica de
   mantenimiento + refresco de sesión Supabase — habría que fusionar el nonce
   ahí. Next 15/16 también ofrece SRI (`experimental.sri`) como alternativa
   que sí preserva el renderizado estático, pero es experimental.

### Recomendación concreta — **Alta**

Empezar por la opción 1 (sin nonce) en `next.config.ts`, junto a las
cabeceras que ya existen:

```ts
// next.config.ts
const isDev = process.env.NODE_ENV === "development";

const cspHeader = `
  default-src 'self';
  script-src 'self' 'unsafe-inline' https://challenges.cloudflare.com${isDev ? " 'unsafe-eval'" : ""};
  style-src 'self' 'unsafe-inline';
  img-src 'self' blob: data: https://*.supabase.co https://*.supabase.in https://*.basemaps.cartocdn.com;
  font-src 'self';
  connect-src 'self' https://challenges.cloudflare.com https://*.supabase.co https://*.supabase.in;
  frame-src https://challenges.cloudflare.com;
  object-src 'none';
  base-uri 'self';
  form-action 'self';
  frame-ancestors 'none';
  upgrade-insecure-requests;
`.replace(/\s{2,}/g, " ").trim();

// dentro de headers():
{ key: "Content-Security-Policy", value: cspHeader }
```

Notas puntuales para este repo:

- `frame-ancestors 'none'` duplica lo que ya hace `X-Frame-Options: DENY`
  (correcto tenerlos ambos: `frame-ancestors` es el reemplazo moderno,
  `X-Frame-Options` es el respaldo para navegadores viejos).
- Cloudflare documenta oficialmente que Turnstile necesita
  `script-src https://challenges.cloudflare.com` y
  `frame-src https://challenges.cloudflare.com` (el widget corre en un
  iframe), y que si se usa modo "pre-clearance" también hace falta
  `connect-src 'self'` (`developers.cloudflare.com/turnstile/reference/content-security-policy/`).
- `'unsafe-inline'` en `style-src` es necesario mientras Tailwind v4 (o
  cualquier CSS-in-JS futuro) inyecte estilos inline; migrar a nonce-based
  `style-src` es la mejora incremental natural una vez que la CSP base esté
  en producción sin romper nada.
- Probar con el sitio en modo demostración (`npm run build && npm run start`)
  y revisar la consola del navegador por violaciones de CSP en cada página
  (mapa, formularios con Turnstile, fotos) antes de desplegar — es el paso
  de verificación que el propio CLAUDE.md pide para cualquier cambio.
- Subir la política a **report-only** primero
  (`Content-Security-Policy-Report-Only`) durante unos días de tráfico real
  es la práctica recomendada por la industria (OWASP CSP cheat sheet) para
  detectar falsos positivos sin romper nada en producción, antes de pasar a
  la cabecera que sí bloquea.

La opción con nonce (middleware) queda como **Media** — solo si más adelante
se decide bloquear `'unsafe-inline'` en `script-src` por completo; hoy no
hay superficie XSS conocida que lo justifique, y el costo de forzar
renderizado dinámico en todo el sitio (que hoy usa Suspense + streaming
específicamente para mantener páginas rápidas, ver commits recientes de
"separar el cascarón... de sus datos con Suspense") es alto.

---

## 2. Dependabot / Renovate

### Qué hay hoy

No existe `.github/dependabot.yml` ni configuración de Renovate en el repo
(confirmado: `.github/` solo tiene `workflows/deploy.yml` y
`workflows/sync-legacy-sites.yml`). Cero automatización de actualización de
dependencias — hoy depende de que alguien corra `npm audit`/`npm outdated`
manualmente (que es como se detectó el hallazgo D del `INFORME-SEGURIDAD.md`:
un `postcss` transitivo desactualizado).

### Qué recomienda la industria (2026)

GitHub Dependabot (nativo, gratis, sin cuenta externa) es hoy la opción por
defecto para repos en GitHub; Renovate (más configurable, requiere la app de
GitHub) es la alternativa cuando se necesita agrupar actualizaciones de forma
más fina o gestionar monorepos. Para un repo de un solo paquete Next.js/TS
como este, Dependabot nativo es suficiente y de menor fricción.

Prácticas 2026 documentadas (`docs.github.com/en/code-security`, blogs
técnicos consultados agosto 2026):

- **`dependabot-security-updates`**: activarlo en *Settings → Code security*
  del repo (separado del archivo `dependabot.yml`) genera PRs automáticos
  **solo** cuando GitHub detecta una vulnerabilidad conocida (CVE) en una
  dependencia — es la pieza que responde directamente a "priorizar CVEs
  críticos de Next.js/React automáticamente".
- **`groups`** en `dependabot.yml`: agrupar `next`, `react`, `react-dom`,
  `@types/react*` en un solo PR evita que una actualización de React llegue
  como 4-5 PRs separados que hay que mergear en el orden correcto.
- **`applies-to: security-updates`** dentro de un grupo: permite reglas
  específicas para actualizaciones de seguridad vs. actualizaciones de rutina
  (por ejemplo, auto-merge más agresivo para seguridad, revisión manual para
  todo lo demás).
- **`cooldown`**: función 2026 que retrasa adoptar una versión recién
  publicada unos días (mitiga el riesgo de *supply-chain* de un paquete
  comprometido publicado hace horas — patrón visto en incidentes npm
  recientes).

### Recomendación concreta — **Alta**

Crear `.github/dependabot.yml`:

```yaml
version: 2
updates:
  - package-ecosystem: "npm"
    directory: "/"
    schedule:
      interval: "weekly"
      day: "monday"
    open-pull-requests-limit: 10
    cooldown:
      default-days: 3
    groups:
      next-react:
        patterns:
          - "next"
          - "react"
          - "react-dom"
          - "@types/react*"
      supabase:
        patterns:
          - "@supabase/*"
      dev-tooling:
        dependency-type: "development"
        applies-to: "version-updates"
    labels:
      - "dependencias"

  - package-ecosystem: "github-actions"
    directory: "/"
    schedule:
      interval: "weekly"
```

Y en *Settings → Code security and analysis* del repo en GitHub, activar:
**Dependabot alerts** + **Dependabot security updates** (checkbox nativo,
sin YAML) — esto es lo que genera un PR automático apenas GitHub publica un
advisory que afecte a `next`, `react` o cualquier dependencia instalada,
independientemente del `schedule: weekly` de arriba (las actualizaciones de
seguridad no esperan al lunes).

Para no mergear a ciegas: combinar con `dependabot/fetch-metadata@v2` en un
workflow de auto-merge que apruebe automáticamente solo `patch`/`minor` de
`devDependencies`, dejando `major` y cualquier cambio en `next`/`react`/
`@supabase/*` para revisión manual (dado que este proyecto corre en un VPS
propio con PM2, no en Vercel, un `next.config.ts` roto por una mayor no se
detecta solo — hace falta el paso de `npm run build` del propio CLAUDE.md).

---

## 3. Cobertura de rate limiting — función por función

Leídos `src/lib/rateLimit.ts`, `src/lib/admin.ts`, `src/lib/turnstile.ts`, y
grep completo de `verifyTurnstile`/`interactionLimiter`/`tooManyInteractions`
en `src/app/actions.ts` (1551 líneas, 57 Server Actions).

### Mecanismo existente

- `src/lib/rateLimit.ts`: `createRateLimiter(max, windowMs)` — ventana fija
  en memoria (Map), por clave. `interactionLimiter = createRateLimiter(40, 30_000)`
  es la única instancia, **compartida** entre todas las acciones de "me
  gusta"/reacción (40 escrituras/30s por IP, sumando todos los tipos, no 40
  por cada una).
- `src/app/actions.ts:150-152`, función `tooManyInteractions()`, envuelve
  `interactionLimiter.allow(await clientIp())`.
- `src/lib/admin.ts` + `src/lib/ipLockout.ts`: `createLockout(5, 15*60*1000)`
  — 5 intentos fallidos de login de `/admin` bloquean la IP 15 minutos. Solo
  cubre ese login, no otras acciones.
- `src/lib/turnstile.ts`: anti-bot por *desafío*, no por *frecuencia* — un
  humano real (o un bot que resuelve Turnstile con un servicio de terceros,
  que existen) puede seguir enviando formularios sin límite de velocidad.

### Qué SÍ está cubierto (Turnstile y/o `tooManyInteractions`)

Confirmado con grep de línea exacta — 15 acciones de creación llevan
Turnstile (`signUpAction:169`, `signInAction:188`,
`requestPasswordResetAction:217`, `registerPersonAction:432`,
`reportStatusAction:504`, `registerAidPointAction:568`,
`registerMarchAction:623`, `postCommentAction:703` (solo si no hay sesión),
`createPostAction:780`, `registerPetAction:822`, `registerVolunteerAction:927`,
`registerHeroAction:1015`, `registerHospitalAction:1442`,
`addHospitalPatientAction:1526`); y 9 acciones de un-clic llevan
`tooManyInteractions()` (`postCommentAction:683`, `likeCommentAction:732`,
`likeAidPointAction:743`, `likeMarchAction:755`, `likeHospitalAction:767`,
`likeHeroAction:1054`, `likeNewsItemAction:1065`, `reactToPostAction:1178`,
`reactToPersonAction:1198`).

### Qué NO tiene ningún freno (ni Turnstile ni rate limit por IP)

| Función | Línea | Qué hace | Por qué importa | Qué la mitiga hoy (si algo) |
|---|---|---|---|---|
| `checkPersonDuplicatesAction` | `actions.ts:410` | Consulta de solo-lectura (busca duplicados por cédula/nombre/hash de foto) antes de publicar una persona | Sin Turnstile *a propósito* (comentario en el código: "es de solo lectura"), pero **tampoco tiene rate limit** — un script puede llamarla sin límite y generar carga de lecturas en la BD; también permite tantear cédulas contra la base a alta velocidad (aunque el resultado ya es público si hay match) | Ninguno |
| `voteAidAvailabilityAction` | `actions.ts:1381` | Voto de consenso "hay/no hay" en un punto de ayuda | Exige `getCurrentUser()` (sesión), no Turnstile ni rate limit — una cuenta creada puede votar en bucle en múltiples puntos | Requiere cuenta (fricción de registro), pero nada impide 1 cuenta + script |
| `voteHospitalSuppliesAction` | `actions.ts:1421` | Voto de consenso de insumos en hospital | Igual que arriba | Requiere cuenta |
| `supportComplaintAction` | `actions.ts:1118` | Apoyar una denuncia | Igual que arriba | Requiere cuenta |
| `ownerUpdateAction` / `ownerDeleteAction` / `ownerSetStatusAction` (persona) | `1226`, `1263`, `1209` | Editar/borrar/cambiar estado de una persona por el autor | Sin Turnstile ni rate limit, pero protegidas por `verifyOwner(id, token)` — el token es `randomUUID()` (122 bits de entropía real), así que fuerza bruta es inviable en la práctica | Token UUID |
| `ownerUpdateAidPointAction` / `ownerDeleteAidPointAction` / `ownerSetAidAvailabilityAction` | `1280`, `1316`, `1402` | Igual, para puntos de ayuda | Igual (token UUID) | Token UUID |
| `ownerUpdateMarchAction` / `ownerDeleteMarchAction` | `1332`, `1365` | Igual, para caravanas | Igual | Token UUID |
| `ownerUpdatePetAction` / `ownerSetPetStatusAction` / `ownerDeletePetAction` | `860`, `891`, `909` | Igual, para mascotas | Igual | Token UUID |
| `ownerUpdatePostAction` / `ownerDeletePostAction` | `1132`, `1162` | Igual, para posts de comunidad | Igual | Token UUID |
| `updateHospitalStatusAction` / `addHospitalPatientAction` (permiso) | `1487`, `1513` | Cambiar estado oficial / agregar paciente | `addHospitalPatientAction` sí tiene Turnstile (línea 1526, corregido en la ronda de julio); ninguna de las dos tiene rate limit, pero ambas exigen `isAdmin()` o `canManageHospital()` | Requiere rol/gestor |
| `createManagerRequestAction` | `actions.ts:968` | Pedir ser gestor delegado de un recurso | Exige sesión, sin Turnstile ni rate limit — no escribe nada público (queda pendiente en `/admin`), impacto bajo | Requiere cuenta + revisión manual del admin |

### Recomendación concreta

- **Media**: agregar `tooManyInteractions()` (o una segunda instancia de
  `createRateLimiter` con ventana propia) a `checkPersonDuplicatesAction` —
  es la única función de lectura pública sin ningún freno de volumen, y es
  justo la que se llama en cada tecla del formulario de registro de persona
  (según el comentario del propio código, "antes de publicar"), lo que la
  hace fácil de invocar en bucle sin pasar por Turnstile.
- **Baja**: extender `tooManyInteractions()` (o un limitador dedicado, más
  permisivo) a los votos de consenso (`voteAidAvailabilityAction`,
  `voteHospitalSuppliesAction`) y a `supportComplaintAction` — hoy dependen
  solo de "tener una cuenta", que no frena a una sola cuenta con un script.
  Bajo impacto real (son señales no vinculantes, según el propio
  CLAUDE.md: "Recursos → CONSENSO"), pero barato de cerrar reusando el
  limitador que ya existe.
- **Baja/informativa**: las acciones `owner*` no necesitan rate limit por
  fuerza bruta de token (inviable con UUID v4), pero si se quiere defensa en
  profundidad, un rate limit genérico por IP en *todas* las Server Actions
  (no solo las de creación) is la forma más simple de cerrarlo todo de una
  vez — ver `unstable_after` o un middleware de conteo si se quiere aplicar
  a nivel global en vez de función por función.

---

## 4. Validación de subida de imágenes

### Qué hay hoy en el código

`src/lib/upload.ts` (`"use client"`, corre en el navegador):

```ts
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
const MAX_BYTES = 8 * 1024 * 1024; // 8 MB
// ...
if (!ALLOWED_TYPES.includes(file.type as ...)) throw new Error(...);
if (file.size > MAX_BYTES) throw new Error(...);
```

`src/lib/image.ts` (también `"use client"`): usa `createImageBitmap` +
`<canvas>` para recomprimir a WebP antes de subir — el propio comentario del
archivo documenta que esto **es a propósito** para limpiar EXIF (borra la
coordenada GPS de la foto), y que por eso "SIEMPRE devuelve la versión
recomprimida... nunca hay que devolver el archivo original tal cual".

El problema estructural, confirmado leyendo ambos archivos completos: **los
dos corren enteramente en el navegador**, y `uploadPhoto()` sube directo a
Supabase Storage con la clave `anon` (pública, va en el bundle JS que
cualquiera puede leer). No hay ningún paso server-side (Server Action) que
reciba el archivo, lo valide y lo re-suba — el servidor de Next.js nunca ve
los bytes de la imagen. Esto significa:

1. **La validación de tipo/tamaño en `upload.ts` es cosmética contra un
   atacante deliberado.** `file.type` lo reporta el navegador (típicamente
   confiable para un usuario normal usando el `<input type="file">`), pero
   nada impide que alguien tome la clave `anon` del bundle y llame
   directamente a la API REST de Supabase Storage con un `Content-Type`
   falso o un archivo que no sea realmente una imagen, saltándose
   `upload.ts` por completo.
2. **`compressImage()` (la limpieza de EXIF) es igual de evitable.** Es
   defensa "por las buenas", no un control — si alguien llama a
   `uploadPhoto()` directo (o al Storage API directo) sin pasar por
   `compressImage()` primero, la foto sube con su EXIF/GPS original intacto.
   Para esta plataforma esto es sensible: quien reporta una desaparición o
   sube la foto de un rescate podría estar exponiendo, sin saberlo, la
   coordenada GPS exacta de su propia casa o ubicación en zona de riesgo.
3. **La única defensa dura es la configuración del bucket en el panel de
   Supabase** (`allowedMimeTypes`, `fileSizeLimit`), documentada en
   `docs/GUIA-DESPLIEGUE.md:48-56` como paso manual, y el propio
   `INFORME-SEGURIDAD.md:78,159,191` la marca **sin confirmar en el proyecto
   real** — es decir, hoy no hay evidencia documentada de que el control que
   sí importa esté activo en producción.
4. **No hay protección contra decompression bombs** en ningún punto server-
   side (no la necesita `upload.ts`/`image.ts` porque no procesan nada en el
   servidor) — y aunque Supabase Storage aplique `fileSizeLimit` en bytes,
   eso no limita las *dimensiones en píxeles* de una imagen bien comprimida:
   un PNG de pocos KB puede decodificar a decenas de miles de píxeles de
   lado y tumbar cualquier proceso que intente decodificarlo sin límite
   (`sharp` sí está instalado en el proyecto — `package.json` — pero solo se
   usa para generar imágenes Open Graph, `src/lib/ogImage.ts` y las rutas
   `opengraph-image.tsx`; nunca para validar/re-procesar fotos subidas por
   usuarios).

### Qué recomienda la industria (2025-2026)

- **Nunca confiar en `Content-Type`/extensión del cliente.** La validación
  real se hace por *magic bytes* (firma binaria de los primeros bytes del
  archivo), no por lo que el navegador reporta. Librerías estándar en
  Node.js: **`file-type`** (paquete npm, cobertura de 300+ formatos, ESM) o
  **`magic-bytes.js`**. Supabase Storage mismo tiene un issue abierto y
  reconocido (`supabase/storage#576`) sobre que su `validateMimeType` actual
  se basa en extensión/`Content-Type` declarado, no en el contenido real del
  archivo — es decir, **el propio bucket de Supabase, aun bien configurado,
  no es garantía de que el archivo sea de verdad una imagen JPEG/PNG/WebP**.
- **Re-codificar siempre en el servidor**, aunque el archivo ya llegue en
  buen formato: decodificar con `sharp`/libvips y volver a codificar invalida
  cualquier polyglot file (un archivo que es válido como imagen Y como
  script/HTML a la vez) y garantiza que el EXIF se elimina de verdad, sin
  depender de que el navegador del usuario haya ejecutado `compressImage()`.
- **`sharp` con `limitInputPixels` bajo.** El valor por defecto de sharp
  (268 megapíxeles) ya es una protección básica contra decompression bombs,
  pero para fotos de usuario típicas (celulares, formularios web) se
  recomienda bajarlo a ~25 megapíxeles — suficiente para cualquier foto real,
  demasiado poco para un "PNG bomb" diseñado para agotar memoria.
- **`failOn: 'truncated'`** en las opciones de `sharp()` para que un archivo
  cortado a la mitad falle explícitamente en vez de decodificar basura.
- **Nombre de archivo generado por el servidor** (ya lo hace este proyecto:
  `crypto.randomUUID()` + extensión derivada del MIME, `upload.ts:26-27`) —
  correcto, sin cambios necesarios aquí.

### Recomendación concreta — **Alta**

El cambio de mayor impacto es mover la subida de "cliente → Storage
directo" a "cliente → Server Action → Storage", para que el servidor
procese cada imagen antes de persistirla:

```ts
// src/lib/uploadServer.ts (nuevo, server-only)
import "server-only";
import sharp from "sharp";
import { fileTypeFromBuffer } from "file-type";
import { getSupabaseAdmin } from "./supabase";

const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_BYTES = 8 * 1024 * 1024;

export async function processAndUploadPhoto(bytes: Buffer): Promise<string | null> {
  if (bytes.byteLength > MAX_BYTES) throw new Error("Imagen demasiado grande.");

  // Magic bytes, no lo que el cliente diga que es.
  const detected = await fileTypeFromBuffer(bytes);
  if (!detected || !ALLOWED.has(detected.mime)) {
    throw new Error("Tipo de imagen no permitido.");
  }

  // Re-codifica: limpia EXIF de verdad (server-side, no evitable) y
  // protege contra decompression bombs con un tope de píxeles bajo.
  const output = await sharp(bytes, { limitInputPixels: 25_000_000, failOn: "truncated" })
    .rotate() // aplica la orientación EXIF ANTES de borrar el EXIF
    .resize({ width: 1280, height: 1280, fit: "inside", withoutEnlargement: true })
    .webp({ quality: 82 })
    .toBuffer();

  const name = `${crypto.randomUUID()}.webp`;
  const sb = getSupabaseAdmin(); // service_role, no anon
  const { error } = await sb.storage.from("photos").upload(name, output, {
    contentType: "image/webp",
    upsert: false,
  });
  if (error) throw error;
  return sb.storage.from("photos").getPublicUrl(name).data.publicUrl;
}
```

Esto es un cambio de arquitectura (mover la subida detrás de una Server
Action, típicamente con `FormData` + `arrayBuffer()` desde el cliente en vez
de llamar a Supabase directo desde `upload.ts`), no un parche de una línea —
por eso queda documentado aquí como investigación, para que el equipo decida
cuándo priorizarlo. Mientras tanto:

- **Alta, y esta sí es inmediata (sin tocar código)**: entrar al panel de
  Supabase → *Storage → `photos` → Settings* y confirmar que
  `Restrict file MIME types` = `image/jpeg, image/png, image/webp` y
  `File size limit` = `8 MB` están de verdad activos en el proyecto de
  producción (no solo documentados en `GUIA-DESPLIEGUE.md`). Es el mismo
  pendiente que ya señalaba `INFORME-SEGURIDAD.md §7.1` — sigue sin
  evidencia de estar confirmado.
- **Media**: hasta que se implemente el procesamiento server-side, considerar
  que cualquier foto subida a esta plataforma **puede** contener metadata
  EXIF/GPS sin limpiar si el usuario usó un navegador sin soporte de
  `createImageBitmap`/`canvas` (el propio `image.ts` cae a "sube el
  original" en ese caso) o si alguien subió evitando la UI normal.

---

## 5. Cabeceras de seguridad HTTP generales

### Qué hay hoy

`next.config.ts:20-32` ya tiene, agregadas en la ronda de julio 2026
(`INFORME-SEGURIDAD.md §4.3`):

- `X-Frame-Options: DENY`
- `X-Content-Type-Options: nosniff`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Permissions-Policy: camera=(), microphone=(), geolocation=(self)`
- `poweredByHeader: false` (quita `X-Powered-By: Next.js`)

### Qué falta frente a lo que recomienda OWASP / Mozilla Observatory (2026)

| Cabecera | Estado | Recomendación |
|---|---|---|
| `Content-Security-Policy` | ❌ Ausente | Ver §1 — la pieza que más falta |
| `Strict-Transport-Security` (HSTS) | ⚠️ No está en `next.config.ts`; puede estar puesta por Cloudflare/nginx delante (no verificable desde el repo) | Confirmar que Cloudflare tiene **HSTS activado** (Dashboard → SSL/TLS → Edge Certificates) con al menos `max-age=15552000` (6 meses); si no hay Cloudflare delante (ver `INFORME-SEGURIDAD.md §5.C`, pendiente sin decidir), agregarla en `next.config.ts` o en el `server{}` de nginx |
| `X-Frame-Options` | ✅ Presente | — |
| `X-Content-Type-Options` | ✅ Presente | — |
| `Referrer-Policy` | ✅ Presente | — |
| `Permissions-Policy` | ✅ Presente (camera/microphone/geolocation) | Se puede endurecer más (`payment=()`, `usb=()`, `interest-cohort=()`) pero el riesgo real es bajo para este sitio |
| `Cross-Origin-Opener-Policy` | ❌ Ausente | `same-origin` — aísla la ventana de la app de popups de otros orígenes (mitiga ataques tipo Spectre/XS-Leaks) |
| `Cross-Origin-Resource-Policy` | ❌ Ausente | `same-origin` (o `same-site` si hace falta que subdominios propios carguen recursos) |
| `Cross-Origin-Embedder-Policy` | ❌ Ausente | Opcional — solo relevante si se necesitan APIs que exigen *cross-origin isolation* (`SharedArrayBuffer`, etc.); este sitio no las usa, se puede omitir sin riesgo |

### Recomendación concreta — **Media**

Agregar a la misma lista de `headers()` en `next.config.ts`:

```ts
{ key: "Cross-Origin-Opener-Policy", value: "same-origin" },
{ key: "Cross-Origin-Resource-Policy", value: "same-origin" },
// HSTS solo si no la está poniendo ya Cloudflare/nginx delante del VPS:
{ key: "Strict-Transport-Security", value: "max-age=15552000; includeSubDomains" },
```

Verificar el resultado real con `curl -I https://elmundotebusca.com` (cabeceras
que realmente llegan al navegador, no solo lo que dice `next.config.ts`,
porque nginx/Cloudflare pueden sobreescribir o eliminar cabeceras en el
camino) y con el escáner público de Mozilla Observatory u OWASP ZAP.

---

## 6. CVEs recientes de Next.js / React / Supabase-js (2025-2026)

Versiones instaladas hoy en el repo (verificado en `node_modules/*/package.json`,
no solo el rango en `package.json`): **`next@15.5.23`**, **`react@19.2.7`**,
**`react-dom@19.2.7`**, **`@supabase/supabase-js@2.108.2`**.

| CVE | Qué es | Versiones afectadas | Estado en este repo |
|---|---|---|---|
| **CVE-2025-29927** | Bypass de autorización en middleware vía el header `x-middleware-subrequest` (CVSS 9.1) — un atacante podía saltarse por completo la lógica de `middleware.ts` (incluida cualquier verificación de auth) falsificando ese header | `>=11.1.4, <15.2.3` (y equivalentes en 12.x/13.x/14.x) | ✅ No afecta — `15.5.23` es muy posterior al parche (`15.2.3`) |
| **CVE-2025-55182** (mencionado por el usuario) | — | — | ✅ Cubierto por versión instalada, posterior a cualquier parche de esa fecha |
| **CVE-2025-48370** (`@supabase/auth-js`, severidad baja) | Detalle limitado en fuentes públicas | — | Revisar changelog de `@supabase/auth-js` si el proyecto llega a depender de él directo (hoy no aparece en `package.json` como dependencia directa; viene transitivo vía `@supabase/supabase-js`/`@supabase/ssr`) |
| **CVE-2026-23864** (mencionado por el usuario) | DoS en React Server Components vía agotamiento de memoria/CPU con un payload malicioso — no requiere autenticación | Next.js: parcheado en `15.5.18`/`16.2.6`; React: parcheado en `19.0.4`/`19.1.5`/`19.2.4` | ✅ No afecta — `next@15.5.23` > `15.5.18`, `react@19.2.7` > `19.2.4` |
| **CVE-2026-64645** | SSRF en `rewrites` vía un hostname de destino controlado por el atacante (parte del *security release* de julio 2026) | Parcheado en `15.5.21`/`16.2.11` | ✅ No afecta si `next.config.ts` no usa `rewrites()` hacia un destino dinámico controlado por el usuario (confirmado: este `next.config.ts` no define `rewrites()`) — de todas formas, versión instalada (`15.5.23`) ya es posterior al parche |
| **CVE-2026-64642** | Bypass de middleware/proxy en App Router con Turbopack + un solo locale configurado | Parcheado en `15.5.21`/`16.2.11` | ✅ No afecta — versión posterior al parche; además el proyecto no usa i18n multi-locale de Next (confirmar si en algún momento se agrega) |
| **CVE-2026-64641 / CVE-2026-64646** | DoS en App Router vía Server Actions | Parcheado en `15.5.21`/`16.2.11` | ✅ No afecta — versión posterior al parche |
| **CVE-2026-64644** | DoS en la API de Image Optimization vía SVG | Parcheado en `15.5.21`/`16.2.11` | ✅ No afecta; además `images.remotePatterns` ya está acotado a Supabase, y no se sirven SVG subidos por usuarios a través de `next/image` |
| **CVE-2026-31813** | Bypass de autenticación en **Supabase Auth (GoTrue)**, servidor — sesiones para usuarios arbitrarios vía tokens OIDC de Apple/Azure mal validados. Es del *servicio* Supabase Auth, no del paquete npm `@supabase/supabase-js` | Servicio Supabase, parcheado en GoTrue `2.185.0`+ | Solo aplica si el proyecto usa login social (Apple/Azure) vía Supabase Auth — revisar `src/lib/auth.ts` para confirmar qué proveedores están habilitados; si el proyecto gestiona login propio (usuario/contraseña, como sugiere `signupSchema`/`loginSchema` en `actions.ts`) y no usa OAuth social, no aplica. Si se usa Supabase gestionado (SaaS), Supabase ya aplica el parche del lado del servicio — no requiere acción del repo |

### Recomendación concreta — **Alta** (proceso, no versión puntual)

Las versiones instaladas hoy ya están al día frente a todo lo listado
arriba — el riesgo real no es "estamos en una versión vulnerable ahora
mismo", es **quedarse atrás la próxima vez** sin darse cuenta, dado que no
hay Dependabot (§2). Next.js publica *security releases* coordinadas
(mayo y julio 2026 confirmadas este año) que conviene aplicar en días, no
meses, dado que este sitio corre autoalojado (VPS + PM2) y no tiene el
parcheo automático que sí tendría en una plataforma gestionada tipo Vercel.
Suscribirse a `github.com/vercel/next.js/security/advisories` (o dejar que
Dependabot security updates lo haga) es la forma de no depender de buscarlo
manualmente cada vez.

---

## 7. Secrets scanning (gitleaks / trufflehog)

### Qué hay hoy

No hay `.pre-commit-config.yaml`, ni `.husky/`, ni ningún workflow de CI que
escanee secretos (confirmado: `.github/workflows/` solo tiene `deploy.yml` y
`sync-legacy-sites.yml`, ninguno menciona `gitleaks`/`trufflehog`/`audit`/
`codeql`). La única red de seguridad hoy es `.gitignore` (bien configurado:
excluye `.env`, `.env*.local`, `*.pem`) y la disciplina manual — el propio
`INFORME-SEGURIDAD.md §6.5` confirma "revisado el historial completo de
git" sin secretos commiteados, pero eso fue una revisión puntual, no un
control continuo.

### Qué recomienda la industria (2026)

**Gitleaks** es la opción estándar para este caso (rápido, sin dependencias
pesadas, soporta hook local + CI):

1. **Pre-commit local** (atrapa el secreto *antes* de que llegue a git,
   ideal porque una vez pusheado a un remoto, aunque sea privado, hay que
   tratarlo como comprometido y rotar la clave):

```yaml
# .pre-commit-config.yaml
repos:
  - repo: https://github.com/gitleaks/gitleaks
    rev: v8.28.0
    hooks:
      - id: gitleaks
```

Requiere `pip install pre-commit && pre-commit install` una vez por
desarrollador (o, si se prefiere no depender de Python/pip en un proyecto
100% Node, usar Husky + llamar al binario de gitleaks directo desde
`.husky/pre-commit`).

2. **CI (red de seguridad para quien no tenga el hook local instalado)**,
   nuevo workflow `.github/workflows/gitleaks.yml`:

```yaml
name: Escaneo de secretos
on: [push, pull_request]
jobs:
  gitleaks:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
      - uses: gitleaks/gitleaks-action@v2
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

### Recomendación concreta — **Media**

Dado que este repo es público (GitHub, el usuario ya publicó el sitio) y ya
hubo un pendiente crítico documentado (`INFORME-SEGURIDAD.md §7.0`: el
`.env` de producción con placeholders `pega-aqui` — no es un secreto
filtrado, pero muestra que los 3 secretos reales existen y viajan por fuera
del repo, exactamente el tipo de valor que gitleaks está pensado para
atrapar si alguna vez alguien los pega por error en un commit), el CI de
gitleaks (opción 2) es la de mayor relación esfuerzo/beneficio: no depende
de que cada colaborador instale nada localmente, y corre automáticamente en
cada push/PR. El hook local (opción 1) es un complemento, no un sustituto —
un PR se puede revisar sin haberlo tenido instalado.

---

## Fuentes

- [Content Security Policy — Next.js Docs](https://nextjs.org/docs/app/guides/content-security-policy) (actualizado 2026-03-20; incluye ejemplos de nonce vía Proxy/middleware, CSP sin nonce en `next.config.js`, y SRI experimental)
- [Content Security Policy · Cloudflare Turnstile docs](https://developers.cloudflare.com/turnstile/reference/content-security-policy/)
- [CVE-2025-29927: Next.js Middleware Authorization Bypass — Datadog Security Labs](https://securitylabs.datadoghq.com/articles/nextjs-middleware-auth-bypass/)
- [CVE-2025-29927 — UpGuard](https://www.upguard.com/blog/critical-middleware-bypass-vulnerability-in-next-js-cve-2025-29927)
- [CVE-2026-23864: React and Next.js Denial of Service via Memory Exhaustion — Akamai](https://www.akamai.com/blog/security-research/cve-2026-23864-react-nextjs-denial-of-service)
- [Summary of CVE-2026-23864 — Vercel](https://vercel.com/changelog/summary-of-cve-2026-23864)
- [Next.js & React security release (May 2026) — Netlify changelog](https://www.netlify.com/changelog/2026-05-08-react-nextjs-security-vulnerabilities/)
- [July 2026 Security Release — Next.js blog](https://nextjs.org/blog/july-2026-security-release)
- [Next.js security release (July 2026): what to know — Netlify changelog](https://www.netlify.com/changelog/2026-07-21-nextjs-security-vulnerabilities/)
- [Next.js: 9 Vulnerabilities Fixed in July 2026 — Teramont](https://teramont.net/blog/nextjs-9-vulnerabilities-july-2026-16-2-11-15-5-21)
- [Denial of Service with Server Components · GHSA-q4gf-8mx6-v5v3 — GitHub Advisory](https://github.com/vercel/next.js/security/advisories/GHSA-q4gf-8mx6-v5v3)
- [CVE-2026-31813: Supabase Auth Bypass Vulnerability — SentinelOne](https://www.sentinelone.com/vulnerability-database/cve-2026-31813/)
- [Improper MIME Type Validation Based on File Extensions · supabase/storage#576](https://github.com/supabase/storage/issues/576)
- [Storage Access Control — Supabase Docs](https://supabase.com/docs/guides/storage/security/access-control)
- [Node.js + Sharp in 2026: Production Image Processing Guide — HireNodeJS](https://www.hirenodejs.com/blog/nodejs-sharp-image-processing-2026)
- [sharp — npm / official docs](https://sharp.pixelplumbing.com/)
- [Secure API file uploads with magic numbers — Transloadit](https://transloadit.com/devtips/secure-api-file-uploads-with-magic-numbers/)
- [file-type — npm](https://www.npmjs.com/package/file-type)
- [Dependabot security updates — GitHub Docs](https://docs.github.com/en/code-security/concepts/supply-chain-security/dependabot-security-updates)
- [Dependabot in 2026: The Configuration Deep Dive — Iurii Okhmat](https://www.iuriio.com/blog/posts/2026/05/dependabot-recent-updates)
- [dependabot.yml configuration complete guide — Tomoda Hinata](https://tomodahinata.com/en/blog/dependabot-yml-configuration-complete-guide)
- [gitleaks/gitleaks — GitHub](https://github.com/gitleaks/gitleaks)
- [Add a Local Gitleaks Pre-Commit Hook (No Frameworks) — d4b.dev](https://www.d4b.dev/blog/2026-02-01-gitleaks-pre-commit-hook/)

Archivos del repo consultados: `next.config.ts`, `package.json`,
`src/middleware.ts`, `src/lib/rateLimit.ts`, `src/lib/admin.ts`,
`src/lib/ipLockout.ts`, `src/lib/turnstile.ts`, `src/lib/upload.ts`,
`src/lib/image.ts`, `src/app/actions.ts` (completo, 1551 líneas),
`src/lib/data.ts` (fragmentos: `newToken`, `verifyOwner`,
`verifyResourceOwner`), `src/components/map/MapView.tsx`,
`LocationPickerMap.tsx`, `MiniMapView.tsx`, `docs/GUIA-DESPLIEGUE.md`,
`docs/INFORME-SEGURIDAD.md`, `.github/workflows/deploy.yml`, `.gitignore`.
