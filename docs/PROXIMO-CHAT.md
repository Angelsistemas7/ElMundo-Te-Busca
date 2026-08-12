# Estado y pendientes — "El Mundo Te Busca"

Plataforma ciudadana, sin fines de lucro, para localizar personas desaparecidas y
coordinar ayuda tras los terremotos de Venezuela (jun. 2026) y Colombia (10 ago.
2026). En producción en `elmundotebusca.com` (VPS propio, Next.js + Supabase,
deploy automático por GitHub Actions + PM2 en cada push a `main`). Español,
`npm run build` siempre verde.

## ✅ Cerrado en esta sesión (2026-08-11/12) — todo desplegado y migrado

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

## 🔶 Pendiente — ideas que quedaron a medias o sin construir

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
   cualquier página se queda en "Cargando…" en el navegador de la sesión
   (confirmado con `curl` que el HTML se genera bien server-side). Probar
   de verdad en el teléfono/navegador normal cuando se pueda, especialmente:
   - El botón de ícono de mapa al publicar una persona (que abra bien la
     ventana, que el pin se pueda arrastrar).
   - El filtro "Buscar cerca de un punto" con los chips de radio.
   - La guía de voluntariado y el formulario de solicitar gestor.
   - La cola "Solicitudes de gestor" en `/admin` (aprobar/rechazar).

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
