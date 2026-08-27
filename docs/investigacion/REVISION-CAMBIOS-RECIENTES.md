# Revisión de cambios recientes

Fecha de revisión: 27 de agosto de 2026.

## Alcance y método

No existen pull requests, abiertos o cerrados, cuyo autor sea `Angelsistemas7`.
Por ello se revisaron los diffs completos de sus cinco commits más recientes,
además del código actual relacionado y las reglas de `CLAUDE.md`.

Se prestó atención especial a:

- separación entre autoridad sobre personas y consenso sobre recursos;
- tokens privados de `person_owners` y `resource_owners`;
- doble implementación memoria/Supabase de `src/lib/data.ts`;
- RLS, uso de service role, autenticación, abuso y exposición de PII;
- sincronización entre `supabase/schema.sql`, `src/lib/types.ts` y validaciones;
- rendimiento, accesibilidad y comportamiento de los nuevos límites `Suspense`.

## Resumen por commit

| Commit | Qué hace | Riesgos encontrados | Severidad máxima | Estado |
|---|---|---|---|---|
| `d0026e9` | Excluye `supabase/functions` del typecheck de Next para no interpretar código Deno como TypeScript del navegador/servidor Next. | La exclusión arregla el build, pero deja la Edge Function sin ninguna verificación de tipos automatizada. | Medio | Recomendado |
| `91ca155` | Añade el rol `volunteer`, `profiles.blood_type`, `poll` y la consulta privada `list-needs-help`. | El rol existía solo en SQL y no se podía asignar desde el flujo tipado del panel; errores al cambiar `pending` podían ocultar alertas; la ubicación antigua podía reemplazar el snapshot del sismo; la lista global de 50 filas puede omitir emergencias; `user_id` y `blood_type` no tienen un flujo completo de escritura. | Alto | Parcialmente arreglado |
| `95d1f96` | Crea `safety_optins`, `safety_checkins` y la Edge Function de activación, ubicación, prueba y respuesta. | `test-alert` permitía fabricar alertas de emergencia desde el endpoint público; `device_id` funciona como único secreto de gestión; no hay rate limit; `respond` confirmaba éxito aunque no modificara ningún check-in. | Crítico | Parcialmente arreglado |
| `d9017d8` | Separa el cascarón y los datos de ocho listados mediante `Suspense`. | No se encontró una regresión funcional en los filtros, paginación ni separación de autoridad/consenso. Los skeletons no anuncian el estado de carga a tecnologías de asistencia. | Bajo | Recomendado |
| `6e9043a` | Añade un cierre de sesión operativo a `docs/PROXIMO-CHAT.md`. | Mezcla documentación permanente con datos y afirmaciones operativas de producción que envejecen y amplían la información pública sobre la infraestructura. | Bajo | Recomendado |

## Hallazgos priorizados

### Crítico

#### C-1. El endpoint de prueba podía llenar la cola de rescate con emergencias falsas

- **Commit:** `95d1f96`
- **Archivo:** `supabase/functions/safety-optin/index.ts:258-290`
- **Estado:** arreglado
- **Por qué importa:** `activate` acepta un UUID nuevo y coordenadas elegidas por
  el cliente. Después, `test-alert` creaba un check-in sin autenticación
  adicional ni límite de frecuencia. El mismo cliente podía responder
  `needs_help`, o esperar cinco minutos para que apareciera como
  `no_response`. Repitiendo el flujo se podían ocupar las 50 posiciones que ve
  un voluntario y desplazar alertas reales.
- **Corrección aplicada:** `test-alert` queda deshabilitado por defecto y solo
  funciona si el entorno controlado define
  `ENABLE_SAFETY_TEST_ALERTS=true`. No se debe activar esa variable en
  producción de forma permanente.

### Alto

#### A-1. Un fallo al promover `pending` dejaba víctimas fuera de la lista sin avisar

- **Commit:** `91ca155`
- **Archivo:** `supabase/functions/safety-optin/index.ts:95-108`
- **Estado:** arreglado
- **Por qué importa:** la consulta posterior solo devuelve
  `needs_help`/`no_response`. Si el `UPDATE` de los pendientes fallaba, el
  código ignoraba el error y devolvía una lista aparentemente válida sin esas
  personas.
