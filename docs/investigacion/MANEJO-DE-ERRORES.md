# Auditoría de manejo de errores

**Fecha:** 27 de agosto de 2026
**Alcance:** capa de datos, Server Actions, subidas, integraciones externas, rutas API, fronteras de Next.js, listados, Edge Functions y scripts operativos.

## Resumen ejecutivo

La revisión encontró fallos de alto impacto que podían quedar invisibles: formularios que continuaban sin la foto seleccionada, estados optimistas que permanecían aunque el servidor rechazara la operación, errores de Supabase ignorados en permisos y estadísticas, una actualización no comprobada en `safety-optin` y scripts que terminaban con código de éxito después de importaciones parciales.

Este cambio corrige los casos de bajo riesgo y mayor valor, introduce un logger servidor común y añade códigos estructurados a los resultados de las acciones críticas. No se modificaron RLS, el esquema de datos ni dependencias.

Quedan propuestas que requieren una decisión de producto o una refactorización mayor: hacer obligatorio el código de error en todas las Server Actions, definir si una caída del detector de duplicados debe bloquear una publicación y aislar cada bloque secundario de todos los listados.

## Metodología

- Lectura de la documentación de arquitectura, estado y seguridad.
- Revisión manual de `src/lib/data.ts`, `src/lib/supabase*.ts`, `src/lib/upload.ts`, `src/lib/news.ts`, `src/lib/usgs.ts`, `src/app/actions.ts`, rutas API, fronteras de error, páginas de listado, `supabase/functions` y scripts.
- Búsqueda de `catch` vacíos, promesas no esperadas, resultados de Supabase sin comprobar y actualizaciones optimistas sin rollback.
- Revisión de consumidores antes de modificar contratos de Server Actions.
- Separación entre errores silenciosos y degradaciones intencionales.

## Hallazgos críticos

### C-01 — Una publicación podía continuar silenciosamente sin la foto seleccionada

**Ubicaciones:** `src/components/RegisterPersonButton.tsx:144`, `src/components/RegisterAidPointButton.tsx:58`, `src/components/RegisterHospitalButton.tsx:55`, `src/components/CreatePostButton.tsx:89`, `src/components/DenunciaButton.tsx:77`, `src/components/RegisterPetButton.tsx:63`, `src/components/RegisterVolunteerButton.tsx:65`, `src/components/AddNewsItemButton.tsx:52`, `src/components/CommentSection.tsx:147`.

**Por qué importa:** la persona podía creer que adjuntó evidencia visual de una persona desaparecida, un hospital, un punto de ayuda o una denuncia, pero el formulario continuaba después de fallar la compresión o subida.

**Corrección aplicada:** detener el envío, mantener el formulario utilizable y mostrar `No se pudo subir la foto. Intenta de nuevo.`. En denuncias también se vuelve al paso editable.

## Hallazgos altos

### A-01 — Errores internos de Server Actions no quedaban registrados ni clasificados

**Ubicaciones:** `src/app/actions.ts:116-151`, acciones críticas desde `src/app/actions.ts:494`.

**Por qué importa:** Turnstile, límite de frecuencia, validación, autenticación, permisos y fallos internos llegaban a la UI con formas indistinguibles; los `catch` devolvían un texto genérico sin dejar contexto servidor.

**Corrección aplicada:** se añadieron `ActionErrorCode`, `ActionFailure`, `actionFailure` e `internalFailure`. Las acciones críticas de personas, reportes, ayuda, comunidad, mascotas, voluntariado, denuncias y hospitales devuelven mensajes españoles seguros y códigos diferenciados. Las excepciones se registran solo en servidor y nunca se devuelve el error crudo.

**Propuesta pendiente de decisión:** hacer `code` obligatorio y migrar todas las acciones de autenticación, perfil, gestión y lectura. Actualmente es opcional para no romper consumidores existentes; acciones de lectura como `getAidPointOptionsAction` (`src/app/actions.ts:679`) o `canManageHospitalAction` (`src/app/actions.ts:1585`) todavía pueden rechazar la promesa si falla su dependencia.

### A-02 — Consultas de Supabase ignoraban errores en permisos y propiedad

**Ubicaciones:** `src/lib/data.ts:987`, `src/lib/data.ts:1013`, `src/lib/data.ts:1059`, `src/lib/data.ts:1257`, `src/lib/data.ts:1493`.

**Por qué importa:** una caída de base de datos podía confundirse con “sin permiso” sin dejar diagnóstico. En flujos de gestión delegada esto dificulta distinguir una denegación válida de una indisponibilidad.

