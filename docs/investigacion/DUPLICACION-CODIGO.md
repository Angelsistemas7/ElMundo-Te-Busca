# Duplicación de código: hallazgos, medición y plan

Investigación de los patrones repetidos en `src/app/actions.ts`, `src/lib/data.ts`,
las páginas de listado de `src/app/**`, los componentes de `src/components/**` y
los scripts de `scripts/`. Todas las referencias son `archivo:linea`; las líneas
de la parte **implementada** son las del código anterior a este PR, y las de las
**propuestas pendientes** son las del código actual (después de este PR).

Criterio de corte: se implementa solo lo mecánico y verificable (mismo texto,
mismo orden de comprobaciones, misma respuesta). Todo lo que cambie el
comportamiento visible, el contrato de una acción o el HTML que ve la gente
queda documentado abajo como propuesta pendiente de decisión, no ejecutado.

Resultado de este PR: **-366 / +183 líneas** en 20 archivos, con `npm run build`
y `npm run typecheck` en verde y sin un solo cambio de comportamiento.

---

## Resumen priorizado

| Prioridad | Hallazgo | Ocurrencias | Líneas | Estado |
| --- | --- | --- | --- | --- |
| Alto | Boilerplate de Server Actions: captcha, zod, enlace de gestión | 21 + 13 + 10 | ~120 | Implementado |
| Alto | `SearchParams` / `str` / `num` copiados en cada página | 13 + 13 + 8 | ~90 | Implementado |
| Medio | Filtros de listado en `data.ts` (fin de día, saneo de búsqueda, texto libre) | 16 + 6 + 7 | ~40 | Implementado |
| Medio | Botones de compartir con la misma Web Share API | 3 | ~45 | Implementado |
| Medio | Comprobación de sesión repetida en los votos comunitarios | 2 (de 4) | ~10 | Implementado |
| Crítico | Doble rama memoria/Supabase en las 8 funciones paginadas | 8 | ~400 | Propuesta |
| Alto | 12 mapeadores `rowToX` snake_case -> camelCase | 12 | ~250 | Propuesta |
| Alto | Envoltorio único para las acciones de formulario público | 13 | ~150 | Propuesta |
| Medio | Esqueleto de los botones "Registrar/Publicar X" (modal + foto + Turnstile) | 8 | ~250 | Propuesta |
| Medio | Bloque "Eliminar" de los paneles de gestión | 5 | ~90 | Propuesta |
| Medio | `likeX` y `deleteX` en `data.ts` | 6 + 6 | ~120 | Propuesta |
| Medio | Cascarón de las páginas de listado (Suspense, paginación, filtros) | 9 | ~200 | Propuesta |
| Bajo | `loadEnv()` copiado en cuatro scripts | 4 | ~40 | Propuesta |
| Bajo | `getXById` con la misma doble rama | 12 | ~60 | Propuesta |
| Bajo | Estados vacíos escritos a mano en vez de `EmptyState` | 4 | ~30 | Propuesta |

---

## Implementado en este PR

### 1. Boilerplate de las Server Actions (Alto)

`src/app/actions.ts` tenía tres bloques idénticos repartidos por sus 1.582 líneas:

- **Error de validación zod** (21 veces, 3 líneas cada una):
  `actions.ts:181`, `:199`, `:233`, `:258`, `:488`, `:565`, `:619`, `:671`, `:827`,
  `:867`, `:908`, `:975`, `:1011`, `:1060`, `:1126`, `:1181`, `:1282`, `:1333`,
  `:1382`, `:1491`, `:1571`.
- **Verificación de Turnstile** (13 veces, 4 líneas cada una):
  `actions.ts:171`, `:190`, `:463`, `:535`, `:599`, `:654`, `:734`, `:811`, `:853`,
  `:958`, `:1046`, `:1473`, `:1557`.
- **Validación del enlace privado de gestión** (10 veces):
  `actions.ts:894`, `:927`, `:944`, `:1166`, `:1197`, `:1314`, `:1351`, `:1366`,
  `:1400`, `:1438`.

Por qué importa: el mensaje al usuario y el orden de las comprobaciones estaban
copiados a mano. Cualquier corrección (un texto, un control anti-bot) había que
aplicarla en 13 sitios, y un olvido es un hueco de seguridad silencioso.

Corrección: tres helpers privados en el propio `actions.ts` —`invalidFields()`,
`captchaError()` y `ownerLinkError()`— más la constante `INVALID_OWNER_LINK`.
Devuelven exactamente el mismo objeto que antes, así que **ningún contrato de
acción cambia**: siguen retornando `{ ok: false, error, fieldErrors? }`.

