# Escaneo de seguridad — 27 de agosto de 2026

Revisión completa del código con el proyecto ya a punto de publicarse. Punto de
partida: `e61d0a1` (rama `main`). Se leyeron primero
[`docs/AUDITORIA-SEGURIDAD.md`](../AUDITORIA-SEGURIDAD.md),
[`docs/INFORME-SEGURIDAD.md`](../INFORME-SEGURIDAD.md) y
[`docs/CHECKLIST-INFRAESTRUCTURA.md`](../CHECKLIST-INFRAESTRUCTURA.md) para no
repetir lo ya corregido; este informe solo cubre lo que sigue vigente hoy y lo
nuevo (cuenta con Google, Edge Function `safety-optin`, pacientes de hospital,
endpoint de noticias para la app móvil).

Ningún valor de secreto aparece en este informe.

## Resumen

| Severidad | Hallazgo | Estado |
|---|---|---|
| Crítico | Datos de salud y cédula de pacientes legibles por cualquiera (RLS + UI) | Propuesta pendiente de decisión |
| Crítico | `safety-optin`: identidad solo por `device_id`; expone ubicación exacta y tipo de sangre | Propuesta pendiente de decisión (freno de abuso ya aplicado) |
| Alto | `CRON_SECRET` viajaba en la URL (queda en logs de nginx/Cloudflare/cron) | Corregido |
| Alto | Comparación de tokens de gestión y de la cookie de admin con `===` (canal temporal) | Corregido |
| Alto | Redirección abierta por barra invertida en el flujo de ingreso (`next=/\dominio`) | Corregido |
| Alto | Dependencias vulnerables: `sharp`, `postcss` | `sharp` propio corregido; los de Next quedan propuestos |
| Medio | Foto de noticia del panel sin validar → SSRF del servidor | Corregido |
| Medio | Falta `Strict-Transport-Security` | Corregido |
| Medio | Ubicación exacta de voluntarios legible en la base | Propuesta pendiente de decisión |
| Bajo | `lint` no está configurado (`next lint` pide configuración interactiva) | Propuesta pendiente de decisión |

Lo que se verificó y **está bien** (sin cambios): no hay secretos ni `.env` en el
árbol ni en el historial (solo `.env.example`, sin valores; tampoco
`google-services*`, `.pem`, `.p12` ni keystores); ninguna `NEXT_PUBLIC_*` es
sensible; `SUPABASE_SERVICE_ROLE_KEY` solo se lee en `src/lib/supabase.ts`
detrás de `getSupabaseAdmin()` y en la Edge Function, nunca en un componente de
cliente; no hay `dangerouslySetInnerHTML` en `src/`; `src/lib/socialEmbed.ts`
limita los embeds a `twitter.com`/`x.com` con ruta `/status/<dígitos>` y no arma
HTML crudo; las noticias se pintan como texto de React; no hay SQL crudo ni
concatenación de consultas; `verifyOwner`/`verifyResourceOwner` sí se aplican en
**todas** las acciones de edición/borrado de persona, `aid_point`, `march` y
`post`; `person_owners` y `resource_owners` no tienen lectura pública; no hay
políticas públicas de UPDATE/DELETE; no hay endpoints de depuración; los dos
endpoints de `src/app/api/**` no exponen datos personales; Turnstile está en los
formularios públicos y `postCommentAction` limita `entityType` por lista blanca.

---

## Crítico 1 — Los datos de salud de los pacientes de hospital son públicos

- `supabase/schema.sql:332` (tabla) y `supabase/schema.sql:617`
  (`create policy "public_read_patients" on hospital_patients for select using (true)`)
- `src/components/HospitalPatients.tsx:128-129` (la UI muestra cédula y condición)

La tabla guarda `full_name`, `cedula`, `condition`, `status` y `note`. Con
lectura pública en RLS, **cualquiera con la clave anon** (que va en el bundle
del navegador, como corresponde) puede descargar la lista completa de personas
ingresadas con su cédula y su diagnóstico. Eso es un registro médico
identificado; además la UI ya lo enseña en la ficha del hospital.

Reproducción: desde cualquier navegador,
`fetch(NEXT_PUBLIC_SUPABASE_URL + "/rest/v1/hospital_patients?select=*", { headers: { apikey: NEXT_PUBLIC_SUPABASE_ANON_KEY } })`.

**No se corrige en este PR**: la lista de ingresados es justamente la función
del módulo de hospitales (una familia busca a alguien y comprueba si está
ingresado), así que quitar la lectura pública apaga una parte visible del
producto y hay que decidir el diseño. Opciones, de menor a mayor cambio:

1. Minimizar lo público: dejar de guardar/mostrar `cedula` y `condition` en
   claro y publicar solo nombre y estado (estable/grave/…), que es lo que
   necesita quien busca. Es el cambio más pequeño con casi todo el beneficio.
