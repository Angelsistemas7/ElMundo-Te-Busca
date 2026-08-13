# Seguridad avanzada — hallazgos y recomendaciones

Investigación de código (Grep/Read sobre el repo real) + investigación externa (CVEs,
buenas prácticas) hecha el 2026-08-12. Todo lo marcado "no se puede confirmar desde
el código" depende de configuración en el dashboard de Supabase o de GitHub, que este
análisis no tiene forma de leer.

Prioridades: **Alta** (explotable hoy o control central ausente) · **Media** (defensa
en profundidad razonable, no urgente) · **Baja** (mejora menor / higiene).

---

## 1. [Alta] Sin Content-Security-Policy real

`next.config.ts:21-33` manda `X-Frame-Options`, `X-Content-Type-Options`,
`Referrer-Policy` y `Permissions-Policy`, pero **ninguna cabecera `Content-Security-
Policy`**. El comentario en el propio archivo (línea 18-20) lo reconoce: "No se usa
CSP estricta porque cargamos scripts de terceros... por dominio variable". Sin CSP,
un XSS (por ejemplo vía `dangerouslySetInnerHTML`, o contenido de terceros mal
saneado en comentarios/posts) puede ejecutar cualquier script y exfiltrar a cualquier
dominio.

Dominios externos reales confirmados en el código:

| Uso | Dominio | Archivo:línea |
|---|---|---|
| Widget + script Turnstile | `challenges.cloudflare.com` | `src/components/Turnstile.tsx:19` |
| Verificación servidor Turnstile | `challenges.cloudflare.com` | `src/lib/turnstile.ts:5` |
| Tiles del mapa (Leaflet) | `*.basemaps.cartocdn.com` | `src/components/map/MapView.tsx:229`, `MiniMapView.tsx:45`, `LocationPickerMap.tsx:56` |
| Fotos subidas (Storage) | `*.supabase.co` / `*.supabase.in` | `next.config.ts:14-15`, `src/lib/validation.ts:39` |
| API REST/Auth Supabase | host exacto de `NEXT_PUBLIC_SUPABASE_URL` (`*.supabase.co`) | `src/lib/supabase.ts`, `src/middleware.ts:68` |
| `@vercel/analytics` / `@vercel/speed-insights` | mismo origen por defecto (`/_vercel/insights/...`) — ver hallazgo 8 | `src/app/layout.tsx:3-4,87-88` |

No se usa Realtime de Supabase desde el navegador (no hay `.channel(` en `src/`), así
que no hace falta `wss://` en `connect-src`.

**CSP propuesta** (para pegar en `next.config.ts`, cabecera adicional en la misma
lista de `headers()`):

```
Content-Security-Policy:
  default-src 'self';
  script-src 'self' 'unsafe-inline' https://challenges.cloudflare.com;
  style-src 'self' 'unsafe-inline';
  img-src 'self' data: blob: https://*.supabase.co https://*.supabase.in https://*.basemaps.cartocdn.com;
  font-src 'self' data:;
  connect-src 'self' https://*.supabase.co https://*.supabase.in https://challenges.cloudflare.com;
  frame-src https://challenges.cloudflare.com;
  object-src 'none';
  base-uri 'self';
  form-action 'self';
  frame-ancestors 'none';
```

Notas sobre esta propuesta:
- `script-src` necesita `'unsafe-inline'` porque Next.js App Router inyecta datos de
  hidratación en `<script>` inline sin nonce salvo que se adopte CSP estricta con
  nonce (requiere generar un nonce por request en `middleware.ts` y pasarlo a
  `next/script`/`<Script nonce=...>` — más trabajo, pero es lo recomendado por Next
  para eliminar XSS por inyección de script; se puede hacer en una segunda vuelta).
- `style-src 'unsafe-inline'` hace falta porque Leaflet fija posición de marcadores
  con `style` inline (patrón estándar de la librería, no hay forma limpia de evitarlo
  sin parchear Leaflet).
- `frame-ancestors 'none'` sustituye/refuerza `X-Frame-Options: DENY` (ya presente).
- Si se elimina `@vercel/analytics`/`@vercel/speed-insights` (ver hallazgo 8), no
  hace falta añadir ningún dominio de Vercel a la CSP.