**Corrección aplicada:** comprobar y registrar los errores de propiedad, gestores y roles; los permisos siguen fallando de forma cerrada.

**Propuesta pendiente de decisión:** devolver una causa interna separada desde los verificadores de propiedad. Cambiar de `boolean` a un resultado discriminado afecta muchas acciones y se deja fuera de este cambio mínimo.

### A-03 — Lecturas previas y agregaciones podían usar datos incompletos como si fueran válidos

**Ubicaciones:** votos existentes en `src/lib/data.ts:1850-1857` y `src/lib/data.ts:4259-4266`; publicaciones propias en `src/lib/data.ts:2900-2910`; estadísticas en `src/lib/data.ts:2972-3038`.

**Por qué importa:** ignorar el error de una consulta previa puede producir votos incorrectos, estadísticas falsas o publicaciones que desaparecen de la vista personal.

**Corrección aplicada:** lanzar ante errores de consultas necesarias y registrar/degradar únicamente enriquecimientos no esenciales.

### A-04 — Votos, “me gusta” y reacciones podían quedar confirmados solo en el navegador

**Ubicaciones:** `src/components/AidConsensusVote.tsx:52-53`, `src/components/HospitalSuppliesVote.tsx:52-53`, `src/components/LikeButton.tsx:48-49`, `src/components/CommentSection.tsx:408-432`.

**Por qué importa:** la interfaz mostraba una señal ciudadana como guardada aunque Supabase o la Server Action la hubiera rechazado.

**Corrección aplicada:** esperar el resultado, revertir contador y `localStorage`, y mostrar un mensaje reintentable.

### A-05 — La expiración de alertas de seguridad ignoraba el resultado de la base

**Ubicación:** `supabase/functions/safety-optin/index.ts:98-107`.

**Por qué importa:** una actualización fallida podía dejar alertas `pending` indefinidamente y el operador recibir una lista incompleta o incoherente.

**Corrección aplicada:** comprobar `expirationError`, registrar solo el código y devolver HTTP 500 antes de continuar.

## Hallazgos medios

### M-01 — Un fallo secundario podía tumbar secciones completas de listados

**Ubicaciones corregidas:** `src/app/se-busca/page.tsx:95-105`, `src/app/comunidad/page.tsx:112-140`, `src/app/ayuda/page.tsx:136-153`, `src/app/hospitales/page.tsx:81-87`.

**Por qué importa:** `Promise.all` rechaza todo el bloque si falla una consulta auxiliar, aunque el listado principal esté disponible.

**Corrección aplicada:** `withServerFallback` registra la causa y permite degradar solo extras, comentarios, contadores o permisos visuales. Los listados principales siguen propagando sus fallos a la frontera de error y conservan el botón de reintento.

**Propuesta pendiente de decisión:** extender límites por sección a páginas con agregaciones más acopladas, por ejemplo `src/app/mapa/page.tsx:63` y `src/app/admin/page.tsx:41-63`. Requiere decidir qué datos pueden ocultarse sin inducir a error.

### M-02 — La comprobación de duplicados degrada a “sin coincidencias” cuando falla

**Ubicación:** `src/app/actions.ts:475-491`.

**Por qué importa:** el usuario puede continuar creyendo que no existen coincidencias cuando en realidad el detector no respondió.

**Corrección aplicada:** registrar la excepción servidor.

**Propuesta pendiente de decisión:** bloquear la publicación o mostrar un aviso no bloqueante de “no se pudo comprobar”. La primera opción protege contra duplicados pero puede impedir una publicación humanitaria urgente durante una caída.

### M-03 — Respuestas y excepciones completas de proveedores externos podían llegar a logs

**Ubicaciones:** `src/lib/news.ts:211-224`, `src/lib/news.ts:245-248`, `src/lib/news.ts:328-331`, `src/lib/news.ts:507-510`, `src/lib/error-reporting.ts:5-19`.

**Por qué importa:** los cuerpos externos no son confiables y los mensajes de `fetch` pueden incluir una URL con una clave en query string.

**Corrección aplicada:** registrar estado HTTP sin cuerpo, usar logging acotado y ocultar parámetros comunes de clave/token y cabeceras Bearer.

### M-04 — Las rutas API no tenían un contrato uniforme ante excepciones inesperadas

**Ubicaciones:** `src/app/api/noticias/verificadas/route.ts:37-44`, `src/app/api/cron/warm-news/route.ts:17-55`.

