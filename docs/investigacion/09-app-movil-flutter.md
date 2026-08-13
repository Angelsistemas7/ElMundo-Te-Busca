# 09 — App móvil (Flutter/Dart, Android + iOS)

Sesión de planeación pura — **no se construyó nada hoy**. Objetivo: dejar la
arquitectura y las decisiones claras para empezar a construir mañana.
Fecha: 2026-08-12. Cada afirmación sobre el código cita `archivo:línea`.

Contexto de recursos (confirmado con el usuario): un compañero tiene Mac, por
ahora la app se instala por depuración (Xcode → dispositivo/simulador), **no
se publica en App Store todavía** — así que no aplican por ahora las reglas de
revisión de Apple ni la cuenta Apple Developer de pago ($99/año, solo hace
falta para publicar o para firmar builds de depuración de más de 7 días).

---

## Decisión de arquitectura: Flutter habla directo con Supabase

**No construir una API intermedia.** `supabase_flutter` (SDK oficial Dart) da
paridad casi total con lo que ya usa la web — Auth, Postgres vía RLS,
Storage, Realtime — así que el móvil se conecta al **mismo proyecto
Supabase**, gobernado por las **mismas políticas RLS** (`supabase/schema.sql`)
que ya son la única fuente de verdad de permisos. Evita mantener reglas de
negocio duplicadas en dos lenguajes.

Esto es coherente con el patrón que ya existe en `src/lib/data.ts:74-77`: la
UI nunca habla con la base directo, siempre pasa por una capa — en Flutter esa
capa es un conjunto de *repositories* Dart que replican las funciones de
`data.ts` (sin la rama de memoria/demo, que no aplica a producción móvil).

Lo que **no** tiene equivalente directo y hay que decidir cómo resolver:

| Pieza web | Ubicación | Por qué no aplica igual en móvil | Reemplazo propuesto |
|---|---|---|---|
| Cloudflare Turnstile | `src/lib/turnstile.ts:7` (`verifyTurnstile`), sitekey en `:34` | Widget es web-only (challenges.cloudflare.com) | **App Attest** (iOS) + **Play Integrity API** (Android) — certifican que la llamada viene de la app real firmada, no de un script. Más fuerte que Turnstile para apps nativas |
| Validación zod en Server Actions | `src/app/actions.ts` (todas las mutaciones) | Duplicar los esquemas en Dart = mantenerlos 2 veces, se desincronizan con el tiempo | Validación de escritura movida a una **Supabase Edge Function** delgada (Deno) que web y Flutter llamen por igual para las mutaciones sensibles (crear persona, reportar estado). Constraints de Postgres como segunda capa de defensa, igual que hoy |
| `revalidatePath` tras cada mutación | por toda `actions.ts` | No existe fuera de Next | **Supabase Realtime** (subscribe a cambios) o refetch simple — de hecho mejora la UX: listas se actualizan sin acción del usuario |
| Leaflet (`CrisisMap.tsx`, `next/dynamic({ssr:false})`) | mapa de zonas/ayuda/hospitales/rescates | Web-only | `flutter_map` + mismos tiles (evita atarse a Google Maps y su facturación) |
| `localStorage` para deduplicar votos/likes por dispositivo | patrón en varios componentes de voto | No existe en móvil | UUID de dispositivo generado una vez, guardado en `shared_preferences` — mismo concepto, otro storage |
| `compressImage` (`src/lib/image.ts:14`) + `uploadPhoto` (`src/lib/upload.ts:15`) | subida de fotos | JS/Canvas-only | `flutter_image_compress` antes de subir directo a Supabase Storage con `supabase_flutter` |
| Enlaces de gestión con token (`verifyResourceOwner`, `src/lib/data.ts:1219`; `person_owners`) | `/persona/[id]/gestion?token=`, `/ayuda/[id]/gestion`, etc. | Deben abrir la app si está instalada, no solo el navegador | **App Links** (Android) / **Universal Links** (iOS) sobre el mismo dominio; si la app no está instalada, cae al sitio web actual sin romper nada |
| Rate limiting / bloqueo por IP (`src/lib/rateLimit.ts`, `src/lib/ipLockout.ts`) | login, formularios públicos | Pensado para peticiones HTTP con IP de servidor | Se mantiene igual si las mutaciones sensibles pasan por la Edge Function (ahí sí hay IP de servidor); si se escribe directo a Postgres desde el cliente, ese control se pierde — **razón adicional para la Edge Function en escrituras sensibles** |
| `/admin` (moderación) | `src/app/admin/` | Bajo uso, alta complejidad de UI | **Queda solo web.** No replicar en el MVP móvil |
| Supabase Auth (usuario/contraseña, correo sintético) | `src/lib/auth.ts:35-155` | — | Paridad casi total: `supabase_flutter` soporta `signInWithPassword`, sesión persistida de forma segura (Keychain/Keystore vía `flutter_secure_storage` internamente) |