- Recomiendo desplegar primero en modo `Content-Security-Policy-Report-Only` una
  semana para detectar falsos positivos (por ejemplo si el modal de imagen usa
  `data:` URLs en algún sitio no listado) antes de aplicarla en modo bloqueante.

---

## 2. [Alta] Subida de fotos directa a Supabase Storage con clave anónima (no se puede confirmar el control duro)

Confirmado en código: `src/lib/upload.ts` es `"use client"` (línea 1) y llama
`sb.storage.from("photos").upload(...)` (línea 30) directo desde el navegador con
`NEXT_PUBLIC_SUPABASE_ANON_KEY`, que está en el bundle JS público. La validación de
tipo (`ALLOWED_TYPES`, línea 12) y tamaño (`MAX_BYTES`, línea 13) es **solo del
cliente**: el propio comentario del archivo (líneas 8-11) ya lo advierte. Cualquiera
puede llamar la API de Storage de Supabase directamente con la clave anon extraída
del bundle, sin pasar por `uploadPhoto()`, y subir un archivo de cualquier tipo o
tamaño al bucket `photos`.

La defensa real tiene que estar en la configuración del bucket en el dashboard de
Supabase (`allowedMimeTypes`, `fileSizeLimit`) — **esto no se puede confirmar desde
el código del repo**, no hay ningún archivo de infraestructura-como-código para
Storage. Hay que verificarlo a mano en Supabase → Storage → bucket `photos` →
"Edit bucket": confirmar que `allowedMimeTypes` está restringido a
`image/jpeg,image/png,image/webp` y `fileSizeLimit` a un valor razonable (p. ej. 8 MB,
igual que `MAX_BYTES`).

Defensa en profundidad ya presente y buena: `isSafePhotoUrl()` en
`src/lib/validation.ts:51-64` exige que cualquier `photoUrl` que llegue a una Server
Action venga de `/storage/v1/object/public/photos/` en el host exacto del propio
proyecto Supabase (`ownSupabaseHost()`, líneas 41-49) — esto cierra el SSRF de "pego
la URL de un bucket ajeno", pero **no** impide subir un archivo malicioso al propio
bucket en primer lugar.

Recomendación adicional (más allá de la config del bucket, que ya se avisó en
`docs/GUIA-DESPLIEGUE.md` según el comentario del código): considerar mover la subida
a una Server Action que reciba el archivo, valide tipo real (magic bytes, no solo
`file.type` del cliente) con `sharp` (ya es dependencia, `package.json:26`) y suba con
la service role. Es más trabajo y más tráfico por el propio servidor, así que es un
cambio de arquitectura, no un parche rápido — dejarlo como mejora futura si la config
del bucket ya está bien cerrada.

---

## 3. [Media] No hay Dependabot ni Renovate configurado

`Glob(".github/**")` solo encuentra `.github/workflows/deploy.yml` y
`.github/workflows/sync-legacy-sites.yml` — no existe `.github/dependabot.yml` ni
configuración de Renovate en ningún lado del repo. Sin esto, actualizaciones de
seguridad en dependencias (incluido `next`, `react`, `@supabase/supabase-js`) no se
detectan ni proponen solas.

YAML listo para pegar en `.github/dependabot.yml`:

```yaml
version: 2
updates:
  - package-ecosystem: "npm"
    directory: "/"
    schedule:
      interval: "weekly"
    open-pull-requests-limit: 10
    groups:
      # Agrupa actualizaciones menores/parche para no saturar de PRs;
      # las mayores (next, react) llegan sueltas para revisar con más cuidado.
      minor-and-patch:
        update-types: ["minor", "patch"]
    labels:
      - "dependencies"

  - package-ecosystem: "github-actions"
    directory: "/"
    schedule:
      interval: "weekly"
```

Nota: como el `build-deploy` en `deploy.yml` corre `npm ci` (línea 29) y luego
`npm run build` directo, un Dependabot PR de `next`/`react` se probará solo cuando
haya un check de CI que corra `npm run build`/`npm run typecheck` sobre pull
requests — hoy `deploy.yml` solo dispara con `push` a `main` y
`workflow_dispatch` (`deploy.yml:4-7`), no con `pull_request`. Sin un workflow de
CI en PRs, los PRs de Dependabot no tendrán ninguna verificación automática antes
de mergear (fuera del alcance de "seguridad avanzada" estricta, pero relacionado:
vale la pena un `ci.yml` mínimo con `npm run build` + `npm run typecheck` en
`pull_request`).

