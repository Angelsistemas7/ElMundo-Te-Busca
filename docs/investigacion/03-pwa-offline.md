# PWA y resiliencia en bajo ancho de banda

Investigación nueva (agosto 2026), sin trabajo previo en `docs/investigacion/`.
Foco: qué tan lejos conviene llevar "modo app" / soporte offline en una plataforma
donde los datos que se muestran (¿esta persona ya apareció?, ¿este punto de ayuda
todavía tiene agua?) son potencialmente de **vida o muerte** si se sirven viejos
sin avisar.

## Veredicto en una frase

Vale la pena el "cascarón" instalable (manifest + iconos + cabeceras) porque es
barato y no toca datos; **no** vale la pena un service worker que cachee ninguna
página con estado de personas o disponibilidad, y **no** vale la pena "offline-first"
con cola de publicaciones — el propio criterio de seguridad del proyecto lo descarta.
Ver la tabla de prioridades al final.

---

## 1. Criterio de seguridad de la información (por qué esto no es "offline-first" normal)

En una PWA de e-commerce o blog, cachear agresivamente y mostrar datos de hace
una hora es un problema de UX menor. Acá no:

- **Personas**: si alguien ya fue marcado como localizado por su familiar (autor
  con token) o por un moderador, y el service worker le sirve a otro usuario una
  copia en caché de la ficha de "desaparecido" de hace 20 minutos, esa persona
  sigue apareciendo como perdida — trabajo de búsqueda duplicado o, peor, alguien
  deja de buscar en el lugar correcto porque cree que ya fue encontrada cuando en
  realidad el estado cambió al revés.
- **Puntos de ayuda / hospitales**: el consenso "✅ Sí hay / ❌ Se acabó" (`data.ts`,
  `AidConsensusVote.tsx`) existe *precisamente* porque la disponibilidad cambia
  en minutos. Servir una versión cacheada donde "hay agua" cuando ya se acabó
  puede mandar a una familia a caminar horas para nada, en zona de sismo.
- **Server Actions** (`src/app/actions.ts`): son mutaciones (crear reporte,
  cambiar estado, votar). Cachearlas o repetirlas offline sin que el usuario
  sepa que no se envió es el peor escenario — alguien cree que reportó a un
  familiar encontrado y en realidad el POST nunca salió.

Conclusión de diseño: el service worker debe tratar **todo dato dinámico como
"nunca cachear, siempre red"**, y solo puede acelerar la carga de la cáscara de
la interfaz (CSS/JS/fuentes/iconos) y, como mucho, páginas puramente informativas
que el usuario ya visitó (FAQ, "cómo ayudar"). Esto también es una realidad
técnica y no solo una elección: la Cache API del navegador **solo puede
almacenar respuestas GET** — un Service Worker no puede cachear un POST (Server
Action) aunque quisiera; para reintentar escrituras el patrón estándar es
Background Sync, no la caché (ver fuentes de estrategias de caché, sección 4).

---

## 2. Qué existe hoy en el repo

Revisado en agosto 2026:

- **No hay** `src/app/manifest.ts` ni `public/manifest.json`. No hay "agregar a
  inicio" configurado con manifest — Android/iOS pueden agregar el sitio como
  marcador pero sin nombre corto, ícono propio ni `theme-color` de instalación.
- **Sí hay** `src/app/icon.svg` (32×32, fondo `#1d1b40`, ícono de "encontrado")
  — Next.js ya lo usa automáticamente como favicon vía la convención de archivo,
  pero no sirve como ícono de manifest (falta tamaño 192/512 y un ícono
  "maskable" para Android).
- `src/app/layout.tsx` ya define `viewport.themeColor = "#d3824a"` y
  `viewportFit: "cover"` — es decir, ya hay trabajo pensado para móvil
  (`MobileNav.tsx`, safe-area). Falta el `manifest` link para que el navegador
  ofrezca instalar.
- `next.config.ts`: define `images.remotePatterns` para Supabase Storage, pero
  **no** define `images.formats`. El default de Next.js 15 es servir solo
  `image/webp` (no AVIF) cuando el navegador lo soporta — o sea, ya hay
  optimización automática vía `next/image`, pero no la mejor compresión posible.
- No existe ningún `sw.js`, ni `@serwist/next`, ni `next-pwa` en `package.json`.
  Cero service worker hoy.
- `next` está en `15.5.23` (confirmado en `node_modules/next/package.json`),
  React 19. `output: "standalone"` para el VPS.

---

## 3. Serwist: estado y madurez para integrarlo hoy