### Nota de consistencia con [03-pwa-offline.md](03-pwa-offline.md)
Esa investigación **descartó explícitamente** cachear datos de personas/
disponibilidad de forma offline-first, porque servir un estado desactualizado
sin avisar es peligroso en una app de personas desaparecidas. La misma regla
aplica al cache offline de Flutter (Fase 4 abajo): cualquier dato mostrado sin
conexión fresca necesita un aviso visible de "última actualización hace X" —
nunca presentarse como estado actual.

---

## Contenido: qué migra de la web y qué no

### No conviene tener como sección propia en la app — y por qué

| Ruta web | Por qué no |
|---|---|
| `/admin` | Uso de escritorio, poco frecuente, alta complejidad de UI (tablas, acciones en lote). Ya funciona bien en web para quien modera; replicarlo en móvil es esfuerzo alto para valor bajo |
| `/recursos` | Ya es un `redirect()` a `/emergencias` en la propia web (`src/app/recursos/page.tsx:6-8`) — no hay contenido real que portar |
| `/noticias` | Ya es un `redirect()` a `/ayuda` (`src/app/noticias/page.tsx:7-9`) — su contenido se repartió entre `/ayuda` (ReliefWeb, héroes, sismos) y `/comunidad` (historias destacadas) |
| `/mantenimiento` | No es contenido, es un estado global de la app cuando el backend está caído. En Flutter es una pantalla de estado a nivel de app, no un ítem de navegación |
| `/cuenta/confirmar`, `/cuenta/restablecer` | Son destinos de un enlace de correo (recuperar contraseña), no secciones que alguien visite por su cuenta. El equivalente móvil es una pantalla de "restablecer contraseña" propia, alcanzada por Universal Link/App Link desde el correo — se construye, pero no va en el menú |

### Sí, pero en fases posteriores (no en el MVP de lectura/escritura)

`/perfil`, `/configuracion`, `/perfil/publico/[username]` — cuentas y ajustes. Ya estaban ubicados en la Fase 3 (Cuentas) del roadmap de abajo; no son parte de "salvar vidas ya" y no bloquean nada si se posponen.

### Todo lo demás: sí, heredando la jerarquía que la propia web ya definió para móvil

Hallazgo clave: `MobileNav.tsx` (la barra inferior que ya usa la PWA en pantallas chicas) **ya resolvió esta jerarquía** — no hay que inventarla de nuevo:

- **5 tabs primarios** (`MobileNav.tsx:33-39`): Inicio (`/`), Se busca (`/se-busca`), Comunidad (`/comunidad`), Mapa (`/mapa`), SOS (`/emergencias`).
- **Hoja "Más"** (`MobileNav.tsx:41-44`): Ayuda y hospitales, Mascotas.
- **Comunidad agrupa** voluntarios, caravanas y denuncias (`MobileNav.tsx:30`, `COMMUNITY_PATHS`) — no son tabs propios, son subsecciones dentro de Comunidad.
- **Ayuda agrupa** hospitales (`MobileNav.tsx:31`, `AYUDA_PATHS`).

Recomendación: Flutter **hereda esta misma jerarquía tal cual** (mismos 5 tabs + hoja "Más"), en vez de diseñar una nueva. Beneficio directo: quien ya usa la PWA no tiene que reaprender nada al pasar a la app nativa.

### Pantalla Inicio: contenido exacto (de `src/app/page.tsx:12-35`)

**No es un feed de tarjetas** — son 4 bloques verticales, cada uno en su propio `Suspense` para que el cascarón aparezca de inmediato aunque las noticias externas tarden:

1. **Selector de país** (`CountrySwitcher`, dentro de `HomeHero.tsx:159-161`) — en móvil se reduce a un control compacto en la barra superior (bandera + nombre + chevron) en vez de la tarjeta grande de escritorio.
2. **Hero** (`HomeHero.tsx:140-213`): título+subtítulo con gancho emocional (mención al país activo y fecha del sismo), 2 CTAs — *"¿Cómo puedo ayudar?"* → guía de voluntarios, y *"Ver mapa EN VIVO"* → en móvil esto debería **cambiar a la pestaña Mapa** en vez de navegar a una pantalla nueva (evita apilar una ruta redundante sobre un tab ya existente) — y el panel **"Juntos somos más fuertes"** con 4 cifras animadas: Personas buscadas, Reportes verificados, Voluntarios activos, Puntos de ayuda.
3. **Cifra del sismo** (`CrisisStatsPanel`, `HomeHero.tsx:102-129`): fallecidos/heridos/desaparecidos/afectados **según prensa reciente, con fuente y fecha visibles** — o el bloque curado estático si la cifra de prensa tiene más de 30 días (`CRISIS_STAT_FRESHNESS_MS`, línea 89). Regla de honestidad ya resuelta en la web: nunca mostrar una cifra vieja como si fuera reciente — el mismo principio que ya aplica al cache offline (nota arriba).
4. **Fila de 8 cifras deslizables** (`DashboardStats.tsx:34-59`): Desaparecidos, En hospitales, A salvo, Niños, Fallecidos, Denuncias, Necesidades, Ofrecen ayuda — cada una es un enlace a su filtro. En web ya es una fila de scroll horizontal en móvil (`DashboardStats.tsx:49-51`); en Flutter es un `ListView` horizontal directo, cada chip navega a la pestaña/pantalla correspondiente con el filtro pre-aplicado.
5. **Carrusel de noticias verificadas** (`VerifiedNewsCarousel.tsx`): tarjetas con foto, fuente y título de GDELT/GNews; al tocar abren la nota **fuera de la app** (advertir antes de salir, como ya hace `ExternalLinkGuard` en la web).