---

## 4. [Informativo, ya mitigado] Versiones de Next.js / React frente a CVEs 2026

`package.json` declara `"next": "^15.1.3"` y `"react"/"react-dom": "^19.0.0"`
(`package.json:22-24`), pero la versión **resuelta e instalada realmente**
(`package-lock.json`) es:

- `next@15.5.23`
- `react@19.2.7`

2026 tuvo varias rondas de advisories coordinadas para Next.js y React Server
Components:

- **CVE-2026-44574 / CVE-2026-44575 / CVE-2026-64642** — bypass de autorización de
  middleware en App Router (vía `.rsc`, segment-prefetch y parámetros de ruta
  dinámica). Parchados en Next.js **15.5.21** / 16.2.11.
  ([Security Boulevard](https://securityboulevard.com/2026/05/cve-2026-44575-middleware-authorization-bypass-in-next-js-app-router/),
  [ZeroPath](https://zeropath.com/blog/cve-2026-44574-nextjs-middleware-authorization-bypass))
- **CVE-2026-44578** — SSRF no autenticado vía upgrade de WebSocket, afecta despliegues
  self-hosted (como este, en VPS con PM2 — relevante porque NO es Vercel).
  Corregido en la ronda de mayo 2026 (Next.js 15.5.16+).
  ([Hadrian](https://hadrian.io/blog/next-js-websocket-ssrf-unauthenticated-access-to-internal-resources-cve-2026-44578-2),
  [GitHub Advisory GHSA-c4j6-fc7j-m34r](https://github.com/vercel/next.js/security/advisories/GHSA-c4j6-fc7j-m34r))
- Ronda de julio 2026 (Next.js 15.5.21 / 16.2.11): SSRF en `rewrites`
  (GHSA-p9j2-gv94-2wf4), fuga de endpoints de Server Functions
  (GHSA-955p-x3mx-jcvp), entre otras.
- **CVE-2026-23870 / CVE-2026-23864** — denegación de servicio en React Server
  Components (`react-server-dom-webpack`/`turbopack`/`parcel`) vía peticiones HTTP
  manipuladas a endpoints de Server Functions. Afecta 19.0.0–19.0.5, 19.1.0–19.1.6,
  19.2.0–19.2.5. Corregido en **19.0.6 / 19.1.7 / 19.2.6**.
  ([react.dev](https://react.dev/blog/2025/12/11/denial-of-service-and-source-code-exposure-in-react-server-components),
  [GitLab Advisories DB](https://advisories.gitlab.com/npm/react-server-dom-parcel/CVE-2026-23870/))

**Conclusión: las versiones actualmente instaladas (`next@15.5.23`,
`react@19.2.7`) ya son posteriores a todos los parches anteriores** (15.5.21 y
19.2.6 respectivamente), así que hoy no hay una vulnerabilidad conocida sin
parchar en estas dos librerías, según lo que arrojó la búsqueda al momento de este
informe. Ojo con dos matices:
1. No pude confirmar contra el listado completo y actualizado de
   `github.com/vercel/next.js/security/advisories` más allá de los títulos (el fetch
   no expuso versiones parchadas por advisory individual) — vale la pena revisar esa
   página a mano una vez.
2. El riesgo real es que esto se desactualice: sin Dependabot (hallazgo 3), la
   próxima ronda de CVEs de Next.js/React no se detecta sola. Esta es la razón
   concreta, no solo higiene, para priorizar el hallazgo 3.
3. El bypass de middleware (CVE-2026-4457x) es menos crítico en este proyecto
   porque `src/middleware.ts` **no hace control de acceso** — solo refresca la
   sesión de Supabase (líneas 62-89) y redirige a mantenimiento (líneas 11-58); no
   protege ninguna ruta administrativa (`/admin` usa su propio `ADMIN_TOKEN` +
   verificación en el server, ver `src/lib/admin.ts`). Un bypass del matcher no
   destaparía una ruta que de otro modo estuviera bloqueada.

---

## 5. [Baja] Cobertura de Turnstile / rate limit en Server Actions — auditoría completa

Revisé las 60 funciones exportadas de `src/app/actions.ts`. Todas las que escriben
datos públicamente tienen freno de algún tipo:

- **Formularios de publicación anónimos** (registrar persona, punto de ayuda,
  caravana, post, mascota, voluntario, hospital, héroe, cuentas) → `verifyTurnstile`
  (14 llamadas confirmadas, p. ej. `actions.ts:169,432,504,568,623,703,780,822,927,1015,1442`).
- **Reacciones/"me gusta" de un clic** (comentario, punto de ayuda, caravana,
  hospital, héroe, noticia, post, persona) → `tooManyInteractions()` →
  `interactionLimiter` (40 llamadas / 30s por IP, `src/lib/rateLimit.ts:41`),
  confirmado en `actions.ts:732,743,755,767,1054,1065,1178,1198` y en
  `postCommentAction` (`actions.ts:683`, cubre también usuarios con sesión).
- **Acciones que exigen sesión en vez de Turnstile** (denuncias, apoyo a denuncias,
  voto de disponibilidad de ayuda, voto de insumos de hospital, solicitud de gestor)
  → `getCurrentUser()` obligatorio, sin rate limit adicional
  (`actions.ts:1083-1086,1119-1121,1387-1390,1425-1428,969-972`). No es un hueco de
  seguridad grave (exigir cuenta ya filtra bots anónimos y da trazabilidad), pero una
  cuenta ya autenticada podría, en teoría, votar/apoyar en bucle sin freno de tasa —
  vale la pena, si se ve abuso real, añadir `tooManyInteractions()` también aquí
  (es barato: ya está importado en el archivo).
- **Gestión por token de enlace privado** (`ownerUpdate*`, `ownerDelete*`,
  `ownerSet*`) → verificación de `verifyResourceOwner`/`person_owners`, no necesita
  Turnstile (ya requiere conocer un token secreto).

No encontré ninguna acción de escritura pública sin ningún freno.

---

## 6. [Media] Sin escaneo de secretos automatizado (gitleaks/trufflehog/secret scanning)

`Glob(".github/workflows/**")` solo tiene `deploy.yml` y `sync-legacy-sites.yml`
(ver hallazgo 3) — ninguno corre gitleaks, trufflehog, ni ningún paso de escaneo de
secretos. No hay `.gitleaks.toml` en el repo tampoco.

GitHub **Secret Scanning** (el nativo de GitHub, gratis en repos públicos, de pago en
privados sin GitHub Advanced Security) es una opción del repositorio en
Settings → Code security, **no algo que se pueda confirmar leyendo el código del
repo** — no pude verificar si está activado. Si el repo es público, recomiendo
confirmarlo a mano y activarlo si no lo está (es gratis).

Como capa adicional independiente de esa opción del repo, un job de gitleaks en CI
es barato de añadir:

```yaml
# .github/workflows/gitleaks.yml
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

---

## 7. [Baja / positivo] RLS de `supabase/schema.sql` en tablas sensibles — bien cerradas

Revisé las políticas de Row Level Security de las tablas que pedía el encargo:

- **`person_owners`** (`schema.sql:141-147`) y **`resource_owners`**
  (`schema.sql:153-...`): `enable row level security` (líneas 578-579) **sin ninguna
  política de INSERT/SELECT/UPDATE para `anon`** — el comentario del propio esquema
  lo confirma (línea 584-585: "SIN lectura pública... y SIN inserción pública. Se
  escriben con service role al publicar"). Con RLS habilitado y cero políticas, por
  defecto Postgres deniega todo a roles no-superusuario — correcto: los tokens de
  gestión son secretos y solo el servidor (service role, que bypassea RLS) puede
  leerlos/escribirlos.
- **`app_roles`** (`schema.sql:206-224`): mismo patrón, RLS activado, **sin
  políticas** (línea 222-224: "quién tiene qué rol no es público, y asignarlo
  requiere ya ser admin"). Correcto.
- **`manager_requests`** (`schema.sql:185-199`): mismo patrón (línea 197-199:
  "solo el servidor... la lee/escribe; quién pidió qué permiso no es público").
  Correcto.
- Confirmado también en general (líneas 615-638): se eliminaron las políticas
  `public_insert_*` que existían antes (comentario línea 616-618: "permitía
  saltarse Turnstile... e incluso falsear `user_id`"); hoy **no hay ninguna política
  de INSERT/UPDATE/DELETE para `anon`** en ninguna tabla del esquema — toda escritura
  pasa por `SUPABASE_SERVICE_ROLE_KEY` desde las Server Actions.

No encontré ninguna política de escritura abierta a `anon`/`public` en las tablas
revisadas. Esto es justo el patrón correcto (RLS cerrado + service role solo en el
servidor) y vale la pena no tocarlo sin necesidad.

Nota aparte, no es un hallazgo de RLS pero sí relacionado: `public_read_complaints`
(`schema.sql:594,607`) hace las denuncias legibles por cualquiera — es una decisión
de producto (el feed de denuncias es público), no un error, pero como
`createComplaintAction` exige sesión (`actions.ts:1083-1086`) y el nombre del
denunciante queda expuesto (`user.username`, línea 1105), confirma que "denuncias no
anónimas" es literal también de cara al público, no solo "ante el sistema" como dice
el comentario en `actions.ts:1079-1081` — vale la pena que el aviso legal en la UI
dor dej claro que el nombre de usuario también es visible públicamente en la
publicación, no solo conocido por el sistema.

---

## 8. [Baja] `@vercel/analytics` / `@vercel/speed-insights` en un despliegue que no es Vercel

`src/app/layout.tsx:3-4,87-88` importa y renderiza `<Analytics />` y
`<SpeedInsights />` de paquetes de Vercel. Por defecto estos apuntan a rutas
relativas de mismo origen (`/_vercel/insights/script.js`, `/_vercel/insights/event`,
etc.) que solo existen en la infraestructura de Vercel. Este proyecto se despliega en
un VPS propio con PM2 (confirmado en `.github/workflows/deploy.yml` y
`ecosystem.config.cjs`), así que estas peticiones van a devolver 404 en cada visita
sin que rompan nada — no es una vulnerabilidad, pero:
- Es tráfico y una petición de red descartada en cada carga de página, para cada
  visitante, sin ningún beneficio (no se está recogiendo analítica real).
- No añade superficie de CSP (las rutas son de mismo origen, no un dominio externo),
  así que no hace falta listarlo en la CSP propuesta en el hallazgo 1 — pero si en
  algún momento se activa con `scriptSrc`/`eventEndpoint` apuntando a un dominio de
  Vercel, sí habría que añadir ese dominio a `script-src`/`connect-src`.

Recomendación: quitar `<Analytics />`/`<SpeedInsights />` (y las dependencias del
`package.json`) ya que no funcionan fuera de Vercel, o sustituirlas por una solución
de analítica que sí tenga sentido en el VPS propio (Plausible/Umami autoalojado,
por ejemplo) si se quiere telemetría real. Es limpieza, no seguridad — prioridad baja.

---

## Resumen de prioridades

| # | Hallazgo | Prioridad |
|---|---|---|
| 1 | Sin CSP real (propuesta completa arriba) | Alta |
| 2 | Subida de fotos con clave anon; control duro depende del dashboard de Supabase (no verificable desde el código) | Alta |
| 3 | Sin Dependabot/Renovate (YAML listo arriba) | Media |
| 4 | Versiones next/react actualmente parchadas contra CVEs 2026 conocidos, pero sin Dependabot no hay garantía a futuro | Informativo / ligado a #3 |
| 5 | Turnstile/rate-limit: cobertura completa; solo acciones ya protegidas por sesión (votos, denuncias) quedan sin rate limit adicional | Baja |
| 6 | Sin escaneo de secretos en CI (gitleaks); GitHub Secret Scanning no verificable desde el código | Media |
| 7 | RLS de `person_owners`/`resource_owners`/`app_roles`/`manager_requests` bien cerradas | Baja (positivo, confirmar y no tocar) |
| 8 | `@vercel/analytics`/`@vercel/speed-insights` no funcionan fuera de Vercel | Baja |
