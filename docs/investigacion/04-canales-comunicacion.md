# Investigación: canales de comunicación fuera de la web

Fecha de la investigación: 12 ago. 2026. Nueva, sin material previo en
`docs/investigacion/`. Fuentes citadas en cada sección; todas verificadas en
2026 (algunos datos de proveedores cambian sin aviso — revisar antes de
implementar si pasan más de unos meses).

**Pregunta que responde:** ¿cómo llega "El Mundo Te Busca" a quien nunca abre
el sitio — porque no tiene datos, porque no sabe que existe, o porque en medio
de una emergencia lo único que tiene a mano es un chat? Hoy la única vía de
entrada/salida fuera de la web es la ingesta social por hashtag
(`scripts/fetch-social-posts.mjs`, ver `docs/` y `CLAUDE.md`), que es de
**lectura** (trae publicaciones de Bluesky/Mastodon/Reddit hacia la cola de
moderación). Esta investigación es sobre el **canal inverso y bidireccional**:
que alguien reporte o consulte información *hacia* el sitio sin visitarlo.

---

## 1. Resumen ejecutivo / recomendación

**Empezar por un bot de Telegram**, no por WhatsApp Business API. Motivo
corto: WhatsApp tiene mejor alcance en Venezuela/Colombia, pero su
Verificación de Negocio de Meta toma de **3 a 14 días hábiles** (hasta 2-3
semanas en casos complejos) y es un trámite **externo, fuera de nuestro
control** — no depende de cuánto código se escriba. Telegram no tiene ningún
trámite: se crea el bot con BotFather en minutos y se puede tener el flujo de
reporte funcionando el mismo día. La secuencia recomendada:

1. **Ahora mismo:** iniciar el trámite de Verificación de Negocio de Meta
   (documentos de la organización, sitio web, etc.) — que corra en paralelo
   mientras se construye lo demás. No cuesta nada empezarlo ya aunque WhatsApp
   no sea el primer canal en salir.
2. **Semana 1:** bot de Telegram con el único flujo que de verdad importa
   primero — reportar disponibilidad de un punto de ayuda (ver sección 5) —
   reusando el patrón de consenso ya construido (`voteAidAvailability`).
3. **Cuando la Verificación de Negocio quede lista (semanas después, en
   paralelo):** WhatsApp Business API con el mismo flujo, como canal
   principal de alcance masivo (80-94% de penetración en la región, contra
   una fracción minoritaria en Telegram).
4. **SMS:** no implementar de entrada. Es ~4-30× más caro por mensaje que
   WhatsApp en Venezuela/Colombia (tabla en sección 3) y solo tiene sentido
   como alerta de un solo sentido (broadcast) para quien no tiene datos
   móviles, no como canal de reporte bidireccional.

El precedente de Turquía 2023 (sección 4) refuerza esto: el canal que falló
fue el que dependía de una sola plataforma que alguien más (el gobierno)
podía bloquear; lo que funcionó fue tener varias vías redundantes hacia una
fuente de datos propia. Empezar por el canal gratis y sin trámite, y sumar
el de mayor alcance después, sigue esa misma lógica de no apostar todo a un
solo proveedor externo.

---

## 2. WhatsApp Business API

### 2.1 Modelo de precios (cambió en 2025-2026 — importante no usar cifras viejas)

