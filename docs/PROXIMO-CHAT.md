## ✅ Cerrado (2026-08-12, ronda 14) — bug real encontrado y corregido: el nombre anónimo NO estaba bloqueado en comentarios

**El dueño probó en vivo y encontró que la ronda 13 estaba incompleta**: en
comentarios (`CommentSection.tsx`) pudo borrar su nombre sin sesión y poner
otro distinto, sin ninguna traba. La ronda 12 había asumido (nota heredada,
NUNCA re-verificada) que `CommentSection` "ya funcionaba bien" desde la ronda
4 y la usó como referencia para construir `AuthorNameField` — pero en
realidad `CommentSection` solo **prellenaba** el nombre desde `localStorage`
en un `<input>` normal, sin bloquearlo. Nunca se migró al patrón de
`useAuthorName`/bloqueo que sí se aplicó a los otros 4 formularios. Corregido:
`CommentSection.tsx` ahora usa `useAuthorName("vtb_anon_comment_name")` (misma
clave de siempre, separada de la de publicaciones) y el mismo input de
solo-lectura + "¿No eres tú?" que ya usan `CreatePostButton`/`ReportStatusButton`/
`RegisterVolunteerButton`, con `commit()` al comentar con éxito — mismo
comportamiento, con el estilo compacto propio de la caja de comentarios (sin
el `Field`/label completo de `AuthorNameField`, para no romper su diseño).

**Auditoría COMPLETA de todo el sitio para esta ronda** (releído código real,
no notas heredadas, tras el error de arriba):

| Formulario | Campo | Estado |
|---|---|---|
| `CreatePostButton.tsx` (Comunidad) | authorName | ✅ Verificado: usa `useAuthorName`+`AuthorNameField`+`commit()` correctamente |
| `ReportStatusButton.tsx` | reporterName | ✅ Verificado: igual, correcto |
| `RegisterVolunteerButton.tsx` | name | ✅ Verificado: igual, correcto |
| `RegisterMarchButton.tsx` (Caravanas) | organizerName | ✅ Prellenado sin bloquear (ronda 13, a propósito — puede ser un colectivo) |
| `CommentSection.tsx` (TODOS los comentarios del sitio) | authorName | 🔴→✅ **Estaba roto, corregido esta ronda** |
| `RegisterPersonButton.tsx` | contactName | ✅ Verificado: sin `required`, genuinely opcional, no es el bug |
| `RegisterAidPointButton.tsx` | contactName | ✅ Verificado: sin `required`, opcional |
| `RegisterHospitalButton.tsx` | contactName | ✅ Verificado: sin `required`, opcional |
| `PostManagePanel.tsx` (editar post) | authorName | ✅ Verificado: `defaultValue` del post, no bloquea, es edición no creación |
| `MarchManagePanel.tsx` (editar caravana) | organizerName | ✅ Verificado: mismo caso, `defaultValue` |
| `DenunciaButton.tsx` | — | ✅ Verificado: no tiene campo de nombre, requiere sesión, se toma del servidor |

**Foto ampliada (reacciones/comentarios/header sobrepuestos) — re-verificado,
YA estaba corregido de raíz desde antes de esta sesión** (commit `8dedcfb`,
sesión anterior): `PhotoLightbox.tsx` usa `createPortal(..., document.body)`
envolviendo TODO (fondo oscuro, botón cerrar, imagen) en un único `return` —
al estar fuera del árbol DOM del contenedor con `viewTransitionName` en
`persona/[id]/page.tsx`, ese `contain: layout` ya no puede afectarlo pase lo
que pase. Confirmado también que `PersonPhoto.tsx` (la ficha de persona) y
`PhotoView.tsx` (fotos de comentarios/otras fichas) comparten el mismo
componente — un solo fix cubre ambos casos. **No fue necesario tocar código
aquí, solo confirmar que sigue así.**

**Verificado con**: `npm run build` (verde) + `npm run start` + `curl` con
un ID de persona REAL sacado en vivo de Supabase (no un ID inventado) —
confirmado 200 y que el HTML inicial trae el campo "Tu nombre". **Lo que
sigue sin poderse verificar con `curl`** (por ser interacción pura tras
hidratar): que el bloqueo se sienta bien en el navegador — escribir un
nombre, comentar, recargar la página, y confirmar que el campo queda de
solo lectura con el link "¿No eres tú?" en vez de editable.

## ✅ Cerrado (2026-08-12, ronda 13) — RESUELTO: migración corrida con éxito, "Publicar" funciona de nuevo

**El dueño confirmó que pegó `supabase/schema.sql` completo en el proyecto
correcto de Supabase y salió "success".** Se reverificó en vivo de inmediato
(misma consulta OpenAPI de solo lectura) — **las 7 columnas ya existen**:
`persons.photo_hash/possible_duplicate/duplicate_match_id`,
`aid_points.category_status`, `marches.aid_point_id`, `posts.aid_point_id`,
`hospitals.photo_url`. Publicar personas, posts de Comunidad, puntos de
ayuda, caravanas y hospitales debería funcionar de nuevo. Ver la sección
"📖 Ronda 13 — diagnóstico técnico" más abajo para el detalle completo de
la causa raíz (proyecto de Supabase equivocado) y cómo se verificó.

