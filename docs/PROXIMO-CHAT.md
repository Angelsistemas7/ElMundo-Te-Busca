# Estado y pendientes — "El Mundo Te Busca"

Plataforma ciudadana, sin fines de lucro, para localizar personas desaparecidas y
coordinar ayuda tras el **terremoto de Venezuela 2026**. En producción en
`elmundotebusca.com` (VPS propio, Next.js + Supabase, deploy automático por
GitHub Actions + PM2 en cada push a `main`). Español, `npm run build` siempre verde.

## 📌 Continuación misma sesión (2026-08-10) — pulido iOS: transición hero + skeletons

Seguido del pedido explícito "pulido tipo iOS: transiciones, fluidez,
optimización". Se extendió lo ya empezado:
- `HospitalCard`/`MarchCard` ahora navegan con `ViewTransitionLink`
  (crossfade nativo, no morphea foto porque `Hospital`/`March` no tienen
  `photoUrl` en `types.ts` — a diferencia de persona/ayuda/mascotas). Con
  esto las 5 entidades con ficha propia (persona, ayuda, mascota, hospital,
  caravana) usan la View Transitions API de forma consistente.
- Nuevo `src/components/ListSkeletons.tsx` + `loading.tsx` propio en
  `/ayuda`, `/hospitales`, `/caravanas`, `/mascotas`, `/se-busca`,
  `/voluntarios`, `/denuncias`, `/comunidad` — antes esas 8 rutas caían en
  el `loading.tsx` genérico de la raíz (solo un spinner, sin la forma de
  la tarjeta real), lo que se sentía más "app nativa a medias" que iOS.
  Sigue el mismo patrón que `HomeSkeletons.tsx` (ya existía solo para el
  inicio).

**Verificación**: `npm run typecheck` y `npm run build` en verde. La
verificación visual en navegador quedó bloqueada por el mismo problema de
entorno ya documentado abajo (migración SQL de `country` sin correr en el
Supabase real conectado en `.env.local`, y sin salida a internet en este
sandbox hacia GDELT) — **no es causado por este cambio**: se confirmó que
hasta la portada (`/`), sin tocar, se queda igual de colgada en
"Cargando…" en este entorno. Recomendado: probar visualmente cuando se
corra la migración pendiente / desde un entorno con salida a internet
normal.

**Siguiente candidato de pulido** (no se llegó): revisar `FeaturedSections`/
carruseles (`SwipeStaticRow`/`SwipeHintRow`) para inercia tipo iOS
(`scroll-snap-type`), y animación de entrada (`animate-rise`) en las
tarjetas fijadas/destacadas de Comunidad si no la tienen ya.

## 📌 Cierre de sesión (2026-08-10) — MULTI-PAÍS: leer esto primero

El mismo día del terremoto de Colombia (M7,4, 10 ago. 2026, epicentro cerca
de San José del Palmar, Chocó — Pereira y Cali las más afectadas), el dueño
pidió arrancar la arquitectura multi-país que quedó anotada como "idea a
futuro, NO construir todavía" en `docs/PLAN-TINDER-Y-ROLES.md` §4.4. Se
decidió el modelo ahí planteado como pendiente: **un solo código y una sola
base de datos**, con una columna `country` por tabla (no instancias
separadas por país). Build y typecheck verdes en cada paso.

**⚠️ Acción pendiente del dueño, antes de desplegar**: volver a correr
`supabase/schema.sql` completo en el SQL Editor de Supabase (agrega la
columna `country` a `persons`/`aid_points`/`posts`/`hospitals`, con
`default 've'` — migración aditiva e idempotente, no borra nada). Sin esto,
el sitio en producción sigue funcionando exactamente igual que antes (todo
cae en 've' por el default), pero las consultas nuevas del código fallarán
si Supabase real no tiene la columna. En memoria/demo no hace falta nada.

**Lo que quedó funcionando** (ver `src/lib/countries.ts` como fuente única
de verdad por país — regiones, coordenadas, datos del sismo con fuente,
teléfono de emergencia, bbox de USGS):
- Selector de banderas (`CountrySwitcher`) en la portada, cookie `emb_country`
  (Server Action `setActiveCountryAction`, país siempre resuelto del lado del
  servidor — nunca se confía en el país que mande un formulario del cliente).
- Filtrado real por país (memoria + Supabase) en las 4 entidades núcleo:
  personas, puntos de ayuda, posts de comunidad, hospitales — listados,
  paginación, agrupaciones, dashboard, "recientemente localizados", mapa.
- `/mapa` y `/emergencias` (este último pasó a `force-dynamic`, a propósito:
  el teléfono único nacional SÍ cambia por país — 911 en Venezuela, 123 en
  Colombia — y el costo de leer la cookie ahí es mínimo) muestran datos del
  país activo.
- Los 4 formularios de registro núcleo y sus paneles de gestión
  (`OwnerManagePanel`, `PostManagePanel`, `AidPointManagePanel`) usan las
  regiones del país correspondiente, no la lista fija de estados de Venezuela.