**No migran al Inicio de la app:**
- `DevModeNotice` — solo modo demostración/desarrollo, no existe en producción.
- `CountryIntroModal` — se mantiene, pero como modal de primer lanzamiento (una vez), no como contenido permanente de la pantalla.

**Corrección sobre el primer mockup de esta sesión:** mostraba una lista de tarjetas tipo "cerca de ti" (persona + punto de ayuda) que no existe en el Inicio real — esa clase de tarjeta sí es el contenido real de `/se-busca` y `/ayuda`, no de `/`. El banner de SOS que agregué tampoco es contenido documentado del Inicio (SOS ya es un tab primario); queda como decisión abierta, no como algo ya en la web.

### Paleta y tipografía (para mockups y para el theme de Flutter)

Tomados de `src/app/globals.css:3-76` — son los valores reales, no aproximados:

- **Marca (terracota)**: `brand-500 #d3824a` (CTAs, focos, enlaces), `brand-700 #9c552e` (texto/ícono activo), `brand-50 #fdf3ec` (fondos suaves de estado activo).
- **Navy**: `navy-700 #1d1b40` (texto de marca, fondos oscuros).
- **Semánticos**: `success-500 #10b981`, `warning-500 #f59e0b`, `danger-500 #f43f5e`, `info-500 #0ea5e9` — mismos que usan las insignias de consenso ("sí hay"/"se acabó") y estados.
- **Fondo/texto base**: `#f8fafc` / `#18181b`.
- **Tipografías**: Signika para encabezados (`--font-heading`), Figtree para cuerpo (`--font-sans`) — ambas cargables en Flutter vía `google_fonts` (paquete Dart) sin tener que empaquetar los archivos a mano.

Mockup de referencia (pantalla de inicio + barra inferior de 5 tabs, con estos colores/tipografías reales) generado en esta sesión — sirve de punto de partida visual, no de diseño final.

---

## Fases propuestas

0. **Cimientos** — repo Flutter nuevo y separado (no monorepo: toolchains muy
   distintos). `supabase_flutter` apuntando al mismo proyecto Supabase.
   Riverpod (estado), `go_router` con deep linking configurado desde el
   inicio (los enlaces de gestión lo necesitan desde la Fase 2).
1. **Solo lectura** — Se busca, ¿La reconoces?, mapa, ayuda, hospitales,
   caravanas, comunidad. Sin escritura ni anti-bot todavía. Ya es útil
   instalada en una zona con mala señal.
2. **Escritura** — registrar persona/reporte, votar, comentar, publicar en
   comunidad, subir fotos. Aquí entran App Attest/Play Integrity y la Edge
   Function de validación.
3. **Cuentas** — login/registro con Supabase Auth, perfil, avatar,
   "voluntario digital" público.
4. **Nativo real** — push notifications (FCM/APNs) para avisos de cambio de
   estado en una persona seguida (mejora que la web no puede dar bien);
   cache offline con aviso de antigüedad (ver nota arriba).
5. **Publicación** — solo cuando se decida: cuenta Apple Developer de pago,
   revisión de tiendas (Apple es más estricta con contenido generado por
   usuarios sin pre-moderación — documentar que `/admin` ya modera).

---

## Decisiones abiertas para retomar mañana

- ¿La Edge Function de validación se escribe ahora (Fase 2) o se empieza
  escribiendo directo a Postgres con RLS + constraints, y se migra a Edge
  Function solo si aparece abuso? (MVP más rápido vs. control más fuerte desde
  el día 1 — no se decidió hoy).
- ¿`flutter_map` con los mismos tiles que usa `CrisisMap.tsx` hoy, o
  aprovechar la migración móvil para revisar el proveedor de tiles? (fuera de
  alcance de esta sesión, no se investigó).
- Nombre/bundle ID de la app, ícono, monetización de las stores (ninguno
  decidido — no aplica todavía porque no hay publicación planeada).
