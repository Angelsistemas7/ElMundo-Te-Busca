# Índice de investigaciones — pulido de arquitectura, fluidez y seguridad

8 investigaciones en paralelo (2026-08-12), cada una verificando contra el código real (archivo:línea) y con investigación web fresca (CVEs, librerías, precios, precedentes). Cada tema tiene su propio documento; este README cruza las prioridades de todas para decidir por dónde empezar.

**Metodología:** ningún hallazgo se acepta solo porque "suena razonable" — cada afirmación sobre el código cita archivo:línea verificable, y cada afirmación externa (CVE, precio, ley, estado de un proyecto) cita fuente. Donde algo no se pudo confirmar (config del dashboard de Supabase, texto primario de una sentencia), se dice explícito en vez de asumir.

## ✅ Ya resuelto en esta sesión (no repetir)
- **Denuncia no-anónima**: `/denuncias` mostraba "Reportado por {nombre real}" a cualquier visitante — corregido en `ComplaintCard.tsx`, verificado por tipos y en navegador. El admin sigue viendo el nombre para moderación.
- **Óvalo de la barra móvil** desalineado — corregido en `MobileNav.tsx`.

## 🔴 Prioridad Alta (7 puntos, cruzando las 8 investigaciones)

1. **Confirmar backups/PITR de Supabase en producción** ([02](02-backups-continuidad.md)) — nadie en el repo confirmó el plan real. Si es Free, **hoy no hay ningún backup automático** de la base de personas desaparecidas, y las fotos (Storage) nunca están cubiertas por backups de Supabase en NINGÚN plan. Acción: que el compañero revise Database → Backups en el dashboard hoy mismo. Workflow de `pg_dump` + espejo de fotos cifrado ($0/mes) ya listo para pegar.
2. **Subida de fotos solo se valida en el cliente** ([01](01-seguridad-avanzada.md)) — `upload.ts` sube directo a Supabase Storage con la clave anónima; el control real depende de `allowedMimeTypes`/`fileSizeLimit` en el dashboard, no verificable desde el código. Confirmar a mano.
3. **Content-Security-Policy real** ([01](01-seguridad-avanzada.md)) — hoy no existe ninguna. CSP completa ya diseñada con los dominios reales (`challenges.cloudflare.com`, `*.basemaps.cartocdn.com`, `*.supabase.co`), recomendada desplegar primero en `Report-Only`.
4. **Sin filtro de contenido en imágenes** ([06](06-moderacion-retencion.md)) — ninguna foto pasa por moderación NSFW/violencia hoy. OpenAI Moderation API (gratis) recomendada.
5. **Suspense en las 4 fichas individuales** ([08](08-accesibilidad-performance.md)) — `persona/[id]:25`, `ayuda/[id]:19`, `hospitales/[id]:16`, `caravanas/[id]:19`, todas `force-dynamic` sin Suspense. El patrón correcto ya existe en `hospitales/page.tsx:56-196`, solo replicarlo (cuidado: el `notFound()` depende del primer fetch, decidir cómo tratarlo).
6. **Borrado hard-delete sin rastro ni retención** ([06](06-moderacion-retencion.md)) — toda función `delete*` en `data.ts` borra directo, sin `deleted_at` ni auditoría. Política de retención concreta propuesta (30/60/90 días según tipo).
7. **Deploy va directo a producción sin ningún test** ([07](07-observabilidad-testing.md)) — smoke test de Playwright diseñado (con las claves de prueba oficiales de Turnstile, no el fail-open de dev) listo para integrar en `deploy.yml` antes del `rsync`/`pm2 reload`.

## 🟡 Media prioridad

- **Dependabot + escaneo de secretos** ([01](01-seguridad-avanzada.md)) — ninguno configurado, YAMLs listos.
- **`getPatientCounts()` sin caché** ([08](08-accesibilidad-performance.md)) — único hueco entre las "listas calientes" (`data.ts:4252`), fix de una línea con `unstable_cache`.
- **Bot de Telegram para reportar disponibilidad** ([04](04-canales-comunicacion.md)) — sin trámite, gratis, mismo día. Iniciar en paralelo el trámite de Meta para WhatsApp (tarda 3-14 días hábiles, no depende del código).
- **`@vercel/analytics`/`speed-insights` son peso muerto** ([07](07-observabilidad-testing.md)) — no funcionan fuera de Vercel, desinstalar.
- **Sentry (plan free)** ([07](07-observabilidad-testing.md)) — 5.000 errores/mes alcanza hoy, con `tracesSampleRate` casi en 0 para no agotar cupo en un pico.
- **`/api/health` + monitor externo** ([07](07-observabilidad-testing.md)) — UptimeRobot gratis, alertas por Telegram.
- **pHash para duplicados de foto** ([06](06-moderacion-retencion.md)) — hoy solo detecta hash exacto (SHA-256); se escapa la misma foto recortada/recomprimida.
- **Contraste `brand-600`** ([08](08-accesibilidad-performance.md)) — 4.05:1, falla AA de texto normal. De 8 usos, solo 1 es texto real (`OnboardingTour.tsx:520`).
- **Manifest.json + iconos + AVIF** ([03](03-pwa-offline.md)) — menos de un día cada uno, sin tocar datos.

## 🟢 Baja prioridad / futuro (no construir ahora, con justificación)

- **PWA offline-first**: descartado explícitamente — datos de personas/disponibilidad no pueden servirse cacheados sin avisar ([03](03-pwa-offline.md)).
- **WhatsApp Business API**: sí, pero después de Telegram, por el trámite de verificación ([04](04-canales-comunicacion.md)).
- **PFIF / interoperabilidad**: no hay nadie del otro lado — PFIF archivado desde sept. 2025, ICRC sin API pública, HDX/OCHA se retira en enero 2026 ([05](05-interoperabilidad-pfif.md)).
- **SMS**: descartado por costo (20-74× más caro que WhatsApp) ([04](04-canales-comunicacion.md)).
- **Next.js 16 / Cache Components**: sin beneficio inmediato que justifique 3-5+ días de migración ([03](03-pwa-offline.md)).

## Dato aparte, no priorizado
Existen al menos 5 sitios paralelos más cubriendo el mismo terremoto (desaparecidosterremotovenezuela.com, venezuelareports.org, desaparecidosvenezuela.com, buscatupaciente.com, VenApp gubernamental) — ninguno usa ningún estándar de intercambio, fragmentación confirmada por Infobae (7 ago 2026) ([05](05-interoperabilidad-pfif.md)).

## Documentos completos
1. [Seguridad avanzada](01-seguridad-avanzada.md)
2. [Backups y continuidad de datos](02-backups-continuidad.md)
3. [PWA y bajo ancho de banda](03-pwa-offline.md)
4. [Canales de comunicación](04-canales-comunicacion.md)
5. [Interoperabilidad (PFIF)](05-interoperabilidad-pfif.md)
6. [Moderación y retención de datos](06-moderacion-retencion.md)
7. [Observabilidad y testing](07-observabilidad-testing.md)
8. [Accesibilidad y performance](08-accesibilidad-performance.md)
9. [App móvil (Flutter/Dart)](09-app-movil-flutter.md) — planeación de arquitectura, sin construir nada aún
