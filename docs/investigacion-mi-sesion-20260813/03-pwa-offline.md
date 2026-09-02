# Investigación: PWA, offline y resiliencia ante mala conexión

Fecha: 12 ago. 2026. Solo investigación — **no se tocó código en este documento**.
Contexto: usuarios reales en zona de terremoto (La Guaira y alrededores), con
conectividad intermitente, datos móviles caros/lentos (2G/3G) y a veces batería o
dispositivo modesto. Stack actual: Next.js 15.1.3 (App Router), React 19,
Tailwind v4, Leaflet client-only, Supabase Storage. **Hoy el proyecto no tiene
manifest.json, ni service worker, ni ninguna pieza de PWA** (confirmado:
`public/` solo tiene logos, no hay `app/manifest.ts` ni `sw.js`).

---

## Resumen ejecutivo

**Recomendación de alcance mínimo viable (unos 2-3 días de trabajo):**
1. **`app/manifest.ts`** con iconos (192/512 + maskable) → instalable en 1-2 h de trabajo. Beneficio alto, riesgo casi nulo.
2. **Service worker mínimo con Serwist**, cacheando *solo* shell estático (CSS, fuentes, iconos, logo) con `precache` + una estrategia `NetworkFirst` con timeout corto para las páginas de listado (personas, ayuda, hospitales) — **nunca** cachear Server Actions ni formularios. Esto da una pantalla utilizable en vez de "sin conexión" del navegador cuando la red falla a medias.
3. **Banner/degradado ligero cuando `saveData` o `effectiveType` indica 2G/3G**: ocultar el mapa Leaflet (mostrar botón "cargar mapa"), servir fotos en tamaño pequeño. No hace falta una vista de texto puro paralela — con lazy-load del mapa y `next/image` bien configurado se cubre el 80% del caso NPR/emergencia sin mantener dos versiones del sitio.
4. **NO** perseguir "offline-first completo" (leer/publicar personas sin red, sync en segundo plano): la app depende de Server Actions + Supabase con datos que cambian por segundo en una emergencia (ubicación de una persona, disponibilidad de un punto de ayuda); servir datos viejos como si fueran actuales es **peligroso**, no solo una molestia de UX. El service worker debe ayudar a que la app *cargue* y a no perder lo ya visto, no a fingir que se puede publicar/editar sin red.
5. Vale la pena vigilar `experimental.useOffline` (hook nativo `useOffline` + reintento automático de Server Actions, lanzado en Next.js 16.3, jul. 2026) como reemplazo futuro de partes de esto — pero hoy es experimental, "no recomendado para producción", y el proyecto está en Next 15.1.3, así que no es una opción inmediata sin upgrade mayor.

---

## 1. Service Worker / PWA en Next.js 15 App Router: comparación de opciones (2025-2026)

