# Investigación profunda — ronda ago. 2026

Ocho investigaciones en paralelo (agentes con acceso web + verificación contra el
código real, sin tocar código) sobre seguridad, arquitectura, fluidez y todo lo
que se pueda seguir puliendo. Cada documento cita archivo:línea cuando hace una
afirmación sobre el estado actual — no son ideas genéricas, están verificadas
contra este repo.

| Doc | Tema | Veredicto en una línea |
|---|---|---|
| [01-seguridad-avanzada.md](01-seguridad-avanzada.md) | CSP, validación de subida de fotos, huecos de rate limiting, CVEs, Dependabot | Fotos solo se validan en el cliente; hay huecos de rate limit puntuales |
| [02-backups-continuidad.md](02-backups-continuidad.md) | Backups de Supabase, PITR, Storage, runbook de recuperación | No está confirmado qué plan de Supabase corre en producción — puede no haber backups |
| [03-pwa-offline.md](03-pwa-offline.md) | Service worker, modo datos livianos, instalabilidad | Alcance mínimo de 2-3 días recomendado; nada de offline-first completo (peligroso para datos en vivo) |
| [04-canales-comunicacion.md](04-canales-comunicacion.md) | WhatsApp Business API, Telegram, SMS | Empezar con bot de Telegram (gratis, sin trámite); WhatsApp requiere verificación de Meta en paralelo |
| [05-interoperabilidad-pfif.md](05-interoperabilidad-pfif.md) | PFIF, ICRC, HXL/HDX | Prematuro — los tres estándares están congelados/descontinuados y no hay con quién interoperar hoy |
| [06-moderacion-retencion.md](06-moderacion-retencion.md) | Moderación de imágenes, duplicados, retención de datos | ⚠️ Bug de privacidad activo: denuncias muestran el nombre del denunciante en público |
| [07-observabilidad-testing.md](07-observabilidad-testing.md) | Sentry, health check, alertas, Playwright/CI | Deploy actual no tiene ningún test de por medio; Analytics de Vercel instalado pero no recoge nada (VPS propio) |
| [08-accesibilidad-performance.md](08-accesibilidad-performance.md) | Suspense en fichas, caché, contraste WCAG | Fichas individuales tienen el mismo hueco de streaming que ya se corrigió en listados |

## Prioridad Alta — cruzando las 8 investigaciones

1. **Confirmar plan/backups de Supabase en producción** ([02](02-backups-continuidad.md)).
   Es la pregunta más urgente: si es plan Free, hoy no hay forma de recuperar
   la base de personas desaparecidas ante un borrado o corrupción.
2. **Denuncias no son anónimas ante el público** ([06](06-moderacion-retencion.md)).
   `ComplaintCard.tsx:59` muestra el nombre de quien denuncia, incluso en
   `abuso_autoridad` — riesgo real de represalias. Cambio chico y aislado.
3. **Validación de fotos solo client-side** ([01](01-seguridad-avanzada.md)).
   Sube directo a Supabase Storage con la clave `anon`; la única defensa real
   es la config del bucket en el panel — sin confirmar en producción.
4. **CSP real** ([01](01-seguridad-avanzada.md)) — ojo con el dato corregido:
   los tiles del mapa son `*.basemaps.cartocdn.com`, no OpenStreetMap.
5. **Backup del bucket de Storage (fotos)** ([02](02-backups-continuidad.md)) —
   nunca lo cubren los backups de Postgres en ningún plan de Supabase.
6. **Suspense en fichas individuales** (`persona/[id]`, `ayuda/[id]`,
   `hospitales/[id]`, `caravanas/[id]`) — mismo patrón que ya se aplicó a los
   listados ([08](08-accesibilidad-performance.md)).
7. **Deploy sin ningún test de por medio** ([07](07-observabilidad-testing.md)) —
   cada push a `main` va directo a producción vía `deploy.yml`.

## Prioridad Media

- Dependabot/gitleaks ([01](01-seguridad-avanzada.md)).
- `getPatientCounts()` sin caché, único hueco entre las listas calientes ([08](08-accesibilidad-performance.md)).
- Bot de Telegram como primer canal de reporte fuera de la web ([04](04-canales-comunicacion.md)).
- Sentry + `/api/health` + monitor externo con alerta a Telegram ([07](07-observabilidad-testing.md)).
- Hash perceptual (pHash) para reforzar la cola de duplicados ([06](06-moderacion-retencion.md)).
- Política de retención/purga para reportes descartados ([06](06-moderacion-retencion.md)).
- Contraste de `brand-600` (4.05:1, por debajo de AA) usado como color de texto en 7+ archivos ([08](08-accesibilidad-performance.md)).

## Prioridad Baja / a futuro

- PWA/modo datos livianos — vale la pena pero no urgente ([03](03-pwa-offline.md)).
- WhatsApp Business API una vez verificado el negocio ([04](04-canales-comunicacion.md)).
- Exportador PFIF — solo si una organización concreta lo pide ([05](05-interoperabilidad-pfif.md)).
- Moderación automática de imágenes (NSFWJS gratis) ([06](06-moderacion-retencion.md)).

## Nota aparte (no priorizada, solo registrada)

Existe un sitio `venezuelatebusca.com` con nombre muy parecido a
"El Mundo Te Busca" — posible confusión de marca, detectado de pasada por el
agente de interoperabilidad ([05](05-interoperabilidad-pfif.md)).