2. Vista pública reducida: una vista de Postgres con solo nombre + estado, con
   lectura pública, y la tabla completa sin lectura pública (solo service role,
   para el moderador del hospital).
3. Búsqueda por nombre exacto en el servidor (una Server Action que confirme
   "sí/no está ingresado") en vez de listar; evita la descarga masiva.

Mientras se decida, conviene no cargar cédulas reales en producción.

## Crítico 2 — `safety-optin` autoriza por `device_id` y devuelve tipo de sangre y ubicación exacta

- `supabase/functions/safety-optin/index.ts` — acciones `activate`,
  `deactivate`, `update-location`, `test-alert`, `poll`, `respond`
- Lista para voluntarios: `select("user_id, username, blood_type")` y
  `lat/lng` del último punto conocido
- CORS `Access-Control-Allow-Origin: "*"`

Todas las acciones salvo `list-needs-help` se autorizan **solo con el
`device_id` que manda el cliente**, y la función opera con service role. Quien
adivine o capture un `device_id` puede desactivar el check-in de esa persona
(deja de aparecer como "necesita ayuda"), moverle la ubicación o responder por
ella. `list-needs-help` sí exige sesión con rol `volunteer`, pero devuelve tipo
de sangre y coordenadas exactas, es decir dato de salud más ubicación precisa de
personas en riesgo: si una cuenta de voluntario se cuela, se lleva todo el
padrón.

**Corregido en este PR (parte de abuso, sin cambiar comportamiento legítimo):**
`test-alert` ya no crea un check-in nuevo si ese dispositivo tiene uno sin
resolver; devuelve el existente con `already_pending: true`. Antes cada llamada
insertaba una fila con `quake_id` distinto que a los 5 minutos aparecía como
`no_response`, o sea que se podía inundar la cola que miran los voluntarios con
avisos falsos durante una emergencia real.

**Propuesta pendiente de decisión** (toca el contrato con la app Flutter, no se
puede cambiar a ciegas desde este repo):

- Ligar el opt-in a la cuenta (JWT de Supabase) y usar `device_id` solo como
  identificador secundario; o, si tiene que funcionar sin cuenta, entregar en
  `activate` un secreto aleatorio del servidor y exigirlo en las demás acciones
  (el `device_id` deja de ser la credencial).
- Restringir el CORS al dominio del sitio y al de la app.
- En `list-needs-help`, entregar coordenadas aproximadas y el tipo de sangre
  solo cuando el voluntario acepta atender ese caso, no en el listado.
- Limitar la longitud de `push_token` y `quake_id`.

---

## Alto 1 — `CRON_SECRET` viajaba en la URL — CORREGIDO

- `src/app/api/cron/warm-news/route.ts` (antes: `searchParams.get("secret")`)
- `docs/DESPLIEGUE-VPS.md` (el crontab documentado usaba `?secret=…`)

La línea de petición se escribe entera en el log de acceso de nginx, en los logs
de Cloudflare y —por el `>>` del crontab— en `warm-news.log` del propio VPS.
Cualquiera con lectura de logs se lleva la clave.

Corrección: el endpoint acepta el secreto por `Authorization: Bearer …` o
`X-Cron-Secret`, y lo compara en tiempo constante. Se mantiene `?secret=` como
compatibilidad para no romper el crontab ya instalado; la guía y `.env.example`
ya documentan la cabecera. **Acción manual pendiente:** cambiar el crontab del
VPS a la cabecera y luego rotar `CRON_SECRET` (el actual ya está en los logs).

## Alto 2 — Comparación de tokens con `===` — CORREGIDO

- `src/lib/data.ts` — `verifyOwner` y `verifyResourceOwner`
- `src/middleware.ts` — cookie de admin en modo mantenimiento

`===` sobre cadenas corta en el primer byte distinto, así que el tiempo de
respuesta filtra cuánto prefijo acertó quien prueba tokens. `src/lib/admin.ts`
ya usaba `timingSafeEqual`, pero estos caminos no. Corrección: nueva utilidad
`src/lib/constantTime.ts` (`constantTimeEqual`, sin `node:crypto` porque el
middleware corre en runtime Edge) usada en los tres sitios y en el endpoint de
cron.

## Alto 3 — Redirección abierta por barra invertida en el ingreso — CORREGIDO

- `src/app/auth/callback/route.ts`, `src/app/cuenta/confirmar/route.ts`,
  `src/app/cuenta/usuario/page.tsx`, `src/lib/auth.ts` (`getGoogleAuthUrl`)

Los cuatro sitios validaban el parámetro `next` con "empieza por `/` y no por
`//`". Los navegadores normalizan la barra invertida a barra normal, así que
`next=/\atacante.example` pasa el filtro y termina navegando a
`//atacante.example`, es decir a otro dominio, justo después de iniciar sesión
con Google: base perfecta para una página de phishing que parece continuación
del flujo.

Reproducción: abrir `/auth/callback?next=/\atacante.example` (o pedir el ingreso
con Google con ese `next`) y observar el `Location` de la respuesta.