No se tocó `verifyOwner` (personas) para fusionarlo con `verifyResourceOwner`
(recursos): son dos modelos de autorización distintos y mezclarlos sería un
riesgo de seguridad, no una limpieza. Solo comparten ahora el texto del error.

### 2. Lectura de parámetros de consulta en las páginas (Alto)

13 páginas declaraban el mismo tipo y las mismas dos funciones:

`se-busca/page.tsx:37`, `comunidad/page.tsx:32`, `ayuda/page.tsx:26`,
`hospitales/page.tsx:24`, `caravanas/page.tsx:22`, `mascotas/page.tsx:23`,
`denuncias/page.tsx:25`, `voluntarios/page.tsx:24`,
`persona/[id]/gestion/page.tsx:10`, `ayuda/[id]/gestion/page.tsx:10`,
`caravanas/[id]/gestion/page.tsx:10`, `mascotas/[id]/gestion/page.tsx:10`,
`comunidad/[id]/gestion/page.tsx:11`.

Corrección: `src/lib/searchParams.ts` con `SearchParams`, `str` y `num`. Las ocho
copias de `num` eran idénticas byte a byte salvo la de `se-busca`, que era
equivalente (`!s -> undefined`, luego `Number.isFinite`).

### 3. Filtros de los listados en `data.ts` (Medio)

Tres reglas repetidas en las ocho funciones paginadas:

- `` `${dateTo}T23:59:59.999Z` `` (fin de día inclusive), 16 veces.
- `search.replace(/[,()*]/g, " ").trim()` (saneo del `or(...ilike...)` de
  Supabase, donde coma y paréntesis son sintaxis), 6 veces.
- El bloque de búsqueda de texto en memoria
  (`[campos].filter(Boolean).join(" ").toLowerCase().includes(s)`), 7 veces.

Corrección: `endOfDay()`, `searchTerm()` y `matchesText()` como funciones
privadas de `data.ts` (`src/lib/data.ts:190-205`). Son puras y sustituyen
expresiones idénticas; las dos ramas (memoria y Supabase) siguen intactas, como
exige `CLAUDE.md`.

### 4. Botones de compartir (Medio)

`PersonShareButton.tsx:34`, `PetShareButton.tsx:22` y
`VolunteerProfileShareButton.tsx:20` repetían el mismo mecanismo: intentar
`navigator.share`, salir en silencio si la persona cancela, y si no hay Web Share
API copiar "texto + enlace" al portapapeles con el aviso "Enlace copiado"
durante 1,8 s.

Corrección: `src/lib/useShareLink.ts`. Cada botón conserva su propio texto, su
propia URL y su propio estilo; `PersonShareButton` sigue sumando la reacción
`difundir` antes de compartir.

### 5. Comprobación de sesión en los votos comunitarios (Medio)

`AidConsensusVote.tsx:33` y `HospitalSuppliesVote.tsx:34` tenían el mismo efecto
para saber si hay sesión (`null` mientras se comprueba).

Corrección: `src/lib/useLoggedIn.ts`.

Deliberadamente **no** se aplicó a `ReportStatusButton.tsx:49` ni a
`DenunciaButton.tsx:32`: ahí el efecto depende de `[open]`, es decir solo
consulta al abrir el modal. Cambiarlo a "al montar" añadiría una llamada de
servidor por cada tarjeta de la lista. El hook acepta `refreshKey` para cuando
se decida unificarlos también.

---

## Propuestas pendientes de decisión

### P1. Motor común para las funciones paginadas de `data.ts` (Crítico por tamaño, riesgo alto)

Ocho funciones repiten la misma estructura completa —filtro por país, filtros
opcionales, rango de fechas, búsqueda, orden, total y página— dos veces cada
una (memoria y Supabase):

`queryMemoryPersons` `data.ts:258` + `getPersons` `:327`,
`getAidPointsPage` `:1605`, `getMarchesPage` `:1903`, `getPostsPage` `:2645`,
`getComplaints` `:3152`, `getPets` `:3305`, `getVolunteersPage` `:3553`,
`getHospitalsPage` `:4005`.

Ahorro estimado: ~400 líneas con un pequeño motor declarativo (`{ tabla, campos
de búsqueda, filtros, orden }`) que genere ambas ramas.

