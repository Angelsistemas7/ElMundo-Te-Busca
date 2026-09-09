# Accesibilidad y performance

> Investigación pura — no se tocó código. Dos frentes: (1) si el patrón
> "cascarón + Suspense" que ya se aplicó a las 8 páginas de listado (Inicio,
> Comunidad, Ayuda, Se busca, Hospitales, Mascotas, Denuncias, Caravanas,
> Voluntarios) también hace falta en las páginas de ficha individual y en la
> capa de datos; (2) si el sitio es usable para el público real —familiares
> de todas las edades, muchos con baja alfabetización digital, buscando bajo
> estrés— según WCAG 2.2 AA.

## Resumen ejecutivo

Las **4 páginas de ficha individual** (`persona/[id]`, `ayuda/[id]`,
`hospitales/[id]`, `caravanas/[id]`) tienen exactamente el mismo problema que
tenían los listados antes de la corrección reciente: `force-dynamic` sin
`Suspense` interno, así que la página entera —incluyendo el `BackLink` y el
encabezado que no dependen de datos— espera a que resuelvan varias consultas
en cascada antes de pintar nada; aplica el mismo patrón de solución ya
probado. En `src/lib/data.ts`, `getPatientCounts()` (línea 4252) es el único
hueco de caché entre las funciones "calientes" de listado: hace un `select`
sin filtrar sobre toda la tabla `hospital_patients` en cada carga de
`/hospitales`, sin `unstable_cache`, a diferencia de sus vecinas
(`getHospitals`, `getAidPoints`, etc.) que sí llevan 60s. No hay
`@next/bundle-analyzer` instalado; se puede añadir sin afectar producción con
la variable `ANALYZE=true`. PPR sigue marcado experimental por Next.js
oficialmente y no se recomienda para producción en 2026; el React Compiler
es una mejora de bajo riesgo pero de beneficio menor en una app ya con poco
JS de cliente. En accesibilidad: el foco visible y `prefers-reduced-motion`
ya están cubiertos globalmente en `globals.css`, pero **`text-brand-600`
sobre blanco (y su inverso, texto blanco sobre `bg-brand-600`) da un
contraste de ~4.05:1, por debajo del 4.5:1 que exige AA para texto normal**
—se usa en botones y enlaces reales del sitio (ver §7); no hay suite de
pruebas automatizadas (ni Playwright ni axe-core) en el repo todavía.

---

## Frente 1 — Arquitectura y performance

### 1. Fichas individuales: mismo problema de "cascarón sin Suspense"

Confirmado con evidencia directa. Las 4 páginas de ficha:

| Página | Archivo | `force-dynamic` | `Suspense` interno |
|---|---|---|---|
| Persona | `src/app/persona/[id]/page.tsx:25` | Sí | **No** |
| Punto de ayuda | `src/app/ayuda/[id]/page.tsx:19` | Sí | **No** |
| Hospital | `src/app/hospitales/[id]/page.tsx:16` | Sí | **No** |
| Caravana | `src/app/caravanas/[id]/page.tsx:19` | Sí (no leído en detalle, mismo patrón por grep) | **No** |

Ejemplos del bloqueo en cascada:

- `src/app/persona/[id]/page.tsx:29-43` — `await getPersonById(id)` primero
  (bloquea todo, incluida la notícia 404), luego `Promise.all([getComments,
  getStatusReports])`, y **después** un tercer `await getCurrentUser()` +
  `await getMyPublications(user.id)` en serie (no está en el `Promise.all`)
  solo para decidir si ocultar el botón "Guardar". Todo esto —4-5 idas y
  vueltas a la BD, una de ellas encadenada— corre antes de que el navegador
  reciba un solo byte de HTML útil. El usuario ve pantalla en blanco (no hay
  fallback) durante todo ese tiempo.
- `src/app/ayuda/[id]/page.tsx:23-30` y `src/app/hospitales/[id]/page.tsx:20-26`
  — mismo patrón: `await getXById` seguido de `Promise.all` con 2-4 consultas
  más, todo bloqueante, sin ningún fallback visual.

El patrón que ya corrigió los listados (ver `src/app/hospitales/page.tsx:56-58`,
comentario: *"todo lo que depende de datos, separado del cascarón... para
que ese cascarón aparezca de inmediato al navegar"*, y `src/app/page.tsx:19-31`
con `Suspense` por sección) **aplica igual de bien aquí**, con una diferencia
importante: en una ficha, el dato principal (`person`/`point`/`hospital`) es
necesario para decidir `notFound()` y para el `<h1>` mismo, así que no puede
diferirse tan limpiamente como en un listado (donde el cascarón —encabezado,
filtros— no depende de ningún dato). La forma natural de aplicar el mismo
principio aquí es:

1. `await getPersonById(id)` se queda arriba (es indispensable para el
   `notFound()` y el `<h1>` — no tiene sentido mostrar un esqueleto de nombre
   antes de saber si existe el registro).
2. Todo lo secundario que hoy retrasa el primer pintado —comentarios,
   reportes de estado, `isOwner` (que hoy hace **dos** llamados en serie,
   `getCurrentUser` + `getMyPublications`, solo para un botón)— se mueve a un
   componente async aparte envuelto en `<Suspense>`, con un esqueleto que
   imite el layout real (mismo patrón que `HomeSkeletons.tsx` / `ListSkeletons.tsx`
   ya usados en los listados).

Esto no es solo teórico: `getMyPublications` (línea 2853) trae **todas** las
publicaciones del usuario para filtrar una sola en memoria
(`mine.some(p => p.type === "person" && p.id === person.id)`,
`persona/[id]/page.tsx:43`) — una consulta potencialmente cara que bloquea el
render solo para ocultar/mostrar un botón "Guardar". Es la mejor candidata a
mover dentro de un `Suspense` propio (o incluso a resolverse en el cliente
tras el primer pintado).

**Prioridad:** media-alta. No es tan crítico como en los listados (una
ficha ya trae la mayoría de sus datos con la primera consulta), pero
`persona/[id]` es la página que ve un familiar angustiado justo al hacer clic
desde "Se busca" — cada segundo de pantalla en blanco ahí pesa más que en
cualquier otra ruta del sitio.

### 2. Caché en `src/lib/data.ts`: un hueco real

La mayoría de las funciones de lectura "caliente" (las que ve cualquier
visitante sin publicar nada) están cacheadas 60s con `unstable_cache`,
aisladas por país con el helper `perCountryCache` (línea 498-507):

- `getDashboardStats` (517-524), `getRecentlyLocated` (585-592),
  `getFeaturedPersons` (622-633), `getPersonsWithLocation` (659-666),
  `getAidPoints` (1524-1525 — confirmado por grep), `getMarches` (1867),
  `getVolunteers` (3521), `getHeroes` (3730), `getNewsItems` (~3869-3873),
  `getHospitals` (3993-3996).

**`getPatientCounts()` (línea 4252-4264) es la excepción**: no usa
`unstable_cache`, y hace `sb.from("hospital_patients").select("hospital_id")`
**sin ningún filtro** — trae la tabla de pacientes completa (de todos los
hospitales, de todos los países) en cada carga para contarlos en JS. Se
invoca en `src/app/hospitales/page.tsx:82`, dentro de `Promise.all` junto a
`getHospitalsPage` (que sí está paginada) y `getHospitals` (que sí está
cacheada). Ya está dentro del `Suspense` de `HospitalesContent` (línea 59,
comentario confirma el mismo patrón que Comunidad/Ayuda/Se busca), así que
**no** rompe el cascarón — pero sí golpea la base de datos sin caché en cada
visita a `/hospitales`, y escala mal: cuantos más hospitales y pacientes
tenga el sitio, más fila trae sin necesidad (solo hacen falta los conteos por
hospital de la página actual, 10-50 filas, no todos los pacientes de todo el
país).

`getComments`, `getHospitalPatients`, `getAidPointById`, `getHospitalById`,
`getPersonById`, `getMyPublications` no están cacheadas — correcto: son
consultas por id/entidad específica (no "listas calientes" compartidas por
todo el tráfico), cachearlas traería más riesgo de servir datos viejos que
beneficio.

**Recomendación:** envolver `getPatientCounts` en `unstable_cache` (60s,
mismo criterio que sus vecinas) y, más importante, filtrar por los hospitales
realmente mostrados en la página en vez de traer la tabla completa —o al
menos por país— antes de que crezca el volumen de pacientes.

### 3. `@next/bundle-analyzer`

No está instalado (no aparece en `package.json`). Integración estándar que
no afecta el build de producción normal, en `next.config.ts`:

```ts
import withBundleAnalyzer from "@next/bundle-analyzer";

const bundleAnalyzer = withBundleAnalyzer({
  enabled: process.env.ANALYZE === "true",
});

export default bundleAnalyzer(nextConfig);
```