**Por qué importa:** una excepción podía producir una respuesta de framework o filtrar detalles de configuración.

**Corrección aplicada:** cuerpo `{ ok: false, code, error }`, HTTP 401 para secreto incorrecto y HTTP 503 para indisponibilidad o configuración ausente. Los detalles quedan en logs servidor.

**Propuesta pendiente de decisión:** la ruta de noticias todavía puede responder 200 con lista vacía cuando todos los proveedores degradan intencionalmente a `[]`; distinguir “sin noticias” de “todos fallaron” exige cambiar el contrato de `getVerifiedNews`.

### M-05 — Scripts operativos podían terminar exitosamente con importaciones parciales

**Ubicaciones:** `scripts/import-data.mjs:122-139`, `scripts/import-aid-points.mjs:86-101`, `scripts/sync-legacy-sites/sync-colombia.mjs:145`, `scripts/sync-legacy-sites/sync-venezuela.mjs:138`.

**Por qué importa:** automatizaciones y operadores no podían detectar mediante el código de salida que faltaron registros.

**Corrección aplicada:** contar fallos, resumirlos y fijar `process.exitCode = 1` si existe cualquier error parcial.

## Hallazgos bajos

### B-01 — La limpieza de fotos era completamente silenciosa

**Ubicaciones:** `src/lib/data.ts:177-191`, lecturas auxiliares en `src/lib/data.ts:1137`, `src/lib/data.ts:1799`, `src/lib/data.ts:3171`, `src/lib/data.ts:3558`, `src/lib/data.ts:3896`, `src/lib/data.ts:4016`.

**Por qué importa:** no afecta la eliminación principal, pero puede dejar objetos huérfanos y consumo de Storage.

**Corrección aplicada:** conservar la limpieza de mejor esfuerzo y registrar tanto la lectura de la URL como `storage.remove`.

### B-02 — Las fronteras de error imprimían el objeto completo en el cliente

**Ubicaciones:** `src/app/error.tsx:16-20`, `src/app/global-error.tsx:13-17`.

**Por qué importa:** una excepción cliente podía exponer detalles innecesarios en la consola del navegador.

**Corrección aplicada:** registrar únicamente el `digest`; se conserva el mensaje español y el botón de reintento.

### B-03 — Fallos de Turnstile y USGS no dejaban señal operativa

**Ubicaciones:** `src/lib/turnstile.ts:30-34`, `src/lib/usgs.ts:70-73`.

**Por qué importa:** el usuario recibía una degradación segura, pero no había forma de diagnosticar una caída sostenida.

**Corrección aplicada:** logging contextual servidor sin token; USGS conserva la lista vacía y su aviso suave.

## Decisiones intencionales conservadas

- **Recuperación de contraseña:** `src/app/actions.ts:273-281` siempre responde éxito para evitar enumerar usuarios, aunque Turnstile o el envío fallen.
- **Noticias y USGS:** se conserva la caché previa o `[]` para que una fuente externa no tumbe una página humanitaria. Los fallos ahora quedan registrados.
- **Caché de disco:** la ausencia `ENOENT` es normal en el primer arranque; corrupción u otros errores sí se registran.
- **Cookies en Server Components:** `src/lib/supabaseServer.ts:19-27` mantiene el `catch` porque Next.js no permite escribir cookies allí y el middleware refresca la sesión.
- **Storage:** borrar una publicación no falla solo porque no se pudo eliminar su foto; la inconsistencia se registra para mantenimiento.
- **Duplicados:** se conserva temporalmente `[]` ante fallo para no bloquear una publicación urgente; queda pendiente la decisión descrita en M-02.

## Verificación

Resultados ejecutados:

```bash
npm install       # correcto
npm run build     # correcto, con avisos preexistentes de Edge Runtime y metadataBase
npm run typecheck # correcto
npm run lint      # no ejecutable sin crear configuración; abre un asistente interactivo
git diff --check  # correcto
npm run start     # servidor listo
curl /            # HTTP 200
```

El repositorio no declara un runner de pruebas automatizadas ni hooks de pre-commit locales. `npm run lint` invoca el comando obsoleto `next lint`, pero no existe configuración de ESLint y Next.js abre un asistente interactivo; no se generó una configuración nueva porque queda fuera del alcance de esta auditoría.

`npm audit` informa tres vulnerabilidades altas en `next`, `postcss` y `sharp`; la corrección automática propuesta requiere actualizar Next.js a una versión mayor. No se modificaron dependencias dentro de esta auditoría enfocada en manejo de errores.