Hasta el 1 de julio de 2025 Meta cobraba por **conversación** (ventana de 24h).
Desde esa fecha el cobro es **por mensaje de plantilla entregado**, según la
categoría (Marketing / Utility / Authentication) y el país del destinatario.
Los mensajes dentro de la ventana de servicio de 24h (cuando el usuario
escribe primero) son gratis — desde el 1 nov. 2024 esa ventana de servicio es
gratis **sin límite mensual** (antes había 1.000 conversaciones de servicio
gratis al mes; Meta quitó el tope) [Blueticks](https://blueticks.co/blog/whatsapp-business-api-pricing-2026),
[Authgear](https://www.authgear.com/post/whatsapp-api-pricing/). No hay cuota
de suscripción por usar la API en sí (Cloud API de Meta es gratis de acceso).

⚠️ Una fuente (Cliengo, sin poder confirmarlo en una segunda fuente
independiente) menciona que a partir del **1 de octubre de 2026** Meta
empezaría a cobrar también los mensajes de servicio salientes dentro de la
ventana de 24h. Verificar esto en `developers.facebook.com/docs/whatsapp`
antes de presupuestar, porque cambiaría el cálculo de costo de este canal
para un bot que solo responde reportes (que hoy caería en esa ventana
gratis).

**Tarifas por mensaje (2026), Venezuela vs. Colombia** — relevantes solo para
mensajes que la plataforma inicia (recordatorios, alertas push); un bot que
solo responde a quien escribe primero no las paga:

| País | Marketing | Utility | Authentication |
|---|---|---|---|
| Venezuela | $0,0740 | $0,0113 | $0,0113 |
| Colombia | $0,0125 | $0,0008 | $0,0008 |

Fuente: [Mazkara Studio — WhatsApp Penetration in Latin America 2026](https://mazkara.studio/en/newsletter/whatsapp-penetration-latin-america-2026/).
Colombia tiene, según esa fuente, las tarifas de utility/authentication más
bajas de toda Latinoamérica.

### 2.2 Verificación de Negocio de Meta — el cuello de botella real

Esto es lo que **más importa para planear tiempos**: el trámite de
Verificación de Negocio (documentos legales de la organización, sitio web
verificable, etc.) típicamente toma:

- Casos simples y bien documentados: **1 a 5 días hábiles**.
- Rango típico citado por varias guías: **3 a 14 días hábiles**.
- Casos con revisión manual, categoría de negocio sensible, o datos que no
  cuadran entre documentos: hasta **2-3 semanas**.

Fuentes: [Superchat](https://help.superchat.com/en/articles/14982-how-to-submit-a-meta-business-account-verification),
[Wati.io](https://support.wati.io/en/articles/11462440-meta-business-verification-a-step-by-step-guide),
[AdStellar](https://www.adstellar.ai/blog/meta-business-verification).

Esto **no depende de la app ni de cuánto se programe** — es cola de revisión
humana de Meta. Por eso la recomendación es iniciarlo cuanto antes, en
paralelo a construir el bot de Telegram, y no bloquear el arranque del
proyecto esperándolo.

Además, sin verificar, la cuenta arranca en el nivel más bajo de mensajería:
**250 usuarios únicos/día** de mensajes iniciados por el negocio. Verificada,
sube a 1.000 → 10.000 → 100.000 → ilimitado, según calidad y volumen
sostenido (revisión de nivel cada 6h). Un número con calificación de calidad
baja (mensajes bloqueados/reportados) se queda en 250 aunque esté verificado.
Fuente: [Meta for Developers — Messaging Limits](https://developers.facebook.com/docs/whatsapp/messaging-limits/),
[Chatarmin](https://chatarmin.com/en/blog/whats-app-messaging-limits).
Para el flujo inicial (alguien reporta, el bot responde dentro de la ventana
de 24h) este límite de 250 casi no aplica — es un límite sobre mensajes que
*el negocio inicia*, no sobre respuestas a quien escribe primero.

### 2.3 Alcance (por qué vale la pena a pesar del trámite)

- Venezuela: penetración de WhatsApp 80-85%, ~12-14M usuarios activos/mes.
- Colombia: penetración 92-94%, ~38M usuarios activos/mes.

Fuente: [Mazkara Studio](https://mazkara.studio/en/newsletter/whatsapp-penetration-latin-america-2026/),
[DataReportal — Digital 2026 Venezuela](https://datareportal.com/reports/digital-2026-venezuela).
WhatsApp no tiene competencia real como app de mensajería dominante en la
región — es, con mucha diferencia, el canal de mayor alcance de los tres
evaluados.

---

## 3. Telegram Bot API

- **Costo: $0.** Sin cargo por mensaje, sin cuota, sin límite de llamadas a
  la API por volumen (dentro de límites técnicos razonables de tasa).
- **Sin ningún trámite de aprobación.** Se crea el bot hablándole a
  `@BotFather` dentro de Telegram, se recibe un token, y ya se puede recibir
  webhooks — sin KYC, sin verificación de negocio, sin plantillas de mensaje
  que aprobar.
- **Implementación mucho más simple** que WhatsApp: no hay categorías de
  mensaje, no hay ventana de 24h que gestionar, no hay firma HMAC obligatoria
  (aunque Telegram sí permite fijar un `secret_token` al registrar el webhook
  para autenticar que las llamadas vienen de Telegram — ver sección 6).
- **Limitación real:** penetración muy inferior a WhatsApp en la población
  general de Venezuela/Colombia — es la app de mensajería "de respaldo" para
  la mayoría, no la principal. Sirve muy bien para **llegar rápido a un
  círculo activo** (voluntarios, moderadores, gente ya conectada a la
  ingesta social) pero no reemplaza a WhatsApp como canal de alcance masivo
  al público general afectado.

Fuentes: [Wati.io — Telegram vs WhatsApp](https://www.wati.io/en/blog/telegram-vs-whatsapp/),
[AziqDev — Telegram Bot vs WhatsApp Bot 2026](https://aziqdev.com/blog/telegram-bot-vs-whatsapp).

Esta combinación (gratis + cero trámite + implementación simple, pero menor
alcance) es exactamente por qué es el candidato correcto para **empezar**:
prueba el flujo completo (bot → validación → escritura en la misma capa de
datos que ya existe → moderación) sin esperar semanas ni gastar nada, y ese
mismo flujo se reutiliza casi tal cual cuando WhatsApp quede listo.

---

## 4. SMS (Twilio) — tabla comparativa de costo

Tarifas Twilio verificadas en `twilio.com/en-us/sms/pricing/{ve,co}` (2026,
sujetas a cambio sin aviso, y con posibles recargos de operador adicionales):

| Canal | Venezuela (por mensaje) | Colombia (por mensaje) |
|---|---|---|
| SMS (Twilio) | $0,2257 | $0,0592 |
| WhatsApp Utility/Authentication | $0,0113 | $0,0008 |
| WhatsApp Marketing | $0,0740 | $0,0125 |
| Telegram | $0 | $0 |

Fuentes: [Twilio — SMS pricing Venezuela](https://www.twilio.com/en-us/sms/pricing/ve),
[Twilio — SMS pricing Colombia](https://www.twilio.com/en-us/sms/pricing/co).

En Venezuela, un SMS por Twilio cuesta **~20× más** que un mensaje de utility
de WhatsApp, y en Colombia **~74× más**. SMS no tiene botones, ni contexto
enriquecido, ni forma barata de sostener una conversación — solo texto plano
de un lado a otro. Su única ventaja real es que funciona sin datos móviles,
lo cual sí importa en zonas donde cayó la cobertura de internet pero no la
red celular. Por eso la recomendación es **no implementarlo ahora**: el
costo por mensaje lo hace inviable para un flujo conversacional (reportar,
confirmar, repreguntar), y como alerta de un solo sentido ("hay un punto de
ayuda cerca de ti") se puede evaluar más adelante como canal de emergencia
adicional, no como punto de partida.

---

## 5. Precedente: terremoto de Turquía, febrero 2023

Durante los primeros días, el canal dominante para pedir ayuda fue **Twitter**
(hoy X): sobrevivientes y familiares publicaban ubicación y "seguimos con
vida, esta es la dirección"; un grupo de voluntarios coordinados por Discord
cruzó esos mensajes con datos de Instagram/WhatsApp para armar un mapa de
calor de solicitudes de ayuda (proyecto **Afetharita.com**, "mapa de
desastre") que llegó a procesar más de 45.000 solicitudes únicas para
equipos de rescate y ONGs.

El punto crítico del caso: **el 8 de febrero de 2023, en medio de la
operación de rescate, el gobierno turco bloqueó el acceso a Twitter**
citando desinformación — y eso interrumpió activamente el flujo de
solicitudes de ayuda justo cuando más se necesitaba. Los voluntarios
tuvieron que apoyarse en VPN y otras vías para seguir operando.

Fuentes: [Scientific American](https://www.scientificamerican.com/article/turkeys-twitter-cutoff-harmed-earthquake-rescue-operations/),
[The Conversation](https://theconversation.com/twitter-cutoff-in-turkey-amid-earthquake-rescue-operations-a-social-media-expert-explains-the-danger-of-losing-the-microblogging-service-in-times-of-disaster-199580),
[TIME](https://time.com/6254500/turkey-earthquake-twitter-musk-rescue/),
[Euronews](https://www.euronews.com/next/2023/02/10/how-twitter-helped-find-survivors-trapped-beneath-rubble-after-turkeys-earthquakes).

**Aprendizaje aplicado a "El Mundo Te Busca":**

1. **No depender de una sola plataforma como fuente de verdad.** Aquí ya se
   cumple por diseño: el sitio propio es la fuente canónica (Supabase), y
   cualquier canal externo (Bluesky/Mastodon/Reddit hoy; Telegram/WhatsApp
   mañana) es solo una **entrada/salida** hacia esa misma base — si un canal
   se cae o se bloquea, los demás y el sitio siguen funcionando igual.
2. **Los grupos cerrados de WhatsApp fueron la herramienta real de
   coordinación logística de voluntarios** (no el descubrimiento público),
   mientras que la plataforma abierta y buscable (Twitter) fue mejor para
   que el público reportara — y también la más frágil ante censura o caída.
   Esto confirma tener ambos tipos de canal: uno amplio y público (web +
   redes) y uno más directo y personal (bots de mensajería) para que quien
   reporta o pide ayuda no dependa de saber usar ninguno en particular.
3. **La agregación automática con intervención humana ganó**: Afetharita no
   publicaba nada sin cruzar y limpiar datos. Es el mismo patrón que ya usa
   este proyecto (cola de moderación en `/admin` antes de publicar posts
   externos) y el que debe seguir el nuevo canal de reportes por bot: nunca
   escritura directa sin pasar por el mismo criterio de "no verificado hasta
   que alguien o el consenso lo confirme".

---

## 6. Diseño del flujo concreto para empezar

**Elegido: reportar disponibilidad de un punto de ayuda ("¿todavía hay
agua/comida/medicinas?") vía bot de Telegram**, porque:

- Reutiliza un patrón de datos que **ya existe y ya está probado**: el voto
  de consenso "✅ Sí hay / ❌ Se acabó" de `voteAidAvailabilityAction`
  (`src/app/actions.ts:1381`) → `voteAidAvailability` (`src/lib/data.ts:1788`),
  que ya deduplica por identidad del votante y nunca cambia el estado por sí
  solo salvo por mayoría de votos (autoridad real sigue siendo del
  autor/admin vía `ownerSetAidAvailabilityAction`).
- Es de una sola pregunta — bajo umbral de fricción para alguien escribiendo
  desde un chat en medio de una emergencia, sin formularios.
- Tiene impacto directo e inmediato: evita que alguien camine hasta un punto
  que ya no tiene nada.

### Flujo del bot

1. Usuario escribe `/reportar` (o el bot lo detecta como primer mensaje).
2. Bot pregunta el país (VE/CO) → si ya se sabe por contexto previo, se
   salta este paso.
3. Bot ofrece buscar el punto de ayuda por nombre o por cercanía (si el
   usuario comparte ubicación de Telegram, que es opcional y nativo del
   cliente).
4. Bot muestra 2-3 candidatos con botones inline (Telegram permite botones
   sin plantillas, a diferencia de WhatsApp).
5. Usuario toca el punto → bot pregunta "¿Sigue teniendo insumos? Sí / No"
   (los mismos dos botones que ya existen en la web).
6. Bot confirma "Gracias, tu reporte quedó registrado" y, si aplica, muestra
   el estado de consenso actual del punto.

### Cómo entra al modelo de datos (clave para la seguridad pedida)

- **No usar el token de autoridad del autor/admin.** El reporte por bot debe
  entrar exactamente por la misma puerta que un voto web: una llamada
  equivalente a `voteAidAvailability(id, vote, userId)`, donde `userId` es un
  identificador sintético derivado del `chat_id` de Telegram (p. ej.
  `telegram:<chat_id>`) o del número verificado de WhatsApp
  (`whatsapp:<wa_id>`). Esto hace que el reporte se comporte **igual que un
  voto anónimo dedupificado de la web**: una persona = un voto que puede
  cambiar, nunca autoridad unilateral sobre el estado del punto. Cumple
  literalmente el requisito de la tarea: "debería entrar sin verificar igual
  que los de la web, nunca con más autoridad".
- Alternativa más conservadora si se prefiere no tocar `voteAidAvailability`
  directamente: encolar el reporte como fila `pending` (mismo patrón que
  `fetch-social-posts.mjs` usa con `moderation_status`) para revisión en
  `/admin` antes de contar. Más lento pero cero riesgo nuevo — razonable para
  una primera versión mientras se gana confianza en el volumen y calidad de
  los reportes por bot.

### Seguridad del nuevo webhook público — superficie de abuso nueva

Un endpoint que Telegram/Meta llaman desde fuera es alcanzable por
cualquiera que adivine la URL, no solo por el proveedor real. Aplicar lo que
ya existe en el proyecto (`src/lib/rateLimit.ts`, `src/lib/ipLockout.ts`),
adaptado a esta superficie:

1. **Autenticar que la llamada viene de verdad del proveedor**, antes de
   confiar en nada del cuerpo:
   - Telegram: fijar un `secret_token` al registrar el webhook
     (`setWebhook`) y exigir que cada request traiga
     `X-Telegram-Bot-Api-Secret-Token` igual — sin esto, cualquiera que
     encuentre la URL puede mandar updates falsos.
   - WhatsApp (fase 2): Meta firma cada payload con `X-Hub-Signature-256`
     (HMAC-SHA256 con el App Secret) — verificar la firma en el servidor
     antes de procesar, mismo principio que ya se aplica con Turnstile en
     `src/lib/turnstile.ts` (rechazar si no valida, fail-closed en
     producción).
2. **Reusar `createRateLimiter`/`createLockout`, pero con la clave
   correcta.** Ambos módulos ya están pensados para ser genéricos por
   "clave" — hoy la clave es la IP (`clientIp()` en `ipLockout.ts`), porque
   el abuso llega directo desde el navegador del atacante. En un webhook de
   bot, todo el tráfico HTTP entra desde los rangos de IP del proveedor
   (Telegram/Meta), así que la IP del request ya no distingue nada; la clave
   debe ser el `chat_id` / `wa_id` del remitente dentro del payload (una vez
   verificada la firma del paso 1). Mismos límites conceptuales que
   `interactionLimiter` (40 acciones/30s) pero probablemente más estrictos
   para reportes de disponibilidad, ya que a diferencia de un "me gusta" un
   reporte falso mueve el consenso real que otros usan para decidir a dónde
   ir.
3. **Nunca dar al canal externo un atajo a las rutas de autoridad**
   (`ownerSetAidAvailabilityAction`, cambios de estado de personas por
   autor/admin). El bot solo debe poder llamar el equivalente al voto
   público no vinculante — igual que un visitante anónimo de la web nunca ve
   el enlace de gestión de otro.
4. Registrar el `origin` del reporte (`telegram` / `whatsapp` / `web`) igual
   que ya se hace con los posts de la ingesta social (`origin` en la tabla
   `posts`), para poder auditar de dónde vino cada voto si el consenso de un
   punto se ve manipulado.

---

## Fuentes citadas

- [Blueticks — WhatsApp Business API Pricing 2026](https://blueticks.co/blog/whatsapp-business-api-pricing-2026)
- [Authgear — WhatsApp API Pricing Explained 2026](https://www.authgear.com/post/whatsapp-api-pricing/)
- [Cliengo — Precios WhatsApp Business API 2026](https://guiawabusiness.cliengo.com/precios)
- [Mazkara Studio — WhatsApp Penetration in Latin America 2026](https://mazkara.studio/en/newsletter/whatsapp-penetration-latin-america-2026/)
- [DataReportal — Digital 2026 Venezuela](https://datareportal.com/reports/digital-2026-venezuela)
- [Superchat — How to submit a Meta Business Account Verification](https://help.superchat.com/en/articles/14982-how-to-submit-a-meta-business-account-verification)
- [Wati.io — Meta Business Verification guide](https://support.wati.io/en/articles/11462440-meta-business-verification-a-step-by-step-guide)
- [AdStellar — Meta Business Verification](https://www.adstellar.ai/blog/meta-business-verification)
- [Meta for Developers — Messaging Limits](https://developers.facebook.com/docs/whatsapp/messaging-limits/)
- [Chatarmin — WhatsApp Messaging Limits 2026](https://chatarmin.com/en/blog/whats-app-messaging-limits)
- [Wati.io — Telegram vs WhatsApp](https://www.wati.io/en/blog/telegram-vs-whatsapp/)
- [AziqDev — Telegram Bot vs WhatsApp Bot 2026](https://aziqdev.com/blog/telegram-bot-vs-whatsapp)
- [Twilio — SMS Pricing Venezuela](https://www.twilio.com/en-us/sms/pricing/ve)
- [Twilio — SMS Pricing Colombia](https://www.twilio.com/en-us/sms/pricing/co)
- [Scientific American — Turkey's Twitter Cutoff Harmed Earthquake Rescue Operations](https://www.scientificamerican.com/article/turkeys-twitter-cutoff-harmed-earthquake-rescue-operations/)
- [The Conversation — Twitter cutoff in Turkey amid earthquake rescue operations](https://theconversation.com/twitter-cutoff-in-turkey-amid-earthquake-rescue-operations-a-social-media-expert-explains-the-danger-of-losing-the-microblogging-service-in-times-of-disaster-199580)
- [TIME — Twitter Changes Are Slowing Earthquake Relief](https://time.com/6254500/turkey-earthquake-twitter-musk-rescue/)
- [Euronews — How Twitter helped rescue trapped earthquake survivors](https://www.euronews.com/next/2023/02/10/how-twitter-helped-find-survivors-trapped-beneath-rubble-after-turkeys-earthquakes)

---

## Código del proyecto referenciado en esta investigación

- `src/app/actions.ts:1381` — `voteAidAvailabilityAction` (patrón de consenso a reutilizar).
- `src/lib/data.ts:1788` — `voteAidAvailability` (dedup por `userId`, mayoría decide).
- `src/app/actions.ts:1402` — `ownerSetAidAvailabilityAction` (autoridad real del autor/admin — NO exponer al bot).
- `src/lib/rateLimit.ts` — limitador de tasa por clave, genérico (reusar con clave `chat_id`/`wa_id`).
- `src/lib/ipLockout.ts` — freno de fuerza bruta por clave, genérico (mismo caso).
- `src/lib/turnstile.ts` — patrón de verificación server-side de un proveedor externo antes de confiar en el payload (mismo principio para `X-Hub-Signature-256` de WhatsApp).
- `scripts/fetch-social-posts.mjs` — patrón de ingesta externa → `moderation_status: "pending"` → cola en `/admin` (alternativa conservadora para los reportes por bot).
