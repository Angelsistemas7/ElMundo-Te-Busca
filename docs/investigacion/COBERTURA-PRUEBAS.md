# Cobertura de pruebas — estado, arnés instalado y mapa de riesgo

Investigación y trabajo de 2026-08-27. Punto de partida: **el repositorio no tenía
ningún framework de pruebas**. Verificado en `package.json` antes de tocar nada: no
había script `test`, ni Vitest, ni Jest, ni Playwright, ni `jsdom`, ni ninguna
herramienta de cobertura entre `dependencies`/`devDependencies` (el único script
adicional era `fetch:social`). Esto ya estaba señalado como riesgo alto en
[`07-observabilidad-testing.md`](07-observabilidad-testing.md) ("deploy va directo a
producción sin ningún test").

Resultado de este trabajo: **178 pruebas unitarias reales en 12 archivos**, todas en
verde en local y en CI, un workflow de GitHub Actions que las corre en cada PR, y
**un bug real de producción encontrado por las pruebas y corregido** (desplazamiento
de coordenadas en el mapa, ver hallazgo 1).

Prioridad de cada hallazgo: **Crítico** / **Alto** / **Medio** / **Bajo**.

---

## 1. Arnés de pruebas elegido: Vitest 4 + cobertura V8 (+ jsdom solo donde hace falta)

### Qué se instaló

```json
"devDependencies": {
  "@vitest/coverage-v8": "4.1.11",
  "jsdom": "26.1.0",
  "vitest": "4.1.11"
}
```

```json
"scripts": {
  "test": "vitest run",
  "test:watch": "vitest",
  "test:coverage": "vitest run --coverage"
}
```

Versiones **fijas** (sin `^`, instaladas con `--save-exact`) y publicadas hace más de
7 días, según la política del repositorio para dependencias nuevas.

### Por qué Vitest y no Jest

1. **Cero configuración de transpilación para TypeScript + ESM.** El proyecto es
   TypeScript con `"module": "esnext"` y `moduleResolution: "bundler"`
   (`tsconfig.json`). Vitest usa Vite/esbuild y consume TS y ESM tal cual. Jest
   necesitaría `ts-jest` o `babel-jest` más configuración de `extensionsToTreatAsEsm`
   y mapeo manual de rutas — más piezas que mantener para el mismo resultado.
2. **Alias `@/*` con una línea.** El código importa siempre `@/lib/...`; en Vitest se
   resuelve con un `resolve.alias`. En Jest haría falta duplicar los `paths` del
   tsconfig en `moduleNameMapper`.
3. **Cobertura incluida y nativa** (`@vitest/coverage-v8`), sin instrumentación
   adicional: usa la cobertura del propio V8.
4. **Entorno por prueba.** Casi toda la lógica útil de `src/lib` es Node puro; solo
   `image.ts` necesita DOM (canvas, `createImageBitmap`). Vitest permite pedir DOM
   archivo por archivo con `// @vitest-environment jsdom`, así que **una sola** prueba
   paga el coste de jsdom y las otras 11 corren en Node (la suite completa tarda
   menos de 1 s).
5. **No arranca Next.** No se necesita `next/jest` ni levantar el servidor: se prueba
   lógica pura, sin red ni base de datos, que es exactamente lo que pedía el alcance.

Lo que **no** se instaló, a propósito: React Testing Library / Playwright. Probar la
UI implica React 19 + Server Components + Leaflet + Turnstile; es otro proyecto en
sí (ver hallazgo 8) y habría multiplicado las dependencias sin cubrir la lógica que
de verdad decide si una persona aparece o no en un listado.

### Detalles de configuración que hubo que resolver (y por qué)

`vitest.config.mts` — **extensión `.mts` a propósito**: con `vitest.config.ts` el
cargador de configuración lo interpretaba como CommonJS y fallaba al requerir una
dependencia solo-ESM (`ERR_REQUIRE_ESM` en `std-env`). Con `.mts` se carga como ESM y
funciona sin tocar el `type` del `package.json` (cambiarlo habría afectado al build).

**Dobles de módulos de servidor** (`test/stubs/`): `data.ts` importa transitivamente
`server-only` y `next/headers` (`data.ts` → `auth.ts` → `ipLockout.ts`). El paquete
`server-only` está diseñado para reventar fuera del grafo de React Server Components
y `next/headers` necesita el almacén de la petición. Ambos se sustituyen por dobles
mínimos vía alias:

- `test/stubs/server-only.ts`: módulo vacío.
- `test/stubs/next-headers.ts`: `headers()` sobre un `Headers` que la prueba puede
  preparar con `__setHeaders(...)`, lo que permite probar de verdad la precedencia de
  cabeceras de `clientIp()` (`ipLockout.ts:9-15`), la clave de todos los frenos por
  fuerza bruta.

**`jsdom` fijado en 26.1.0, no en la última (30.x).** Con `jsdom@30.0.1` el worker de
Vitest no arrancaba: una dependencia transitiva (`@exodus/bytes` vía
`html-encoding-sniffer`) es solo-ESM y se cargaba por `require()`
(`Failed to start forks worker` → `ERR_REQUIRE_ESM`). 26.1.0 es la última línea que
funciona en este entorno y cubre de sobra lo que necesita `image.ts`. Queda anotado
como deuda menor: reevaluar al actualizar Node/Vitest.

---

## 2. Qué se cubrió

12 archivos en `test/`, 178 pruebas. Cobertura medida con `npm run test:coverage`
(ámbito `src/lib/**/*.ts`, excluyendo `seed.ts` y los hooks `use*.ts`):

| Módulo | Statements | Branches | Notas |
|---|---|---|---|
| `countries.ts` | 100 % | 100 % | resolución de país, fallback, listas |
| `geo.ts` | 100 % | 81 % | sectores, regiones, `jitter` (ver hallazgo 1) |
| `image.ts` | 100 % | 100 % | jsdom + dobles de canvas/`createImageBitmap` |
| `phone.ts` | 100 % | 100 % | normalización y validación por país |
| `rateLimit.ts` | 100 % | 91 % | ventana fija, poda, aislamiento de claves |
| `socialEmbed.ts` | 100 % | 100 % | detección/normalización de enlaces |
| `validation.ts` | 97,7 % | 100 % | zod, `superRefine`, `isSafePhotoUrl` |
| `utils.ts` | 97 % | 100 % | WhatsApp, fechas, distancias, textos |
| `ipLockout.ts` | 100 % | 94 % | `clientIp` + bloqueo por intentos |
| `data.ts` (rama memoria) | 21,7 % | 19,4 % | ver más abajo: el 78 % restante es la rama Supabase |
| `news.ts` | 17 % | 13 % | solo `getWorldPress`; ver hallazgo 6 |

El total global (23,3 % de sentencias sobre `src/lib`) **no** es la cifra a mirar: está
diluido por los módulos que son puro acceso a red o a Supabase y que no se pueden
probar sin infraestructura (`auth.ts`, `admin.ts`, `upload.ts`, `turnstile.ts`,
`usgs.ts`, `ogImage.ts`, `savedStore.ts`, `myPubs.ts`, `viewTransition.ts`,
`types.ts` — que es solo tipos y constantes). Ver el mapa de riesgo (sección 3).

Casos borde cubiertos que importan de verdad para el producto:

- **Nombre obligatorio solo si `!isUnidentified`** (`validation.ts:97`, `superRefine`):
  se prueban las dos intenciones de publicación — "busco a una persona" (nombre
  exigido, el error cuelga de la ruta `firstName`) y "vi a una persona" (nombre
  opcional) — más el resto de campos opcionales, cédula con formato, edad fuera de
  rango, coordenadas fuera de rango, correo inválido y `isSafePhotoUrl`.
- **Teléfonos y países inválidos**: prefijos ajenos al país, longitudes cortas/largas,
  caracteres no numéricos, país desconocido cayendo al predeterminado.
- **Límites de rate limit y de bloqueo por IP**: llamada N permitida y N+1 rechazada,
  reinicio al cambiar de ventana, un éxito limpia el contador, aislamiento entre
  claves, caducidad del bloqueo, poda del mapa, y precedencia de
  `CF-Connecting-IP` > `X-Forwarded-For`(primer valor) > `X-Real-IP` > `unknown`.
- **Deduplicación de votos de consenso** (`data.ts:1797-1807` puntos de ayuda,
  `data.ts:4170-4180` hospitales): votar dos veces lo mismo no suma; cambiar el voto
  resta del contador anterior y suma al nuevo; cuentas distintas suman
  independientemente; votar un recurso no afecta a otro; el consenso **no** toca la
  disponibilidad oficial; votar un id inexistente no lanza.
- **Paginación y filtros de la rama en memoria** (`data.ts:241`, `queryMemoryPersons`
  y equivalentes de puntos de ayuda, hospitales y posts): página fuera de rango
  devuelve lista vacía manteniendo `total`, separación estricta por país, filtros
  `unidentifiedOnly` / `excludeUnidentified` / `unresolvedOnly` / estado / género /
  causa / hospitalizados, rangos de edad y de fecha inclusivos, búsqueda por nombre,
  apellido, cédula, región y ubicación, radio geográfico, y todos los ordenamientos
  (nombre, región, distancia, recientes, populares) incluida la ventana de prioridad
  del desastre.
- **Autoría y duplicados de personas**: token de gestión emitido y verificado,
  rechazo de token cruzado o inválido, detección de duplicado por cédula, por hash de
  foto y por nombre, edición/borrado por el autor, reportes de terceros que quedan
  "sin verificar" sin cambiar el estado oficial.
- **`getWorldPress`** (`news.ts`): parseo del RSS, CDATA y entidades XML, quitar el
  sufijo " - Medio" solo si coincide con la fuente, descarte de lo que no habla del
  país activo, descarte de redes sociales, deduplicación por enlace, límite, y
  degradación a lista vacía cuando la API responde mal o falla (con `fetch` doblado:
  **ninguna prueba sale a la red**).

---

## 3. Mapa de riesgo: qué quedó SIN cubrir y por qué

### 3.1 Server Actions (`src/app/actions.ts`) — riesgo **Alto**, sin cubrir

Es donde se juntan validación zod, Turnstile, rate limit, autoría y escritura. No se
cubre porque cada acción llama a `revalidatePath`, `cookies()`/`headers()` y
`verifyTurnstile`, es decir depende del contexto de petición de Next y de una llamada
HTTP a Cloudflare. Para cubrirlo haría falta: dobles de `next/cache` y
`next/headers`, un doble de `verifyTurnstile` (o las claves de prueba oficiales de
Turnstile) y un doble de la capa de datos. Es viable con Vitest sin infraestructura
nueva, y es el siguiente paso de mayor valor: hoy la lógica de "quién puede cambiar
el estado oficial de una persona" solo está probada en la capa de datos, no en la
frontera pública.

### 3.2 Rama Supabase de `data.ts` — riesgo **Alto**, sin cubrir

Aproximadamente el 78 % de `data.ts` es la rama con credenciales: consultas
encadenadas del cliente de Supabase y los mapeadores `rowToX(row)` de snake_case a
camelCase. No se cubre porque exige o un doble muy fiel del constructor de consultas
(frágil: pasaría con dobles y fallaría en producción, el peor tipo de prueba) o una
base real. Para cubrirlo de forma útil: **Supabase local con Docker** (`supabase
start`) más `supabase/schema.sql`, y pruebas de integración en un job de CI separado
del rápido. Riesgo concreto que hoy nadie vigila: una divergencia entre
`supabase/schema.sql`, `types.ts` y los mapeadores solo se detecta en producción.
Atenuante: los mapeadores no tienen ramas condicionales complejas y el `build`
verifica los tipos.

### 3.3 UI y componentes — riesgo **Medio**, sin cubrir

React 19 con Server Components, Leaflet cargado solo en cliente, Turnstile y
`localStorage` para dedup por dispositivo. Cubrirlo bien requiere Playwright (flujo
real de navegador, con las claves de prueba de Turnstile), no pruebas unitarias de
componentes: el valor está en el camino crítico completo (publicar una persona →
verla en el listado → cambiar su estado con el enlace de gestión). Ese smoke test ya
está diseñado en [`07-observabilidad-testing.md`](07-observabilidad-testing.md); este
PR deliberadamente no lo incluye para no mezclar arneses ni alargar el despliegue.

### 3.4 Integraciones externas — riesgo **Medio**, cubierto solo en parte

`turnstile.ts`, `upload.ts` (Storage), `usgs.ts`, `emergency.ts`, `ogImage.ts` y las
fuentes GDELT/GNews/OpenAI de `news.ts` hablan con servicios de terceros. Probarlas
con `fetch` doblado, más allá de lo hecho con `getWorldPress`, tiene valor decreciente
(se acaba probando el doble). Lo que sí conviene verificar es la **degradación**: que
un fallo externo nunca tumbe la página. En `news.ts` eso ya está probado; en el resto
está por hacer.

---

## 4. Hallazgos priorizados

### Hallazgo 1 — `geo.ts:108-120`: el desplazamiento de coordenadas iba en sentido contrario — **Alto** — ARREGLADO

`jitter()` separa registros que comparten la misma ubicación aproximada para que no
queden apilados en el mapa. El hash se acumula con `| 0`, es decir un entero de 32
bits **con signo**, y en JavaScript el resto de un número negativo también es
negativo:

```ts
let h = 0;
for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
const dx = ((h % 100) / 100 - 0.5) * 0.01;      // antes
const dy = -(((h >> 8) % 100) / 100) * 0.006;   // antes
```

Con un hash negativo (aproximadamente la mitad de las semillas), `dy` se volvía
**positivo**: el marcador se desplazaba al norte en vez de al sur. Para la zona más
afectada (La Guaira, franja costera) el norte es **mar abierto**: un registro podía
dibujarse dentro del Caribe. Además `dx` salía del rango previsto de ±0,005° y podía
llegar al triple (hasta ±0,015°), ~1,6 km de desviación lateral.

Corrección aplicada (una línea, sin cambiar el diseño ni el rango previsto):

```ts
const mag = Math.abs(h);
const dx = ((mag % 100) / 100 - 0.5) * 0.01;
const dy = -(((mag >> 8) % 100) / 100) * 0.006;
```

Lo encontró una prueba, no una lectura: `test/geo.test.ts` afirma que el resultado
nunca queda al norte del punto base y que se mantiene dentro del rango previsto.

### Hallazgo 2 — `npm run lint` no está configurado y no puede correr en CI — **Medio** — propuesta pendiente de decisión

`package.json` define `"lint": "next lint"`, pero no existe ninguna configuración de
ESLint en el repositorio (ni `.eslintrc*` ni `eslint.config.*`) ni ESLint entre las
dependencias. Ejecutarlo abre el asistente interactivo de Next ("How would you like
to configure ESLint?") y termina con código 1: en CI se quedaría colgado o fallaría
siempre. Además `next lint` está obsoleto y desaparece en Next 16.

No se implementa aquí porque instalar ESLint con la config estricta de Next sobre una
base de código ya escrita suele producir docenas de errores nuevos, y arreglarlos
tocaría media aplicación — justo lo contrario de "cambios mínimos" en un repositorio
que está a punto de publicarse. Propuesta: en un PR aparte, `eslint` +
`eslint-config-next` con la config **Base** (no Strict), migrando a la CLI de ESLint
(`npx @next/codemod next-lint-to-eslint-cli .`), y añadir el paso al workflow de
pruebas cuando esté en verde. Mientras tanto, el workflow de este PR corre
`typecheck` + pruebas, que es la parte que sí aporta señal hoy.

### Hallazgo 3 — La poda de `rateLimit.ts:12-16` e `ipLockout.ts:24-29` puede no liberar nada — **Medio** — propuesta pendiente de decisión

Ambas podas solo actúan cuando el mapa ya llegó a `maxTrackedKeys`, y solo borran
entradas **caducadas**. Bajo un pico real (o un ataque distribuido con muchas IP
activas al mismo tiempo) puede no haber ninguna entrada caducada que borrar: el mapa
sigue creciendo por encima del máximo y la poda se ejecuta en **cada** llamada,
recorriéndolo entero (O(n) por petición). Con 5.000 claves el coste es despreciable;
con cientos de miles, no.

No se cambia el comportamiento en este PR porque tocar un freno de fuerza bruta
justo antes de publicar es riesgoso y hay que decidir la política. Propuesta:
desalojar la entrada más antigua cuando tras la poda se siga por encima del máximo
(el mapa de JavaScript preserva el orden de inserción, así que es un `for...of` que
corta al primer elemento), y contabilizar cuántas veces ocurre. Nota de diseño ya
asumida en los comentarios del propio código: ambos limitadores son **por proceso**;
si algún día se corre más de una instancia de Node, el límite efectivo se multiplica
por el número de instancias. Hoy el despliegue es PM2 con un solo proceso
(`ecosystem.config.cjs`), así que es correcto — pero conviene recordarlo antes de
escalar horizontalmente.

### Hallazgo 4 — `validation.ts:51-61`: sin `NEXT_PUBLIC_SUPABASE_URL`, `isSafePhotoUrl` acepta cualquier subdominio de Supabase — **Bajo** — comportamiento intencional, documentado

El respaldo `PHOTO_HOST_FALLBACK_RE` (`validation.ts:39`) admite cualquier host
`*.supabase.co` / `*.supabase.in` cuando el proyecto no está configurado. En
producción la variable siempre está definida (se "hornea" en el build, ver
`deploy.yml`), así que se exige el host exacto y la ruta
`/storage/v1/object/public/photos/` sobre HTTPS. Queda cubierto por pruebas en ambos
modos para que un cambio futuro no relaje el caso configurado sin darse cuenta. No
requiere acción.

### Hallazgo 5 — La rama en memoria de `data.ts` no expone forma de reiniciarse — **Bajo** — propuesta pendiente de decisión

`mem` (`data.ts:132`) es un módulo con estado global y sin función de reinicio. Como
Vitest comparte el módulo entre pruebas del mismo archivo, las pruebas de listados
tuvieron que aislarse creando datos en un país sin semilla relevante (`co`) y
consultando por rangos de fecha exclusivos con temporizadores falsos. Funciona y no
toca código de producción, pero es más frágil de lo necesario. Propuesta: exportar un
`__resetMemoryStore()` usado solo por las pruebas (unas 5 líneas que reasignan los
arrays desde el seed). No se implementa aquí para no añadir superficie exportada a la
capa de datos sin que el dueño del repositorio lo apruebe.

### Hallazgo 6 — `news.ts`: la mayor parte de la lógica sigue sin cubrir — **Bajo** (deuda, no defecto) — pendiente

Solo se cubrió `getWorldPress`. `fetchFromGdelt`, `fetchFromGNews`, la traducción con
OpenAI, la caché en disco y `getVerifiedNews` no se exportan de forma probable de
manera aislada y dependen de variables de entorno, del sistema de archivos y de
peticiones en vuelo compartidas por país. Para cubrirlas: extraer las funciones puras
(normalización de artículo, coincidencia de país, `parseGdeltDate`) a un módulo
exportado y doblar el sistema de archivos. Es refactor, no arreglo: fuera del alcance
de este PR.

### Hallazgo 7 — El workflow de despliegue no ejecuta pruebas — **Medio** — parcialmente resuelto

`deploy.yml` va de `push` en `main` a producción con solo `npm run build`. Este PR
añade `.github/workflows/pruebas.yml` (typecheck + pruebas con cobertura en cada PR y
en cada rama que no sea `main`), lo que evita fusionar una regresión. **No** se
modifica `deploy.yml`: encadenar las pruebas antes del `rsync`/`pm2 reload` es una
decisión del dueño (añade minutos a un despliegue de emergencia). Propuesta:
añadir un `needs:` al job de despliegue una vez que el workflow de pruebas se haya
visto estable unos días.

### Hallazgo 8 — Nota sobre versiones de Node — **Bajo** — resuelto en CI

Vitest 4 exige Node >= 20.19 (o >= 22.12). `deploy.yml` usa `node-version: 20`, que
resuelve a la última 20.x y cumple, pero para no depender de eso el workflow de
pruebas fija `22.12.0`. Si alguien corre las pruebas en local con un Node 20 antiguo
y ve fallos raros del worker, esa es la causa.

---

## 5. Cómo correr todo

```bash
npm test              # 178 pruebas, ~1 s, sin red ni base de datos
npm run test:coverage # informe de texto + HTML en coverage/
npm run typecheck
npm run build         # verificación principal del proyecto
```

`npm run lint` sigue sin funcionar en este repositorio: ver hallazgo 2.