**Lo que quedó PENDIENTE (a propósito, por alcance/tiempo — próxima ronda)**:
- **Mascotas, Voluntarios, Caravanas, Denuncias, Héroes, Noticias curadas**:
  sus tablas no tienen columna `country` todavía; todo lo existente y nuevo
  cae en 've' implícito. Mismo patrón que las 4 entidades ya migradas —
  replicar: columna en `schema.sql`, campo en `types.ts`, filtro en
  `data.ts` (mem + Supabase), `country` en el formulario/Server Action.
- **`src/lib/news.ts`** (GDELT/GNews/ReliefWeb/Google Noticias RSS) sigue
  filtrando solo con `VE_TERMS` — las noticias/cifras de prensa en el inicio
  y `/ayuda` siguen siendo de Venezuela aunque el país activo sea Colombia
  (por eso el hero oculta esa fila y muestra en su lugar la cifra fuente de
  `countries.ts` cuando el país no es 've' — ver `HomeHero.tsx`). Para
  arreglarlo de raíz: parametrizar cada función de `news.ts` con el
  `NewsConfig` que ya existe por país en `countries.ts` (`matchPattern`,
  `searchQuery`, `gl`).
- `getMarches()`/`getVolunteers()` (usados en `/mapa`) tampoco filtran por
  país todavía — mismo motivo (sin columna `country` aún).

## 📌 Cierre de sesión (2026-07-10) — leer esto primero

**La carpeta del proyecto se renombró** de `venezuelatebusca` a
`Elmundotebusca` (mismo repo, mismo git, nada se perdió — solo cambió la ruta
local en el escritorio de Windows).

**Se bajaron 13 commits de compañeros** (`git pull`, fast-forward limpio, sin
conflictos) que NO se habían tocado ni revisado en esta sesión:
- **Rediseño de Comunidad estilo Facebook, en 3 fases**: avatar y perfil
  clickeable en posts/comentarios (Fase 1), composer siempre visible +
  scroll infinito (Fase 2), hilos de respuesta sin límite de profundidad
  pero aplanados a un nivel visual (Fase 3). Archivos nuevos: `Avatar.tsx`,
  `InfiniteFeed.tsx`; cambios grandes en `CommentSection.tsx`, `PostCard.tsx`,
  `CreatePostButton.tsx`, `app/comunidad/page.tsx`.
- **Modo mantenimiento**: `MAINTENANCE_MODE=true` en el `.env` bloquea todo
  el sitio salvo `/admin` y quien ya tenga sesión de admin. Nueva
  `app/mantenimiento/page.tsx`, lógica en `middleware.ts`.
- **Ingesta automática de redes sociales** (`scripts/fetch-social-posts.mjs`):
  busca por hashtag en Bluesky/Mastodon, clasifica cada post con IA
  (aprobar/rechazar/revisar — nunca publica solo algo dudoso) y **traduce
  automáticamente al español**. Cola de moderación nueva en `/admin`.
  Corre aparte (tiene su propio `scripts/package.json`), por cron en el VPS
  (ver `docs/DESPLIEGUE-VPS.md`, sección agregada por el compañero).
- **Header de escritorio**: ahora 4 secciones fijas + menú "Más", igual que
  ya tenía el móvil (antes eran 9 ítems sueltos).

**Verificado tras el pull**: `npm install` (sin cambios, el script de
ingesta tiene su propio `package.json` aparte) + `npm run build` en verde
con TODO junto (lo de esta sesión + lo de los compañeros).

**Hueco menor encontrado, no corregido**: `scripts/fetch-social-posts.mjs`
usa `OPENAI_API_KEY` para el filtro de IA (opcional — sin ella, todo queda
"pending" como antes, no rompe nada), pero esa variable **no está en
`.env.example`** — el compañero la documentó bien en el propio script pero
se le olvidó copiarla ahí. Agregar `OPENAI_API_KEY=` a `.env.example` cuando
se retome.

**Sin revisar todavía por esta auditoría** (la metodología de esta sesión
era repasar sección por sección buscando bugs reales — estos 13 commits
NUNCA pasaron por ese repaso): Comunidad (todo el rediseño), modo
mantenimiento, y el script de ingesta social. Si se retoma el trabajo de
auditoría, esto es lo primero que falta.

**Pendiente explícito del dueño para esta sesión** (aún no se tocó):
- El rediseño de Comunidad que el dueño pidió — probablemente **ya lo
  resolvieron los compañeros** con su rediseño estilo Facebook. Antes de
  construir nada nuevo ahí, mostrarle al dueño lo que ya está y preguntar
  si eso cubre lo que quería o si falta algo específico.
- Guía rápida de bienvenida para quien entra por primera vez — **pedido
  explícitamente para después**, no construir sin que lo pida.

---

## 🚨 Pendiente crítico — acción del dueño (NO tocar sin sus claves)
El `.env` del VPS (`/var/www/elmundotebusca/.env`) tiene **3 secretos que siguen
siendo el texto de ejemplo `pega-aqui`** de la documentación (nunca se
reemplazaron):
- `SUPABASE_SERVICE_ROLE_KEY` — causaba que reacciones/guardados con permisos
  elevados fallaran en silencio (ya blindado en código para que avise en vez de
  fallar callado, pero la causa real sigue sin arreglar).