Corrección: helper único `src/lib/safeNext.ts` que además rechaza barras
invertidas y caracteres de control, usado en los cuatro sitios.

## Alto 4 — Dependencias vulnerables (`npm audit`)

- `sharp <0.35.0` (GHSA-f88m-g3jw-g9cj, CVEs heredadas de libvips) — el proyecto
  procesa con `sharp` imágenes descargadas de terceros en `src/lib/ogImage.ts`,
  así que aquí la entrada es controlable por quien publica una foto.
- `postcss <=8.5.22` (cuatro avisos, entre ellos lectura arbitraria de archivos
  `.map` vía `sourceMappingURL`) — afecta la construcción, no el servidor.

Corregido: `sharp` de primer nivel subido a `^0.35.3` (instalado 0.35.4). Build
y typecheck pasan.

**Propuesta pendiente de decisión:** las copias que quedan vulnerables son las
*anidadas dentro de Next* (`node_modules/next/node_modules/{sharp,postcss}`) y
`npm audit fix --force` propone `next@16.3.3`, un salto de mayor con cambios
incompatibles. A días de publicar no conviene. Opciones: esperar a que Next 15.x
actualice sus dependencias, o forzar `overrides` de `sharp`/`postcss` y volver a
verificar el optimizador de imágenes de `next/image` con fotos reales de
Storage. El `postcss` anidado solo interviene al compilar, con CSS del propio
repo, así que su riesgo real aquí es bajo.

---

## Medio 1 — Foto de noticia del panel sin validar (SSRF) — CORREGIDO

- `src/app/admin/actions.ts` — `createNewsItemAction` pasaba `photoUrl` tal cual

El resto de las acciones filtra las URLs de foto con `isSafePhotoUrl` (solo el
bucket propio de Storage); esta no. La URL termina en un `fetch()` del servidor
al armar la imagen de compartir (`src/lib/ogImage.ts`), o sea que servía para
hacer que el servidor pidiera direcciones internas. Requiere sesión de admin,
por eso es Medio y no Alto. Corregido aplicando `isSafePhotoUrl`.

## Medio 2 — Faltaba `Strict-Transport-Security` — CORREGIDO

- `next.config.ts`

Había `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy` y
`Permissions-Policy`, pero no HSTS: una primera visita por HTTP podía
degradarse y llevar la cookie de sesión o el token del enlace de gestión en
claro. Añadido `max-age=31536000` sin `includeSubdomains` (hay subdominios que
no se sirven desde aquí).

## Medio 3 — Ubicación exacta de voluntarios legible en la base

- `supabase/schema.sql:613` (`public_read_volunteers`) y tabla `volunteers`

La UI ya aproxima las coordenadas al pintar el mapa (corregido en una ronda
anterior, ver `docs/INFORME-SEGURIDAD.md`), pero la fila publica `lat`/`lng`
exactos y el contacto, y la lectura pública de la tabla permite descargarlos con
la clave anon, saltándose la UI. Son domicilios de personas que se ofrecieron a
ayudar.

**Propuesta pendiente de decisión:** guardar las coordenadas ya redondeadas (2-3
decimales) al insertar, o mover el contacto y la posición exacta a columnas sin
lectura pública (vista reducida para el mapa). Cambia lo que reciben los
componentes del mapa, por eso no se toca aquí.

## Bajo 1 — `npm run lint` no está configurado

`next lint` abre un asistente interactivo porque el repo no tiene configuración
de ESLint, así que hoy no hay lint automatizable ni en CI. Propuesta: migrar a
la CLI de ESLint con `eslint-config-next` (`npx @next/codemod@canary
next-lint-to-eslint-cli .`). No se hace aquí porque añade dependencias y
probablemente saque muchos avisos en todo el árbol, y eso no es un cambio
mínimo de seguridad. `npm run build` y `npm run typecheck` sí pasan.

---

## No verificable desde el repositorio

Sin credenciales de producción no se puede afirmar nada del estado vivo. Queda
para verificación manual con
[`docs/CHECKLIST-INFRAESTRUCTURA.md`](../CHECKLIST-INFRAESTRUCTURA.md):

- Que el bucket `photos` tenga de verdad `allowedMimeTypes` y `fileSizeLimit`.
  `src/lib/upload.ts` valida tipo y tamaño en el navegador, pero la clave anon
  permite subir directo a Storage saltándose la app: sin el límite del lado del
  bucket, el control real no existe.
- Que las políticas RLS aplicadas en el proyecto Supabase coincidan con
  `supabase/schema.sql` (el archivo es la intención, no la prueba).
- Cloudflare (proxied, Full strict, WAF, rate limiting), TLS, `client_max_body_size`
  de nginx, cortafuegos del VPS y permisos del `.env`.
- Las URLs de redirección permitidas en Supabase Auth para el ingreso con
  Google.