| Opción | Estado | Veredicto |
|---|---|---|
| `next-pwa` (clásico, `shadowwalker/next-pwa`) | **Sin mantenimiento activo**, incompatible con varias cosas de App Router moderno | Descartar |
| `@ducanh2912/next-pwa` | Fork mantenido de `next-pwa`, API similar (config simple, "precachea JS/CSS/imágenes, cachea páginas al visitarlas, fallback offline") | Válido como opción de bajo esfuerzo, pero el propio ecosistema apunta a Serwist como sucesor |
| **Serwist (`@serwist/next`)** | Fork activo de Workbox (que dejó de evolucionar), con paquete específico para Next.js que resuelve el "plumbing" de build (inyecta el manifest de precache, genera `public/sw.js`) | **Recomendado hoy** por la comunidad y referenciado directamente en la [documentación oficial de Next.js](https://nextjs.org/docs/app/guides/progressive-web-apps) como "una opción" para offline completo vía service worker |
| Workbox manual | Sigue funcionando pero Workbox como proyecto está estancado; Serwist es literalmente ese mismo motor con mantenimiento activo | No hay razón para ir manual si Serwist ya envuelve Workbox |
| `experimental.useOffline` (nativo, Next 16.3+) | Hook `useOffline()` + reintento automático de navegación/prefetch/Server Actions cuando vuelve la red, sin service worker | Prometedor pero **experimental, "no recomendado para producción"**, y requiere Next 16.3+ (el proyecto está en `^15.1.3`) |

**Conclusión: Serwist es la opción correcta hoy** si se quiere service worker. Next.js oficialmente dejó de recomendar `next-pwa` y apunta a Serwist en su propia guía.

### Setup de Serwist (referencia, para cuando se implemente)

```bash
npm i @serwist/next
npm i -D serwist
```

`next.config.ts`:
```ts
import withSerwistInit from "@serwist/next";

const withSerwist = withSerwistInit({
  swSrc: "app/sw.ts",
  swDest: "public/sw.js",
  // No precachear rutas dinámicas (personas, ayuda, admin) — solo shell.
});

export default withSerwist(nextConfig); // nextConfig = el objeto actual del repo
```

`app/sw.ts` (esqueleto):
```ts
import { defaultCache } from "@serwist/next/worker";
import { installSerwist } from "@serwist/sw";

declare const self: ServiceWorkerGlobalScope;

installSerwist({
  precacheEntries: self.__SW_MANIFEST, // shell: JS/CSS/fuentes/iconos generados en build
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: defaultCache, // ver estrategia por tipo de contenido abajo
});
```

`tsconfig.json` necesita `"types": ["@serwist/next/typings"]` y `"lib": [..., "webworker"]`; y `public/sw.js` va a `.gitignore` (se genera en build).

### Estrategia de caché por tipo de contenido (matiz importante)

Este es el punto donde hay que ser cuidadoso, porque el sitio no es un blog estático: mezcla shell, datos casi-estáticos, datos muy dinámicos y escritura.

| Contenido | Estrategia | Por qué |
|---|---|---|
| Shell: CSS, JS de Next, fuentes, logo, iconos manifest | `CacheFirst` / precache en build | No cambia entre despliegues; es justo lo que permite que la app *abra* sin red |
| Páginas de listado (`/`, `/ayuda`, `/hospitales`, `/comunidad`, `/mapa`) | `NetworkFirst` con timeout corto (p. ej. 4-6 s) y fallback a la última copia en caché | Se necesita el dato más fresco posible (una persona pudo aparecer, un punto de ayuda pudo agotarse), pero si la red falla es mejor mostrar la última vista conocida con una nota "sin conexión, mostrando última copia" que una pantalla en blanco |
| Fichas individuales ya visitadas (`/persona/[id]`, `/ayuda/[id]`) | `NetworkFirst` igual, cachear la respuesta para poder reabrirla sin red | El usuario probablemente vuelve a la misma ficha (la persona que está buscando) |
| Imágenes de Supabase Storage (fotos subidas) | `StaleWhileRevalidate` con límite de entradas (p. ej. últimas 50-60) vía `expiration` de Serwist | Sirve rápido de caché y refresca en segundo plano; hay que poner tope de tamaño de caché o se llena el almacenamiento del teléfono |
| **Server Actions** (`app/actions.ts`: crear/editar persona, votar, comentar, subir foto) | **NO cachear. Nunca.** Dejar pasar directo a la red (`NetworkOnly` implícito, no interceptar) | Cachear una mutación es directamente incorrecto: son POST con efectos secundarios (Turnstile, escritura en Supabase). Si no hay red, deben fallar visiblemente, no simular éxito. Esto es el matiz que separa este sitio de un blog: "PWA" aquí significa "que cargue y sea legible", no "que se pueda publicar sin red" |
| `/admin/*`, formularios con Turnstile | Excluir de todo caché | Turnstile requiere red por definición; cachear la página del panel de moderación no ayuda y podría confundir sobre el estado real |

Fuente clave: la propia [guía oficial de Next.js sobre PWAs](https://nextjs.org/docs/app/guides/progressive-web-apps) menciona a Serwist explícitamente como la vía para "offline support completo basado en service worker", y remite a los ejemplos oficiales de Serwist para Turbopack/webpack.

---

## 2. Qué cachear realistamente (y qué no)

**Sí tiene sentido cachear:**
- Cáscara de la app: CSS compilado, fuentes (Figtree/Signika ya se sirven con `display: swap`), iconos, logo — esto es "gratis" con precache de Serwist y es lo que evita la pantalla de error de Chrome/Safari cuando no hay red en absoluto.
- Las últimas páginas de listado y fichas que el usuario ya vio (persona que está siguiendo, punto de ayuda cercano, hospital de referencia) vía `NetworkFirst`/`StaleWhileRevalidate` — sirve para "lo até a ver hace 10 minutos, la red se cayó, quiero volver a mirarlo".
- El propio `/mapa` como shell (Leaflet JS/CSS), aunque los tiles del mapa (OpenStreetMap u otro proveedor) son un caso aparte: cachear tiles de mapa es más trabajo (son cientos de imágenes pequeñas por zona) y de beneficio dudoso si de por sí se recomienda ocultar el mapa en conexión lenta (ver punto 3).

**No tiene sentido (o es directamente riesgoso) cachear:**
- Formularios de publicación/edición y sus Server Actions — necesitan red, y fingir que funcionan offline genera falsa sensación de "ya publiqué" cuando en realidad no salió nada.
- `/admin` — panel de moderación con Turnstile, sin beneficio de cachear.
- Cualquier página con datos de "disponibilidad ahora" (ej. `available` de un punto de ayuda, capacidad de un hospital) más allá de una ventana corta — es exactamente el tipo de dato donde una copia vieja puede llevar a alguien a un lugar que ya no tiene insumos.

---

## 3. Modo "datos livianos" / vista ligera para conexión lenta

### Patrones reales observados

- **Sitios de emergencia estáticos (Max Böck, "Emergency Website Kit"; el patrón que usó NPR con Brightspot para el huracán Milton):** la filosofía es "rule of least power" — HTML estático, CSS inline, sin fuentes web, sin tracking, sin JS pesado, objetivo de caber en el primer *round-trip* (~14 KB). El caso NPR es contundente: la home normal de una de sus estaciones pesaba **8.5 MB**; la versión texto-only, **21.5 KB** — **~400x menos**. Se armó en horas antes de que tocara tierra el huracán, reusando el CMS compartido de 200+ estaciones.
- **Facebook Lite / Google Go:** no es "otra web", es la misma función con recorte agresivo — iconos con símbolos Unicode en vez de imágenes, imágenes comprimidas agresivamente, autoplay de video solo en Wi-Fi, tamaño de app final ~4 MB.
- **Patrón común a ambos:** no mantienen dos *aplicaciones* completas en paralelo a largo plazo; es un **modo/degradado dentro del mismo sistema** (banderas de compresión, ocultar medios, no autoplay), no un micrositio hermano que hay que mantener sincronizado para siempre (excepto el caso NPR, que es explícitamente un plan de contingencia de horas, no una sección permanente del sitio).

### Recomendación para este proyecto

No construir una "vista de solo texto" como página/ruta separada (`/lite`) que haya que mantener en paralelo — con 8 personas de equipo y prioridad en seguridad, es deuda de mantenimiento que se desactualiza. En su lugar:

1. **Detección:** combinar `navigator.connection.saveData` (el usuario activó "ahorro de datos" en el sistema) y `navigator.connection.effectiveType` (`'slow-2g' | '2g' | '3g' | '4g'`) donde esté disponible — **ojo:** el soporte es real en Chrome/Android (incluyendo Chrome de escritorio) pero **no existe en Safari/iOS** ([MDN Network Information API](https://developer.mozilla.org/en-US/docs/Web/API/Network_Information_API), [caniuse](https://caniuse.com/netinfo)). Como buena parte de los usuarios en Venezuela/Colombia probablemente usan Android, esto cubre a muchos, pero no se puede depender solo de la API.
2. **Por eso, además:** un toggle manual persistente en `localStorage` ("Modo datos livianos"), visible y fácil de encontrar (ej. en el header o banner de emergencia), que el usuario active él mismo si detecta que su conexión es mala aunque la API no lo reporte (ej. en iPhone).
3. **Qué apaga el modo liviano (cualquiera de las dos vías, API o toggle):**
   - Reemplaza el mapa Leaflet por un botón "Ver mapa (puede tardar)" en vez de cargarlo automático — Leaflet + tiles es de lo más pesado del sitio.
   - Fuerza `next/image` a menor calidad/tamaño (ver punto 3b).
   - Evita precargar imágenes fuera de viewport de forma agresiva (ya deberían ser lazy por defecto con `next/image`).
   - Opcionalmente, oculta imágenes de fondo/decorativas no esenciales.
4. Esto dista mucho de un "sitio texto-only" tipo NPR, pero da la mayor parte del beneficio (menos MB, menos tiempo de carga) sin duplicar código ni rutas.

---

## 3b. Estado actual de imágenes en el proyecto y qué mejorar

`src/lib/image.ts` ya hace bastante bien lo esencial del lado cliente:
- `compressImage()` redimensiona a `maxDim = 1280` px y recodifica a WebP calidad `0.82` en un `<canvas>` **antes de subir** — de foto de cámara (2-5 MB) a ~100-250 KB. Esto es exactamente lo recomendado para el caso de uso (subida desde el lugar del desastre).
- Efecto colateral documentado y deliberado: limpia metadatos EXIF (incluida GPS) al re-codificar — importante para privacidad, no tocar ese comportamiento.

Lo que falta del lado de **servir** imágenes (no de subirlas), donde hay margen real de mejora:
- `next.config.ts` no configura nada en `images` más allá de `remotePatterns` para Supabase — no hay `formats`, `deviceSizes`, ni `quality` custom. Por defecto Next.js ya intenta AVIF/WebP automáticamente y sirve el tamaño según `sizes`, pero conviene ser explícito:
  ```ts
  images: {
    remotePatterns: [ /* ...existente... */ ],
    formats: ["image/avif", "image/webp"], // AVIF cuando el navegador lo soporte, si no WebP
    // deviceSizes / imageSizes por defecto de Next.js ya cubren bien de 640 a 3840px;
    // no hace falta tocarlos salvo que se detecten breakpoints muy distintos al uso real.
  },
  ```
- Faltaría usar `next/image` (con su generación automática de variantes) en los lugares donde hoy probablemente se usa `<img>` directo para las fotos de Supabase Storage — si no se está usando ya, es la ganancia más grande y de menor esfuerzo (revisar componentes de tarjetas de persona/comunidad/ayuda).
- Para el "modo datos livianos" del punto 3, se puede bajar el prop `quality` de `next/image` (p. ej. de 75 a 40-50) condicionalmente cuando el modo esté activo, sin tocar nada del pipeline de subida.
- Nota: como ya se recomprime a WebP en cliente antes de subir, el AVIF de `next/image` en el servidor re-codificaría un WebP ya comprimido — sigue dando beneficio (AVIF suele ganarle a WebP en tamaño a igual calidad) pero el margen es menor que en un sitio que sube JPEG sin comprimir. La compresión client-side ya hecha es, con diferencia, la optimización que más pesa.

---

## 4. Instalabilidad PWA (manifest, iconos, "Agregar a inicio")

Beneficio real para el caso de uso: en una emergencia, un enlace en la pantalla de inicio ahorra el paso de "abrir navegador → recordar la URL o buscarla → esperar que cargue la home del navegador con pestañas/historial de por medio". Es una ganancia de fricción real y de bajo costo de implementación — vale la pena aunque no se llegue a hacer nada de service worker.

Next.js App Router soporta manifest nativo vía `app/manifest.ts` (no hace falta ninguna librería):

```ts
// app/manifest.ts
import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "El Mundo Te Busca",
    short_name: "Te Busca",
    description:
      "Plataforma ciudadana para localizar personas desaparecidas y coordinar ayuda ante emergencias.",
    start_url: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#d3824a", // mismo brand-600 que ya usa viewport.themeColor en layout.tsx
    lang: "es",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      // Maskable aparte: Android recorta a círculo/squircle: necesita margen de seguridad
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
```

Notas concretas para este repo:
- Ya existe `public/logo-icon.svg` y `logo.png` — hay que generar los PNG cuadrados 192/512 (y una versión maskable con relleno/padding, p. ej. con un generador como realfavicongenerator.net) a partir de esos assets; no alcanza con reusar el SVG/PNG actual tal cual porque el maskable necesita márgenes específicos.
- `theme_color` del manifest debería coincidir con el `themeColor: "#d3824a"` que ya está en `viewport` de `layout.tsx` — ya son consistentes con `--color-brand-600`.
- iOS/Safari no dispara `beforeinstallprompt`; ahí "instalar" es manual vía Compartir → Agregar a inicio. No vale la pena construir un botón de instalación custom sofisticado — con el manifest bien armado más un texto breve tipo "En iPhone: Compartir → Agregar a inicio" alcanza (esto es literalmente lo que recomienda la guía oficial de Next.js, incluyendo desaconsejar depender de `beforeinstallprompt` por su soporte parcial).
- Instalar la PWA **no da nada de offline por sí sola** sin service worker — son piezas independientes. El manifest solo mejora la instalabilidad/atajo; el service worker (Serwist) es lo que efectivamente cachea contenido.

---

## 5. Costo/beneficio realista — qué hacer y qué NO

Dado que el proyecto ya está en producción, con comentarios hostiles en Facebook y foco declarado en "seguridad > funcionalidades nuevas" (ver memoria del proyecto), la vara para nuevas piezas de infraestructura debe ser alta.

**Vale la pena (80% del beneficio, bajo riesgo):**
- `app/manifest.ts` + iconos → instalabilidad. Horas, no días. Cero riesgo de romper nada existente (es un archivo nuevo, no toca lógica).
- Un service worker Serwist **minimalista**, precacheando solo shell estático + `NetworkFirst` en páginas de listado/ficha ya visitadas. Riesgo bajo si se es disciplinado en **no** interceptar rutas de Server Actions, `/admin`, ni nada con Turnstile. Esto es lo que evita la pantalla de error del navegador y da algo de "sensación de app" cuando la red se cae a medias, que es el escenario más común en zona de desastre (no "cero red", sino "red mala").
- Ajustar `next.config.ts` → `images.formats: ["image/avif", "image/webp"]`, revisar que las fotos usen `next/image`. Cambio de configuración pequeño, beneficio automático en todas las páginas.
- Toggle "modo datos livianos" (oculta mapa por defecto, baja calidad de imagen) + lectura de `saveData`/`effectiveType` donde exista. Esfuerzo moderado (un componente de estado + un par de condicionales en los sitios que renderizan el mapa/imágenes), beneficio directo para el usuario que más lo necesita.

**No vale la pena ahora mismo (mucho esfuerzo, beneficio marginal o riesgo real):**
- Offline-first completo (leer y **publicar** sin red, con cola de sincronización tipo IndexedDB + reintento). Para una app de "última ubicación conocida de una persona" o "insumos disponibles ahora en un hospital", servir/aceptar datos desactualizados sin dejarlo carísimamente claro es un riesgo de seguridad de la información, no solo de UX. Si se llega a necesitar esto de verdad, `experimental.useOffline` de Next.js (nativo, sin service worker) es la vía más prometedora a futuro — pero es experimental y exige subir de Next 15 a 16.3+, dos cosas que hoy pesan más que el beneficio.
- Vista de "solo texto" como ruta/sistema paralelo permanente (al estilo NPR) — tiene sentido como *plan de contingencia de horas* ante un colapso total de infraestructura, no como parte del código a mantener todos los días. Si algún día hace falta, el patrón a copiar es el de NPR/Brightspot: una página estática de emergencia, generada aparte, sin depender del build normal de Next.js — pero eso es un proyecto propio, no una feature del sitio.
- Cachear tiles de mapa de Leaflet — volumen alto (cientos de tiles por zona vista), beneficio bajo si el mapa ya se oculta por defecto en modo datos livianos.
- Push notifications (VAPID, Web Push) — la guía oficial de Next.js lo cubre en detalle, pero no hay pedido ni caso de uso claro todavía para este sitio (¿notificar cambios de estado de una persona? sería una feature de producto nueva, no de resiliencia de red) — fuera de alcance de esta investigación.

**Orden sugerido de implementación si se aprueba avanzar:**
1. Manifest + iconos (instalabilidad).
2. `images.formats` + auditoría de `next/image` en tarjetas con foto.
3. Toggle de modo datos livianos + detección `saveData`/`effectiveType`.
4. Service worker Serwist minimalista (shell + listados ya vistos), con headers `no-cache` en `/sw.js` como recomienda la guía oficial de Next.js.

---

## Fuentes

- [Next.js — Guía oficial: Building a PWA with Next.js](https://nextjs.org/docs/app/guides/progressive-web-apps)
- [Next.js — Functions: useOffline](https://nextjs.org/docs/app/api-reference/functions/use-offline)
- [Next.js — next.config.js: useOffline](https://nextjs.org/docs/app/api-reference/config/next-config-js/useOffline)
- [Next.js — Guides: Offline support](https://nextjs.org/docs/app/guides/offline-support)
- [Next.js — release v16.3.0 (useOffline)](https://github.com/vercel/next.js/releases/tag/v16.3.0)
- [Serwist — Getting started con @serwist/next](https://serwist.pages.dev/docs/next/getting-started)
- [Serwist — Runtime caching / estrategias (NetworkFirst, StaleWhileRevalidate)](https://serwist.pages.dev/docs/serwist/runtime-caching/caching-strategies)
- [@ducanh2912/next-pwa — docs](https://ducanh-next-pwa.vercel.app/docs/next-pwa)
- [GitHub Discussion — Building an Offline-First Next.js 15 App (vercel/next.js #82498)](https://github.com/vercel/next.js/discussions/82498)
- [MDN — Network Information API](https://developer.mozilla.org/en-US/docs/Web/API/Network_Information_API)
- [caniuse — Network Information API](https://caniuse.com/netinfo)
- [Addy Osmani — Adaptive Serving using JavaScript and the Network Information API](https://addyosmani.com/blog/adaptive-serving/)
- [Max Böck — The Emergency Website Kit](https://mxb.dev/blog/emergency-website-kit/)
- [Emergency Mode for News — Lite Sites](https://emergencymode.news/)
- [Brightspot — NPR and Brightspot deliver critical text-only web pages for Hurricane Milton](https://www.brightspot.com/about-us/news/npr-and-brightspot-hurricane-milton-text-only-pages)
- [Meta Engineering — How we built Facebook Lite for every Android phone and network](https://engineering.fb.com/2016/03/09/android/how-we-built-facebook-lite-for-every-android-phone-and-network/)
- [DebugBear — Next.js Image Optimization: The next/image Component](https://www.debugbear.com/blog/nextjs-image-optimization)