- `TURNSTILE_SECRET_KEY` — probablemente rechaza publicaciones de gente SIN
  sesión ("no se pudo verificar que eres humano").
- `ADMIN_TOKEN` — **hueco de seguridad**: el panel `/admin` usa un token
  adivinable (está literal en `docs/DESPLIEGUE-VPS.md`, que es público en GitHub).

El dueño dijo que lo hace él más tarde. Pasos: sacar la `service_role` real de
Supabase (Settings → API), el secreto real de Cloudflare Turnstile, generar un
`ADMIN_TOKEN` aleatorio largo, editar el `.env` en el VPS y `pm2 restart
elmundotebusca --update-env`.

## 📞 Pendiente — teléfonos de emergencia sin verificar
`src/lib/emergency.ts` solo tiene bomberos/ambulancias de **Caracas y La
Guaira**, sin verificar en la vida real, y nada de Falcón/Valencia/Maracay (zonas
también afectadas). El dueño no tiene forma de verificarlos ahora mismo — se
irán completando **cuando la comunidad aporte números confirmados**. No
inventar ni "corregir" ningún teléfono sin confirmación real (son datos de vida
o muerte).

## Metodología de esta ronda: auditoría profunda por sección
El dueño pidió repasar el sitio **sección por sección, a fondo** (rendimiento,
caché de Supabase/VPS, bordes, animaciones, transiciones, bugs reales — no
cambios al azar). Ya se hizo, con commits propios cada vez:
- **Se busca** — cache de `getCountsByEstado`, tap feedback en `PersonCard`.
- **¿La reconoces?** — carruseles por edad (paridad con "Se busca"), fix de
  búsqueda por rasgos (`search_doc` no incluía `description`; correr
  `supabase/schema.sql` si no se ha hecho).
- **Comunidad** — paginación clásica (10/20/50 por página, no scroll infinito:
  se probó y el dueño prefirió páginas), fijados/rescates en carrusel lateral,
  orden por relevancia (`reactions_total`, columna calculada), fix de "me
  gusta" que no se guardaba (mismo problema de fondo que las claves del VPS).
- **Mapa** — control de capas nativo de Leaflet más fácil de tocar en móvil.
- **Fichas de persona** — `BackLink` (usa el historial del navegador: "volver
  al listado" ya no pierde el filtro/página), botón "Compartir" separado de
  las reacciones (debajo de "Guardar"), imagen de compartir POR PERSONA (foto
  real + estado + texto), reportes de estado unificados visualmente con
  "Información de la comunidad".
- **Vaivén leve** (`SwipeHint.tsx`): se pausa al tocar/deslizar, retoma solo a
  los 10s, amplitud reducida (6px).
- **Emergencias** — página 100% estática (no tenía ninguna consulta a la BD;
  antes forzada a "force-dynamic" sin motivo), tap feedback en los teléfonos.
- **Noticias** — código muerto eliminado (`getLatestNews`/GDELT, ya no se
  usaba), dominio viejo en el `appname` de ReliefWeb, aviso de "vas a salir
  del sitio" en titulares/fuentes (contenido de terceros).
- **Hospitales** — **hallazgo grande**: TODO `lib/data.ts` tenía el mismo
  patrón sin revisar errores de `reactToPerson`/`reactToPost` (~18 lugares:
  likes de aid_points/marches/comments/heroes/news_items/hospitales,
  votos de insumos/disponibilidad, `person_owners`/`resource_owners`
  (enlaces de gestión), `saved_items`, `resource_managers`). Se revisó y
  blindó TODO el archivo (ya no queda ningún `await sb...update/insert/delete`
  sin comprobar `error`). Esto es justo lo que las 3 claves del VPS seguían
  rompiendo en silencio — doblemente importante corregir esas claves.
  También: `HospitalCard` sin tap feedback (mismo bug que `PersonCard`),
  buscador de pacientes con el mismo problema de zoom en iPhone.

- **Voluntarios** — mismo bug de Comunidad: `getVolunteers` traía hasta 300 sin
  paginar, cacheado 60s. Nueva `getVolunteersPage` (en vivo, 10/20/50 a
  elegir) para la página; se dejó `getVolunteers` intacta para el mapa.

- **Puntos de ayuda** — mismo bug de Comunidad/Voluntarios: `getAidPoints()`
  traía la tabla entera cacheada 60s sin límite. Nueva `getAidPointsPage`
  (en vivo, filtro por tipo/disponibilidad, 10/20/50 a elegir); se dejó
  `getAidPoints` intacta para `/admin` y `/mapa`. Tap feedback (`.press`)
  agregado en varios botones que quedaron sin él: teléfono y "Ver y
  comentar" de `AidPointCard`, teléfono y "Gestionar este punto" en la
  ficha, y en `AidPointManagePanel` (checkbox de tipos, "Guardar cambios",
  toggle Disponible/Agotado, "Eliminar" y su confirmación "Sí,
  eliminar"/"Cancelar"), y en `RegisterAidPointButton` (dropzone de foto,
  "Cerrar", "Cancelar"/"Publicar punto").

- **Mascotas** — mismo bug de paginación (`getPets` traía hasta 200 sin
  paginar); ahora pagina de verdad (10/20/50). Tap feedback agregado:
  tarjeta (`.tap-card`), teléfono en `PetCard`; dropzone, "Cerrar",
  "Cancelar"/"Publicar" en `RegisterPetButton`.

  **Hallazgo grande, ya resuelto**: a diferencia de personas/puntos de
  ayuda/caravanas/posts, las mascotas no tenían enlace de gestión. El
  dueño pidió el mismo alcance que una persona (editar, marcar
  encontrada, eliminar, compartir). Se construyó:
  - `resource_owners.entity_type` ahora incluye `'pet'` (migración en
    `supabase/schema.sql`, **hay que correrla en Supabase — ver abajo**).
  - `pets` tiene `user_id` (cuenta) y `updated_at` (trigger `pets_touch`),
    igual que `aid_points`/`persons`.
  - Nueva ficha pública `/mascotas/[id]` (foto, estado, descripción,
    contacto, `PetShareButton`, comentarios) — antes solo existía la
    tarjeta en el listado con comentarios inline (se quitó ese modo, la
    tarjeta ahora enlaza a la ficha, como `AidPointCard`).
  - Nueva `/mascotas/[id]/gestion` + `PetManagePanel`: botones rápidos de
    estado (perdida/encontrada/refugio/veterinario), editar datos,
    eliminar — igual que `AidPointManagePanel`.
  - `RegisterPetButton` ahora muestra el enlace privado de gestión
    (`ManageLinkBox`) al publicar, igual que puntos de ayuda.
  - Nueva `/mascotas/[id]/opengraph-image.tsx` (tarjeta de compartir con
    foto real, igual que la de personas).
  - "Mis publicaciones" (campanita) y "Guardar" ya reconocían `pet`; se
    corrigió que el enlace de la campanita apuntara a la ficha propia en
    vez de al listado general.

- **Corregido de paso**: la foto de una persona compartida por WhatsApp
  salía en blanco. Causa: las fotos se suben en formato WebP y el
  generador de la tarjeta de compartir (`next/og`/satori) no decodifica
  WebP — la incrustaba rota sin avisar del error. Se arregló
  descargando y convirtiendo la foto a JPEG con `sharp` (ya venía
  instalado por Next, ahora es dependencia directa) antes de
  incrustarla. Se extrajo a `src/lib/ogImage.ts` (helper compartido:
  `toEmbeddablePhoto`, `getLogoDataUrl`, `PLATFORM_BLURB`) y lo usan
  tanto `persona/[id]/opengraph-image.tsx` como la nueva de mascotas. De
  paso se agrandó el logo y se movió a la esquina superior derecha de la
  tarjeta, y se agregó una línea con las funcionalidades de la
  plataforma tras el llamado a la acción (pedido del dueño). También se
  agregó un aviso en el formulario de personas: "sube una foto de la
  persona, no de su cédula u otro documento de identidad" (se detectó
  que una foto de prueba era en realidad una cédula).

