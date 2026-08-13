# 08 — Accesibilidad y performance

Análisis nuevo (sin investigación previa en este archivo). Fecha: 2026-08-12.
Prioridad: Alta / Media / Baja. Cada hallazgo cita `archivo:línea`; cada
afirmación externa cita fuente.

---

## Alta

### A1. Fichas individuales sin `<Suspense>`: todo el fetch bloquea el primer render

Confirmado en las 4 fichas individuales — todas usan `export const dynamic =
"force-dynamic"` y hacen el fetch de datos **directo en el componente de
página**, sin ningún `<Suspense>` interno. El usuario ve pantalla en blanco
(o el `loading.tsx` genérico, si existe) hasta que termina la cascada
completa de peticiones, en vez de ver el cascarón (breadcrumb, layout) de
inmediato:

- `src/app/persona/[id]/page.tsx:25` (`dynamic`) — el `default export`
  (línea 27) hace `getPersonById` (30), luego `Promise.all` de comentarios +
  reportes (32-35), y **después, en serie**, `getCurrentUser()` (39) y
  `getMyPublications()` (42) solo para calcular `isOwner`. Es la cascada más
  larga de las 4: 1 fetch → 2 en paralelo → 2 más en serie, todo antes de
  devolver JSX.
- `src/app/ayuda/[id]/page.tsx:19` (`dynamic`) — `getAidPointById` (23) y
  luego `Promise.all` de 4 llamadas (25-30): comentarios, `canManageAidPoint`,
  `getPosts` y `getMarches()` (esta última trae **todas** las caravanas del
  sistema solo para filtrar por `aidPointId` en memoria, línea 31).
- `src/app/hospitales/[id]/page.tsx:16` (`dynamic`) — `getHospitalById` (20)
  y `Promise.all` de pacientes + comentarios (23-26).
- `src/app/caravanas/[id]/page.tsx:19` (`dynamic`) — `getMarchById` (23) y
  `Promise.all` de comentarios, `canManageMarch`, y opcionalmente
  `getAidPointById` (25-29).

**El patrón correcto ya existe en el código** — se aplicó recientemente a las
8 páginas de listado (Comunidad, Ayuda, Se busca, Hospitales, Mascotas,
Denuncias, Caravanas, Voluntarios). Ejemplo documentado en
`src/app/hospitales/page.tsx`:

