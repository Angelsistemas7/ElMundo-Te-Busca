# Estado y pendientes — "El Mundo Te Busca"

Plataforma ciudadana, sin fines de lucro, para localizar personas desaparecidas y
coordinar ayuda ante CUALQUIER tragedia en el mundo (hoy activa: terremotos de
Venezuela jun. 2026 y Colombia 10 ago. 2026). En producción en
`elmundotebusca.com` (VPS propio, Next.js + Supabase, deploy automático por
GitHub Actions + PM2 en cada push a `main`). Español, `npm run build` siempre
verde.

## 🔴 PRIORIDAD AHORA — pedido del dueño 2026-08-12 (ronda 3, probando en vivo tras publicar en Facebook)

El dueño dijo explícitamente: **ignorar** la sección "🔶 Pendiente — ideas que
quedaron a medias" de abajo (son ideas de hace varias sesiones) y enfocarse
primero en seguridad (ver "✅ Cerrado — ronda de seguridad" más abajo, YA
HECHO) y ahora en esta lista, que salió de probar la app en vivo ya publicada.
**Ninguno de estos 8 puntos se tocó todavía** — quedan para la próxima sesión,
en este orden sugerido (de más visible/urgente a menos):

**A. País cruzado: Venezuela aparece con Colombia seleccionado.** Con el
selector de país en Colombia, el dueño ve:
- Voluntarios: el campo de teléfono personal y el placeholder de ciudad/zona
  siguen sugiriendo Venezuela ("Caracas").
- Caravanas: el placeholder de origen sugiere "Plaza Venezuela, Caracas" /
  "La Guaira".
- Puntos de ayuda y Hospitales: el placeholder/hint de teléfono de contacto
  dice "+58 ..." — con Colombia activo debería ser "+57 ...".

  **Causa confirmada por grep**: son strings **hardcodeados**, NO derivados del
  país activo. El hint `"Con el código de tu país si no es +58."` y placeholders
  `"+58 4XX 0000000"` / `"Caracas, La Guaira..."` están repetidos, literales,
  en al menos estos 13 archivos: `RegisterVolunteerButton.tsx`,
  `RegisterMarchButton.tsx`, `RegisterAidPointButton.tsx`,
  `RegisterHospitalButton.tsx`, `RegisterPetButton.tsx`,
  `RegisterPersonButton.tsx`, `CreatePostButton.tsx`, `ReportStatusButton.tsx`,
  `AidPointManagePanel.tsx`, `OwnerManagePanel.tsx`, `PetManagePanel.tsx`,
  `PostManagePanel.tsx`, `MarchManagePanel.tsx`.
  **Sugerencia de arreglo**: agregar `callingCode` (p. ej. "+58"/"+57") y una
  ciudad/zona de ejemplo a `CountryConfig` en `src/lib/countries.ts` (ya existe
  `COUNTRIES[country].quakeInfo.mostAffected` con algo parecible: "La Guaira
  (Caraballeda, Catia La Mar)" para VE, "Risaralda (Pereira) y Valle del Cauca
  (Cali)" para CO — se puede reusar o agregar un campo más simple tipo
  `examplePhone`/`exampleCity`). Todos estos formularios son "use client" —
  hoy NO hay un hook/contexto de país activo en cliente (se buscó
  `useActiveCountry`/`CountryContext` y no existe); el país activo hoy solo se
  lee server-side (`getActiveCountry()` en `country-server.ts`) vía cookie
  `COUNTRY_COOKIE`. Para que un componente cliente sepa el país sin convertirlo
  en Server Component, la vía más simple es pasarlo como prop desde el Server
  Component padre que ya renderiza el botón/formulario (revisar caso por caso;
  puede que algunos ya reciban `country` como prop y solo falte usarlo en el
  placeholder).