- **Corrección aplicada:** se comprueba el error del `UPDATE` y se responde
  `500 db_error`; así el cliente no confunde una operación parcial con una
  lista completa.

#### A-2. El rol `volunteer` estaba desincronizado entre SQL, tipos, zod y panel

- **Commit:** `91ca155`
- **Archivos:** `supabase/schema.sql:201-224`,
  `src/lib/types.ts:430-452`, `src/lib/validation.ts:270-276`,
  `src/components/admin/AdminDashboard.tsx:1000-1100`
- **Estado:** arreglado
- **Por qué importa:** PostgreSQL aceptaba el rol, pero `AppRole`,
  `roleAssignSchema` y las opciones del panel no. El flujo administrativo
  normal no podía otorgar el permiso requerido por `list-needs-help`.
- **Corrección aplicada:** se añadió `volunteer` a la fuente tipada, su
  etiqueta, la validación de servidor y el selector del panel. La rama en
  memoria de `src/lib/data.ts` usa el mismo `AppRole`, por lo que conserva la
  paridad con Supabase.

#### A-3. Una ubicación antigua podía sustituir el snapshot del sismo

- **Commit:** `91ca155`
- **Archivo:** `supabase/functions/safety-optin/index.ts:150-179`
- **Estado:** arreglado
- **Por qué importa:** la respuesta prefería siempre `last_lat/last_lng`,
  aunque `last_location_at` fuera anterior al check-in. Un voluntario podía ser
  enviado a una ubicación histórica en vez de la capturada al emitir la
  alerta.
- **Corrección aplicada:** la ubicación del opt-in solo reemplaza el snapshot
  si ambas coordenadas existen y `last_location_at >= notified_at`.

#### A-4. La cola devuelve como máximo 50 alertas globales y no permite paginar

- **Commit:** `91ca155`
- **Archivo:** `supabase/functions/safety-optin/index.ts:110-119`
- **Estado:** propuesta pendiente de decisión
- **Por qué importa:** durante un evento grande, o ante spam de activaciones,
  cualquier alerta posterior a las 50 más recientes desaparece de la respuesta.
  Tampoco se filtra por país o zona de responsabilidad del voluntario.
- **Corrección propuesta:** definir el alcance operativo del rol y añadir
  paginación estable por `notified_at,id`, filtros de país/región autorizados y
  un total o cursor. La aplicación móvil debe adaptarse antes de cambiar el
  contrato.

#### A-5. Nombre y tipo de sangre no tienen un flujo completo de vinculación

- **Commit:** `91ca155`
- **Archivos:** `supabase/functions/safety-optin/index.ts:125-148`,
  `supabase/functions/safety-optin/index.ts:191-212`,
  `supabase/schema.sql:790-803`, `supabase/schema.sql:837-842`
- **Estado:** propuesta pendiente de decisión
- **Por qué importa:** `list-needs-help` busca el perfil mediante
  `safety_optins.user_id`, pero `activate` nunca escribe `user_id`. Además,
  `blood_type` solo se crea y se lee: no existe en este repositorio una
  operación que lo actualice. Para opt-ins creados por este endpoint, ambos
  datos serán `null`, aunque la persona tenga una cuenta.
- **Corrección propuesta:** cuando exista una sesión válida, derivar
  `user_id` del JWT en servidor, nunca del cuerpo; añadir un flujo autenticado
  y explícito para editar `blood_type`; decidir si borrar la cuenta elimina el
  opt-in y su historial. No se implementó porque afecta identidad, privacidad y
  el contrato con la app móvil.

### Medio

#### M-1. `device_id` actúa como credencial permanente para ubicación y respuestas

- **Commit:** `95d1f96`
- **Archivo:** `supabase/functions/safety-optin/index.ts:185-256`,
  `supabase/functions/safety-optin/index.ts:295-365`
- **Estado:** propuesta pendiente de decisión
- **Por qué importa:** quien obtenga el UUID de instalación puede desactivar la
  red, mover la ubicación, consultar el check-in o responder por la persona. Un
  UUID aleatorio es difícil de adivinar, pero puede filtrarse en logs,
  analítica, copias de seguridad o enlaces internos y no existe rotación.