### ⚠️ Pendiente del dueño: correr la migración de mascotas en Supabase
La gestión de mascotas (arriba) necesita este cambio en la base de datos
de producción. Ir al **SQL Editor de Supabase** y correr de nuevo TODO
`supabase/schema.sql` (es idempotente, ya se ha hecho antes con otras
migraciones) — o, si se prefiere algo más quirúrgico, solo estas líneas
nuevas:
```sql
alter table resource_owners drop constraint if exists resource_owners_entity_type_check;
alter table resource_owners add constraint resource_owners_entity_type_check
  check (entity_type in ('aid_point','march','post','pet'));

alter table pets add column if not exists user_id uuid references auth.users(id) on delete set null;
alter table pets add column if not exists updated_at timestamptz not null default now();
create index if not exists idx_pets_user_id on pets(user_id);

drop trigger if exists pets_touch on pets;
create trigger pets_touch before update on pets
  for each row execute function touch_updated_at();
```
Sin esto, publicar/gestionar una mascota fallará en producción (en local
sin Supabase configurado sí funciona, porque usa el almacén en memoria).

- **Recursos** (directorio de plataformas de terceros) — **hallazgo real**:
  la página no tenía NINGÚN enlace de entrada en escritorio (no estaba en
  el `NAV` de `SiteHeader`, ni en el footer; solo aparecía dentro de "Más"
  en la barra inferior de móvil). Se agregó a `SiteHeader.tsx`. De paso:
  el texto final "¿Conoces una iniciativa que falte? Escríbenos" no tenía
  ningún enlace para escribir — ahora "Escríbenos" abre un `mailto:` al
  correo de contacto. También se agregó `.press` a las pestañas de
  `CommunityTabs.tsx` (Muro/Voluntarios/Caravanas/Denuncias), que no
  tenían el tap feedback que sí tienen los demás chips de filtro del
  sitio. El resto de la página ya estaba bien: es estática (sin consultas
  a la BD, se sirve prerenderizada), sin código muerto, con aviso de
  "sitios de terceros" visible y enlaces `rel="noopener noreferrer"`.
  (Se verificó también que `/sin-identificar` SÍ es intencional: es un
  redirect de compatibilidad a `/?view=reconoces`, no una página huérfana.)