- Se extrae **todo lo que depende de datos** a un componente `async` aparte
  (`HospitalesContent`, `src/app/hospitales/page.tsx:59-143`), con un
  comentario explícito sobre el motivo (líneas 56-58: *"todo lo que depende
  de datos, separado del cascarón (encabezado, filtros) para que ese
  cascarón aparezca de inmediato al navegar"*).
- El `default export` (`HospitalesPage`, línea 145) resuelve solo lo barato
  y **síncrono** (`searchParams`, país activo, arma `FILTER_FIELDS`) y
  devuelve de inmediato el cascarón: tabs, `PageHeader`, filtros, selector de
  tamaño de página — todo eso se pinta sin esperar datos.
- El componente pesado se envuelve en
  `<Suspense key={contentKey} fallback={<CardGridSkeleton variant="text" />}>`
  (línea 184), donde `contentKey` es un hash de los filtros/página
  (línea 164) — así, al cambiar de filtro, Suspense vuelve a mostrar el
  skeleton en vez de dejar la lista vieja congelada.
- El fallback (`CardGridSkeleton`) vive en `src/components/ListSkeletons.tsx:46`
  y ya está importado y listo para reusar.

**Fix propuesto** (idéntico para las 4 fichas): envolver el bloque de
`Promise.all` + JSX que depende de datos en una función `async` interna
(p. ej. `PersonaContent`, `AidPointContent`, `HospitalContent`,
`CaravanaContent`), dejar en el `default export` solo el `await params` y el
`notFound()` temprano si aplica, y renderizar
`<Suspense fallback={<algo liviano>}>` alrededor. Nota importante para
`persona/[id]`: el `notFound()` (línea 30) depende de `getPersonById`, así
que ese primer fetch no puede moverse dentro del Suspense sin cambiar el
comportamiento de 404 — hay que decidir si el 404 se resuelve fuera del
Suspense (como ahora, aceptando que ese primer fetch sigue bloqueando) o se
maneja dentro del componente hijo. Las otras 3 fichas tienen el mismo caso
(`notFound()` atado al primer fetch): mismo trade-off.

Impacto: en conexión lenta desde el celular (perfil explícito de la mayoría
de usuarios de esta plataforma — familiares buscando a alguien), cada
segundo de pantalla en blanco antes de ver "algo" pesa mucho más que en un
sitio genérico.

### A2. `getPatientCounts()` sin `unstable_cache`

Confirmado: `src/lib/data.ts:4252` define

```ts
export async function getPatientCounts(): Promise<Record<string, number>> {
  const sb = getSupabase();
  ...
```

sin envolver con `unstable_cache`, a diferencia de sus vecinas directas en el
mismo archivo, p. ej. `getMarches` (`src/lib/data.ts:1867`:
`export const getMarches = unstable_cache(getMarchesImpl, ["marches"], { revalidate: 60 });`)
y `getVolunteers` (`src/lib/data.ts:3521`, mismo patrón). El propio
`HospitalesContent` en `src/app/hospitales/page.tsx:80-86` llama
`getPatientCounts()` en paralelo con `getHospitals(country)` — y el comentario
de esa misma línea 83-84 dice explícitamente *"Conteos del resumen por
estado: siempre sobre el total (**cacheada 60s**)"* refiriéndose a
`getHospitals`, dejando en evidencia que `getPatientCounts()` (la llamada de
al lado) se olvidó del mismo tratamiento. Es un `SELECT hospital_id FROM
hospital_patients` sin filtro (línea 4259) que se ejecuta en **cada** render
de la página de listado de hospitales y de cada ficha, sin necesidad —
los conteos de pacientes no cambian con esa frecuencia.

**Fix concreto:**

```ts
export const getPatientCounts = unstable_cache(
  getPatientCountsImpl,
  ["patient-counts"],
  { revalidate: 60 },
);
async function getPatientCountsImpl(): Promise<Record<string, number>> {
  const sb = getSupabase();
  if (!sb) {
    const counts: Record<string, number> = {};
    for (const p of mem.patients) counts[p.hospitalId] = (counts[p.hospitalId] ?? 0) + 1;
    return counts;
  }
  const { data, error } = await sb.from("hospital_patients").select("hospital_id");
  if (error) throw error;
  const counts: Record<string, number> = {};
  for (const r of data ?? []) counts[r.hospital_id] = (counts[r.hospital_id] ?? 0) + 1;
  return counts;
}
```

Ojo con la trampa que el propio código ya documentó en
`src/lib/data.ts:489-496` (el comentario sobre `getHospitalsByCountry` /
`makeImpl`): `unstable_cache` no distingue de forma confiable dos llamadas
con distintos argumentos si el argumento no va en `keyParts`. `getPatientCounts()`
no recibe argumentos (siempre trae todo), así que este caso es simple y no
necesita el patrón por-país — pero si en el futuro se le agrega un filtro
por país o por hospital, hay que replicar `makeCountryScoped` (o meter el
argumento fijo en `keyParts`) en vez de pasarlo como parámetro de la función
cacheada.

**Revalidación al escribir:** revisar que `addHospitalPatient`
(`src/lib/data.ts:4266`) dispare `revalidatePath` sobre `/hospitales` y
`/hospitales/[id]` en la Server Action correspondiente de `app/actions.ts`
(o que el `revalidate: 60` sea aceptable como margen de espera) — igual que
ya debe pasar para `getHospitals`.

---

## Media

### M1. Contraste de `brand-600` como texto: falla AA para texto normal

`brand-600` está definido en `src/app/globals.css:12` como
`--color-brand-600: #b96a3a;`.

Contraste calculado con la fórmula estándar WCAG (luminancia relativa por
canal sRGB → contraste `(L1+0.05)/(L2+0.05)`) contra blanco `#ffffff`:

- R=185, G=106, B=58 → luminancia relativa ≈ 0.2094
- Contraste = (1.0 + 0.05) / (0.2094 + 0.05) ≈ **4.05:1**

Esto **no pasa** el mínimo AA para texto normal (4.5:1) pero **sí pasa** para
texto grande (≥18pt / ≥14pt negrita → mínimo 3:1) y para componentes de UI /
gráficos no textuales (mínimo 3:1, criterio 1.4.11).

Grep de `brand-600` usado específicamente como color de **texto** (no fondo):

| Archivo:línea | Uso | ¿Es texto real? | ¿Contraste OK? |
|---|---|---|---|
| `src/components/OnboardingTour.tsx:520` | `<span className="text-[11px] font-bold uppercase ... text-brand-600">{stepIndex+1}/{steps.length}</span>` | **Sí** — texto real 11px sobre tarjeta blanca | **Falla** (11px < umbral de "texto grande"; necesita 4.5:1, tiene 4.05:1) |
| `src/components/AccountBanner.tsx:39` | ícono `<Sparkles>` | No (decorativo) | N/A — pero si algún día se usa como color de un ícono informativo solo, aplica 3:1 (pasa) |
| `src/app/emergencias/page.tsx:102` | ícono `<ExternalLink>` en `:hover` | No | N/A |
| `src/components/CountryIntroModal.tsx:111` | ícono `<Globe2>` | No | N/A |
| `src/components/FaqAccordion.tsx:82` | ícono `<ChevronDown>` | No | N/A |
| `src/components/OnboardingTour.tsx:534` | borde de spinner (`border-t-brand-600`), no texto | No | N/A |
| `src/components/PullToRefresh.tsx:73` | ícono `<RefreshCw>` | No | N/A |
| `src/components/RecognizeDeck.tsx:295` | ícono `<Info>` dentro de botón | No | N/A |

**Conclusión:** el único caso real de texto con `brand-600` es el contador de
pasos del onboarding (`"1/6"`, etc.), que en teoría es de bajo impacto (texto
corto, contexto claro por posición), pero técnicamente incumple 1.4.3
Contraste Mínimo. Fix más simple: usar `text-brand-700` (`#9c552e`,
`src/app/globals.css:13`) en vez de `brand-600` para ese `<span>` — o subir
el peso/tamaño a "texto grande" si se quiere conservar el tono exacto.

No se encontraron usos de `brand-600` como `bg-*` con texto blanco encima
fuera del alcance pedido (el usuario pidió explícitamente solo el caso de
texto, no fondo) — aunque vale anotar que varios botones usan
`hover:bg-brand-600` con `text-white` (p. ej. `src/components/HomeHero.tsx:173`,
`src/components/ManagerRequestForm.tsx:131`, `src/app/voluntarios/guia/page.tsx:68`);
el mismo cálculo de contraste (4.05:1) aplicaría a ese estado hover si se
audita fondo-sobre-texto en una pasada futura — no es el foco de este
hallazgo pero queda anotado para no repetir el cálculo.

### M2. WCAG 2.2 AA — criterios nuevos relevantes para este sitio

WCAG 2.2 se convirtió en recomendación W3C en 2023 y para 2026 es el
estándar de referencia en auditorías [W3C — WCAG 2.2](https://www.w3.org/TR/WCAG22/).
Los criterios nuevos de nivel A/AA más aplicables a un sitio con formularios
largos, mapa y tarjetas densas en información:

- **2.4.13 Focus Appearance (AA):** el indicador de foco debe tener grosor
  mínimo (perímetro de 2px CSS alrededor del componente) y contraste ≥3:1.
  El sitio ya define un foco global consistente en
  `src/app/globals.css:119-123` (`outline: 2px solid var(--color-brand-600)`,
  `outline-offset: 2px`) — el contraste de `brand-600` (#b96a3a) como
  **outline sobre fondos claros** cumple el 3:1 exigido para UI (calculado
  arriba: 4.05:1 sobre blanco, aún mayor sobre `--background: #f8fafc`), así
  que este criterio ya se cumple razonablemente. Revisar manualmente sobre
  fondos oscuros del sitio (navy) si el outline se ve ahí también.
- **2.5.8 Target Size Minimum (AA):** objetivos táctiles/clicables deben
  medir al menos 24×24px CSS (con excepciones: en línea de texto, o si hay
  equivalente más grande cerca). Relevante para esta plataforma porque el
  público usa mucho el celular. Vale una pasada puntual sobre íconos pequeños
  en tarjetas densas (p. ej. botones de "me gusta" o reacciones dentro de
  `CommentSection`/`PersonReactions`) para confirmar que el área de toque
  real (no solo el ícono visual) llega a 24px.
- **2.4.11 Focus Not Obscured – Minimum (AA):** el elemento con foco no debe
  quedar oculto por completo detrás de otro contenido (headers pegajosos,
  modales). Revisar `Modal.tsx` y cualquier barra fija (nav móvil) para
  confirmar que un `Tab` no deja el foco tapado.
- **2.5.7 Dragging Movements (AA):** si algo requiere arrastrar, debe existir
  alternativa de un solo puntero (tap/click). El selector de ubicación en
  mapa (`src/components/map/LocationPickerMap.tsx:60-72`) usa un marcador
  `draggable`, pero **ya tiene alternativa de un solo clic** — tocar/click en
  el mapa reposiciona el pin (`ClickCapture`, líneas 15-22, ligado a
  `useMapEvents({ click })`) — así que este punto **ya está cubierto**, no es
  un hallazgo, se documenta como verificación positiva.
- **3.3.7 Redundant Entry (A):** no pedir de nuevo un dato que el usuario ya
  dio en el mismo proceso (relevante para los formularios largos de
  registrar persona/hospital/punto de ayuda, si en algún paso se repite
  teléfono/nombre de contacto). No se detectó un caso concreto en esta
  pasada; queda como criterio a vigilar si se agregan más pasos a los
  formularios existentes.
- **3.2.6 Consistent Help (A):** si hay un mecanismo de ayuda (enlace a
  puntos de ayuda, WhatsApp de soporte, etc.), debe estar en el mismo lugar
  relativo en todas las páginas. Vale revisar si el enlace "Puntos de ayuda"
  agregado recientemente en la navegación aparece siempre en la misma
  posición.

Fuentes: [W3C — Web Content Accessibility Guidelines (WCAG) 2.2](https://www.w3.org/TR/WCAG22/),
[Level Access — WCAG 2.2 Checklist](https://www.levelaccess.com/blog/wcag-2-2-aa-summary-and-checklist-for-website-owners/),
[Deque University — WCAG 2.2 Updates](https://dequeuniversity.com/resources/wcag-2.2/).

### M3. `@next/bundle-analyzer` no está configurado

`next.config.ts` no envuelve `nextConfig` con ningún analizador; `package.json`
no lo tiene en `devDependencies`. Config exacta para agregarlo **sin afectar
el build de producción** (solo se activa con una variable de entorno, típico
de este paquete):

```bash
npm install --save-dev @next/bundle-analyzer
```

```ts
// next.config.ts
import type { NextConfig } from "next";
import withBundleAnalyzerInit from "@next/bundle-analyzer";

const withBundleAnalyzer = withBundleAnalyzerInit({
  enabled: process.env.ANALYZE === "true",
});

const nextConfig: NextConfig = {
  // ... configuración actual sin cambios
};

export default withBundleAnalyzer(nextConfig);
```

```json
// package.json — scripts
"analyze": "cross-env ANALYZE=true next build"
```

(o en PowerShell sin `cross-env`: `$env:ANALYZE="true"; npm run build`). Con
`enabled` condicionado a la variable, el build normal (`npm run build`,
Vercel, PM2 en el VPS) no se ve afectado en absoluto — el analizador solo
corre cuando se invoca explícitamente `npm run analyze`.

---

## Baja

### B1. Tamaño del JS compartido: 103 kB, confirmado con build real

Se corrió `npm run build` (producción, no dev) el 2026-08-12. Resumen real:

```
+ First Load JS shared by all    103 kB
  ├ chunks/1255-d3668eefd1b4a69b.js       46.1 kB
  ├ chunks/4bd1b696-100b9d70ed4e49c1.js   54.2 kB
  └ other shared chunks (total)            2.59 kB
```

El dato de **103 kB de una sesión anterior sigue siendo exacto** (coincide al
byte con este build). Es un tamaño razonable para una app Next 15 / React 19
con Tailwind v4 — está dentro del rango típico de un baseline de framework
(~90-120 kB) y no destaca como problema por sí solo.

Lo que sí vale la pena mirar (no es exactamente "JS compartido" pero es la
otra mitad de la foto): las fichas individuales sin Suspense (hallazgo A1)
cargan un **First Load JS por ruta** notablemente más alto que las páginas
simples: `/persona/[id]` 193 kB, `/hospitales/[id]` 190 kB, `/ayuda/[id]`
183 kB, `/caravanas/[id]` 182 kB — en el mismo rango que sus listados
correspondientes (`/hospitales` 192 kB, `/ayuda` 206 kB), así que el peso
extra viene sobre todo del mapa (Leaflet, cargado `next/dynamic({ssr:false})`
según `CLAUDE.md`) y no de código duplicado evidente. No se detectó una
dependencia sobredimensionada obvia en `package.json` (lista corta: Leaflet,
Supabase, lucide-react, zod, sharp — todas justificadas por la
funcionalidad). Confirmar con `npm run analyze` (M3) antes de optimizar a
ciegas.

Middleware: 90.6 kB — dentro de rango normal para Next 15 con lógica de
país/sesión.