Se activa solo con `ANALYZE=true npm run build` (genera `client.html`,
`nodejs.html`, `edge.html` en `.next/analyze/`); en cualquier otro build
(incluido `npm run start` en producción, que también carga `next.config.ts`)
la variable está ausente y el plugin queda inerte. Vale la pena envolver el
`require`/`import` con el chequeo de entorno tal como documenta el propio
paquete, para no pagar ni el costo de análisis en CI/producción normal.

Sobre el JS compartido: una nota de sesión previa menciona ~103kB de First
Load JS compartido, pero no se encontró esa cifra documentada en el repo
(ni en `docs/`, ni derivable de `package.json` sin correr el build) — se cita
aquí como referencia no verificada, no como hecho confirmado en código. Con
el analyzer instalado, lo razonable a vigilar primero son: `leaflet` +
`react-leaflet` (ya cargado `next/dynamic({ssr:false})` en `CrisisMap.tsx`,
correcto, pero confirmar que **todas** las páginas con mapa —incluida la
`MiniMap` de `persona/[id]/page.tsx:176`— realmente code-splittean y no se
cuelan en el bundle compartido) y `lucide-react` (import granular ya
correcto vía ES modules, pero fácil de romper si alguien importa el paquete
completo por accidente).

### 4. Optimizaciones Next.js 15 / React 19 (2025-2026) — evaluación honesta

- **Partial Prerendering (PPR):** sigue **experimental** según la
  documentación oficial de Next.js 15 y no se recomienda para producción; es
  opt-in por página/layout (`experimental_ppr = true`). Para este sitio,
  donde *todas* las páginas relevantes ya están en `force-dynamic` por
  necesidad real (datos en vivo, país activo, sesión), PPR aportaría poco
  hoy y añade una superficie experimental a un sitio de emergencia civil ya
  en producción — **prematuro**, no recomendado mientras siga marcado
  experimental.
- **React Compiler:** memoiza automáticamente sin `useMemo`/`useCallback`
  manuales. Beneficio real pero acotado aquí: el sitio ya usa Server
  Components de forma amplia (la mayoría de páginas son `async function` de
  servidor) y el JS de cliente parece limitado a componentes interactivos
  puntuales (mapas, formularios, botones de voto). Es una mejora de **bajo
  riesgo, bajo esfuerzo, beneficio modesto** — razonable probarla en un
  branch aparte cuando haya tiempo, no urgente.
- **`unstable_cache` → `"use cache"` (Cache Components):** Next.js está
  migrando hacia la directiva `"use cache"` como reemplazo de
  `unstable_cache`/`revalidate` de ruta; sigue marcada experimental en la
  rama estable de Next 15. El patrón actual con `unstable_cache` +
  `perCountryCache` es correcto y estable para hoy; no hay urgencia de migrar
  mientras la nueva API no salga de experimental.
- **`next/dynamic` para code-splitting de componentes pesados:** ya en uso
  (`CrisisMap.tsx`, `RegisterHospitalButton` en `hospitales/page.tsx:11-13`).
  Buena práctica ya aplicada, vale la pena auditar (con el bundle analyzer de
  §3) si falta en algún otro componente pesado no diferido todavía.

---

## Frente 2 — Accesibilidad

### 5. Checklist WCAG 2.2 AA — relevancia específica para este sitio