- **Corrección propuesta:** emitir un token de gestión separado, aleatorio y
  rotatable, almacenarlo hasheado y exigirlo en todas las mutaciones; vincular
  las operaciones a la sesión cuando haya una cuenta.

#### M-2. Las acciones públicas con service role no tienen límite de frecuencia

- **Commit:** `95d1f96`
- **Archivo:** `supabase/functions/safety-optin/index.ts:56-71`,
  `supabase/functions/safety-optin/index.ts:190-320`
- **Estado:** propuesta pendiente de decisión
- **Por qué importa:** aunque `test-alert` quede cerrado, se pueden generar
  muchos `safety_optins`, escrituras de ubicación y lecturas `poll` con UUID
  distintos. Eso consume base de datos y capacidad de la Edge Function.
- **Corrección propuesta:** aplicar límites en el borde y un límite persistente
  por IP/dispositivo/acción. Para `activate`, evaluar Turnstile o App
  Attest/Play Integrity según el cliente móvil. No se añadió un contador local
  porque una Edge Function puede ejecutarse en varias instancias.

#### M-3. `respond` devolvía éxito para alertas inexistentes o ya resueltas

- **Commit:** `95d1f96`
- **Archivo:** `supabase/functions/safety-optin/index.ts:323-365`
- **Estado:** arreglado
- **Por qué importa:** el cliente podía mostrar una confirmación que nunca
  quedó guardada. También podía reescribir el estado de un check-in resuelto.
- **Corrección aplicada:** se limita el identificador a 128 caracteres, se
  actualizan solo filas no resueltas y se devuelve `404 checkin_not_found` si
  no hubo coincidencia.

#### M-4. La Edge Function quedó fuera de toda comprobación de tipos

- **Commit:** `d0026e9`
- **Archivo:** `tsconfig.json:21-22`
- **Estado:** recomendado
- **Por qué importa:** excluir Deno del proyecto Next es correcto, pero no hay
  `deno check`, configuración Deno ni CI alternativo. Errores en la función que
  maneja ubicación y alertas pueden llegar al despliegue sin ser detectados.
- **Corrección propuesta:** añadir una verificación separada con una versión
  fijada de Deno/Supabase CLI y ejecutarla en CI. No se agregó porque el
  repositorio y el entorno actual no incluyen Deno ni una convención de CI para
  Edge Functions.

#### M-5. La clave foránea de `safety_optins.user_id` no define borrado

- **Commit:** `95d1f96`
- **Archivo:** `supabase/schema.sql:790-803`
- **Estado:** propuesta pendiente de decisión
- **Por qué importa:** cuando se implemente la vinculación del hallazgo A-5,
  PostgreSQL impedirá borrar una cuenta que tenga un opt-in, a diferencia de
  las demás relaciones a `auth.users`, que declaran `cascade` o `set null`.
  Esto afecta el flujo de eliminación de cuenta y la retención de ubicación.
- **Corrección propuesta:** decidir la política de privacidad. Para datos de
  seguridad y ubicación, `on delete cascade` es la opción conservadora; si se
  necesita conservar el historial anonimizado, usar `on delete set null` y una
  política explícita de retención.

#### M-6. El índice no cubre el orden de la consulta operativa

- **Commit:** `95d1f96`
- **Archivo:** `supabase/schema.sql:810-824`
- **Estado:** recomendado
- **Por qué importa:** la cola filtra por estado y `resolved_at`, ordena por
  `notified_at desc` y limita resultados. El índice parcial actual solo contiene
  `status`, por lo que una cola grande puede requerir ordenar muchas filas.
- **Corrección propuesta:** después de medir con `EXPLAIN ANALYZE`, usar un
  índice parcial como `(status, notified_at desc)` donde
  `resolved_at is null`.

### Bajo

#### B-1. Los nuevos estados de carga no se anuncian a lectores de pantalla

- **Commit:** `d9017d8`
- **Archivo:** `src/components/ListSkeletons.tsx:46-125`
- **Estado:** recomendado
- **Por qué importa:** al cambiar un filtro React reemplaza el listado por
  bloques visuales, pero no existe un estado textual `role="status"` ni
  `aria-live`; una persona que no ve la animación puede no saber que el
  resultado está actualizándose.