- Serwist es el sucesor mantenido de `next-pwa` (que ya no tiene mantenimiento
  activo del autor original). El propio `npm` de `next-pwa` recomienda migrar a
  `@serwist/next`. `@ducanh2912/next-pwa` es un fork intermedio, pero los
  autores de ese fork también apuntan a Serwist como la opción recomendada para
  proyectos nuevos [Building a PWA in Next.js with Serwist (next-pwa successor)](https://javascript.plainenglish.io/building-a-progressive-web-app-pwa-in-next-js-with-serwist-next-pwa-successor-94e05cb418d7).
- Actividad reciente confirmada: `@serwist/next` en versión `9.5.11` (publicado
  hace ~2 meses al momento de la búsqueda) y el resto de paquetes de Serwist en
  `9.5.12` publicado hace ~16 días — o sea, mantenimiento activo en 2026, no
  abandonado.
- Integración: se envuelve `next.config.ts` con `withSerwistInit` de
  `@serwist/next`, apuntando a un archivo fuente (`src/sw.ts`) que Serwist
  compila a `public/sw.js` en el build, inyectando el manifest de precache de
  los assets estáticos. Es compatible con App Router — hay guías y ejemplos
  específicos para Next 15 App Router (no es un patrón solo de Pages Router)
  [Building Offline Apps with Next.js and Serwist](https://sukechris.medium.com/building-offline-apps-with-next-js-and-serwist-a395ed4ae6ba).
- Hay al menos un issue abierto en el repo de Next.js sobre que el `sw.js` no
  se genera en ciertas configuraciones con Serwist + Next 15
  ([vercel/next.js#73457](https://github.com/vercel/next.js/issues/73457)) —
  señal de que la integración funciona pero no es "cero fricción"; hay que
  probar el build real (`npm run build` + `npm run start` en modo standalone,
  como ya indica `CLAUDE.md`) antes de confiar en que el SW se generó.
- Veredicto de madurez: **suficientemente maduro para un uso mínimo y
  conservador** (precache de assets estáticos, sin interceptar datos). No lo
  recomendaría para una estrategia agresiva de cache-first en páginas
  dinámicas — ni falta hace, dado el criterio de la sección 1.

---

## 4. Diseño del service worker mínimo (si se implementa)

Objetivo único: que la segunda visita cargue el "cascarón" (JS/CSS/fuentes/
iconos) desde caché mientras la red venezolana/colombiana de 2G-3G tarda, sin
tocar ni un byte de dato que pueda estar desactualizado.

### Qué SÍ cachear

| Recurso | Estrategia | Por qué |
|---|---|---|
| JS/CSS con hash de build (`/_next/static/...`) | Cache-first (inmutable) | El nombre cambia con cada build; cachear para siempre es seguro y es el caso de uso estándar de precache de Workbox/Serwist. |
| Fuentes (`Figtree`/`Signika` vía `next/font`, ya autoalojadas) | Cache-first | Estáticas, no cambian entre despliegues del mismo build. |
| `icon.svg`, iconos de manifest, `opengraph-image` | Cache-first | Estáticos. |
| Cáscara de navegación (layout: header, `MobileNav`, footer) | Stale-while-revalidate solo para el *shell* de la app (App Shell), nunca para el contenido de la ruta | Permite que la barra de navegación aparezca instantáneo aunque la red esté lenta, mientras el contenido real siempre se pide fresco. |
| Páginas puramente estáticas de información (`/mantenimiento`, FAQ si existiera, páginas "cómo ayudar") | Network-first con fallback a caché | Útil si la conexión se cae a medio cargar, pero no son datos sensibles a "quedar viejos". |

### Qué NUNCA cachear (network-only, sin fallback silencioso)

- **Todas las Server Actions** (`app/actions.ts`, `app/admin/actions.ts`) — son
  POST; técnicamente ni siquiera son cacheables por la Cache API, pero además
  hay que asegurarse de que el SW no intente aplicar Background Sync
  automático sobre ellas sin que el usuario vea un estado explícito de
  "pendiente de enviar" (ver sección 1 — un envío fantasma es peor que un
  error visible).
- **Fichas de persona** (`/persona/[id]`), **listado "Se busca"** (`/` /
  `/se-busca`) y **"¿La reconoces?"** (`/sin-identificar`) — estado que cambia
  por decisión de autor/moderador.
- **Puntos de ayuda, hospitales, caravanas** (`/ayuda*`, `/hospitales*`,
  `/caravanas*`) — disponibilidad por consenso, cambia en minutos.
- **`/comunidad*`** — feed y reacciones en vivo.
- **`/mapa`** — combina todo lo anterior sobre Leaflet.
- **`/admin`** — panel de moderación; nunca debe verse una versión cacheada de
  la cola de moderación.
- Cualquier ruta bajo `/api/cron` y cualquier respuesta con cookie de sesión o
  de país (el sitio ya evita hacer dinámico el layout raíz por esto mismo,
  según el comentario en `layout.tsx`; un SW mal configurado podría cachear una
  respuesta personalizada por país y servírsela a otro usuario).

### Estrategia recomendada en una frase

**Network-first estricto (sin caché) para todo lo que tenga un dato que
alguien pueda estar decidiendo "camino hacia allá o no" / "sigo buscando o
no"; cache-first solo para bytes que no representan un hecho del mundo real
(código y tipografías).** Esto es justo la separación que ya documentan las
fuentes de estrategias de caché en PWA: network-first para contenido que debe
estar actualizado, cache-first para assets inmutables, y nunca cachear
mutaciones (POST) — la Cache API solo admite respuestas GET, así que un
Service Worker no puede "cachear por accidente" una Server Action aunque la
lista de exclusión tenga un error humano ([Offline-First PWAs: Service Worker
Caching Strategies](https://www.magicbell.com/blog/offline-first-pwas-service-worker-caching-strategies);
[Caching strategies in PWA — Borstch](https://borstch.com/blog/caching-strategies-in-pwa-cache-first-network-first-stale-while-revalidate-etc)).

### Qué implica NO hacer offline-first con cola

Explícitamente descartado por el criterio de la sección 1: no implementar
Background Sync para reintentar reportes de personas o votos de consenso sin
conexión. Si se quiere dar *algo* de resiliencia ante conexión intermitente,
la opción segura y honesta es: al fallar el envío, mostrar un mensaje claro
("No se pudo enviar, tu conexión falló, vuelve a intentar") y dejar el
formulario con los datos rellenados para reintento manual — nunca una cola
silenciosa que el usuario cree que ya se envió.

---

## 5. Manifest + iconos: ¿vale la pena?

Sí, con alcance acotado. Motivos:

- Es independiente del service worker — un `app/manifest.ts` con nombre,
  `short_name`, colores (reusar `#d3824a` de `viewport.themeColor` y el
  `#1d1b40`/`#f2af5e` del ícono actual) e íconos 192/512 (incluyendo una
  variante "maskable") es ~horas de trabajo, no días, y no toca ninguna
  lógica de datos.
- iOS cambió de comportamiento en 2025/2026 (iOS 26): ahora, por defecto,
  **cualquier sitio agregado a la pantalla de inicio se abre como app web**, y
  si el sitio tiene manifest, el usuario obtiene todos los beneficios de ese
  manifest (ícono propio, nombre corto, sin barra de navegador) en vez del
  comportamiento anterior más limitado [Web Apps in iOS 26 — Michael Tsai /
  WebKit](https://mjtsai.com/blog/2025/10/03/web-apps-in-ios-26/). Esto hace
  que el manifest valga más la pena ahora que hace un año: antes en iOS el
  "agregar a inicio" era un caso especial que requería más trucos; ahora es el
  camino por defecto y el manifest se aprovecha directo.
- Para el público objetivo (gente en zona de desastre, mucha desde el celular,
  con conexión mala) tener el ícono en la pantalla de inicio ahorra escribir
  la URL o buscar en el navegador cada vez — importa más la fricción de
  *volver* a la app que la posibilidad de "instalar app nativa".
- Costo: bajo. No requiere service worker para funcionar (un manifest sin SW
  ya permite "agregar a inicio" con ícono propio en Android/iOS).

---

## 6. Optimización de imágenes: qué falta

- `next/image` con Next 15 ya optimiza automáticamente a WebP según el header
  `Accept` del navegador — eso ya está andando sin configuración extra, porque
  `images.formats` por defecto es `['image/webp']`.
- Falta agregar `image/avif` a la lista (`images: { formats: ["image/avif",
  "image/webp"] }` en `next.config.ts`). AVIF comprime ~20% más chico que WebP
  a calidad similar, aunque tarda ~50% más en codificarse en el servidor — el
  costo de codificación lo paga el build/servidor de optimización, no el
  usuario, así que para el público de 2G/3G es una ganancia neta de bytes.
  Cambio de una línea, sin riesgo.
- No hay evidencia de que se necesite más que esto: no hay un pipeline de
  imágenes gigante ni miles de fotos por página; las fotos son de perfil /
  fichas individuales, ya se comprimen en cliente con `compressImage` antes de
  subir (mencionado en `CLAUDE.md`). El cuello de botella real de datos en 2G
  no son las imágenes optimizadas de Next sino el peso de Leaflet + tiles del
  mapa (ver sección 7).

---

## 7. "Modo de datos livianos" (ocultar mapa/fotos): ¿vale la pena?

Veredicto honesto: **no todavía — sobre-ingeniería para el volumen y la etapa
actual del proyecto.**

A favor de construirlo:
- Leaflet + `react-leaflet` (`components/map/CrisisMap.tsx`) ya se carga
  `next/dynamic({ ssr: false })`, es decir client-only y separado del bundle
  principal — es lo correcto, y significa que **quien no visita `/mapa` no
  paga ese costo** aunque no exista modo liviano. El problema de "mapa pesado"
  ya está contenido a la propia página del mapa, no contamina el resto del
  sitio.
- Las fotos ya pasan por `next/image` (redimensionadas por tamaño de
  viewport) y por `compressImage` en el cliente antes de subir — dos capas de
  mitigación ya existen.

En contra de construirlo ahora:
- Requeriría un mecanismo nuevo de preferencia persistente (cookie o
  `localStorage`, similar al patrón de `CountrySwitcher`), un toggle en la UI,
  y luego auditar cada página para decidir qué ocultar sin romper la utilidad
  real (el mapa no es decorativo — es cómo alguien ubica el punto de ayuda más
  cercano; ocultarlo mal puede quitarle a alguien la única forma de encontrar
  ayuda cercana).
- El verdadero costo en 2G no es "cuántas imágenes hay en la página" sino la
  latencia de round-trips (TTFB, tiles del mapa que son decenas de requests
  pequeños). Un modo "liviano" que solo esconde imágenes no resuelve eso; lo
  que sí ayudaría es que `/mapa` avise su peso antes de cargar (p. ej. un
  botón "cargar mapa" en vez de auto-cargar tiles), que es un cambio mucho más
  chico y dirigido que un "modo" global.
- No hay señal en el repo (analytics, quejas documentadas en
  `docs/ESTADO-DEL-PROYECTO.md` u otros informes) de que el peso de imágenes
  sea hoy un problema reportado por usuarios reales, a diferencia de, por
  ejemplo, el freno de fuerza bruta o el rate-limit de reacciones anónimas que
  sí se atacaron porque eran problemas concretos (ver commits recientes).

Alternativa de menor costo si se quiere avanzar en esta dirección: convertir
`/mapa` en "cargar bajo demanda" (botón explícito antes de montar
`CrisisMap`) en vez de un modo de datos global — resuelve el 80% del ahorro
de datos con una fracción del esfuerzo y sin tocar el resto del sitio.

---

## 8. Next.js 16: ¿aplica algo nativo de offline? ¿vale la pena subir de versión ahora?

- Next.js 16 (lanzado 21 de octubre de 2025) **no trae ningún hook ni API
  nativa de "offline"** — no existe tal cosa en el framework. Lo que sí trae
  es un cambio grande de modelo de caché: **Cache Components**, basado en la
  directiva `"use cache"` (estabilizada junto con `cacheLife`, `cacheTag` y
  `updateTag` en la versión 16.2), donde **todo el código dinámico se ejecuta
  en cada request por defecto** y el cacheo pasa a ser explícito y opt-in
  [Next.js 16 — blog oficial](https://nextjs.org/blog/next-16).
- Ese modelo — "todo dinámico por defecto, cacheo explícito" — de hecho
  **encaja filosóficamente** con el criterio de seguridad de la sección 1
  (nunca servir datos de personas/disponibilidad viejos sin que sea una
  decisión explícita). Pero no es un motivo suficiente para migrar ahora: el
  proyecto ya logra "siempre fresco" hoy sin Cache Components, simplemente no
  cacheando nada a nivel de framework en esas rutas — no hay una necesidad no
  resuelta que Next 16 resuelva acá.
- Riesgo real del upgrade (15.5.23 → 16.x), según el propio changelog de
  breaking changes:
  - Turbopack pasa a ser el bundler por defecto (probablemente sin impacto,
    pero es una superficie de build nueva para validar).
  - `middleware.ts` se renombra a `proxy.ts` — si el proyecto usa middleware
    para el enrutamiento por país (mencionado en `layout.tsx`), hay que
    revisar y renombrar.
  - `revalidateTag()` cambia de firma (ahora exige un perfil `cacheLife` como
    segundo argumento) — si `data.ts` o `actions.ts` usan `revalidatePath`/
    `revalidateTag`, hay que auditar cada uso.
  - Node.js mínimo sube a 20.9+ — hay que confirmar la versión de Node en el
    VPS de producción (Oracle Cloud) antes de subir, no asumir.
  - `images.qualities` por defecto cambia de rango completo a `[75]` fijo, y
    `images.minimumCacheTTL` sube de 60s a 4h — puede cambiar visualmente la
    compresión de fotos ya subidas sin que nadie lo pida.
  - `params`/`searchParams`/`cookies()`/`headers()` ya exigían `await` desde
    Next 15, así que ese costo específico ya debería estar pagado; confirmar
    igual.
  - Adoptar Cache Components (`cacheComponents: true`) es **opt-in**, no
    obligatorio con el upgrade — se puede subir a Next 16 sin activarlo y
    revisar Cache Components como un proyecto aparte más adelante.
- Veredicto: **no recomendado ahora.** Es una migración de varios días con
  riesgo real de romper el enrutamiento por país (middleware/proxy) y el
  cacheo existente (`revalidatePath`/`revalidateTag`), para un beneficio que
  hoy es cero (no hay ninguna funcionalidad bloqueada por estar en Next
  15.5.23). Cuando haya una razón concreta para subir (fin de soporte de
  Next 15, o necesidad real de Cache Components), conviene volver a evaluar
  con codemod oficial (`npx @next/codemod@canary upgrade latest`) y probar en
  una rama aparte contra el modo standalone antes de tocar producción.

---

## 9. Tabla de prioridades

| Prioridad | Acción | Costo estimado | Toca datos sensibles |
|---|---|---|---|
| Alta | `app/manifest.ts` + íconos 192/512 (+ maskable) para "agregar a inicio" | 0,5–1 día | No |
| Alta | Agregar `image/avif` a `images.formats` en `next.config.ts` | <0,5 día | No |
| Media | Service worker mínimo con Serwist: precache de assets estáticos/fuentes/cáscara únicamente, network-only explícito para todas las rutas de datos y Server Actions | 2–3 días (incluye probar el build standalone real, no solo `next dev`) | No, si se implementa con la lista de exclusión de la sección 4 |
| Media | Botón "cargar mapa" bajo demanda en `/mapa` en vez de auto-montar Leaflet | 0,5–1 día | No |
| Baja | "Modo de datos livianos" global (toggle persistente que oculta imágenes/mapa en todo el sitio) | 3–5 días, y requiere decidir con cuidado qué ocultar sin quitar utilidad real | Riesgo si se oculta mal el mapa (es funcional, no decorativo) |
| No recomendado ahora | Offline-first con cola de envíos / Background Sync para reportes o votos | — | Sí, directamente — descartado por criterio de seguridad de la sección 1 |
| No recomendado ahora | Upgrade a Next.js 16 / Cache Components | 3–5+ días solo de migración, sin beneficio funcional inmediato | Riesgo indirecto vía middleware de país y revalidación existente |

---

## Fuentes

- [Building a Progressive Web App (PWA) in Next.js with Serwist (Next-PWA Successor)](https://javascript.plainenglish.io/building-a-progressive-web-app-pwa-in-next-js-with-serwist-next-pwa-successor-94e05cb418d7)
- [Building Offline Apps with Next.js and Serwist — Medium](https://sukechris.medium.com/building-offline-apps-with-next-js-and-serwist-a395ed4ae6ba)
- [`vercel/next.js` issue #73457 — service worker doesn't create Next.js 15 using Serwist](https://github.com/vercel/next.js/issues/73457)
- [`@serwist/next` en npm](https://www.npmjs.com/package/@serwist/next) (versión y fecha de publicación verificadas vía búsqueda, agosto 2026)
- [Web Apps in iOS 26 — Michael Tsai / referencia a WebKit blog](https://mjtsai.com/blog/2025/10/03/web-apps-in-ios-26/)
- [Offline-First PWAs: Service Worker Caching Strategies — MagicBell](https://www.magicbell.com/blog/offline-first-pwas-service-worker-caching-strategies)
- [Caching strategies in PWA — Borstch](https://borstch.com/blog/caching-strategies-in-pwa-cache-first-network-first-stale-while-revalidate-etc)
- [Next.js 16 — anuncio oficial, breaking changes y Cache Components](https://nextjs.org/blog/next-16)
- Repositorio local (agosto 2026): `next.config.ts`, `package.json`, `src/app/layout.tsx`,
  `src/app/icon.svg`, `src/components/map/CrisisMap.tsx`, `node_modules/next/package.json`
  (versión instalada `15.5.23`) — inspeccionados directamente para este informe.