| Criterio | Estado observado | Evidencia |
|---|---|---|
| **1.4.3 Contraste (texto normal, 4.5:1)** | ⚠️ Falla en `brand-600` | Ver §7 |
| **1.4.11 Contraste de componentes no textuales (3:1)** | Parece cumplirse en general (bordes, iconos) — no auditado exhaustivo | — |
| **2.4.7 Foco visible** | ✅ Cubierto globalmente | `globals.css:118-123`, `:focus-visible { outline: 2px solid var(--color-brand-600); ... }` — nota: el propio color de foco (brand-600) es el que falla contraste de texto; como *outline* sobre fondos claros normalmente pasa 3:1 (component contrast), pero vale revisarlo contra fondos claros específicos. |
| **2.3.3 / 2.3.1 Animación** | ✅ Cubierto | `globals.css:127-138`, `@media (prefers-reduced-motion: reduce)` apaga animaciones, pulsos del mapa y scroll suave. |
| **2.5.8 Tamaño de objetivo táctil (mínimo 24×24 CSS px, AA)** | ⚠️ Riesgo puntual | El control de capas de Leaflet se agranda explícitamente a propósito (`globals.css:368-386`, comentario propio: *"pensadas para mouse (muy pequeñas para tocar con el dedo)... se agranda el área de toque"* — ya resuelto ahí). No se auditó sistemáticamente cada botón/ícono suelto del resto del sitio (ej. iconos de `lucide-react` sin padding explícito) contra el mínimo de 24×24; dado el público (personas mayores, bajo estrés, en móvil), conviene una pasada dedicada. |
| **1.1.1 Alternativas textuales en fotos de personas** | ✅ Correcto y sensible | `src/components/PersonPhoto.tsx:33` — `alt` es solo `"${firstName} ${lastName}"` o `"Persona"` si no hay nombre; **no describe apariencia física**, evita cualquier alt insensible (edad, condición, vestimenta). Comportamiento ya adecuado, no requiere cambio. |
| **1.4.4 Redimensionar texto (hasta 200%)** | No auditado — Tailwind usa unidades `rem`/`text-*` relativas por defecto, buen punto de partida, sin verificación visual real. | — |
| **2.4.6 Encabezados y etiquetas descriptivas** | Parece cumplirse por convención del código (`<h1>`, `<h2>` consistentes en las fichas revisadas) — no auditado el resto del sitio. | — |
| **3.3.2 Etiquetas en formularios** | No auditado en este pase (fuera del alcance de lo revisado: `FormControls`, `Field/Input/Select`). | — |

### 6. Herramientas de auditoría automatizada

**Estado actual: no hay ninguna.** El repo no tiene Playwright, Jest,
Vitest ni ningún framework de pruebas instalado (`package.json` no lista
`devDependencies` de testing; el único uso de Playwright en el repo es
`scripts/sync-legacy-sites/sync-venezuela.mjs`, un scraper, no una suite de
pruebas). Recomendación concreta y de bajo esfuerzo:

- **`@axe-core/playwright`**: si en algún momento se instala Playwright para
  pruebas E2E (razonable para un sitio con formularios críticos como
  registrar una persona desaparecida), añadir `@axe-core/playwright` es
  prácticamente gratis — un test por página clave (`/`, `/se-busca`,
  `/persona/[id]`, formulario de registro) que falla el build si hay
  violaciones nuevas. Límite honesto a tener presente: las herramientas
  automatizadas (axe, Lighthouse) **detectan ~30-40% de las violaciones
  reales de WCAG**; no reemplazan una revisión manual con teclado y lector
  de pantalla, solo atrapan la fruta más baja (contraste, `alt` faltante,
  etiquetas ARIA mal formadas) de forma continua.
- **Lighthouse CI**: útil como termómetro amplio en cada PR (accesibilidad +
  performance en un solo número), pero no debería ser el único gate — es
  complementario a axe-core, no sustituto.
- Dado que hoy no existe ninguna suite, la recomendación de menor esfuerzo
  inmediato (sin instalar nada) es correr la extensión de navegador
  **axe DevTools** o **Lighthouse** (ya integrado en Chrome DevTools, cero
  instalación) manualmente sobre las páginas más visitadas
  (`/`, `/se-busca`, `/persona/[id]`, `/ayuda`) antes de invertir en
  automatización en CI.

### 7. Contraste de los colores de marca (`globals.css:3-39`) — cálculo verificado

Valores hex leídos directamente de `@theme` en `src/app/globals.css`.
Fórmula WCAG estándar (luminancia relativa sRGB) aplicada a los dos tonos que
efectivamente se usan como **color de texto/fondo interactivo** en el código
(confirmado por grep: `text-brand-600` en 7 archivos, `bg-brand-600` en 5;
`text-brand-700` se usa en enlaces de contacto de las fichas ya leídas):

| Combinación | Hex | Ratio calculado | AA texto normal (4.5:1) | AA texto grande / UI (3:1) |
|---|---|---|---|---|
| `brand-600` (`#b96a3a`) sobre blanco | texto o fondo | **≈4.05:1** | ❌ No pasa | ✅ Pasa |
| `brand-700` (`#9c552e`) sobre blanco | texto | **≈5.59:1** | ✅ Pasa | ✅ Pasa |