- **Caravanas y Denuncias** — mismo bug de paginación que ya se arregló en
  Comunidad/Voluntarios/Ayuda/Mascotas:
  - **Denuncias**: `getComplaints` traía hasta 200 sin paginar. Ahora
    pagina de verdad (10/20/50 a elegir).
  - **Caravanas**: `getMarches()` (cacheada 60s, sin límite) traía TODAS
    las caravanas; se dejó intacta para `/mapa` y se creó
    `getMarchesPage(show, page, pageSize)` para la página, con conteos
    reales de "Próximas"/"Finalizadas" en los chips (antes contaban solo
    lo cargado en memoria). Se simplificaron las dos secciones apiladas
    ("Próximas" / "Finalizadas" atenuada) a una sola grilla paginada — el
    badge "Próxima/Finalizada" de cada `MarchCard` ya comunicaba el
    estado individualmente, así que no se perdió información.
  - **Hallazgo**: caravanas no tenía `canManageMarch`, así que la ficha
    pública nunca mostraba el enlace "Gestionar esta caravana" a quien
    inició sesión y la publicó (solo funcionaba con el enlace privado
    guardado). Se agregó, igual que en puntos de ayuda/mascotas.
  - Tap feedback (`.press`) agregado en: `MarchCard` (ahora con
    `.tap-card`), `ComplaintCard`, `MarchManagePanel`,
    `RegisterMarchButton`, `DenunciaButton` (varios botones/dropzone), y
    los enlaces "Ver/Volver a X" en las páginas de gestión de ayuda,
    mascotas, caravanas y comunidad (mismo hueco encontrado en las 4).
  - Se eliminó `getComplaintById` (código muerto, sin usos — las
    denuncias no tienen ficha propia ni gestión por autor, a propósito:
    quedan ligadas a la cuenta que las publicó para que no se puedan
    borrar/editar tras el hecho, igual que los posts de Comunidad).

  **Pendiente de decisión (no se tocó)**: las denuncias no tienen NINGUNA
  moderación (ni panel admin, ni edición/borrado por el autor). Es
  distinto al caso de mascotas: aquí podría ser intencional (una
  denuncia no debería poder "desaparecer" después de publicada, para
  evitar que alguien borre una acusación falsa), pero si se quiere que
  el admin pueda al menos eliminar una denuncia comprobadamente falsa,
  eso falta construirse.

- **Comunidad: filtros + limpieza de portada** — varios pedidos relacionados:
  - Se quitó el widget "Sismo (preliminar): M, heridos, fallecidos" de
    `DashboardStats.tsx` (se veía en "Se busca" y "¿La reconoces?", debajo de
    las 8 cifras) — el dueño sintió esa zona sobrecargada de información.
    `QUAKE_INFO` sigue viva para el mapa.
  - "Destacado" y "Rescates activos" en Comunidad ya NO se apilan uno debajo
    del otro: ahora es una sola fila que se desliza (rescates primero, con un
    badge 🚨 en el título si hay alguno activo), en vez de obligar a bajar la
    página.
  - Puntos de ayuda del seed: los 3 que estaban `verified: true` pasan a
    `false` — los datos vinieron de la web, nadie ha ido presencialmente a
    confirmarlos. **Si en producción hay puntos ya marcados verificados**,
    correr en el SQL Editor de Supabase: `update aid_points set verified =
    false;` (decisión del dueño, no lo ejecuté).
  - Nuevo componente reutilizable **`FilterModal`** (`src/components/FilterModal.tsx`):
    ventana de filtros con el mismo diseño para toda la app; cada página define
    qué campos expone (chips de orden, un `select`, un rango de fechas). Los
    chips de tipo/categoría que ya funcionaban bien en cada sección se
    mantienen sueltos, fuera del modal.
  - Aplicado en **Comunidad**: el "Ordenar" (antes 3 chips sueltos) ahora abre
    el modal de Filtros con 4 opciones de orden (se agregó "Menos apoyadas"),
    más filtro por estado/región y rango de fechas de publicación —
    `getPostsPage` en `data.ts` ahora acepta `estado`/`dateFrom`/`dateTo`.
  - **Pendiente, siguiente en la cola**: aplicar el mismo `FilterModal` en Se
    busca/¿La reconoces?, Voluntarios, Caravanas, Denuncias, Hospitales,
    Noticias, Puntos de ayuda y Mascotas — sección por sección, como el resto
    de esta auditoría.
  - Barra "¿Estás en la zona? Quiero ayudar" del inicio: ahora se oculta si la
    cuenta que inició sesión ya se ofreció como voluntario. Antes `volunteers`
    no se enlazaba a la cuenta (`user_id` no existía en esa tabla); se agregó
    igual que en persons/posts/aid_points/marches/hospitals, y
    `registerVolunteerAction` ahora pasa el id de sesión. **Requiere correr la
    migración en Supabase** (ver abajo).