Por qué NO se implementa ahora: cada función tiene particularidades que se
perderían con facilidad al generalizar —`getAidPointsPage` ordena los
disponibles primero *después* de paginar, `getMarchesPage` filtra por `depart_at`
y no por `created_at`, `getPostsPage` excluye `moderation_status = 'pending'` y
tiene cuatro órdenes distintos, `getPersons` usa `textSearch` con configuración
en español mientras el resto usa `ilike`, `getVolunteersPage` limita a 300 filas.
Un error aquí no rompe el build: devuelve listados incompletos, que en esta
plataforma significa personas que no aparecen. Requiere pruebas automatizadas
antes de tocarlo (ver `docs/investigacion/07-observabilidad-testing.md`).

### P2. Mapeadores `rowToX` (Alto, riesgo medio)

12 mapeadores convierten snake_case a camelCase con la misma forma:
`rowToPerson` `data.ts:209`, `rowToReport` `:241`, `rowToAidPoint` `:1556`,
`rowToMarch` `:1959`, `rowToPost` `:2547`, `rowToComplaint` `:3127`,
`rowToPet` `:3276`, `rowToVolunteer` `:3492`, `rowToHero` `:3672`,
`rowToNewsItem` `:3813`, `rowToHospital` `:3932`, `rowToPatient` `:3955`.

Ahorro estimado: ~250 líneas con un conversor genérico de claves.

Por qué NO: cada campo lleva su propio valor por defecto y sus alias históricos
(`r.types ?? (r.type ? [r.type] : [])`, `r.updated_at ?? r.created_at`,
`r.country ?? "ve"`, `r.available ?? true`). Un conversor genérico devolvería
`undefined` donde hoy hay un valor por defecto y además se perdería el tipado
explícito que hoy documenta el modelo. Alternativa intermedia y de menor riesgo:
extraer solo los campos verdaderamente comunes (`id`, `country`, `createdAt`,
`updatedAt`, `photoUrl`) a un `rowToBase`, dejando el resto explícito.

### P3. Envoltorio único de acciones de formulario público (Alto, riesgo medio)

Las 13 acciones de registro/publicación siguen el guion "captcha -> zod ->
escribir en `data.ts` -> `revalidatePath` -> `catch` con mensaje propio", por
ejemplo `registerPersonAction` `actions.ts:461`, `registerAidPointAction` `:597`,
`registerMarchAction` `:652`.

Ahorro estimado: ~150 líneas con un `publicFormAction({ schema, campos,
crear, revalidar, errorAlGuardar })`.

Por qué NO: cada acción difiere en el mensaje de error final, en las rutas que
revalida y en reglas propias (`registerPersonAction` tiene condiciones extra para
"sin identificar"; `postCommentAction` aplica límite de peticiones, valida el
tipo de entidad en tiempo de ejecución y solo exige captcha a quien no tiene
sesión). Un envoltorio genérico tiende a uniformar esos mensajes, que es
justamente comportamiento visible. Los tres helpers ya implementados cubren la
mayor parte del ahorro con riesgo cero.

### P4. Esqueleto de los botones "Registrar/Publicar X" (Medio, riesgo medio)

`RegisterPersonButton.tsx` (560 líneas), `DenunciaButton.tsx` (320),
`CreatePostButton.tsx` (276), `RegisterAidPointButton.tsx` (260),
`RegisterPetButton.tsx` (229), `RegisterVolunteerButton.tsx` (224),
`RegisterHospitalButton.tsx` (213), `AddNewsItemButton.tsx` (149).

Todos repiten: estado `open/submitting/result/preview`, `close()` que limpia el
formulario tras 200 ms, selector de foto con `compressImage` + `uploadPhoto`
(10 copias, ver `RegisterPetButton.tsx:56`), `Turnstile` con `reset()` al fallar,
pantalla de éxito con `ManageLinkBox`, y el pie con "Cancelar"/"Publicar".

Ahorro estimado: ~250 líneas. Primer paso recomendado y de riesgo bajo: extraer
solo `usePhotoUpload()` (referencia del archivo + vista previa + comprimir y
subir), que no toca el HTML. El resto (un `ResourceFormModal` común) sí cambia
el árbol de la interfaz de todos los formularios de alta y debe validarse a mano
en móvil antes de publicar.

### P5. Bloque "Eliminar" de los paneles de gestión (Medio, riesgo bajo-medio)

Mismo bloque de confirmación en dos pasos en cinco paneles:
`PetManagePanel.tsx:169`, `MarchManagePanel.tsx:153`, `OwnerManagePanel.tsx:200`,
`AidPointManagePanel.tsx:222`, `PostManagePanel.tsx:153`.

Ahorro estimado: ~90 líneas con un `<DeleteResourceBlock onDelete=... />`.
Cambia el HTML de cinco pantallas de gestión (las que usan los autores para
borrar su publicación): merece revisión visual antes de entrar.