`brand-600` está a un margen visible del mínimo AA (4.05 vs. 4.5 requerido)
— no es un fallo marginal de redondeo. Se usa como `text-brand-600` en
`OnboardingTour.tsx`, `CountryIntroModal.tsx`, `FaqAccordion.tsx`,
`emergencias/page.tsx`, `PullToRefresh.tsx`, `AccountBanner.tsx`,
`RecognizeDeck.tsx`, y como `bg-brand-600` (texto blanco encima, mismo ratio
por simetría de la fórmula) en `HomeHero.tsx`, `FaqAccordion.tsx`,
`map/LocationPicker.tsx`, `ManagerRequestForm.tsx`, `voluntarios/guia/page.tsx`.
Si ese texto es de tamaño normal (la mayoría de botones/enlaces del sitio
rondan 14-16px regular o semibold, por debajo del umbral de "texto grande"
de WCAG —18px normal o ~18.7px negrita—), **no cumple AA**. Donde el mismo
color se usa solo como fondo de botón con texto en negrita ≥14pt o como
borde/ícono decorativo (no como texto en sí), el criterio aplicable es el de
3:1 (componentes de UI, 1.4.11), que sí se cumple.

**Recomendación concreta:** para texto de tamaño normal sobre fondo blanco
(enlaces, texto en botones pequeños), usar `brand-700` en vez de `brand-600`
—ya es el tono usado correctamente en los enlaces de contacto de las fichas
(`text-brand-700` en `persona/[id]/page.tsx:102`, `ayuda/[id]/page.tsx:121`,
`hospitales/[id]/page.tsx:83`)—. Es un cambio de una clase Tailwind por
ocurrencia, sin rediseño, y no toca el `--color-brand-500`/`400` que sí son
para uso decorativo (fondos grandes, ilustraciones), donde el contraste de
texto no aplica igual.

---

## Prioridad recomendada (ambos frentes, combinada)

1. **`brand-600` → `brand-700` en texto/botones de tamaño normal** (§7):
   esfuerzo mínimo, impacto directo en legibilidad para el público objetivo
   (personas mayores, luz solar en móvil, estrés).
2. **Suspense en `persona/[id]/page.tsx`** (§1): la ficha de mayor tráfico
   emocional del sitio; separar `getComments`/`getStatusReports`/`isOwner`
   del render inicial.
3. **Cachear `getPatientCounts`** (§2): esfuerzo trivial (mismo patrón que
   ya existe 9 veces en el archivo), evita un full-scan de tabla en cada
   carga de `/hospitales`.
4. **Suspense en `ayuda/[id]`, `hospitales/[id]`, `caravanas/[id]`** (§1):
   mismo patrón, menor urgencia que persona por ser fichas de recursos, no
   de personas.
5. **`@next/bundle-analyzer`** (§3): correr una vez para tener una línea
   base real (reemplazar el dato de "103kB" no verificado) antes de decidir
   si hace falta actuar sobre el bundle.
6. **Auditoría manual con axe DevTools/Lighthouse** (§6): sin instalar nada,
   sobre las 4-5 páginas de más tráfico, antes de invertir en CI.
7. **PPR y React Compiler**: no actuar todavía — PPR sigue experimental,
   React Compiler es de bajo impacto dado el uso ya amplio de Server
   Components.

---

## Fuentes

- [Getting Started: Partial Prerendering | Next.js](https://nextjs.org/docs/15/app/getting-started/partial-prerendering)
- [Next.js 15 Partial Prerendering: Real-World Patterns and Tradeoffs](https://wolf-tech.io/blog/nextjs-15-partial-prerendering-real-world-patterns-and-tradeoffs)
- [Partial Prerendering (PPR) in Production: Architecture Patterns (2026 Edition)](https://samcheek.com/blog/nextjs-partial-prerendering-production-2026)
- [@next/bundle-analyzer - npm](https://www.npmjs.com/package/@next/bundle-analyzer)
- [How to analyze bundle size in Next.js | Codevup](https://codevup.com/issues/2026-04-02-nextjs-bundle-analyzer-setup/)
- [WCAG 2.5.8 Target Size (Minimum): Complete Implementation Guide - AllAccessible](https://www.allaccessible.org/blog/wcag-258-target-size-minimum-implementation-guide)
- [Target Size (Minimum) — WCAG 2.2 SC 2.5.8 (AA) | wcag22aa.org](https://wcag22aa.org/new-criteria/target-size/)
- [Add Accessibility Checks to Playwright Tests with Axe (Checkly)](https://www.checklyhq.com/blog/integrating-accessibility-checks-in-playwright-tes/)
- [Automated Accessibility Testing with axe-core, Playwright & GitHub Actions](https://rishikc.com/articles/accessibility-testing-ci-integration/)
- [Playwright Accessibility Testing: What axe and Lighthouse Miss | David Mello](https://www.davidmello.com/software-testing/test-automation/playwright-accessibility-testing-axe-lighthouse-limitations)