### ⚠️ Pendiente del dueño: correr la migración de `volunteers.user_id` en Supabase
```sql
alter table volunteers add column if not exists user_id uuid references auth.users(id) on delete set null;
create index if not exists idx_volunteers_user_id on volunteers(user_id);
```
O correr de nuevo todo `supabase/schema.sql` en el SQL Editor (idempotente).
Sin esto, la barra de voluntarios seguirá apareciendo siempre en producción
aunque el usuario ya se haya ofrecido (en local sin Supabase no aplica, porque
no hay cuentas en modo demostración).

- **`FilterModal` en Se busca / ¿La reconoces?** (`src/components/SearchAndFilters.tsx`):
  el botón "Filtros" ya NO despliega el panel inline de antes (cuadrícula de
  selects que empujaba el contenido) — abre la misma ventana centrada que
  Comunidad. Los chips de estado de localización y de grupo de edad se
  quedan sueltos, igual que antes. Dentro del modal: Estado/región, Género,
  edad exacta (rango numérico, nuevo tipo de campo `numberRange` agregado a
  `FilterModal`), Ordenar (recientes/nombre/estado) y **rango de fechas de
  registro** (nuevo). `getPersons`/`PersonQuery` en `data.ts` ahora aceptan
  `dateFrom`/`dateTo`. Importante: el modal conserva el parámetro `view`
  (Se busca vs. ¿La reconoces? viven en la misma ruta `/`) para no devolver
  a "Se busca" al aplicar un filtro estando en "¿La reconoces?".

- **`FilterModal` en Voluntarios** (`src/app/voluntarios/page.tsx`): el tipo
  (Médico/Rescatista/etc.) se queda como chip suelto; dentro del modal ahora
  hay Estado/región, Ordenar (recientes/antiguos/nombre) y rango de fechas de
  registro. Nueva `VolunteerSort` y `estado`/`dateFrom`/`dateTo` agregados a
  `getVolunteersPage` en `data.ts`.

- **Mapa** — se quitó el recuadro "Alertas de rescate activas" (quedan las
  alertas de rescate como pines en el mapa mismo; ese recuadro aparte era
  redundante y ocupaba espacio). **Datos del sismo actualizados** con cifras
  reales de fuentes públicas al 29 jun. 2026 (Infobae, Telemundo): fallecidos
  235→**1.719**, heridos 4.300→**5.034** (`src/lib/geo.ts`, `QUAKE_INFO`).
- **Vaivén automático quitado en Comunidad/Voluntarios/Denuncias**: el dueño
  sintió que, con tanta información en pantalla, el movimiento constante de
  las filas (Destacado en Comunidad, y los chips de tipo/categoría en
  Comunidad/Voluntarios/Denuncias) sobraba. Nuevo componente
  `SwipeStaticRow` (en `src/components/SwipeHint.tsx`): la fila se sigue
  deslizando a mano igual, pero sin el vaivén automático; en su lugar, una
  pista chiquita debajo ("―desliza›", oculta en escritorio) que casi no
  ocupa espacio. Aplicado en esos 4 lugares puntuales — el resto del sitio
  (home, mapa, mascotas, ayuda) sigue con el vaivén automático de antes,
  sin tocar.
- **`FilterModal` en Caravanas** (`src/app/caravanas/page.tsx`): los chips
  Todas/Próximas/Finalizadas se quedan igual; el modal ahora tiene un rango
  de fecha de salida ("Salida entre"). Caravanas no tiene campo de
  estado/región en el modelo de datos (`March` no lo incluye), así que no se
  pudo agregar ese filtro aquí como en las demás secciones.

- **`FilterModal` + paginación real en Hospitales** (`src/app/hospitales/page.tsx`):
  igual que Comunidad/Voluntarios/etc., `getHospitales()` cacheada 60s traía
  TODOS los hospitales y la página filtraba por estado (operativo/saturado/
  lleno/cerrado) en el cliente, sin paginar. Nueva `getHospitalsPage` (en
  vivo, 10/20/50 a elegir); se dejó `getHospitals` intacta para `/mapa` y
  `/admin` (y para los conteos del resumen por estado, que siguen sobre el
  total). El resumen de capacidad (chips operativo/saturado/lleno/cerrado)
  se queda igual, sin movimiento (ya estaba así). Dentro del modal:
  Estado/región, Ordenar (nombre A-Z/recientes/antiguos) y rango de fechas
  de registro. Nueva `HospitalSort` y `estado`/`dateFrom`/`dateTo` en
  `getHospitalsPage`.

- **`FilterModal` en Ayuda** (`src/app/ayuda/page.tsx`): los chips de tipo
  (comida/agua/medicina/...) y "Solo disponibles" se quedan igual; el modal
  agrega Estado/región y rango de fechas de registro. No se agregó "Ordenar"
  aquí a propósito: la lista ya tiene una regla fija (disponibles primero)
  que no debía competir con un orden manual. `getAidPointsPage` en `data.ts`
  ahora acepta `estado`/`dateFrom`/`dateTo`.

- **`FilterModal` en Mascotas** (`src/app/mascotas/page.tsx`): el estado del
  reporte (perdida/encontrada/refugio/veterinario) se queda como chip suelto;
  el modal agrega Estado/región, Ordenar (recientes/antiguas) y rango de
  fechas de registro. Nueva `PetSort` y `estado`/`dateFrom`/`dateTo` en
  `getPets`.