**B. Verificación indebida en Puntos de ayuda.** El dueño ve puntos marcados
como "verificado" que NO deberían estarlo — solo los que el equipo agregó
directamente deberían salir verificados; lo que registre el público debe
quedar sin verificar por defecto. Revisar en `src/lib/data.ts`
(`createAidPoint`) y `supabase/schema.sql` (columna `verified` en
`aid_points`) que el default sea `false` y que ningún camino público lo ponga
en `true`. También pidió confirmar que la migración de puntos de ayuda de
Colombia esté completa y NO mezclada con datos de Venezuela (revisar el filtro
por país en la consulta de `aid_points`).

**C. Hospitales.**
- Mismo bug de teléfono +58/+57 que el punto A.
- Pedido nuevo: los hospitales deberían poder tener foto (`registrar
  hospital` hoy no lo pide — confirmar en `RegisterHospitalButton.tsx` y
  `createHospital` en `data.ts`; si no existe, es análogo a como ya funciona
  en puntos de ayuda/mascotas: `uploadPhoto` + campo `photo_url`).
- Dato positivo, no tocar: "marcar el lugar exacto en el mapa" ya está en
  todos los formularios de registro y le gustó al dueño — solo confirmar que
  de verdad esté en TODOS (persona, punto de ayuda, hospital, mascota,
  voluntario).

**D. Filtros: deben vivir DENTRO del botón/selector "Filtros", no como texto
suelto en la página.** Aplica a tres secciones:
- **Denuncias**: categorías (riesgo de niñez, desvío/robo de ayuda, fraude,
  estafa, abuso...) deben ser opciones del selector de filtros, no solo
  categorías del formulario de publicar.
- **Caravanas**: sus filtros deben aparecer en su propio selector "Filtros".
- **Voluntarios**: tipos (médico, enfermero, psicólogo, electricista, radio,
  etc.) deben ser opciones filtrables ahí también.
  Revisar el patrón ya usado en Se busca/Comunidad (`FilterModal`,
  mencionado en la sección de sesiones anteriores) y replicarlo para estas
  tres listas si no lo tienen ya.