### P6. `likeX` y `deleteX` en `data.ts` (Medio, riesgo bajo-medio)

Seis "me gusta" con la misma doble rama —leer contador, sumar uno, escribir—:
`likeAidPoint` `data.ts:1779`, `likeMarch` `:2100`, `likeComment` `:2275`,
`likeHero` `:3773`, `likeNewsItem` `:3901`, `likeHospital` `:4206`.
Y seis borrados con la misma secuencia —borrar foto de Storage, borrar el
registro de propiedad, borrar la fila—: `deleteAidPoint` `:1764`,
`deleteMarch` `:2087`, `deletePost` `:3096`, `deletePet` `:3470`,
`deleteHero` `:3799`, `deleteNewsItem` `:3918`.

Ahorro estimado: ~120 líneas con `incrementColumn(tabla, id, columna)` y
`deleteRow(tabla, id, { foto, propiedad })`. Requiere revisar una por una las
diferencias (qué borra la foto, qué limpia `resource_owners`, qué revalida) y no
es una sustitución textual, así que se documenta en vez de aplicarse a ciegas.

### P7. Cascarón de las páginas de listado (Medio, riesgo medio)

Las nueve páginas de listado comparten estructura: `PageHeader`,
`PullToRefresh`, `Suspense` con su esqueleto, contenido en un componente
`*Content`/`*Grid` asíncrono, `FilterModal`, `PageSizeSelect` y `Pagination`.
`ayuda/page.tsx`, `hospitales/page.tsx`, `caravanas/page.tsx`,
`mascotas/page.tsx`, `denuncias/page.tsx`, `voluntarios/page.tsx`,
`comunidad/page.tsx`, `se-busca/page.tsx` (`sin-identificar` ya es solo una
redirección).

Ahorro estimado: ~200 líneas con un `<ListingPage>`. Riesgo: cada listado tiene
filtros, resúmenes y secciones extra propios (`AyudaExtrasSection`, el resumen de
estados de hospitales, el buscador de denuncias); un componente único acabaría
lleno de condicionales y sería más difícil de leer que las copias. Recomendación:
no unificar el cascarón completo; extraer solo la barra de "filtros + tamaño de
página + paginación", que sí es igual en todos.

### P8. `loadEnv()` en los scripts (Bajo, riesgo bajo)

Cuatro copias con diferencias mínimas: `scripts/backfill-estado.mjs:22`,
`scripts/import-data.mjs:29`, `scripts/import-aid-points.mjs:24`,
`scripts/fetch-social-posts.mjs:67` (esta última prueba `.env.local` y `.env`).

Ahorro estimado: ~40 líneas con un `scripts/lib/env.mjs`. No se implementa en
este PR porque `fetch-social-posts.mjs` se ejecuta por cron en el servidor y
`backfill-estado.mjs` lee `.env.local` relativo al directorio de trabajo (no al
del script): unificar cambia de dónde se leen las credenciales. Es un cambio de
despliegue, no de código, y debería ir en su propio PR verificado en el servidor.

### P9. `getXById` (Bajo, riesgo bajo)

12 funciones con la misma forma (`if (!sb) return mem.X.find(...) ?? null`, luego
`select("*").eq("id", id).single()` y `rowToX`), por ejemplo
`getPetById` `data.ts:3357` y `getPostById` `:2727`.

Ahorro estimado: ~60 líneas con un `findById(tabla, coleccionEnMemoria, rowToX)`.
Riesgo bajo, pero exige un genérico con el tipado correcto de las tablas; queda
como candidato natural para el siguiente PR, junto con P6.

### P10. Estados vacíos escritos a mano (Bajo, riesgo bajo)

Existe `src/components/EmptyState.tsx`, pero `ayuda/page.tsx` y
`hospitales/page.tsx` pintan su propio recuadro con borde discontinuo. Unificar
cambia lo que se ve (el componente lleva icono y otra tipografía), así que es una
decisión de diseño, no una limpieza: ~30 líneas.

---

## Notas de verificación

- `npm run build`: correcto (45 rutas generadas).
- `npm run typecheck`: correcto.
- `npm run lint`: **no ejecutable hoy**. El repositorio no tiene
  `eslint.config.*` ni `.eslintrc*`, así que `next lint` abre un asistente
  interactivo y falla en CI/entornos sin terminal. No se ha añadido configuración
  en este PR (sería un cambio ajeno a la duplicación), pero conviene resolverlo:
  es la única de las tres verificaciones de `CLAUDE.md` que no se puede correr.
- El repositorio no tiene hooks de pre-commit (`.husky/` ni
  `.pre-commit-config.yaml`), así que no había nada que instalar.