**Además, en la misma sesión, a pedido explícito del dueño ("haz todo,
bien hecho y diseñado"):**

1. **`RegisterMarchButton.tsx` (campo "Organiza") — prellenado, sin
   bloquear.** Usa `useAuthorName("vtb_anon_publisher_name")` para sugerir
   el nombre de sesión/dispositivo como valor inicial, pero el campo queda
   editable (no se llama `commit()`, para no sobreescribir el nombre
   anónimo compartido con un nombre de colectivo/organización — a
   diferencia de los otros 3 formularios, "Organiza" puede legítimamente
   ser distinto al usuario de la cuenta). `PostManagePanel.tsx` se revisó
   y se dejó **intacto a propósito**: ya trae `defaultValue={post.authorName}`
   y es un flujo de EDICIÓN (no de creación), así que el bug de "campo
   vacío obligatorio" no aplica ahí — tocarlo solo para uniformidad hubiera
   sido riesgo sin beneficio real.
2. **Guía rápida (`OnboardingTour.tsx`) — expandida con funciones
   concretas, tal como pidió el dueño ("no tan largas pero sí lo que se
   necesita mostrar").** Se reescribió el texto de 5 pasos (mismo cambio
   en `MOBILE_STEPS` y `DESKTOP_STEPS`, antes solo nombraban la sección):
   - **Se busca**: ahora menciona la pestaña "¿La reconoces?" (deslizar
     tarjetas) y los filtros reales (región, cercanía, agrupar por
     hospital) — antes no se mencionaba ninguna función, y "¿La reconoces?"
     no aparecía en la guía en absoluto pese a ser una sección principal.
     No se le agregó un anclaje/spotlight propio porque no es una página
     aparte: es una pestaña dentro de `/se-busca` (`?view=reconoces`), así
     que ya queda cubierta por el mismo paso.
   - **Comunidad**: ahora nombra los 7 tipos de publicación (🆘 necesito,
     🤲 ofrezco, 🚨 rescate, 🏥 médico...) y las 3 reacciones (🙏 ❤️ ✅).
   - **Caravanas benéficas**: ahora menciona sumarse o convocar la propia,
     y que se puede vincular a un punto de ayuda.
   - **Ayuda y hospitales**: ahora nombra el nivel por recurso (🔴 urgente/
     🟡 limitado/🟢 cubierto), el voto "Sí hay/Se acabó", y el voto
     "¿Tiene insumos?" de hospitales — antes solo decía "con sus recursos".
   - **Mascotas**: ahora nombra los 4 estados (perdida/encontrada/refugio/
     veterinario) en vez de solo "perdidas o encontradas".
   - Se dejaron sin tocar (ya eran concretos): Inicio, Voluntariado digital,
     Denuncias, Mapa, SOS/Emergencias, Tus avisos, Crear cuenta.
3. **Sync de Colombia re-disparado y CONFIRMADO de punta a punta** (run
   [31640408518](https://github.com/Angelsistemas7/ElMundo-Te-Busca/actions/runs/31640408518),
   `gh workflow run sync-legacy-sites.yml` + `gh run watch`). Log real:
   `Colombia: 2 nuevas, 38 ya existían, 0 errores.` (guardó a Claudia María
   Ortiz Castaño y Hernando Girando Gomez con UUID real, sin ningún error
   de columna) y `Venezuela: 0 nuevas, 495 ya existían, 0 errores.` —
   **el bug de guardado está cerrado de verdad, no solo en teoría.**

**Verificado con**: `npm run build` (verde, typecheck + ESLint incluidos) +
`npm run start` + `curl` a `/`, `/caravanas`, `/comunidad`, `/se-busca`,
`/ayuda` (200 en las 5) + confirmado con `curl` que los anclajes `data-tour`
siguen presentes en el HTML servido. **No verificado visualmente en
navegador real** (panel de navegador integrado deshabilitado a propósito
para este proyecto — le crashea la app al dueño, ver
[[feedback_no_browser_pane]]): el contenido nuevo de la guía (overlay
`createPortal`, solo existe tras hidratar) y el campo "Organiza" prellenado
dentro del modal de Caravanas no se pueden confirmar con `curl`. Probar en
el sitio real: abrir la guía "?" y confirmar que los 5 pasos nuevos se leen
bien y no se cortan en móvil; abrir "Convocar caravana" con sesión iniciada
y confirmar que "Organiza" aparece prellenado con el usuario pero se puede
cambiar libremente.

**Pendiente genuino, sin forma de resolverlo desde este sandbox**:
- **VPS**: seguir sin poder confirmar el cron de precalentamiento de
  noticias (puerto 22 bloqueado saliendo de aquí). El dueño debe correr
  `crontab -l` / `tail -50 logs/warm-news.log` en el VPS él mismo.
- **Nombre anónimo, matiz sin confirmar**: el dueño pidió que el nombre sin
  sesión quede fijo "y no se pueda cambiar" — lo implementado permite
  desbloquear con "¿No eres tú?". Sigue siendo una decisión de diseño no
  confirmada explícitamente por el dueño (ver sección "Aclaraciones" más
  abajo).

## 📖 Ronda 13 — diagnóstico técnico completo (histórico — el resumen y el cierre están arriba)

**Sesión cortada a mitad por el dueño** ("voy a continuar en otro chat, deja
listo") — no se llegó a cerrar todo lo que se abrió. Leer esto completo antes
de tocar nada.

### 0. CAUSA RAÍZ CONFIRMADA de por qué la migración nunca se aplicaba

**El dueño confirmó qué pasaba**: llevaba (no se sabe con exactitud desde
cuándo) pegando cada versión nueva de `supabase/schema.sql` en un proyecto de
Supabase **equivocado** — no en el de "El Mundo Te Busca" — por error. Lo
confirmó pegando literalmente en el chat el historial de todo lo que había
pegado ahí: 6 copias crecientes del mismo archivo, cada una un poco más
completa que la anterior — se ve clarísimo cómo fue creciendo sesión a sesión
mientras, sin saberlo, apuntaba al proyecto que no era. También mencionó que
"otro compañero" le pasó horas antes el mismo bloque de `alter table` (las 7
columnas de abajo) por su cuenta — puede que más de una persona tenga acceso
de escritura a Supabase; conviene que el dueño confirme que de ahora en
adelante los cambios de esquema solo se hacen pegando `supabase/schema.sql`
completo (nunca fragmentos sueltos) y solo en el proyecto correcto.

**Re-verificado en vivo, esta vez de forma EXHAUSTIVA** (no solo las 4
columnas ya conocidas de la ronda 12): se consultó el esquema completo del
proyecto CORRECTO (`https://qcmqlqriqqvctwuvoyvc.supabase.co`, el mismo que
usa `.env.local` y por lo tanto la app real en producción) vía la
introspección OpenAPI de PostgREST — las 21 tablas y ~150 columnas, en una
sola consulta de solo lectura con la service role key. Resultado: **exacta-
mente las mismas 7 columnas que ya se sospechaban siguen faltando, y NINGUNA
otra** — todo lo demás (país multi-instancia, `cause`, `lat`/`lng`, `user_id`
en 6 tablas, rol moderador, `pinned`, `avatar_url`, `email_notifications`,
etc., de rondas anteriores) SÍ está aplicado correctamente en la base real. Es
decir, el error de "proyecto equivocado" empezó justo en la sesión de
"duplicados" (la que agregó estas 7 columnas) y no antes:

```
persons.photo_hash              ❌ no existe
persons.possible_duplicate      ❌ no existe
persons.duplicate_match_id      ❌ no existe
aid_points.category_status      ❌ no existe
marches.aid_point_id            ❌ no existe
posts.aid_point_id              ❌ no existe
hospitals.photo_url             ❌ no existe
```

**Confirmado además con lectura directa de `src/lib/data.ts` que las 7 están
en el camino crítico de "Publicar"**, no son columnas secundarias:
- `findPersonDuplicates` (línea 788) hace `SELECT ... .eq("photo_hash", ...)`
  — esto FALLA antes de siquiera llegar al INSERT, en cualquier intento de
  publicar una persona.
- `createPerson` (líneas ~910-912) inserta `photo_hash`/`possible_duplicate`/
  `duplicate_match_id` en CADA persona nueva (manual o del scraper).
- `createAidPoint`/`updateAidPointFields` (líneas 1699/1737) insertan/
  actualizan `category_status` en CADA punto de ayuda.
- `createMarch`/`updateMarchFields` (líneas 2028/2069) insertan/actualizan
  `aid_point_id` en CADA caravana.
- `createPost`/`updatePostFields` (líneas 2822/3074) insertan/actualizan
  `aid_point_id` en CADA post de Comunidad.
- `createHospital` (línea 4125) inserta `photo_url` en CADA hospital nuevo.

**Conclusión: ahora mismo, en producción, "Publicar" está roto para
personas, posts de Comunidad, puntos de ayuda, caravanas Y hospitales** — 5 de
los flujos principales de publicación del sitio (mascotas, denuncias y
voluntarios NO tocan ninguna de estas 7 columnas, esos si funcionan).

**Acción tomada**: se reenvió `supabase/schema.sql` completo como archivo
adjunto en el chat (sin cambios de contenido — esta verificación exhaustiva
confirmó que el archivo ya tiene todo lo que el código necesita, no le falta
nada). Sigue siendo idempotente: pegarlo completo no rompe nada de lo que ya
existe, solo agrega lo que falta.

**Para no repetir el mismo error, esta vez se le insistió al dueño**:
verificar ANTES de pegar que la URL del Dashboard de Supabase dice
`qcmqlqriqqvctwuvoyvc` (`supabase.com/dashboard/project/qcmqlqriqqvctwuvoyvc/...`)
— es el mismo ID que aparece en `NEXT_PUBLIC_SUPABASE_URL` dentro de
`.env.local`. Si el proyecto abierto en el navegador dice cualquier otro
nombre/ID, NO pegar ahí.

**Verificación pendiente para la próxima sesión**: en cuanto el dueño confirme
que lo corrió, repetir la misma consulta de solo lectura (OpenAPI de
PostgREST contra `/rest/v1/` con la service role key) para las 7 columnas de
arriba — es inmediata, no hace falta que el dueño pegue ninguna query de
verificación él mismo. Recién ahí dar el bug por cerrado y volver a disparar
`sync-legacy-sites.yml` para confirmar Colombia de punta a punta (ver punto 2
del checklist más abajo).

### Aclaraciones del dueño que no estaban explícitas todavía (de la sesión con la otra cuenta, para no perderlas)

- **Prioridad explícita, en sus palabras**: "priorizar completamente el
  funcionamiento de publicar personas y publicar cualquier cosa, cuando se
  esta logueado y cuando no se esta logueado" — esta es la lente para
  cualquier decisión de alcance en las próximas sesiones hasta que quede
  resuelto de punta a punta (la migración de arriba es la mitad del
  problema; la otra mitad es el punto 2 de abajo, el campo de nombre).
- **El bloqueo del nombre anónimo pedido es MÁS estricto que lo ya
  implementado** — pidió textualmente: "cuando no se esta logueado que el
  nombre que se puso quede fijo y no se pueda cambiar, puede ser algo" (nota:
  lo dijo como sugerencia, "puede ser algo", no como requisito cerrado). Lo
  que se construyó en la ronda 12 (`AuthorNameField.tsx`) es más laxo: el
  campo queda de solo lectura tras la primera publicación exitosa, PERO con
  un enlace "¿No eres tú?" que lo desbloquea a propósito. Es una decisión de
  UX tomada por la sesión anterior, no confirmada con el dueño — si en la
  próxima sesión el dueño la prueba y prefiere que sea imposible de cambiar
  (sin ningún enlace de escape), es un cambio de una línea (quitar el botón
  "¿No eres tú?" de `AuthorNameField.tsx`).
- **La guía rápida le sigue pareciendo corta — tercera vez que lo dice, esta
  vez más específico**: "le dije lo de la guía rápida que no tenía casi
  contenido. no tocaba ni una sola sección o funciones de una sección,
  prácticamente solo hablaba de las secciones en general." Esto es más
  fuerte que el feedback de rondas 9-10 (ver checklist punto 4 abajo): no
  solo quiere más pasos en el tour de navegación, quiere que la guía entre
  en el DETALLE de qué se puede hacer dentro de cada sección (botones,
  filtros, funciones concretas), no solo nombrar/ubicar las secciones en el
  menú. Confirma la sospecha ya anotada en ronda 10: la opción rechazada en
  ronda 9 (guías separadas DENTRO de cada página) es probablemente lo que
  realmente hace falta, no seguir ampliando el tour de navegación existente.
  **No es urgente ahora** (la prioridad es la migración + el login), pero no
  se debe volver a subestimar cuando se retome.

### 1. La migración de `supabase/schema.sql` SIGUE SIN CORRERSE — reconfirmado en vivo hoy

La ronda 11 avisó de esto y le pasó el archivo al dueño para que lo corriera
en el SQL Editor de Supabase. **Se volvió a verificar en vivo al abrir esta
sesión (consulta de solo lectura contra la base real con la service role
key) y las 4 columnas siguen sin existir**:
```
persons.duplicate_match_id → 42703 column does not exist
aid_points.category_status → 42703 column does not exist
posts.aid_point_id         → 42703 column does not exist
hospitals.photo_url        → 42703 column does not exist
```
**Se encontró algo peor que en la ronda 11**: no es solo que el registro de
personas esté roto — se revisó `src/lib/data.ts` a fondo y **`createPost`
(cualquier publicación nueva en Comunidad), `createAidPoint` (cualquier punto
de ayuda nuevo) y `createHospital` (cualquier hospital nuevo) escriben SIEMPRE
esas columnas que no existen en el INSERT**, sin importar lo que haya llenado
el usuario en el formulario — así que **ahora mismo, en producción, casi
ningún formulario de "Publicar" funciona en absoluto**: ni personas, ni
posts de Comunidad, ni puntos de ayuda, ni hospitales. Probablemente esto
explica el reporte del dueño de "me da error cuando voy a publicar, por
ejemplo en Comunidad" — no es (solo) el campo de nombre, es esto.

**Sigue sin poder correrse desde este sandbox** (mismo motivo que ronda 11:
solo hay API REST de Supabase, PostgREST no permite `ALTER TABLE`; no hay
`DATABASE_URL` en `.env.local`). **Acción #1 de la próxima sesión, antes de
cualquier otra cosa**: confirmar con el dueño si ya pegó `supabase/schema.sql`
completo en el SQL Editor de Supabase (Dashboard → SQL Editor → pegar → Run,
es idempotente). Si no, es la prioridad absoluta — repetir la consulta de
solo lectura de arriba para confirmar antes de seguir con cualquier feature
nueva.

### 2. Nombre pedido pese a tener sesión iniciada — RESUELTO PARCIALMENTE

El dueño reportó: varios formularios piden "Tu nombre" aunque ya esté
logueado, y eso (junto al bug de arriba) causa el error al publicar en
Comunidad. Causa real: `CreatePostButton`, `ReportStatusButton` y
`RegisterVolunteerButton` tenían un campo `authorName`/`reporterName`/`name`
**obligatorio y siempre vacío**, sin mirar la sesión — a diferencia de
`CommentSection.tsx`, que YA resolvía esto bien desde la ronda 4 (con sesión
oculta el campo y comenta con el username; sin sesión recuerda el nombre en
`localStorage` por dispositivo).

Se creó `src/components/AuthorNameField.tsx` (hook `useAuthorName(storageKey)`
+ componente `<AuthorNameField>`) que generaliza ese mismo patrón, con un
agregado nuevo pedido explícito por el dueño: **sin sesión, una vez que el
nombre se guarda en el dispositivo (tras publicar con éxito), el campo queda
de solo lectura** (ya no se puede cambiar libremente en cada publicación —
antes solo se "recordaba" pero seguía editable) — con un enlace "¿No eres
tú?" para desbloquearlo a propósito si hace falta. Con sesión, el campo se
reemplaza por un input oculto con el username de la cuenta (el servidor ya lo
impone igual vía `userId`).

**Aplicado a 3 de los formularios con este problema**:
`CreatePostButton.tsx` (authorName, Comunidad — el que el dueño mencionó
explícito), `ReportStatusButton.tsx` (reporterName), `RegisterVolunteerButton.tsx`
(name). Los 3 comparten la misma clave de `localStorage`
(`vtb_anon_publisher_name`) para que el nombre quede consistente entre
formularios de publicar (no es la misma clave que usa `CommentSection`,
`vtb_anon_comment_name` — se dejaron separadas a propósito para no tocar el
comportamiento de comentarios, que ya funcionaba bien).

**Sin tocar todavía, quedó a medias** (se identificaron con el mismo grep
pero no se llegó a aplicar el mismo patrón antes de que el dueño pidiera
cortar la sesión):
- `RegisterMarchButton.tsx` — campo "Organiza" (`organizerName`, requerido).
  Nota: a diferencia de los otros, este puede legítimamente ser un nombre de
  colectivo distinto al usuario de la cuenta (p. ej. "Cruz Roja local"), así
  que probablemente conviene solo **prellenarlo** con el nombre de sesión/
  `localStorage` como valor por defecto editable, NO bloquearlo como los
  otros — revisar con el dueño si prefiere igual el mismo bloqueo.
- `PostManagePanel.tsx` — campo `authorName` al EDITAR un post ya publicado
  (`defaultValue={post.authorName}`, ya trae el nombre original del post, así
  que el bug es menos grave aquí, pero convendría mismo tratamiento por
  consistencia).
- Revisar si hace falta lo mismo en `RegisterAidPointButton.tsx` /
  `RegisterHospitalButton.tsx` / `RegisterPersonButton.tsx` — esos tienen
  campo "Responsable / organización" / "Nombre de contacto" pero son
  **opcionales**, no bloquean publicar, así que no son el mismo bug (revisado
  hoy, confirmado opcionales) — bajo impacto, no se tocaron.

**No verificado en navegador real** (mismo motivo crónico: el panel de
navegador le crashea la app al dueño) — solo `npm run build` en verde. Antes
de dar esto por cerrado, probar en el sitio real: publicar un post en
Comunidad sin sesión (el nombre debe pedirse la primera vez y quedar fijo
después), y con sesión iniciada (el campo no debe aparecer, debe decir
"Publicando como tu-usuario").

### 3. Bug nuevo encontrado y corregido: foto ampliada tapada mal (header y comentarios se sobreponen)

El dueño mandó una captura: al tocar la foto de una persona para verla
completa, el header de arriba queda SIN oscurecer (visible por encima del
visor) y la caja de comentarios/reacciones se ve encima de la foto ampliada,
en vez de quedar detrás del fondo oscuro. **Causa raíz encontrada**:
`src/app/persona/[id]/page.tsx` pone `style={{ viewTransitionName:
"person-photo-<id>" }}` en el `div` que envuelve `<PersonPhoto zoomable />`
— la propiedad CSS `view-transition-name` hace que ese elemento reciba
`contain: layout` (parte del spec de View Transitions), lo que lo convierte
en el "containing block" de cualquier descendiente `position: fixed` dentro
de él. `PhotoLightbox.tsx` (el visor de pantalla completa) es descendiente de
ese `div` a través de `PersonPhoto`, así que su `fixed inset-0` quedaba
atrapado dentro de los límites de esa cajita de la foto en vez de cubrir la
pantalla completa — de ahí que el header y el resto del contenido de la
página se sigan viendo "por encima".

**Corregido**: `PhotoLightbox.tsx` ahora se monta con `createPortal` directo
en `document.body` (mismo patrón que ya usa `Modal.tsx` y
`OnboardingTour.tsx` para evitar exactamente este tipo de problema de
contención CSS) — así queda fuera del árbol DOM de cualquier ancestro con
`view-transition-name`/`transform`/`will-change`, sin importar dónde se use
`PhotoLightbox` en el futuro. Con `npm run build` verde. **No verificado en
navegador real** — es un bug puramente visual/de stacking, no se puede
confirmar con `curl`. Probar en el sitio real: abrir la ficha de una persona,
tocar la foto para ampliarla, confirmar que el header y la caja de
comentarios quedan detrás del fondo oscuro (no encima) y que cerrar/arrastrar
sigue funcionando igual. El dueño avisó "no sé dónde más pasará" — si el
mismo patrón de `viewTransitionName` envolviendo un elemento zoomable se usa
en otro lado (revisar `PhotoView.tsx`, que comparte el mismo
`PhotoLightbox.tsx` y ya queda cubierto por el mismo fix), confirmarlo ahí
también.



**Hallazgo crítico, sin cerrar todavía**: la migración de `supabase/schema.sql`
de la sesión de "duplicados" (hace varias rondas) **quedó commiteada en el
código pero NUNCA se corrió en la base real de producción**. Ya se había
avisado con un "⚠️" en su momento y no se confirmó. Se descubrió al intentar
arreglar el scraping de Colombia (ver ronda 10 abajo): el fix del selector
sí funciona, pero al intentar guardar cada persona falla con
`column persons.duplicate_match_id does not exist` (error real de Postgres,
`42703`, verificado en vivo contra la base real — no es caché).

Se revisaron además otras 3 columnas de esa misma migración pendiente y
**ninguna existe en producción**:
- `persons.photo_hash` / `possible_duplicate` / `duplicate_match_id` →
  **rompe el registro de personas desaparecidas en el sitio real** (no solo
  el scraper — `createPerson` en `src/lib/data.ts` escribe estas 3 columnas
  en CADA publicación nueva, manual o automática). Esto es lo más grave:
  cualquiera que intente registrar a alguien desaparecido en producción
  ahora mismo probablemente está fallando.
- `aid_points.category_status` → rompe los niveles de urgencia por
  categoría en puntos de ayuda.
- `posts.aid_point_id` / `marches.aid_point_id` → rompe vincular
  publicaciones/caravanas a un punto de ayuda.
- `hospitals.photo_url` → rompe la foto al registrar un hospital.

**No se pudo correr la migración desde este sandbox**: no hay `DATABASE_URL`
(conexión directa a Postgres) en `.env.local`, solo la API REST de Supabase
(anon + service role), y esa API no permite `ALTER TABLE` (PostgREST solo
hace lectura/escritura de datos, no cambios de esquema). Se le envió el
archivo `supabase/schema.sql` al dueño para que lo pegue completo en el SQL
Editor de Supabase (Dashboard → SQL Editor → pegar → Run) — es idempotente,
ya se corrió varias veces antes, no rompe nada existente.

**Verificación pendiente en la próxima sesión, en este orden**:
1. Confirmar con el dueño si ya corrió `supabase/schema.sql` en el SQL
   Editor. Si no, es la prioridad #1 antes de cualquier otra cosa — el
   registro de personas puede seguir roto en producción.
2. Repetir el chequeo de solo lectura que se hizo hoy (pedir a
   `NEXT_PUBLIC_SUPABASE_URL + /rest/v1/persons?select=duplicate_match_id&limit=1`
   con la service role key) para confirmar que las 4 columnas ya existen.
3. Volver a disparar el workflow `sync-legacy-sites.yml`
   (`gh workflow run sync-legacy-sites.yml`) y revisar con
   `gh run list --workflow=sync-legacy-sites.yml --limit 1` +
   `gh run view <id> --log | grep "Colombia:"` que ahora diga "X nuevas"
   con X>0 en vez de errores — recién ahí el scraping de Colombia queda
   confirmado funcionando de punta a punta (el selector ya está arreglado
   y pusheado, commit `49e123f`; solo falta que la migración desbloquee el
   guardado).
4. Probar en el sitio real registrar una persona nueva (formulario público)
   y confirmar que ya no falla.

### Checklist consolidado de TODO lo pendiente de hoy (2026-08-12), para no perder nada

Pedido explícito del dueño al cerrar la sesión: dejar anotado todo lo que
falta, sin que se escape nada. En orden de prioridad:

1. **✅ RESUELTO (ronda 13) — Migración de `supabase/schema.sql` corrida con
   éxito** en el proyecto correcto de Supabase. Las 7 columnas confirmadas
   en vivo. Ver "✅ Cerrado (ronda 13)" al principio del archivo.
2. **✅ RESUELTO (ronda 13) — Scraping de Colombia**, confirmado de punta a
   punta: `Colombia: 2 nuevas, 38 ya existían, 0 errores.` Ver detalle arriba.
3. **Widget de estadísticas de Inicio lento** (`getCrisisStats`,
   `src/lib/news.ts`) — sigue sin confirmarse si el cron de precalentamiento
   (`/api/cron/warm-news`) está instalado y corriendo en el VPS real. No se
   pudo revisar por SSH desde este sandbox (puerto 22 bloqueado saliendo de
   aquí, confirmado con `Connection timed out`; sí hay salida HTTPS normal).
   El dueño tiene la llave en `Desktop/vps/oracle-vps.key`, IP
   `158.101.105.13`, usuario `ubuntu`. Pendiente que el dueño mismo corra:
   ```
   crontab -l
   tail -50 logs/warm-news.log
   ls -la /tmp/elmundotebusca-news-cache-*.json
   ```
4. **✅ RESUELTO (ronda 13) — Guía rápida (OnboardingTour), tercera vuelta,
   esta vez con funciones concretas.** Rondas 9-10 ampliaron pasos y
   textos; el dueño seguía sintiéndola sin contenido real ("no tocaba ni
   una sola función"). Ronda 13 reescribió 5 pasos con detalle concreto de
   funciones (tipos de post, reacciones, niveles de urgencia, votos de
   consenso, estados de mascotas — ver "✅ Cerrado (ronda 13)" arriba). **Si
   en la próxima sesión SIGUE sintiéndola corta pese a este cambio**, ya no
   es un problema de contenido — es la estructura misma (un tour de
   navegación con tarjetas de texto): ahí sí reconsiderar la opción que
   rechazó en ronda 9 (guías separadas DENTRO de cada página).
5. **Todo lo de interacción pura de las rondas 8-10 sigue sin probarse en un
   navegador/teléfono real** (este sandbox no puede usar el panel de
   navegador — le crashea la app al dueño, y `curl` no sirve para overlays
   `createPortal`/estado que revela solo tras `useEffect`):
   - Barra inferior de móvil ya no debería "saltar" en Chrome Android con
     scroll fuerte, y debería verse bien con el teclado abierto (ronda 9).
   - Los 3 avisos superiores (niñez/emergencia/quiero-ayudar) deberían
     aparecer una vez al día, cada uno llevando a su destino correcto
     (modal, `/emergencias`, `/voluntarios/guia`) (ronda 10).
   - La guía debería abrir sola el desplegable/hoja "Más" en los pasos de
     Ayuda y Mascotas, resaltar el ítem real, y cerrarlo al avanzar
     (ronda 10) — es el cambio más nuevo y menos probado de la sesión.
   - Modales respetando "atrás" del navegador, spotlight de la guía en
     ambos tamaños de pantalla (ronda 7-8, sigue sin confirmarse).
6. **`FieldVolunteerBar.tsx` ("¿Estás en la zona del terremoto?") se dejó
   intacto a propósito** — es voluntariado de TERRENO (gente físicamente en
   la zona), un concepto distinto al voluntariado digital que se enlazó en
   los 3 avisos nuevos. No es un pendiente, es una decisión tomada.
7. `sync-venezuela.mjs` no tiene el mismo bug de selector (usa Playwright,
   no cheerio) y sigue funcionando bien — no necesita el mismo fix, pero SÍ
   depende de la misma migración pendiente del punto 1 si intenta guardar
   una persona con `photo_hash`/`duplicate_match_id` (no se confirmó si le
   pega el mismo error, revisar si sigue dando errores tras la migración).

## ✅ Cerrado (2026-08-12, ronda 10) — build verde, pusheado (commit 49e123f)

Continuación de la ronda 9, mismo chat. Tres pedidos del dueño:

1. **Scraping de colombiatebusca.com dejado de funcionar — BUG REAL,
   ENCONTRADO Y CORREGIDO.** El dueño notó que hace rato no se importaban
   personas nuevas de colombiatebusca.com. Diagnóstico con `gh run list`/
   `gh run view --log` sobre el workflow `sync-legacy-sites.yml` (corre cada
   hora en GitHub Actions, no en el VPS): confirmó que colombiatebusca.com
   cambió el formato de sus enlaces (ahora anteponen `tab=persons&page=N&`
   antes de `person=`, antes iba pegado al `?`), y el selector
   `a[href*="?person="]` en `scripts/sync-legacy-sites/sync-colombia.mjs`
   dejó de encontrar nada desde ~2026-08-12 08:15 UTC (antes encontraba
   decenas de personas nuevas por corrida; desde esa hora, 0/0/0 sin errores
   en cada una de las ~10 corridas siguientes). Se confirmó con una petición
   real a colombiatebusca.com + cheerio que el selector ampliado
   (`a[href*="person="]`, sin el `?`) sí encuentra los 20 IDs de la página 1
   — la regex que valida el UUID ya filtraba cualquier falso positivo, así
   que ampliar el selector es seguro. **Se disparó el workflow a mano**
   (`gh workflow run sync-legacy-sites.yml`) para confirmar en vivo que
   volvió a encontrar personas nuevas en vez de esperar a la próxima hora en
   punto — revisar el resultado de esa corrida si no quedó confirmado antes
   de cerrar la sesión. `sync-venezuela.mjs` no tiene el mismo patrón de
   selector (usa Playwright, no cheerio) y seguía funcionando bien
   (confirmado, 0 nuevas pero 495 ya existían en la última corrida antes del
   fix) — no se tocó.
2. **Avisos superiores separados y limitados a una vez al día.** El dueño se
   refería a dos cosas que YA existían por separado (`SafetyBanner.tsx`,
   global en todas las páginas, texto de niñez+911 pegado sin fecha de
   reaparición; y `FieldVolunteerBar.tsx`, "¿Estás en la zona del
   terremoto?", solo en `/se-busca`, reinicia con cada recarga — voluntario
   de TERRENO, no se tocó, es un concepto distinto al voluntariado digital).
   Se separó `SafetyBanner` en 3 avisos de una línea, cada uno con su
   destino: "Protege a la niñez" (abre un modal con la info completa),
   "¿Emergencia ahora mismo?" (lleva a `/emergencias`), y "¿Quieres ayudar?"
   (lleva a `/voluntarios/guia`, el mismo destino que "¿Cómo puedo ayudar?"
   del inicio). Ahora se muestran una vez al día por dispositivo
   (`localStorage` con la fecha, no con un flag permanente) en vez de en
   cada carga de página.
3. **Guía rápida ampliada de verdad — la ronda pasada quedó corta según el
   dueño.** Dos cambios:
   - `OnboardingTour.tsx` ahora ABRE el desplegable ("Más" en escritorio) o
     la hoja inferior (móvil) DE VERDAD durante los pasos "Ayuda y
     hospitales"/"Mascotas", y resalta el ítem real dentro de ese panel (no
     el botón "Más" en sí) — se coordina con `MobileNav.tsx`/`SiteHeader.tsx`
     por el evento nuevo `vtb:tour-set-more` (mismo patrón que
     `vtb:tour-open`/`vtb:auth-open`). Se cierra solo al avanzar al
     siguiente paso. Nuevos anclajes `data-tour="mnav-mas-ayuda"` /
     `"mnav-mas-mascotas"` (y `dnav-*` en escritorio) en los ítems reales
     del menú, ya no apuntan al botón "Más" genérico.
   - El paso único "Comunidad" se separó en 4: resumen + "Voluntariado
     digital" + "Caravanas benéficas" + "Denuncias" (mismo ancla
     `dnav-comunidad`/`mnav-comunidad`, cuatro tarjetas de texto). El tour
     pasó de 9 pasos (10 con el de bienvenida) a 13 (14 con bienvenida).
   - **Ojo para la próxima sesión**: el dueño pidió esto dos veces y en la
     ronda 9 se interpretó "enriquecer el tour existente" de forma más
     conservadora de lo que quería — si sigue pareciendo corto, probablemente
     haya que reconsiderar la opción que rechazó antes (guías separadas
     dentro de cada página, no solo del menú de navegación).

**Intentado y NO logrado — limitación de este sandbox, no del VPS**: el
dueño ofreció la llave SSH de `Desktop/vps/oracle-vps.key` para revisar en
el VPS real por qué el widget de estadísticas de Inicio (`getCrisisStats`,
ver ronda 9) se sigue sintiendo lento. El puerto 22 (SSH) está bloqueado
para salir de este sandbox (confirmado: sí hay salida HTTPS/443 normal,
`curl` a colombiatebusca.com y GitHub funcionan bien; SSH da
`Connection timed out`). La llave se copió a un directorio temporal SOLO
para el intento, con permisos 600, y se borró esa copia al fallar — el
archivo original en el Desktop del dueño no se tocó. **Sigue pendiente que
el dueño mismo corra en el VPS** (IP `158.101.105.13`, usuario `ubuntu`):
```
crontab -l
tail -50 logs/warm-news.log
ls -la /tmp/elmundotebusca-news-cache-*.json
```

**Verificado con**: `npm run build` (verde, typecheck + ESLint incluidos) +
`npm run start` + `curl` a `/`, `/comunidad`, `/se-busca` (200 en las 3) +
petición real a colombiatebusca.com con cheerio confirmando que el selector
nuevo encuentra los IDs reales de personas (20 en la página 1, el viejo
encontraba 0) + workflow de GitHub Actions disparado a mano para confirmar
el fix en producción real (revisar resultado, run
`31636155560`). El contenido de `SafetyBanner` (client-only, revela tras
`useEffect`) y la apertura de "Más" durante el tour no son verificables con
`curl` — solo en un navegador real. **Se confirmó que no había commits
nuevos del compañero** antes de pushear (commit `49e123f`).

## ✅ Cerrado (2026-08-12, ronda 9) — build verde, pusheado (commit 7a17bc5)

Continuación de la ronda 8, mismo chat. El dueño probó el sitio real (capturas
de pantalla desde el teléfono) y reportó dos cosas nuevas:

1. **Barra inferior de móvil "se levanta" con scroll fuerte/largo — RESUELTO
   (solo Chrome Android; confirmado por el dueño que en Safari no pasa).**
   Es un bug conocido: Chrome Android oculta/muestra su barra de direcciones
   al hacer scroll y los elementos `position: fixed` de abajo "saltan"
   durante esa transición porque el navegador tarda en recalcular su
   posición contra el viewport de layout. `MobileNav.tsx` ya no confía en
   que el navegador la reposicione solo: sigue `window.visualViewport`
   (se actualiza tanto con ese caso como cuando se abre el teclado) y
   traduce la barra hacia arriba lo que haga falta, con una transición
   corta (150ms) para que el ajuste no se vea brusco. Mismo mecanismo
   resuelve de paso el otro pedido del dueño ("que no se vea mal con el
   teclado abierto"): al seguir el viewport visual real, la barra queda
   pegada arriba del teclado en vez de saltar o desaparecer detrás de él.
   **Falta confirmar en un Android real** (no verificable con `curl`, es un
   bug de scroll/viewport puro): hacer scroll fuerte hacia abajo varias
   veces seguidas en Chrome Android y confirmar que la barra ya no se
   "levanta"; abrir un formulario con teclado (p. ej. "Publicar" en
   Comunidad) y confirmar que no se ve mal.
2. **Lentitud del widget de estadísticas de Inicio — NO ES BUG NUEVO, sigue
   pendiente de verificar en el VPS (mismo diagnóstico de la ronda de
   seguridad, nunca confirmado).** El dueño reportó que el widget de cifras
   de arriba de Inicio (`HomeHero` → `getCrisisStats` en `src/lib/news.ts`)
   se siente lento en CADA recarga, no solo la primera. Se revisó de nuevo
   el código: depende de la misma fuente lenta que las noticias (GDELT + una
   llamada a IA para extraer las cifras de los titulares), con caché de 3h
   en memoria + disco (`/tmp/elmundotebusca-news-cache-*.json`) para no
   repetir esa espera, y ya está en su propio `<Suspense>` con skeleton (el
   resto de la página no espera por esto). Se confirmó que
   `ecosystem.config.cjs` corre en un solo proceso PM2 (`instances: 1,
   exec_mode: "fork"`), así que no es un problema de caché fragmentada entre
   workers. **No se tocó código** — sin acceso al VPS real desde este
   sandbox, no se puede confirmar si la causa es que el cron de
   precalentamiento (`docs/DESPLIEGUE-VPS.md` línea ~201,
   `/api/cron/warm-news` cada hora) está instalado y corriendo de verdad.
   **Pendiente para el dueño, antes de tocar más código en esto**: correr en
   el VPS `crontab -l`, `tail -50 logs/warm-news.log`, y
   `ls -la /tmp/elmundotebusca-news-cache-*.json` (confirmar que el archivo
   existe y tiene fecha reciente). Si el cron falta o falla, ahí está la
   causa real — no es algo que se arregle con más cambios de código.

**Verificado con**: `npm run build` (verde, typecheck + ESLint incluidos) +
`npm run start` + `curl` a `/`, `/comunidad` (200 en ambas). El fix del
`visualViewport` es puramente de interacción de scroll/teclado — no
verificable con `curl`, solo en un Android real. **Se confirmó que no había
commits nuevos del compañero** antes de pushear (commit `7a17bc5`).

## ✅ Cerrado (2026-08-12, ronda 8) — build verde, pusheado (commit 634f32b)

Continuación de la ronda 7, mismo chat. Pedido del dueño tras probar el sitio real:
mover el botón "?" de la guía al header junto a "Entrar" (confirmado con
`AskUserQuestion` tras un malentendido — el dueño había probado producción, que
todavía tenía la versión vieja flotante, antes de que esto se pusheara), que la
campanita de avisos se vea con sesión iniciada aunque no haya avisos, que la
guía cubra Inicio/Ayuda-hospitales/Mascotas (antes solo mencionados de pasada o
ausentes), que el selector de país explique que VE/CO son los únicos activos
hoy, y que la cuadrícula de estadísticas del perfil de voluntario digital no
quede con una fila suelta.

1. **Botón "?" al header, ya no flotante.** `OnboardingTour.tsx` ya no
   renderiza su propio botón fijo — escucha el evento `vtb:tour-open` (mismo
   patrón que `AuthMenu` con `vtb:auth-open`). El trigger real vive en
   `SiteHeader.tsx`, entre la campanita y "Entrar" (visible en cualquier
   pantalla, esa fila del header no está oculta en móvil).
2. **La guía ya no se abre sola si hay sesión iniciada.** Antes solo miraba
   `localStorage` (visitante nuevo = nunca vista). Ahora, si no se ha visto,
   consulta `getSessionUserAction()`: si hay sesión, se marca como "vista" sin
   abrir sola (alguien con cuenta ya conoce el sitio) — pero el botón "?" del
   header la sigue abriendo manual en cualquier momento, con o sin sesión.
3. **Tour ampliado** (mismo tour de navegación de siempre, no tours nuevos por
   página — se le preguntó al dueño y eligió esta opción, no la de construir
   mini-tours dentro de cada sección): se agregó el paso "Inicio" que faltaba
   por completo (selector Venezuela/Colombia, noticias verificadas, botón de
   voluntariado), se separó "Ayuda y hospitales" y "Mascotas" en dos pasos
   propios (mismo ancla `mnav-mas`/`dnav-mas`, dos tarjetas de texto — antes
   iban mencionados de pasada dentro de un solo paso "Más"), se completó el
   texto de Comunidad, y se sumó una línea en el paso de bienvenida sobre que
   casi todas las listas tienen un botón "Filtros" arriba (a pedido del dueño,
   sin apuntar a cada filtro individual — sería mucho ruido).
4. **Campanita visible con sesión, aunque esté vacía.** `useNotifications.ts`
   ahora expone `loggedIn` (via `getSessionUserAction()`). `NotificationBell`
   ya no se oculta si `entries.length === 0` y hay sesión — muestra un estado
   vacío ("Aún no tienes publicaciones ni guardados...") en vez de nada. Sin
   sesión y sin nada local, sigue oculta (no tendría qué mostrar). El paso
   `tour-bell` de la guía se beneficia de esto: con sesión, ya no se salta.
5. **Selector de país con contexto de misión.** `CountryIntroModal.tsx`:
   burbuja nueva (estilo tarjeta con ícono `Globe2`) arriba de la grilla
   explicando que Venezuela y Colombia son los únicos países activos hoy, y
   que a futuro se piensa sumar más ante cualquier desastre natural. Las
   tarjetas de VE/CO se resaltan más que las inactivas (borde y fondo
   `brand`, insignia "Activo · M{magnitud}" en vez de solo la magnitud).
6. **Cuadrícula del perfil de voluntario digital, pareja.** El dueño notó
   "2/2/2/1" en su perfil — causa real: `DigitalVolunteerCard.tsx` tiene 6
   estadísticas en un `.map()` + una 7ª aparte ("Personas revisadas en '¿La
   reconoces?'"), sin espacio para acomodarla par. Se evaluó agregar
   "reacciones dadas" (idea del dueño) pero **no es una cifra real
   calculable hoy**: ninguna de las 8 acciones de reacción/like
   (`likeAidPointAction`, `reactToPostAction`, etc.) recibe ni guarda
   `userId` — solo incrementan un contador agregado (mismo motivo por el que
   una reacción no se puede "quitar", ronda 4 punto F). Inventar la cifra
   rompería el principio ya establecido de "solo cifras reales" del propio
   código; trackearla de verdad requeriría una tabla nueva + tocar los 8
   endpoints, cambio grande para un ajuste visual. Se aplicó la solución
   honesta: la 7ª estadística ocupa la fila completa (`col-span-2
   sm:col-span-3`) en vez de quedar sola con espacio vacío al lado. Mismo
   ajuste (más simple, genérico) en la ficha pública compartible
   (`/perfil/publico/[username]`, 5 estadísticas, mismo problema de fila
   suelta en móvil).

**Verificado con**: `npm run build` (verde, typecheck + ESLint incluidos) +
`npm run start` + `curl` a `/`, `/comunidad`, `/se-busca`, `/mapa`, `/perfil`
(200 en las 5) + confirmado con `curl` que el botón "Ver guía rápida" y los
anclajes `data-tour="mnav-inicio"`/`"dnav-inicio"` aparecen en el HTML
servido. **No se pudo verificar con curl** (son overlays montados con
`createPortal`, solo existen client-side tras hidratar, igual que en rondas
anteriores): el contenido de `CountryIntroModal` (burbuja nueva), el
spotlight del tour ampliado, y el estado vacío de la campanita. **Se
confirmó que no había commits nuevos del compañero** antes de pushear
(commit `634f32b`).

**El dueño va a probar esto en el sitio real y va a dar una revisión
profunda** — el próximo chat debería empezar leyendo su feedback antes de
tocar código nuevo, no asumir que esta ronda quedó 100% validada visualmente.

## ✅ Cerrado (2026-08-12, ronda 7) — build verde, pusheado (commit b65d351)

Pedido del dueño: que "atrás" del navegador vuelva de verdad a donde estaba
(cualquier página/formulario/sección), una guía rápida tipo spotlight para
la primera visita con DOS versiones (móvil y escritorio) bien resueltas, y
—corrección a mitad de ronda— que Comunidad tenga paginación numerada +
selector de cantidad por página (20 por defecto) como el resto del sitio,
en vez de scroll infinito.

1. **Búsqueda con debounce apilaba historial de más — CORREGIDO.** En
   `SearchAndFilters.tsx` y `CommunitySearchBar.tsx`, el `setParams` que solo
   usa la búsqueda con debounce (350ms) usaba `router.push` — cada letra
   "asentada" mientras escribías creaba una entrada de historial nueva, así
   que "atrás" había que presionarlo varias veces para salir de tu propia
   búsqueda en vez de una sola vez para volver a la página anterior real.
   Cambiado a `router.replace` (los cambios de filtro/página SÍ siguen
   usando `push` vía `FilterModal`/`Pagination`/`PageSizeSelect` — esos sí
   deben ser un paso de "atrás", no se tocaron).
2. **Comunidad pasó de scroll infinito a paginación numerada — CAMBIO DE
   RUMBO a mitad de esta misma ronda.** Primero se hizo un parche para que el
   scroll infinito de Comunidad restaurara lo cargado al volver atrás
   (`sessionStorage` con page+scrollY). El dueño corrigió el pedido: quiere
   Comunidad con el MISMO patrón que Ayuda/Hospitales/Mascotas — botones de
   página numerada + selector "Mostrar X por página" — no scroll infinito.
   Se deshizo el parche y se aplicó lo pedido de verdad:
   - `src/app/comunidad/page.tsx`: ya no usa `InfiniteFeed`, ahora lee
     `page`/`pageSize` de `searchParams` igual que `ayuda/page.tsx` y
     renderiza `<Pagination>` + `<PageSizeSelect>`.
   - **Por defecto 20 por página en Comunidad** (pedido explícito; el resto
     de secciones sigue en 10). Para no cambiar el default global, se agregó
     un segundo parámetro opcional `defaultSize` a `clampPageSize()`
     (`src/lib/utils.ts`) y una prop opcional `defaultValue` a
     `PageSizeSelect` (`src/components/PageSizeSelect.tsx`) — ambos con su
     valor de siempre (10) si no se pasa nada, así ninguna otra página cambió
     de comportamiento.
   - **Borrado por quedar sin uso**: `src/components/InfiniteFeed.tsx`
     (era el único consumidor) y `getMorePostsAction` en `actions.ts` (junto
     con el import de `clampPageSize` ahí, que solo esa función usaba). El
     `sessionStorage`/restauración de scroll del parche anterior desapareció
     junto con el archivo — ya no hace falta: con paginación real por URL,
     "atrás" del navegador vuelve sola a la página/tamaño correctos (son
     entradas de historial normales), sin ningún parche adicional.
3. **Modales sin integrar con "atrás" — CORREGIDO, el cambio de más riesgo de
   esta ronda.** `Modal.tsx` (compartido por TODOS los formularios/modales
   del sitio) no creaba ninguna entrada de historial al abrirse: "atrás" del
   navegador nunca cerraba un modal abierto (formulario a medio llenar,
   denuncia, login...) ni lo reabría si navegabas desde un link dentro de él
   (caso real: `RecognizeDeck.tsx`, "Ver ficha" dentro del modal
   "Reconocidos"). Ahora, centralizado en un solo archivo:
   - Al abrir un modal, se empuja una entrada de historial "fantasma" (misma
     URL) y se registra en un mapa global.
   - Un listener `popstate` global cierra el modal que esté ENCIMA de la
     pila (reutiliza la pila `modalStack` que ya existía para Escape) en vez
     de dejar que el navegador navegue lejos de la página — así nunca se
     pierde sin querer lo que estabas escribiendo.
   - Al cerrarse por cualquier otra vía (X, Escape, fondo, guardar), se
     "limpia" esa entrada fantasma con `history.back()` — con un contador de
     supresión para que ese mismo `back()` no dispare el cierre de OTRO
     modal en el listener global (importante para modales anidados, p. ej.
     `LocationPicker` dentro de un formulario).
   - Guard clave: si mientras el modal estaba abierto ocurrió una
     navegación REAL a otra URL (el caso de `RecognizeDeck.tsx` de arriba),
     se compara el `href` guardado al abrir contra el actual — si difieren,
     NO se llama `history.back()` al limpiar (eso deshubiera esa navegación
     real, sacando al usuario de la página a la que acababa de entrar).
   - Se usa un `ref` para `onClose` (no como dependencia directa del
     `useEffect`) porque muchos llamadores pasan una función inline que se
     recrea en cada render — si el efecto dependiera de su identidad, se
     re-ejecutaría en cada render con el modal abierto (no solo al cerrar),
     disparando `history.back()` de más.
   - **Este es el cambio que más necesita probarse en un navegador real**
     (interactivo, no verificable con `curl`): abrir cualquier formulario,
     presionar "atrás" del navegador (no el botón X) y confirmar que solo
     cierra el modal sin perder lo escrito ni salir de la página; con dos
     modales anidados (p. ej. el mapa de ubicación dentro de un formulario),
     confirmar que "atrás" cierra primero el de encima; y el caso concreto
     de tocar "Ver ficha" dentro del modal "Reconocidos" en Se busca/¿La
     reconoces?, confirmar que sí navega bien a la ficha de la persona.
4. **Guía rápida (spotlight tour) — NUEVA**, `src/components/OnboardingTour.tsx`,
   montada en `layout.tsx` (disponible en cualquier página, no solo el
   inicio). Aparece SOLO en la primera visita (marca en `localStorage`,
   independiente de la cookie de país); un botón "?" flotante (esquina
   inferior derecha, encima de la barra de seguridad en móvil) la vuelve a
   abrir cuando se quiera. Difumina toda la pantalla y resalta un elemento
   de navegación a la vez con un aro y una tarjeta explicando qué hace
   (Siguiente/Atrás/Saltar, contador "2/7").
   - **Dos secuencias de pasos distintas según el ancho de pantalla al
     abrir** (se decide una sola vez, no se reparte a mitad de tour si
     cambia el ancho): móvil ancla a la barra inferior (`data-tour="mnav-*"`
     en `MobileNav.tsx`); escritorio ancla al header (`data-tour="dnav-*"`
     en `SiteHeader.tsx`). Comparten los pasos de campanita de avisos
     (`tour-bell` en `NotificationBell.tsx`) y cuenta (`tour-account` en
     `AuthMenu.tsx`, el botón "Entrar" — con sesión iniciada ese paso se
     salta solo).
   - Si el elemento de un paso no existe en ese momento (p. ej. la
     campanita sin nada que mostrar para un visitante nuevo, confirmado con
     `curl` en esta sesión: con `localStorage` vacío `tour-bell` no se
     renderiza), se salta solo al siguiente paso en vez de mostrar un
     spotlight vacío o quedar congelada.
   - Espera a que el selector de país (`CountryIntroModal`, mismo criterio
     de "primera vez" pero solo en `/`) se cierre antes de arrancar
     (detecta cualquier `role="dialog"` abierto y reintenta cada 400ms) para
     no amontonar dos overlays encima del usuario en su primerísima visita.
   - **Deliberadamente NO incluye el botón "Publicar"** de cada sección (vive
     en componentes específicos de cada página, no en el layout persistente
     como el header/nav) — se menciona en el texto de los pasos "Se busca"/
     "Comunidad" en su lugar. Si se pide después, se puede sumar anclando a
     esos botones en las páginas donde estén montados.
   - **Falta probar en navegador real** (no verificable con `curl`): que el
     aro resalte bien el elemento correcto en ambos tamaños, que la tarjeta
     no se salga de la pantalla en un teléfono angosto, y que el botón "?"
     la vuelva a abrir correctamente.

**Verificado con**: `npm run build` (verde, typecheck incluido) +
`npm run start` + `curl` a `/`, `/se-busca`, `/comunidad`, `/mapa` (200 en
las 4) + confirmado con `curl` que los 13 anclajes `data-tour` (menos
`tour-bell`, que no debe renderizar sin avisos — comportamiento esperado)
aparecen en el HTML servido + confirmado con `curl` que `/comunidad` con
`page=2`, `pageSize=50` y `pageSize=10` responden 200 y que el `<select>`
servido trae `10`/`20`/`50` con `20` marcado por defecto (`selected=""`) y
el `<nav aria-label="Paginación">` presente. **Lo único que sigue sin
poder verificarse de verdad sin un navegador real** son los cambios de
interacción pura (botón atrás cerrando modales, el spotlight de la guía) —
`curl` no puede simular eso. **Se confirmó que no había commits nuevos del
compañero** (`git fetch` + `git log main..origin/main` vacío, `main` local
ya estaba sincronizado con `origin/main`) antes de commitear y pushear
(commit `b65d351`, a pedido explícito del dueño). **Falta probar en el
navegador real** (la sesión de origen no puede usar el panel de navegador
integrado, le crashea la app al dueño — ver nota crónica más abajo) los 3
cambios de interacción de esta ronda, en este orden de importancia:
1. Abrir cualquier formulario (p. ej. "Publicar" en Comunidad) y presionar
   el botón "atrás" del navegador (NO el botón X): debe cerrar solo el
   modal, sin perder lo escrito ni salir de la página.
2. Con dos modales anidados abiertos (p. ej. el selector de ubicación en el
   mapa, dentro de un formulario ya abierto), "atrás" debe cerrar primero
   el de encima, no los dos de golpe.
3. Dentro del modal "Reconocidos" (Se busca/¿La reconoces?), tocar "Ver
   ficha" de una persona: debe navegar bien a `/persona/[id]` (este es el
   caso concreto que motivó el guard de href en `Modal.tsx` — si "atrás"
   te devuelve a la lista en vez de mostrar la ficha, ese guard tiene un bug).
4. La guía rápida: que aparezca sola en la primera visita (borrar
   `localStorage` para simularlo), que el aro resalte el elemento correcto
   tanto en móvil como en escritorio, y que el botón "?" la reabra.
5. Comunidad con paginación: que los botones de página y el selector
   "Mostrar X por página" se vean y funcionen igual que en Ayuda.

## ✅ Cerrado (2026-08-12, ronda 6) — build verde, pusheado

Pedido del dueño: confirmar que Turnstile avisa bien al expirar en TODOS
lados, confirmar nombre de comentarista persistente, que "¿Cómo puedo
ayudar?" tenga peso propio (no ir directo al formulario), y que el
marcador rojo de zonas afectadas en el mapa lleve a "Se busca" (como ya
hacen los demás pines).

1. **Turnstile — CONFIRMADO, sin cambios de código.** Los 12 formularios
   que lo usan (login/registro de cuenta, comentarios, y los 10 de
   publicar/proponer/reportar) llaman `turnstileRef.current?.reset()` al
   fallar el envío, y el propio `Turnstile.tsx` ya detecta expiración
   (`expired-callback`) y muestra "La verificación expiró — vuelve a
   marcarla" con botón para renovar sin perder el formulario. Denuncias no
   usa Turnstile a propósito (exige sesión real en su lugar, ya
   suficientemente anti-abuso).
2. **Nombre de comentarista persistente + insignia — CONFIRMADO** (ya
   resuelto en la ronda 4, punto G): sigue ahí, sin cambios.
3. **"¿Cómo puedo ayudar?" — CONFIRMADO, ya tiene el peso pedido.** El
   botón del inicio (`HomeHero.tsx`) va a `/voluntarios/guia`, una página
   explicativa (qué es un voluntario digital, dos opciones claras:
   "Quiero ser voluntario digital" / "Quiero gestionar un hospital o punto
   de ayuda") — NO va directo al formulario. Se verificó en vivo con
   `curl` que la página renderiza completa. Puede que el dueño estuviera
   viendo una versión vieja en caché del navegador.
4. **Zona afectada en el mapa sin enlace — BUG REAL, corregido.** El
   marcador rojo "🔴 Zonas afectadas" (`MapView.tsx`) mostraba estadísticas
   (por localizar / localizados / sin vida) en su popup pero, a diferencia
   de TODOS los demás pines (ayuda, hospital, caravana, personas,
   rescates, necesito/puedo ayudar), no tenía ningún enlace de salida. Se
   agregó `href` al tipo `Zone` y un link "Ver en Se busca →" en su popup,
   apuntando a `/se-busca?estado=<nombre de la región>` — reusa el filtro
   por región que ya existe en Se busca (más preciso que un radio en km,
   porque coincide exactamente con la agrupación que ya usa el propio
   marcador). Construido en `src/app/mapa/page.tsx` al armar `zones`.

**Verificado con**: `npm run build` (verde) + `npm run start` + `curl` a
`/mapa` y `/se-busca?estado=La Guaira` (200 en ambas). **Falta probar en
navegador real**: tocar un marcador rojo en el mapa y confirmar que el
enlace "Ver en Se busca →" filtra bien por esa región.

## ✅ Cerrado (2026-08-12, ronda 5) — build verde, pusheado

Pedido del dueño: "botón + flotante en móvil (como en Se busca) para publicar
en todos lados", y luego "continuar con todo lo pendiente de la lista, lo
que quedó a medias". Hecho:

1. **FAB de publicar en móvil** en `RegisterAidPointButton`,
   `RegisterMarchButton`, `DenunciaButton`, `RegisterHospitalButton`,
   `RegisterVolunteerButton`, `RegisterPetButton` — mismo patrón que ya
   tenía `RegisterPersonButton` en Se busca (botón `+` fijo arriba de la
   barra inferior, solo en móvil; en escritorio queda el botón normal). No
   se tocó la lógica interna de ningún modal (denuncia sigue mostrando el
   aviso legal primero).
2. **Bug real corregido**: `Modal.tsx` escuchaba "Escape" en `document` sin
   ninguna noción de cuál modal está "encima" — con dos modales anidados
   abiertos a la vez (p. ej. `LocationPicker` o el `mapPoint` de
   `FilterModal` dentro de un formulario ya abierto en su propio Modal),
   Escape cerraba los dos de golpe. Se agregó una pila global de módulo
   (`modalStack`, un `Symbol` por instancia) — ahora Escape solo cierra el
   modal que está más arriba.
3. **Revisado, no era un bug**: `getPersonGroups` (agrupación por
   hospital/región en Se busca) SÍ respeta `nearLat/nearLng/radiusKm` — el
   filtro de cercanía se aplica antes de paginar en ambas ramas (memoria y
   Supabase), independientemente del `pageSize` que pase `getPersonGroups`
   internamente. No hacía falta tocar código.
4. **Vincular a un punto de ayuda ahora también al editar** posts y
   caravanas ya publicados (antes solo se podía al crear). Se agregó el
   mismo selector "Vincular a un punto de ayuda (opcional)" a
   `PostManagePanel.tsx` y `MarchManagePanel.tsx`, se agregó `aidPointId` a
   los `FormData` que leen `ownerUpdatePostAction`/`ownerUpdateMarchAction`
   en `actions.ts`, y `updatePostFields`/`updateMarchFields` en `data.ts`
   ahora persisten `aid_point_id` (ambas ramas, memoria + Supabase). Sin
   migración nueva — la columna ya existía de la ronda anterior.
5. **Hueco de seguridad real, corregido**: `getMorePostsAction` (Server
   Action del scroll infinito de Comunidad) aceptaba `pageSize` directo del
   cliente SIN el `clampPageSize` que sí aplican todas las páginas normales
   — cualquiera que llamara la acción directamente (no solo desde la UI,
   Server Actions de Next.js son endpoints POST invocables con su id
   codificado, visible en el bundle) podía pedir `pageSize=100000` y volcar
   el feed completo en una sola llamada, saltándose la paginación de
   10/20/50. Se agregó el mismo `clampPageSize` ahí (y se sanea `page` a un
   entero ≥1). Se revisó el resto de `actions.ts`: es la única acción
   client-callable que aceptaba `page`/`pageSize` sin control — el resto de
   listados (Se busca, Ayuda, Hospitales, etc.) pagina vía Server Component
   con `searchParams`, que ya pasaba por `clampPageSize` desde antes.

**Revisado, deliberadamente NO tocado (riesgo sin poder probar en
navegador, o requiere datos/decisiones del dueño):**
- `useNotifications()` (llamadas de red de más para visitantes anónimos):
  la sesión vive en una cookie `httpOnly`, no hay forma barata de saber
  "hay sesión" desde el cliente sin otra llamada de red — y el intento
  anterior de pasar el estado de sesión desde un Server Component ya se
  revirtió una vez por romper la página estática de Emergencias. No se
  reintentó a ciegas.
- `docs/kit-prensa/`, botón "Comunicados de prensa" → Drive: no hay código
  construido todavía, necesita un enlace de Drive/decisión de branding que
  solo tiene el dueño.
- Secretos del VPS de ejemplo, teléfonos de emergencia sin verificar: son
  del dueño (reemplazar secretos) o requieren datos reales verificados (no
  inventar teléfonos), no es trabajo de código.

**Verificado con**: `npm run build` (verde, typecheck incluido) +
`npm run start` + `curl` a `/`, `/comunidad`, `/caravanas`, `/ayuda`,
`/comunidad/x/gestion` (200 en todas). **Falta probar en navegador real**
(sigue sin poder usarse el panel, le crashea la app al dueño): el FAB en
cada página en móvil, el selector de "Vincular a un punto de ayuda" al
editar un post/caravana ya publicado, y confirmar que Escape con dos
modales abiertos a la vez ahora solo cierra el de encima.

# Estado y pendientes — "El Mundo Te Busca"

Plataforma ciudadana, sin fines de lucro, para localizar personas desaparecidas y
coordinar ayuda ante CUALQUIER tragedia en el mundo (hoy activa: terremotos de
Venezuela jun. 2026 y Colombia 10 ago. 2026). En producción en
`elmundotebusca.com` (VPS propio, Next.js + Supabase, deploy automático por
GitHub Actions + PM2 en cada push a `main`). Español, `npm run build` siempre
verde.

## ✅ TODO A-G RESUELTO (2026-08-12, ronda 4) — build verde, pusheado

El dueño dijo explícitamente: **ignorar** la sección "🔶 Pendiente — ideas que
quedaron a medias" de abajo (son ideas de hace varias sesiones) y enfocarse
primero en seguridad (ver "✅ Cerrado — ronda de seguridad" más abajo, YA
HECHO) y luego en esta lista de 7 puntos (A-G), que salió de probar la app en
vivo ya publicada en Facebook. **Los 7 quedaron resueltos** en una sesión con
dos chats trabajando en paralelo (uno tomó A/B/C, un agente en worktree
separado tomó D/E/F/G) — detalle punto por punto de qué se hizo en
"✅ Cerrado en esta sesión (ronda 4)" más abajo. Se compiló todo integrado
(`npm run build` verde) y se hizo push a `main`.

**Falta validar en el navegador real** (el panel de navegador le sigue
cerrando la app al dueño, así que solo se verificó con build+typecheck+curl,
nunca clickeando de verdad): probar cada uno de los 7 puntos en el sitio en
producción tal como el dueño los describió, especialmente el modal de
denuncia (E) y los selectores de filtro nuevos (D) que son los que más UI
nueva tienen.

Se deja el detalle original de los 7 puntos abajo como referencia (qué se
pidió exactamente), en este orden (de más visible/urgente a menos):

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

## ✅ Cerrado en esta sesión (2026-08-12, ronda 4) — build verde, A/B/C del bloque de arriba

Dos chats trabajando en paralelo a pedido del dueño: este resolvió A, B, C;
otro (worktree separado) tomó D, E, F, G (ver nota arriba).

**A. País cruzado — RESUELTO.** Se agregó `callingCode` ("+58"/"+57"),
`examplePhone` y `exampleCity` a `CountryConfig` en `src/lib/countries.ts`.
Se propagó a los 13 archivos (todos ya recibían o ahora reciben `country`
como prop desde su Server Component padre, o lo derivan de la entidad
—`march.country`, `point.country`, etc.— cuando es un panel de gestión):
`RegisterVolunteerButton`, `RegisterMarchButton` (+ prop nueva `country` +
`caravanas/page.tsx` le pasa `getActiveCountry()`), `RegisterAidPointButton`,
`RegisterHospitalButton`, `RegisterPetButton`, `RegisterPersonButton`,
`CreatePostButton`, `ReportStatusButton` (+ prop nueva `personCountry` +
`persona/[id]/page.tsx` le pasa `person.country`), `AidPointManagePanel`,
`OwnerManagePanel`, `PetManagePanel`, `PostManagePanel`, `MarchManagePanel`.
Todos los placeholders/hints de teléfono y ciudad ahora usan el país real en
vez de "+58"/"Caracas"/"La Guaira" fijos. **No se tocó** `ProposeHeroButton`
(placeholder de ejemplo de título, no de país) ni el `defaultCenter` de
fallback interno de `LocationPicker.tsx` (nunca se usa en la práctica, todos
los llamadores ya pasan `getCountry(country).epicenter`).

**B. Verificación indebida en puntos de ayuda — REVISADO, NO ERA BUG.**
Confirmado con datos reales de producción (`aid_points`): Colombia tiene 63
puntos, TODOS con el mismo timestamp exacto (`2026-08-12T15:59:43` /
`16:42:37`) — son 100% del import masivo del equipo
(`scripts/import-aid-points.mjs`, que pone `verified: true` por default para
datos curados por el equipo, correcto por diseño). Venezuela: 22 puntos, solo
3 verificados (los del equipo) y 19 sin verificar (públicos) — la lógica ya
distingue bien. `createAidPoint` en `data.ts` (línea ~1671) ya pone
`verified: false` para registro público; el esquema también default `false`.
Filtro por país (`getAidPointsPage`, `.eq("country", country)`) confirmado sin
mezcla. **No se tocó código** — era un malentendido del dueño sobre el origen
de esos 63 puntos (importados por el equipo = correctamente verificados), no
un bug.

**C. Hospitales — RESUELTO (foto) + CONFIRMADO (teléfono, mapa).**
- Bug de teléfono +58/+57: mismo arreglo que el punto A (ya incluido arriba).
- **Foto en hospitales, de punta a punta (no existía)**: `Hospital.photoUrl`
  nuevo en `types.ts`; `createHospital` en `data.ts` ahora recibe `photoUrl`
  como parámetro separado (mismo patrón que `createAidPoint`), ambas ramas
  (memoria + Supabase); `registerHospitalAction` en `actions.ts` usa
  `getPhotoUrl(form)`; columna nueva `photo_url` en `hospitals`
  (`supabase/schema.sql`, migración idempotente al final del archivo);
  `RegisterHospitalButton.tsx` tiene el mismo widget de subir foto que
  puntos de ayuda (`compressImage` + `uploadPhoto`); se muestra en
  `HospitalCard.tsx` (tarjeta) y en `hospitales/[id]/page.tsx` (ficha).
  `seed.ts` actualizado (`photoUrl: null` en los 19 hospitales semilla).
  **No existe un panel de gestión con token para hospitales** (a diferencia
  de puntos de ayuda/caravanas/posts) — se gestionan por consenso comunitario
  + admin/moderador, así que no hace falta agregar edición de foto ahí.
- Mapa "marcar lugar exacto" confirmado en TODOS los formularios que lo
  necesitan: persona, punto de ayuda, hospital, voluntario (los 4 ya llaman
  `<LocationPicker defaultCenter={getCountry(country).epicenter} />`).
  Mascotas NO lo tiene y el dueño confirmó que el registro de mascotas ya
  está completo tal cual — no se agregó (habría requerido migración nueva:
  `pets` no tiene columnas `lat`/`lng` en el esquema aunque el tipo
  `Pet.lat/lng` sí las declara — deuda técnica menor, no se tocó por no
  haber sido pedido y por evitar riesgo de esquema no solicitado).

**⚠️ Falta correr `supabase/schema.sql` de nuevo** — se agregó
`hospitals.photo_url`. Es idempotente, no rompe nada existente:
```
psql "$DATABASE_URL" -f supabase/schema.sql
```

**Verificado con**: `npm run build` (verde, typecheck incluido) +
`npm run start` + `curl` a `/hospitales`, `/caravanas`, `/ayuda` (200 en las
3). No se pudo probar visualmente el flujo completo de subir una foto de
hospital en un navegador real (misma limitación de siempre — panel de
navegador le crashea la app al dueño). **Probar en el navegador real antes
de dar esto por 100% verificado**: registrar un hospital con foto desde
Colombia y confirmar que el placeholder de teléfono diga +57 y la foto se
vea en la tarjeta y la ficha.

**D. Filtros movidos al selector de Filtros — RESUELTO.** En `/denuncias`
(`src/app/denuncias/page.tsx`) y `/voluntarios` (`src/app/voluntarios/page.tsx`)
las chips sueltas de categoría/tipo (fuera del botón "Filtros") se quitaron;
la categoría (denuncias: riesgo de niñez, desvío/robo de ayuda, fraude,
abuso, etc.) y el tipo de voluntario (médico, enfermero, psicólogo,
electricista...) ahora son un campo `kind: "chips"` más dentro de
`buildFilterFields(...)`, que ya se pasa a `<FilterModal>` (mismo componente
reusado en todo el sitio). En `/caravanas` (`src/app/caravanas/page.tsx`) se
aplicó el mismo patrón al filtro "Todas/Próximas/Finalizadas" que también
vivía suelto fuera del modal. `FilterModal`/`FilterField` (`src/components/
FilterModal.tsx`) ya soportaban `kind: "chips"` de antes, no hizo falta
tocar ese componente. Se quitaron los `Link`+`cn` locales que armaban las
chips a mano (`showHref`, `typeHref`, `catHref`) por quedar sin uso.

**E. Denuncia como modal — RESUELTO.** El aviso legal ("Antes de publicar,
por favor...") vivía fijo en la página `/denuncias`, siempre visible aunque
nadie fuera a denunciar. Se movió dentro de `DenunciaButton.tsx`: el modal
ahora arranca en un paso nuevo `step === "notice"` (antes arrancaba directo
en `"form"`) que muestra ese mismo aviso con dos botones, "Cancelar" y "OK,
entendido" → recién ahí pasa a `"form"` (que a su vez ya redirigía a pedir
login si no hay sesión, sin cambios). `close()` y el estado inicial de
`step` se actualizaron para volver a `"notice"` la próxima vez que se abra.
`src/app/denuncias/page.tsx` perdió el bloque `<ShieldAlert>` fijo de la
página (el import de `ShieldAlert`/`getEmergency` se movió al componente).

**F. Reacciones anónimas no se pueden quitar — REVISADO, YA ERA ASÍ.**
`LikeButton.tsx` y `PersonReactions.tsx` ya guardan en `localStorage`
(`vtb_like_*`/`vtb_preact_*`) apenas se reacciona y deshabilitan el botón
(`disabled={liked}`/`disabled={reacted[k]}`) — no existe ninguna acción de
"quitar" en `actions.ts`/`data.ts` (se confirmó con grep, no hay
`unlike`/`removeLike`/`toggleLike`). Es decir: se puede reaccionar sin
cuenta, pero nunca deshacerlo, que es exactamente lo pedido. **No se tocó
código**, era un malentendido — probablemente el dueño vio el botón
"presionado"/resaltado visualmente y lo interpretó como que se podía volver
a tocar para desmarcarlo.

**G. Nombre de comentarista fijo + insignia "Sin verificar" — RESUELTO.**
`CommentSection.tsx`: se agregó `ANON_NAME_KEY = "vtb_anon_comment_name"` en
`localStorage` — la primera vez que alguien sin cuenta escribe su nombre
para comentar, `updateName()` lo guarda; un `useEffect` nuevo lo precarga la
próxima vez (en cualquier publicación, no solo la misma) para no pedirlo de
nuevo, hasta que la persona se cree una cuenta real (con sesión, el nombre
ya viene del usuario y ese campo ni se muestra, sin cambios ahí). Cada
comentario de alguien sin sesión (`c.authorName` sin `<Link>` de perfil)
ahora muestra una insignia gris "Sin verificar" al lado del nombre.

**Verificado con**: `npm run build` (verde, typecheck incluido) tras
integrar el trabajo del agente en paralelo con A/B/C, sin conflictos reales
(solo `caravanas/page.tsx` se fusionó a mano porque A y D tocaban el mismo
archivo) + `npm run start` + `curl` a `/denuncias`, `/voluntarios`,
`/caravanas` (200 en las 3, y se confirmó que el aviso legal fijo ya no
aparece en el HTML de `/denuncias`). **Falta probar en navegador real**:
abrir el modal de "Denunciar" y confirmar que el aviso aparece primero,
tocar "Filtros" en denuncias/voluntarios/caravanas y confirmar que las
categorías/tipos aparecen ahí, comentar sin cuenta dos veces y confirmar que
el nombre quedó recordado la segunda vez.

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