**E. Denuncias: el aviso legal debe ser un POPUP al presionar "Denunciar", no
texto fijo en la página.** Flujo esperado: el usuario presiona el botón
"Denunciar" → aparece un modal con el texto legal actual ("antes de publicar,
por favor, denuncias sobre irregularidades reales...") + botón OK → al aceptar,
se abre el widget/bottom-sheet con las categorías (despido o robo de ayuda,
riesgo de niñez, fraude, abuso...) → si no hay sesión, pide iniciar sesión
(esto YA es correcto, el dueño lo confirmó explícitamente, no tocar esa parte).
Revisar `createComplaintAction` en `actions.ts` y el componente de denuncias
(probablemente donde vive hoy el texto legal fijo, moverlo a un `Modal` que
se abre con el clic de "Denunciar").

**F. Reacciones anónimas: decisión explícita del dueño — SÍ se puede
reaccionar sin cuenta, pero NO se debe poder quitar la reacción después**
(hoy aparentemente si se puede quitar/toggle sin cuenta). Revisar el
componente de reacciones (botones de post/persona) y sus acciones
`reactToPostAction`/`reactToPersonAction` en `actions.ts` — confirmar si hoy
existe alguna vía de "quitar" reacción (client-side con localStorage o
server-side) y eliminarla; dejarlo como incremento de un solo sentido.

**G. Nombre de comentarista anónimo debe persistir + insignia de "no
verificado".** Cuando alguien comenta SIN cuenta, escribe su nombre una vez;
ese nombre debería guardarse (localStorage, como ya se hace con dedup de
votos/likes por dispositivo) y reusarse automáticamente en sus próximos
comentarios/publicaciones — hasta que se cree una cuenta. Además, junto a
cada comentario anónimo debe verse una etiqueta tipo "perfil no verificado" o
"sin iniciar sesión" para diferenciarlo de comentarios de cuentas reales.
Revisar `postCommentAction`/`CommentSection` (o donde esté el formulario de
comentar) y el componente que renderiza cada comentario.

> **Nada de este bloque toca datos de Supabase** (son bugs de UI/lógica de la
> app) — probablemente no requiera migraciones nuevas, salvo si se decide
> agregar `callingCode`/`exampleCity` a `countries.ts` (eso es código, no SQL).

## ✅ Cerrado en esta sesión (2026-08-12, ronda de seguridad) — build+typecheck verdes

Chat nuevo, retomando después de que la ronda de deduplicación Colombia/
Venezuela (ver abajo) se saliera del pedido real del dueño. Pedido explícito:
"que no nos roben nuestros datos" — inyección de scripts, robo de info,
nadie pueda auto-asignarse admin/superusuario, nadie pueda atacar la base de
datos, nadie pueda borrar contenido subido, nadie pueda descargar con script
todas las fotos/datos — aplicando lo que el dueño ya sabe de haber hecho web
scraping sobre `colombiatebusca.com`/`venezuelatebusca.com`.

**Punto de partida**: la base YA tenía bastante seguridad de sesiones previas
(RLS sin políticas públicas en tablas sensibles como `app_roles`/
`manager_requests`, freno de fuerza bruta en `/admin` con IP real detrás de
Cloudflare vía `CF-Connecting-IP`, comparación de contraseña a tiempo
constante, cabeceras de seguridad en `next.config.ts`, Turnstile en (casi)
todos los formularios públicos, tokens de gestión no legibles públicamente).
Esta ronda encontró y cerró los huecos reales que quedaban:

1. **Login de usuarios sin freno de fuerza bruta** (`src/lib/auth.ts`,
   `signIn`): a diferencia de `/admin`, no tenía ningún límite de intentos —
   se podía probar contraseñas sin parar contra una cuenta real. Se creó
   `src/lib/ipLockout.ts` (freno genérico por IP, reusado también en
   `admin.ts` para no duplicar la lógica) y se aplicó a `signIn`: 8 intentos
   fallidos por IP bloquean 15 min (más laxo que `/admin` porque aquí hay más
   IPs compartidas legítimas — refugios, wifi comunitario).
2. **"Me gusta"/reacciones anónimas sin ningún límite** (`likeCommentAction`,
   `likeAidPointAction`, `likeMarchAction`, `likeHospitalAction`,
   `likeHeroAction`, `likeNewsItemAction`, `reactToPostAction`,
   `reactToPersonAction` en `actions.ts`): no tenían Turnstile NI dedup
   server-side — un script podía machacarlas sin límite (cada llamada es
   lectura+escritura en Supabase). Se creó `src/lib/rateLimit.ts`
   (limitador de ventana fija) y un límite compartido de 40 llamadas/30s por
   IP aplicado a las 8 acciones de arriba + `postCommentAction` (por si una
   cuenta ya creada intenta inundar de comentarios en bucle, ahí Turnstile no
   aplica). Los votos de disponibilidad (`voteAidAvailabilityAction`,
   `voteHospitalSuppliesAction`) y apoyar denuncias ya exigían sesión real —
   no se tocaron, están bien.
3. **`robots.txt` nuevo** (`src/app/robots.ts`): bloquea rastreo de `/admin`,
   rutas `*gestion*` con token, `/cuenta`, `/configuracion`, `/api/`. No
   detiene un script (eso no obedece robots.txt), pero evita que buscadores
   indexen enlaces de gestión compartidos por error.
4. **Verificado EN VIVO (con curl, esta vez sí había salida a internet desde
   el sandbox hacia el Supabase real)**: la clave anónima **NO puede listar
   el bucket `photos`** — se confirmó que hay fotos reales subidas
   (`persons.photo_url` con URLs reales) y aun así
   `storage/v1/object/list/photos` devuelve `[]`. Es decir, **enumerar/
   descargar en bloque todas las fotos por script vía la API de Storage ya
   está bloqueado** (aunque cada foto individual SÍ es pública por URL directa
   si ya se conoce el nombre — diseño esperado de un bucket público).
5. **Confirmado**: `SUPABASE_SERVICE_ROLE_KEY` (la llave que salta TODA la
   seguridad) solo se usa en `auth.ts`/`data.ts`/`supabase.ts`, todos
   server-only — nunca llega al navegador. `.env*` nunca se commiteó (ni en
   el historial de git).
6. **Hueco real que SIGUE abierto, no se tocó esta ronda (riesgoso arreglarlo
   sin poder probar en navegador)**: `upload.ts` sube fotos DIRECTO del
   navegador a Supabase Storage con la clave anónima — por eso esa clave
   (y la URL del proyecto) están necesariamente en el bundle de cliente.
   Cualquiera puede leerla (siempre visible en el navegador, es el diseño de
   Supabase: la seguridad real la da RLS, no ocultar la clave) y usarla para
   pedir directo a la API REST de Supabase `GET /rest/v1/persons?select=*` —
   como `persons`/`aid_points`/etc. tienen política `for select using
   (true)` (necesario, es un directorio público), un script SÍ puede paginar
   y volcar la tabla completa saltándose por completo el rate-limit de
   Next.js (esas peticiones nunca tocan el servidor de la app). **Esto es una
   limitación estructural de usar Supabase con lectura pública, no un bug
   puntual** — la mitigación real no es de código: revisar en el dashboard de
   Supabase si hay límites de tasa configurables en Settings → API, y
   evaluar (a futuro, cambio grande, no ahora) mover la subida de fotos a una
   Server Action para que la clave anónima deje de viajar al navegador —
   eso permitiría además, si algún día se paga Supabase Pro, restringir por
   IP el acceso a la base de datos (Network Restrictions) sin romper subidas.
7. **Diagnóstico de la lentitud reportada** ("se sintió lento entrando desde
   el link de Facebook"): medido en vivo con `curl` contra `npm run start`
   real. El HTML inicial de `/` llega en ~20ms (`time_starttransfer`) — la
   página se ve casi al instante gracias al `Suspense` que ya existe en
   `src/app/page.tsx`. Pero el streaming completo tarda **~10.6-11.2s**
   consistentes en 3 pruebas seguidas. Causa: `HomeHero`
   (`getCrisisStats`) y `VerifiedNewsCarousel` (`getVerifiedNews`) dependen
   de GDELT, una API externa YA documentada en `src/lib/news.ts` como lenta
   ("GDELT puede tardar bastante más... medido ~10s en pruebas reales") —
   antes se sabía que afectaba a `/mapa`, con esta medición se confirma que
   **también pega en el INICIO**. El código YA tiene la mitigación construida
   (caché en memoria + disco con TTL de horas, endpoint
   `/api/cron/warm-news` pensado para precalentarla antes de que llegue
   gente real) — lo que midió esta sesión fue un arranque en frío (sandbox
   sin caché de disco previa, primera vez). **Verificar en el VPS real**:
   ¿está de verdad instalado el cron de `docs/DESPLIEGUE-VPS.md` línea ~201
   (`0 * * * * curl ... /api/cron/warm-news?secret=...`)? Si el dueño abrió el
   link de Facebook justo después de un deploy/reinicio (caché en
   `/tmp` recién borrada) y antes de que corriera el cron por primera vez,
   esto explicaría exactamente lo que sintió. Comando para confirmar en el
   VPS: `crontab -l` y revisar `logs/warm-news.log`.
8. Otras páginas probadas (no dependen de GDELT): `/comunidad`, `/ayuda`,
   `/caravanas`, `/mapa` (el shell, sin el panel de noticias) respondieron
   completas en 0.18-0.7s — rápido, sin problema.

**Sin cambios de esquema esta ronda** — no hace falta correr `supabase/
schema.sql` de nuevo por esto.

**Pendiente relacionado, no urgente**: revisar en el dashboard de Cloudflare
(no es código) si está activado Bot Fight Mode / reglas de límite de tasa —
es la capa real que falta contra scraping agresivo del sitio en general
(más allá de lo que ya se cerró arriba a nivel de aplicación).

## ✅ Cerrado en esta sesión (2026-08-12, continuación) — build verde, SIN PUSHEAR TODAVÍA

> El dueño ya corrió `supabase/schema.sql` una vez a media sesión; luego se le
> agregaron MÁS columnas (ver abajo). **Falta volver a correrlo** antes o justo
> después de desplegar esto — es idempotente, no rompe nada. Nada de esta
> sesión se ha commiteado/pusheado aún; queda para que el dueño decida cuándo.

**1. Detección de posibles duplicados en personas** (`src/lib/data.ts`,
`findPersonDuplicates`/`createPerson`):
- Se disparó por un caso real: 4 personas con nombres distintos (Vicky Caycedo,
  Ana María Saavedra Caycedo, Sofía y Isabela Saavedra) pero la MISMA foto,
  coladas por el sync automático de `colombiatebusca.com`. Ese script nunca
  pasaba por ningún chequeo de duplicados (bypaseaba toda la lógica de la app,
  escribe directo a Supabase). Esas 4 tarjetas se dejaron TAL CUAL a pedido del
  dueño — no se tocaron.
- Ahora: coincidencia por **cédula exacta**, **foto idéntica** (SHA-256 de los
  bytes, calculado en el cliente al publicar y en el sync — NO es IA ni hash
  perceptual, es detección de archivo repetido) o **nombre parecido** (2+
  palabras en común, antes exigía nombre completo exacto).
- Aplica en AMBOS lados: formulario manual (`RegisterPersonButton`, ya
  avisaba, ahora más preciso) Y `scripts/sync-legacy-sites/{lib,sync-colombia,
  sync-venezuela}.mjs` (antes no chequeaba nada).
- **No bloquea publicar/importar**, solo marca `possible_duplicate` +
  `duplicate_match_id` en el registro para revisión. Cola nueva **"Posibles
  duplicados"** en `/admin` (admin y moderador) con botón "Descartar aviso".
- Aviso (no bloqueante) de "número de teléfono inventado" (todos los dígitos
  iguales o en secuencia) en el formulario de persona y en "Tengo información".
- Migración nueva: `photo_hash`, `possible_duplicate`, `duplicate_match_id` en
  `persons`.

**2. Existencias POR CATEGORÍA en Puntos de ayuda** (idea de un post de
Facebook sobre logística de acopio, adaptada): antes un punto tenía un solo
"disponible/agotado" para TODO; ahora cada recurso (agua, comida, medicina...)
tiene su propio nivel 🔴 Urgente / 🟡 Limitado / 🟢 Cubierto, fijado por el
autor o el admin (igual que la disponibilidad general — no es un voto). Se ve
en la tarjeta (solo si hay algo urgente, para no saturar), en la ficha
completa, y se edita al publicar/gestionar. Migración nueva: `category_status`
(jsonb) en `aid_points`.

**3. Posts de Comunidad y Caravanas se pueden vincular a un Punto de ayuda**:
al publicar un post (🆘/🤲/etc.) o una caravana, aparece un selector opcional
"Vincular a un punto de ayuda" (solo si hay puntos en el país activo). La
ficha del punto de ayuda ahora muestra una sección "Necesidades y caravanas
vinculadas a este punto" con lo que se haya ligado. Migración nueva:
`aid_point_id` en `posts` y en `marches`. **No se agregó edición retroactiva**
(los posts/caravanas ya publicados no se pueden vincular después desde
`PostManagePanel`/`MarchManagePanel` — quedó fuera de alcance, se puede sumar
si hace falta).

**4. Tarjetas al compartir (Open Graph)** — dos pedidos del dueño, ambos
verificados generando la imagen de verdad (`curl` + lectura del PNG, esto SÍ
funciona en el sandbox porque no depende de Supabase):
- Texto genérico en vez de nombrar un solo evento/país: "Respuesta ciudadana a
  tragedias en el mundo" (antes decía literalmente "terremotos de Venezuela y
  Colombia 2026" como titular). Tocado: `src/app/opengraph-image.tsx` y
  metadata de `src/app/layout.tsx`.
- Fondo BLANCO tipo iOS en vez de oscuro en la tarjeta de compartir de una
  persona (`src/app/persona/[id]/opengraph-image.tsx`) — el dueño lo pidió
  explícitamente ("bien hecho, bien diseñado, bien bonito"). Se aplicó el
  MISMO cambio a mascotas (`mascotas/[id]/opengraph-image.tsx`, comparte
  plantilla) por consistencia, aunque no se pidió directamente. **NO se tocó**
  la tarjeta de "voluntario digital" (`perfil/publico/[username]`) — es un
  diseño verde intencionalmente distinto.

**⚠️ Importante sobre verificación visual esta sesión**: el panel de
navegador (`Claude_Browser`) le estaba cerrando la app al dueño (crash
reportado), así que se dejó de usar a media sesión. Lo de los puntos 1-3
**compila y pasa el chequeo de tipos**, pero NO se pudo confirmar visualmente
en un navegador real — ni con el panel (crasheaba) ni con `curl` (este sandbox
no tiene salida a internet hacia el Supabase real de producción, así que
`/ayuda/[id]` y páginas con datos en vivo se quedan en "Cargando…" vía curl
también, ver punto 8 de pendientes crónicos más abajo). **Probar de verdad en
el navegador normal es la prioridad #1 de la próxima sesión**, antes de seguir
construyendo encima.

## ✅ Cerrado en sesión anterior (2026-08-11/12) — todo desplegado y migrado

**Backfill de datos:**
- `scripts/backfill-estado.mjs`: rellenó `estado` en 5.817 personas de
  Venezuela y 123 de Colombia que tenían `estado=null`, derivándolo de nombres
  de lugar reconocidos en `location_text`. El resto (25k+ en VE) no tenía
  ningún lugar reconocible en el texto (mucho "Ubicación protegida por
  seguridad" o vacío) — se dejó sin tocar, no se inventó nada. Si se quiere
  subir esa cifra, la única vía real es re-importar desde la fuente original
  con mejor dato de región, no hay más que exprimir del texto libre actual.

**Voluntariado con roles delegados (idea completa, de punta a punta):**
- `/voluntarios/guia`: explica qué es un voluntario digital antes de mandar a
  un formulario. "¿Cómo puedo ayudar?" del inicio apunta aquí (antes iba
  directo a Comunidad).
- `/voluntarios/solicitar-gestor`: el usuario logueado elige un hospital o
  punto de ayuda concreto y explica qué información puede aportar.
- Cola "Solicitudes de gestor" en `/admin` (tabla `manager_requests`, nueva):
  aprobar de un clic crea el permiso real en `resource_managers` (que ya
  existía completo de una sesión anterior); rechazar no otorga nada.
- El compañero (jerdiaz) en paralelo agregó el rol **moderador** (acceso
  parcial: reportes, cola de posts, visto bueno a personas/puntos de ayuda/
  hospitales — sin Colaboradores, gestores, héroes ni denuncias) y un atajo
  "Panel de moderación" en el menú de usuario. Ya integrado y desplegado.

**Ubicación exacta y búsqueda por cercanía:**
- Al publicar una persona (y punto de ayuda, hospital, voluntario):
  `LocationPicker` ya no muestra el mapa siempre desplegado — ahora es un
  botón con ícono de mapa que abre una ventana para marcar el lugar exacto.
- En Se busca / ¿La reconoces? (comparten `FilterModal`): nuevo filtro
  "Buscar cerca de un punto" con chips de radio (5/10/20/50 km) — marcas un
  punto en el mapa y se excluye a quien quede más lejos de ese radio. **A
  propósito no es un mapa con todos los pines** (el dueño lo pidió así:
  demasiados avistamientos sobre un mismo punto sería ilegible). Sin
  PostGIS: la distancia se calcula en JS sobre hasta 500 candidatos con
  lat/lng — trade-off aceptable para el volumen actual, revisar si el
  dataset con coordenada exacta crece mucho.

**Bugs reales corregidos:**
- "Ver todos" de las secciones destacadas del inicio apuntaban a `/` en vez
  de `/se-busca`.
- Réplicas del mapa mezclaban Venezuela y Colombia cerca de la frontera.

**Rediseño de Comunidad** (calcado al patrón de Se busca): filtros de tipo
consolidados en `FilterModal`, búsqueda con debounce, paginación numerada en
vez de "Cargar más", FAB de "Publicar persona" en móvil, panel de capas del
mapa colapsable en móvil.

**Migraciones SQL ya corridas en producción** (no repetir): `cause` en
personas, `manager_requests`, constraint de `app_roles` con `moderator`. El
`schema.sql` completo se corrió más de una vez y es idempotente — si hace
falta volver a correrlo por lo que sea, no rompe nada existente.

## 🔶 Pendiente — ideas que quedaron a medias o sin construir (DESPRIORIZADO)

> **El dueño pidió explícitamente ignorar esta sección por ahora** (2026-08-12):
> "hacer caso omiso a estas sugerencias, porque estos son de hace cuatro chats
> o hace cinco chats". No retomar nada de aquí abajo salvo que lo pida de
> nuevo — la prioridad real está en "🔴 PRIORIDAD AHORA" arriba.

0. **De la sesión de hoy (2026-08-12), en orden de prioridad:**
   - **Probar en el navegador real** (no en este sandbox) los 3 features
     nuevos: publicar un punto de ayuda con niveles por categoría, publicar un
     post/caravana vinculado a un punto, y que la ficha del punto muestre bien
     todo. Nada de esto se vio funcionar en vivo esta sesión.
   - **Volver a correr `supabase/schema.sql`** en producción (columnas nuevas:
     `photo_hash`/`possible_duplicate`/`duplicate_match_id` en `persons`,
     `category_status` en `aid_points`, `aid_point_id` en `posts` y `marches`).
   - **Commitear y pushear** (nada de esta sesión se subió todavía).
   - Vincular posts/caravanas a un punto de ayuda **solo se agregó al crear**,
     no al editar uno ya publicado (`PostManagePanel`/`MarchManagePanel`) — si
     el dueño lo pide, es la siguiente extensión natural.
   - Opcional, no pedido: aplicar el mismo "vincular a un recurso" en sentido
     inverso (que la ficha de un post muestre a qué punto está ligado, no solo
     al revés) — hoy solo se ve desde la ficha del punto de ayuda.
   - Las 4 tarjetas duplicadas de la familia Saavedra/Caycedo (Colombia) se
     dejaron sin tocar a pedido explícito del dueño — no es un pendiente, es
     una decisión tomada.

1. **Estado/región sin asignar en el resto de personas** (25k+ en VE, ~460 en
   CO): no tienen ningún lugar reconocible en `location_text` (vacío o
   "Ubicación protegida por seguridad"). El filtro por región seguirá
   mostrando pocos resultados para esas personas hasta que se re-importen
   con mejor dato de origen. No es un bug de código.
2. **Límite de 500 candidatos en el filtro de cercanía**: si con el tiempo
   hay muchas más de 500 personas con coordenada exacta marcada en un mismo
   país, las más lejanas dentro de ese cupo (ordenado por fecha) podrían
   ganarle a alguna más cercana publicada antes. Solución real: PostGIS
   (`ST_DWithin`), no se justificaba para el volumen de hoy.
3. **Texto de compartir al publicar una persona**: el dueño mencionó en una
   sesión que "no veía la completitud" del cambio de mensaje al compartir.
   Se revisó `PersonShareButton.tsx` y el texto actual ya es completo y
   coherente ("Necesitamos voluntarios digitales...") — probablemente el
   dueño estaba viendo la versión vieja en producción (antes del deploy).
   Si al probar en vivo todavía no convence, pedir específicamente qué
   falta (no se tocó más a ciegas).
4. **`getPersonGroups`** (agrupación por edad/hospital en Se busca) no se
   revisó para que respete `nearLat/nearLng/radiusKm` — si alguien aplica el
   filtro de cercanía Y está en una vista agrupada a la vez, revisar que no
   se ignore el radio silenciosamente.
5. **Nested Modal (recuadro dentro de recuadro)**: `LocationPicker` y el
   campo `mapPoint` de `FilterModal` abren un `Modal` propio estando ya
   dentro de otro `Modal` (el del formulario/filtros). Funciona porque
   ambos usan portal a `document.body`, pero si alguna vez se presiona
   Escape con AMBOS abiertos, los dos se cierran a la vez (cada `Modal`
   escucha `keydown` en `document` mientras esté abierto). Bug menor, no
   se corrigió — nadie lo reportó todavía.
6. **Filtros por radio/cercanía solo en Se busca / ¿La reconoces?**: no se
   replicó en Comunidad, Ayuda, Hospitales, etc. — no se pidió ahí, se dejó
   fuera de alcance a propósito.
7. **`docs/kit-prensa/`** con el nombre nuevo del proyecto, botón
   "Comunicados de prensa" en Noticias → Drive, e importar personas desde
   un export autorizado — pendientes menores de sesiones antiguas, nunca
   retomados.
8. **Verificación visual en navegador limitada en este entorno**: el sandbox
   de desarrollo no tiene salida a internet hacia Supabase/GDELT, así que
   cualquier página con datos en vivo se queda en "Cargando…" — confirmado
   otra vez hoy (2026-08-12): esta vez ni siquiera con `curl` se pudo
   verificar `/ayuda/[id]` (la sesión de origen de esta nota decía que curl
   sí servía; no fue el caso hoy contra el Supabase real ya configurado en
   `.env.local`). Probar de verdad en el teléfono/navegador normal cuando se
   pueda, especialmente:
   - El botón de ícono de mapa al publicar una persona (que abra bien la
     ventana, que el pin se pueda arrastrar).
   - El filtro "Buscar cerca de un punto" con los chips de radio.
   - La guía de voluntariado y el formulario de solicitar gestor.
   - La cola "Solicitudes de gestor" en `/admin` (aprobar/rechazar).
   - Los 3 features nuevos de hoy (ver sección de arriba).
   - **Nota para la próxima sesión**: el panel de navegador integrado
     (`Claude_Browser`) le cerró la app al dueño hoy (crash reportado, causa
     no diagnosticada). Evitarlo si vuelve a pasar; usar `npm run build` +
     `npm run start` + `curl` como verificación principal.

## 📌 Pendientes crónicos (de sesiones muy anteriores, siguen sin resolver)

- **3 secretos del VPS sin reemplazar** (`SUPABASE_SERVICE_ROLE_KEY`,
  `TURNSTILE_SECRET_KEY`, `ADMIN_TOKEN` con el valor de ejemplo público en
  `docs/DESPLIEGUE-VPS.md`) — el dueño dijo que los cambia él.
- **Teléfonos de emergencia sin verificar** (`src/lib/emergency.ts`): solo
  Caracas y La Guaira, nada de Falcón/Valencia/Maracay. No inventar
  ninguno sin confirmación real.
- **`useNotifications()`** hace 2-3 llamadas de red en cada carga incluso
  para visitantes anónimos sin nada que mostrar — arreglarlo de raíz
  requiere pasar el estado de sesión desde un Server Component sin romper
  el fix de página estática de Emergencias (se intentó una vez y se revirtió).

## Metodología recomendada para la próxima sesión
Antes de tocar algo nuevo: `git fetch && git log main..origin/main` — el
compañero (jerdiaz) está trabajando en paralelo en el mismo repo y ya se
adelantó una vez con el rol moderador mientras esta sesión corría. Traer sus
cambios y correr `npm run build` con todo junto antes de seguir.