- **Noticias — NO se le puso `FilterModal`, a propósito.** A diferencia de
  las otras 9 secciones, `/noticias` no es una lista paginada con
  búsqueda/filtros: son pestañas de contenido curado muy distinto entre sí
  (Héroes, Ayuda humanitaria, Últimas noticias, Sismos), mezclando datos de
  la BD con feeds en vivo (ReliefWeb, Google Noticias) y la API de USGS. No
  hay un campo común de tipo/estado/fecha que tenga sentido en las 4
  pestañas a la vez, así que forzar el mismo modal ahí habría sido
  artificial. Si se quiere, lo que sí valdría la pena más adelante: las
  pestañas de `NoticiasTabs.tsx` usan estado de React (`useState`), no la
  URL — a diferencia de `CommunityTabs` y el resto del sitio, no se puede
  compartir un enlace directo a, por ejemplo, "Noticias → Sismos". Quedó
  sin tocar por ahora (no era lo que se pidió).

- **Admin** (`/admin`) — último en la cola. Mismo hueco que las 9 secciones
  anteriores: ningún botón tenía tap feedback (`.press`); se agregó en
  `AdminDashboard.tsx` (reportes, verificar personas, puntos de ayuda/
  hospitales, gestores, fijar posts, héroes) y `AdminLogin.tsx`. También un
  N+1 real: al enriquecer "Reportes por verificar" con el nombre de la
  persona se hacía un `getPersonById` por reporte (hasta 100 consultas en
  paralelo); ahora `getPersonsByIds` (nueva, en `data.ts`) trae todas en una
  sola consulta `in("id", ...)`.

  **Verificado, sin tocar (a propósito)**:
  - Crear noticias curadas vive en `/noticias` (gated por `isAdmin`), no en
    el panel — es donde tiene sentido, no es un hueco.
  - Caravanas y Mascotas no tienen "visto bueno" en Admin porque `March`/
    `Pet` no tienen campo `verified` en `types.ts` — no forman parte del
    patrón de consenso/verificación (solo puntos de ayuda y hospitales lo
    tienen, por ser ubicaciones físicas de las que depende gente). No es un
    bug, es alcance intencional.
  - Denuncias sigue sin ninguna moderación por admin (ni panel, ni
    edición/borrado); ya estaba documentado como "pendiente de decisión" en
    la ronda anterior — se deja así, no se tocó de nuevo.

  **Pendiente de decisión (nuevo, no se tocó)**: a diferencia de personas/
  puntos de ayuda/hospitales/comunidad, el admin no tiene forma de eliminar
  una **caravana** o **mascota** de spam/falsa si el propio autor no lo
  hace (solo existe el enlace privado de gestión del autor). Sería un
  patrón nuevo (Admin ya puede eliminar héroes falsos) — si se quiere, se
  puede agregar `deleteMarchAction`/`deletePetAction` al panel más
  adelante.

## Ronda nueva (2026-07-04, segunda parte): re-auditoría por sección completa
El dueño pidió repetir la auditoría por sección, esta vez sobre las 10
secciones YA revisadas antes (no solo lo nuevo) para atrapar cualquier
regresión o hueco que se escapara. Se hizo sección por sección con commits
propios en cada una. Hallazgos reales:

- **Bug real y significativo**: `getMyPublications()` (alimenta "Mis
  publicaciones" en `/perfil` Y la campanita de notificaciones) se había
  quedado desactualizada — nunca se extendió cuando `hospitals`,
  `complaints` y `pets` ganaron su columna `user_id` en migraciones
  posteriores. Alguien que registra un hospital, una denuncia o una mascota
  con su cuenta NUNCA las veía en su perfil ni recibía avisos de comentarios
  nuevos ahí. Corregido: las 3 tablas ahora se consultan igual que las 4
  originales (persons/posts/aid_points/marches).
- **Barrido sistemático de tap feedback** (comparando cantidad de
  `<button>`/`<Link>` contra uso de `.press`/`.tap-card`/`active:scale` en
  TODO `components/`, `components/admin/`, `components/map/` y `app/`, en
  vez de revisar archivo por archivo al azar): encontrados y corregidos 13
  archivos con botones sin ningún tap feedback, entre ellos **`Modal.tsx`**
  (el botón de CERRAR que usa cada modal del sitio) y **`SearchAndFilters.tsx`**
  (los 4 chips de filtro de "Se busca"/"¿La reconoces?", la página de más
  tráfico) — los de mayor alcance. También `OwnerManagePanel.tsx` y
  `PostManagePanel.tsx` (paneles de gestión de personas y comunidad, a
  diferencia de ayuda/mascotas/caravanas que sí lo tenían),
  `AidConsensusVote.tsx`/`HospitalSuppliesVote.tsx` (botones de consenso),
  y varios botones sueltos de copiar/compartir/cerrar avisos.
- **Feature completada**: Denuncias era la única de las 6 secciones en cola
  para `FilterModal` (ver ronda anterior más abajo) que se quedó sin
  aplicar — ahora tiene filtro de estado/región y rango de fechas, igual
  que Voluntarios/Caravanas/Hospitales/Ayuda/Mascotas. `getComplaints()`
  ahora acepta `estado`/`dateFrom`/`dateTo`.
- **Rendimiento**: en `/noticias`, dos consultas de comentarios
  independientes corrían una detrás de otra en vez de en paralelo.
- Se busca/inicio, Comunidad, Mapa, Emergencias, Voluntarios, Ayuda,
  Mascotas, Caravanas y Recursos: revisados a fondo, sin hallazgos nuevos
  más allá de lo de arriba (ya estaban bien desde rondas anteriores).

## Ronda nueva (2026-07-04): Perfil, Configuración, Notificaciones, roles
Todo lo construido DESPUÉS de que la cola original de 10 secciones se cerró
(Perfil, Configuración, campanita de notificaciones, roles/Colaboradores,
rediseño de "¿La reconoces?") nunca pasó por este repaso. Se auditó y
corrigió lo siguiente:

- **Fix real de rendimiento en "¿La reconoces?"**: la baraja repetía a quien
  ya se había marcado "no lo conozco"/"la reconozco" al recargar o volver con
  el botón "atrás" (el avance vivía solo en memoria del componente). Ahora se
  guarda por dispositivo en localStorage (mismo patrón que votos/"me gusta").
  Se agregó también un apartado "Reconocidos" para revisar o deshacer marcas.
- **Fix real de rendimiento**: las imágenes de vista previa de WhatsApp
  (`/persona/[id]/opengraph-image`, `/mascotas/[id]/opengraph-image`) se
  regeneraban con `sharp` en CADA petición sin caché — con la página
  compartiéndose activamente, competía por CPU con el único proceso Node
  (`ecosystem.config.cjs`: `instances:1`). Ahora `revalidate = 3600`.
- **Fix real**: `ProfileMenu` volvía a pedir la sesión con
  `getSessionUserAction()` aunque `AuthMenu` (su padre) ya la había pedido —
  segunda ida y vuelta al servidor de más en cada carga, para cualquiera con
  sesión iniciada. Ahora la recibe como prop.
- **Bug real de hidratación (confirmado en consola)**: `FieldVolunteerBar`
  tenía una variable mutable a nivel de MÓDULO (`shownThisLoad`) leída y
  mutada durante el render, no en un `useEffect`. Como el servidor es un
  proceso Node de PM2 que vive corriendo (no serverless por petición), esa
  variable quedaba compartida entre visitantes distintos — el primero la
  ponía en `true` para todos los que llegaran después, mientras cada pestaña
  del navegador arranca su propio módulo desde cero: error de hidratación en
  cada carga. Se movió la lógica a un `useEffect` (mismo tipo de bug que ya
  se había corregido una vez en `ShareWhatsApp.tsx`; se revisó el resto de
  `components/` y no hay otra variable mutable a nivel de módulo).
- **Revisado, sin bugs**: `Perfil`, `Configuración`/`AccountSettings`,
  `AvatarUpload`, `AccountBanner`, `SafetyBanner` — todos con `.press`,
  estado inicial servido por el servidor (sin refetch redundante), sin
  enlaces rotos (verificado contra las rutas reales de `src/app`).
- **Pendiente, no se tocó**: `useNotifications()` (la campanita, en TODAS
  las páginas) hace 2-3 llamadas de red en cada carga incluso para
  visitantes anónimos sin publicaciones ni cuenta — el guard existente evita
  la más cara (`getActivityForEntities`) cuando no hay nada que mostrar, pero
  las dos primeras (`getMyPublicationsAction`/`getSavedItemsAction`) siempre
  se disparan. Arreglarlo de raíz requeriría pasar el estado de sesión desde
  un Server Component en vez de que cada componente cliente pregunte por su
  cuenta — se intentó pasar la sesión desde `layout.tsx` para `AuthMenu` pero
  se revirtió: convertía TODO el sitio de estático a dinámico (rompía el fix
  ya documentado de Emergencias). Si se quiere resolver esto bien, hace falta
  un enfoque que no toque el layout raíz.

## Siguiente en la cola
**Ninguna sección nueva pendiente** de la cola original (las 10 secciones
están revisadas: Se busca, ¿La reconoces?, Comunidad, Mapa, Fichas de
persona, Emergencias, Noticias, Hospitales,
Voluntarios/Ayuda/Mascotas/Caravanas/Denuncias/Recursos, y Admin).
Queda pendiente aplicar `FilterModal` a Voluntarios/Caravanas/Denuncias/
Hospitales/Puntos de ayuda/Mascotas si no se hizo ya (revisar más arriba en
este documento, ya se fue aplicando sección por sección) y los pendientes
críticos/menores de siempre (ver arriba: claves del VPS, teléfonos de
emergencia, migraciones SQL de mascotas/voluntarios, kit de prensa,
importar personas).

## Otros pendientes menores
- Los 4 documentos del kit de prensa (`docs/kit-prensa/`) con el nombre nuevo.
- Botón "Comunicados de prensa" en Noticias → Drive.
- Importar personas (export autorizado del dueño).