- **Corrección propuesta:** envolver el fallback con un mensaje accesible
  “Cargando resultados” y ocultar los bloques decorativos con
  `aria-hidden="true"`. Conviene aplicarlo de forma uniforme a todos los
  skeletons, no solo a una ruta.

#### B-2. El documento de traspaso publica detalles operativos que envejecen

- **Commit:** `6e9043a`
- **Archivo:** `docs/PROXIMO-CHAT.md:1-73`
- **Estado:** recomendado
- **Por qué importa:** el archivo afirma el estado de producción y describe
  despliegue, VPS, SSH, PM2 y verificaciones sobre datos reales. No contiene una
  credencial en el bloque revisado, pero la acumulación de identificadores y
  topología ayuda al reconocimiento externo y puede inducir a confiar en
  verificaciones ya antiguas.
- **Corrección propuesta:** antes de publicar el repositorio, mover bitácoras
  operativas a un espacio privado y dejar en público solo procedimientos
  reproducibles, sin detalles innecesarios de infraestructura ni afirmaciones
  temporales.

## Comprobación de patrones del proyecto

- **Doble rama memoria/Supabase:** los commits revisados no añadieron una
  operación a `src/lib/data.ts`. La corrección de `AppRole` sí beneficia ambas
  ramas porque el almacén en memoria y la rama Supabase comparten el tipo.
- **Autoridad para personas:** no se modificaron `person_owners`, sus tokens ni
  el flujo oficial de cambio de estado.
- **Consenso para recursos:** no se modificaron los votos ni los contadores de
  puntos de ayuda/hospitales.
- **Enlaces de gestión:** no se modificaron `resource_owners` ni la verificación
  de tokens de puntos, caravanas o publicaciones.
- **Turnstile/rate limit:** no se añadieron Server Actions públicas. La Edge
  Function móvil sí requiere una defensa equivalente contra abuso; queda
  recomendada en M-2.
- **Esquema/tipos:** se corrigió la divergencia del rol `volunteer`. La
  vinculación de perfil y el tipo de sangre siguen incompletos y se documentan
  en A-5.

## Arreglos incluidos

1. `test-alert` cerrado por defecto mediante una bandera explícita de entorno.
2. Propagación de errores al convertir pendientes en `no_response`.
3. Selección segura entre ubicación actual y snapshot del sismo.
4. Respuestas limitadas a check-ins existentes y no resueltos.
5. Rol `volunteer` sincronizado entre SQL, tipos, zod, panel y rama en memoria.

## Propuestas que requieren decisión

1. Paginación y alcance territorial de la cola de rescate.
2. Vinculación autenticada entre opt-in y perfil, edición del tipo de sangre y
   política de borrado.
3. Sustituir `device_id` como credencial por un token de gestión rotatable.
4. Rate limiting/attestation para las acciones públicas de la Edge Function.
5. Retención de ubicación y ajuste del índice tras medición en producción.
6. Verificación Deno independiente en CI.

## Verificación

- `npm install`: completado.
- `npm run build`: completado correctamente. Next emitió advertencias ya
  existentes sobre Supabase en Edge Runtime y `metadataBase`.
- `npm run typecheck`: completado correctamente.
- Prueba de humo del build: `npm run start` y petición a `/` respondieron
  correctamente con HTTP 200.
- Sintaxis TypeScript de `supabase/functions/safety-optin/index.ts`: validada
  con el compilador TypeScript. Esto no sustituye el `deno check` recomendado.
- `npm run lint`: no es ejecutable de forma no interactiva en el estado actual:
  `next lint` intenta crear la configuración ESLint porque el repositorio no
  tiene una. No se añadió configuración dentro de esta revisión para no
  introducir dependencias y cambios globales ajenos a los cinco commits.
- Hooks de pre-commit: no se encontró configuración de pre-commit, Husky ni
  Lefthook.

### Dependencias detectadas durante la verificación

`npm audit --omit=dev` informa tres vulnerabilidades altas en las versiones
actuales de `next`, su `postcss` interno y `sharp`. No fueron introducidas por
los cinco commits revisados. Las correcciones propuestas por npm requieren
saltos mayores (`next` 16 y `sharp` 0.35), por lo que no se aplicaron como
arreglo de bajo riesgo. Deben tratarse en una actualización separada con
pruebas completas de imágenes, Server Actions, App Router y despliegue.
