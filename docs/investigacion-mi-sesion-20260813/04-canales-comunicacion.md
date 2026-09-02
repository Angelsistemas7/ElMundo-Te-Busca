# Investigación: canales de comunicación sin abrir el sitio (WhatsApp, Telegram, SMS)

> Documento de investigación. **No incluye cambios de código.** Objetivo: evaluar
> si conviene (y cómo) dejar que la gente reporte o consulte información de
> "El Mundo Te Busca" sin necesidad de abrir la web — por WhatsApp, Telegram o SMS —
> porque en el terreno (voluntarios, familiares) se usa mucho más el chat que
> navegar una página. Fecha de la investigación: 2026-08-12.

## Resumen ejecutivo

**Recomendación #1: empezar por un bot de Telegram, no por WhatsApp.** Es 100%
gratis, no tiene límite de mensajes, no exige verificación de negocio ante Meta
(que para una plataforma ciudadana sin persona jurídica formal puede ser un
obstáculo real y lento), y técnicamente es un webhook simple que se integra en
un día o dos reutilizando las funciones que ya existen en `src/lib/data.ts`.
WhatsApp sigue siendo el canal con más alcance real en Venezuela, así que vale
la pena arrancar el proceso de verificación de Meta en paralelo (tarda de días
a semanas y no depende de nosotros), pero no debería bloquear tener *algo*
funcionando ya. SMS no se recomienda por ahora: a Venezuela cuesta ~$0,23 por
mensaje en Twilio (carísimo para un proyecto sin fines de lucro) y su
fiabilidad de entrega en una zona de desastre con antenas caídas es incierta.

## 1. WhatsApp Business Platform (Cloud API) 2025-2026

### Qué cambió recientemente en el modelo de precio
Hasta noviembre de 2024, Meta cobraba por "conversación" (una ventana de 24h
podía incluir mensajes ilimitados) y regalaba 1.000 conversaciones de servicio
al mes. Dos cambios importantes desde entonces:

- **1 de noviembre 2024**: las conversaciones de **servicio** (cuando el
  usuario escribe primero, o cuando tú respondes dentro de esa ventana de 24h
  sin usar una plantilla de marketing/utilidad) se volvieron **gratis e
  ilimitadas**, sin tope de 1.000/mes.
- **1 de julio 2025**: Meta pasó de cobrar por conversación a cobrar **por
  mensaje entregado**, y solo para **mensajes de plantilla** (los que tú
  inicias fuera de la ventana de 24h: marketing, utilidad, autenticación). El
  precio varía por categoría y por país del destinatario — de ~$0,01 a
  ~$0,14 por mensaje de marketing, bastante menos (¬80-90%) para utilidad y
  autenticación.

### Lo importante para nuestro caso de uso
El flujo que nos interesa — **alguien nos escribe primero** para reportar
"se acabó el agua en tal punto" o "vi a esta persona" — encaja exactamente en
la categoría que es **gratis e ilimitada**: es el usuario quien abre la
conversación, y nuestras respuestas (confirmación, menú de opciones) dentro de
esa ventana de 24h no son plantillas de marketing. **Para el caso de uso
principal de este documento, el costo de mensajería en sí sería prácticamente
cero.** Solo pagaríamos si quisiéramos *reabrir* una conversación pasadas 24h
sin que el usuario haya vuelto a escribir (p. ej. avisar "tu reporte fue
verificado" tres días después) — eso exige una plantilla aprobada por Meta y
tiene el costo por mensaje descrito arriba.

### Qué se necesita para arrancar
1. Cuenta de Meta Business (Business Manager) + un número de teléfono
   dedicado (no puede ser el mismo que ya use WhatsApp normal/Business App).
2. **Verificación de negocio (Meta Business Verification)**: exige uno de
   estos documentos con sello/firma oficial — acta o certificado de
   constitución, registro/licencia de negocio, documento fiscal, estado de
   cuenta bancario de la organización, o factura de servicios a nombre de la
   organización — y que el nombre coincida carácter por carácter con lo
   registrado en Meta. El plazo declarado por Meta es de hasta 14 días
   hábiles; en la práctica varía de horas a semanas si hay idas y vueltas.
3. Configurar el webhook (Meta te manda un `POST` por cada mensaje entrante a
   tu endpoint) y verificar la firma `X-Hub-Signature-256`.

**¿Viable para una plataforma ciudadana pequeña sin mucho papeleo?** Aquí está
el punto débil real: si "El Mundo Te Busca" no está constituida como
organización formal (fundación, asociación civil registrada), la verificación
de Meta puede trabarse — piden documentos que una iniciativa ciudadana informal
simplemente no tiene. Si el usuario sí tiene algún RIF/registro o puede usar
uno personal + factura de servicios a su nombre, es viable pero hay que
probarlo; no es instantáneo y no está garantizado que Meta lo apruebe a la
primera.

### Intermediarios (BSP) vs. API directa de Meta
No hace falta ir directo a Meta: existen "Business Solution Providers" que
simplifican el alta y a veces evitan parte del papeleo (aunque la verificación
de identidad del negocio la sigue exigiendo Meta igual, el BSP solo agiliza el
proceso y da un panel más simple).

| Proveedor | Modelo de precio | Notas |
|---|---|---|
| **API directa de Meta (Cloud API)** | Gratis de acceder; pagas por mensaje de plantilla como se explicó arriba | Requiere más trabajo técnico propio (verificar webhooks, manejar tokens) pero cero intermediario ni markup |
| **Twilio** | Recargo plano de ~$0,005 por mensaje sobre la tarifa de Meta, pago por uso | Buena opción para volumen bajo/medio; ya lo conocemos porque se investigó para SMS (ver sección 4) |
| **360dialog** | Plan desde ~€49/mes por número, sin markup sobre las tarifas de Meta | Conviene cuando el volumen es alto (>10.000 mensajes/mes); para volumen bajo sale más caro que Twilio |
| **Gupshup** | Markup más bajo del mercado (~$0,001/mensaje) | Enfocado en India/sudeste asiático, panel menos pensado para LatAm |
| **Wati** | Desde ~$49-99/mes, interfaz sin código, ~20% de recargo | Pensado para equipos de marketing/soporte, no para integraciones a medida vía webhook |

Para nuestro volumen esperado (reportes puntuales, no campañas masivas),
**Twilio o la API directa de Meta** son las opciones que tienen sentido — pagar
una cuota mensual fija (360dialog, Wati) no se justifica todavía.

### Alternativa sin código: WhatsApp Business App (no es la API)
Vale la pena mencionar la app gratuita de WhatsApp Business (la app de
celular, no la API): no requiere verificación de Meta Business ni desarrollo,
pero **no tiene webhook ni automatización** — alguien tendría que leer los
mensajes a mano y cargar los reportes al sitio desde `/admin`. Es una opción
de "puente manual" con cero horas de desarrollo, útil como parche mientras se
decide si vale la pena construir la integración automática, pero no escala y
depende de que haya siempre una persona pendiente del teléfono.

## 2. Caso de uso concreto: reportar por WhatsApp/Telegram → reporte en el sitio

### Arquitectura propuesta
```
Usuario escribe WhatsApp/Telegram
        │
        ▼
Meta / Telegram hace POST a un webhook
        │
        ▼
src/app/api/webhooks/whatsapp/route.ts   (Next.js Route Handler, NO Server Action
src/app/api/webhooks/telegram/route.ts    — estas rutas SÍ pueden recibir POST
                                             externos sin CSRF de formulario)
        │
        ├─ Verifica firma/token del webhook (evita que cualquiera falsifique reportes)
        ├─ Identifica al remitente (teléfono / chat_id de Telegram) → hash como
        │  "deviceId" sustituto, igual al patrón de dedup que ya existe para
        │  votos por localStorage en src/lib/data.ts
        ├─ Parsea el texto: comando simple ("AGUA NO <código-punto>") o
        │  conversación guiada por menú (más amigable, más trabajo)
        └─ Llama DIRECTO a la función de src/lib/data.ts que ya usa la Server
           Action correspondiente (p. ej. la misma lógica que
           likeAidPointAction usa internamente), NO a la Server Action en sí
           (esas están pensadas para invocarse desde un formulario React, no
           desde un webhook)
        │
        ▼
Confirmación de vuelta al usuario ("Gracias, reporte recibido")
```

Esto encaja de forma natural con el patrón de **consenso** que ya existe para
puntos de ayuda (`"✅ Sí hay / ❌ Se acabó"`, dedup por dispositivo) — un
reporte por WhatsApp de "se acabó el agua" es exactamente un voto más, solo
que el "dispositivo" ahora es un número de teléfono en vez de un
`localStorage`. Para el caso de "vi a esta persona" el paralelo es un
**comentario/reporte** sobre la ficha de esa persona (igual al patrón de
"Personas → autoridad": un desconocido reportando por WhatsApp debe quedar
como "sin verificar", igual que cualquier reporte anónimo desde la web).

### Nivel de esfuerzo honesto
- **Parseo de comandos de texto libre**: la parte más subestimada. La gente no
  escribe "AGUA NO PA-042"; escribe "hola se acabó el agua en el punto de la
  plaza". Un parser rígido por palabras clave frustra a la gente rápido. Dos
  caminos: (a) menú guiado por botones/listas (WhatsApp lo soporta con
  "interactive messages"; Telegram con "inline keyboards" — más trabajo pero
  mucho más confiable), o (b) mandarlo a un LLM barato (ya usan `gpt-4o-mini`
  en `scripts/fetch-social-posts.mjs` para clasificar posts) para extraer
  intención + entidad, con un "review" manual en `/admin` como red de
  seguridad — más simple de construir pero depende de un servicio externo y
  tiene costo variable por mensaje.
- **Identificar a qué punto de ayuda/persona se refiere** sin coordenadas GPS
  ni ver el sitio es el problema real, no el webhook en sí. Compartir
  ubicación por WhatsApp (`location message`) sí es fácil y confiable — buscar
  el punto de ayuda más cercano por lat/lon ya es lógica que probablemente ya
  existe para el mapa (`components/map/`).
- **Webhook + firma + guardar en Supabase**: 1 día para alguien que ya conoce
  el repo, para UN canal (Telegram, por ser el más simple).
- **Menú guiado + estado de conversación** (recordar en qué paso va cada
  usuario): otro 1-2 días — necesita una tabla nueva tipo
  `whatsapp_conversations(phone, state, context)` en Supabase.
- **Verificación de Meta Business para WhatsApp**: 0 horas de desarrollo, pero
  días o semanas de espera/tramite fuera de nuestro control — por eso conviene
  arrancarla temprano en paralelo, no como bloqueante del MVP.

**Total realista para un MVP de un solo flujo (reportar que se acabó el agua
en un punto de ayuda) sobre Telegram**: 2-3 días de trabajo efectivo.
Sobre WhatsApp Cloud API: el mismo desarrollo, +tiempo de espera externo de la
verificación de Meta que puede estirar el lanzamiento real varias semanas.

## 3. Alternativa: Telegram Bot API

| | WhatsApp Cloud API | Telegram Bot API |
|---|---|---|
| Costo | Gratis para conversaciones iniciadas por el usuario (nuestro caso); mensajes de plantilla salientes tienen costo por país | 100% gratis, sin límite, sin categorías de mensaje |
| Verificación previa | Meta Business Verification (documentos legales, días-semanas) | Ninguna — se crea con `@BotFather` en minutos |
| Complejidad técnica | Media-alta (firmas, plantillas, ventanas de 24h, categorías) | Baja (webhook simple, token secreto opcional) |
| Alcance real en Venezuela | Muy alto — es la app de mensajería dominante | Presencia real pero secundaria (ver más abajo) |

### Uso real de Telegram vs. WhatsApp en Venezuela
Datos duros específicos de Venezuela 2025-2026 son escasos, pero lo que se
encontró: las apps de mensajería en conjunto (WhatsApp, Telegram y similares)
son la vía por la que **4 de cada 10 venezolanos** se entera de noticias
(41,7%, dato de un estudio citado por Últimas Noticias). A nivel global,
WhatsApp tiene >3.000 millones de usuarios activos y mueve ~140.000 millones
de mensajes al día, contra ~1.000 millones de usuarios activos mensuales y
~15.000 millones de mensajes/día de Telegram — es decir, **WhatsApp
domina de forma aplastante en volumen global**, y todo indica (sin encontrar
una encuesta específica y reciente solo de Venezuela) que en Venezuela pasa
lo mismo: WhatsApp es la app "por defecto" con la que la gente ya tiene
guardados los contactos de familiares y vecinos, mientras Telegram se usa más
para canales informativos/de noticias que para chat uno a uno. Conclusión
honesta: **un bot de Telegram va a tener mucho menos alcance espontáneo que
WhatsApp** — hay que promocionarlo activamente (igual que se promociona el
sitio) para que la gente lo use, no basta con que exista.

## 4. SMS como respaldo para zonas sin datos

Precios reales de Twilio (agosto 2026, vía `twilio.com/en-us/sms/pricing`):

| País | SMS saliente | SMS entrante | Número internacional |
|---|---|---|---|
| Venezuela | **$0,2257 / mensaje** | $0,2257 / mensaje | desde $1,15/mes |
| Colombia | $0,0592 / mensaje | $0,0592 / mensaje | desde $1,15/mes |

El precio a Venezuela es **~4 veces más caro que a Colombia** y no hay
desglose por operadora (Movilnet, Digitel, Movistar) en la página pública, lo
que ya es una señal de que la entrega ahí es menos predecible/estandarizada
que en mercados más grandes. No se encontró un agregador SMS local
venezolano confiable y documentado en esta investigación (quedaría pendiente
de una investigación aparte si de verdad se quiere perseguir esta vía) —
Twilio es la referencia más verificable pero probablemente no la más barata
si existiera una alternativa local.

**¿Tiene sentido "consultar si una persona fue encontrada" por SMS con
palabra clave?** Técnicamente sí (SMS entrante con palabra clave + cédula/ID
→ responder con estado) es un patrón bien conocido y barato de implementar en
Twilio (webhook igual de simple que WhatsApp/Telegram). El problema no es
técnico, es de costo y volumen: a $0,23 por SMS (ida) + $0,23 (respuesta), 100
consultas ya cuestan ~$46 — para un proyecto sin fines de lucro y sin
modelo de ingresos, esto no escala bien si el uso crece. Además, en un
terremoto real las antenas celulares dañadas afectan tanto la voz/SMS como
los datos — SMS no es automáticamente más resiliente que WhatsApp sobre
datos móviles; en muchos casos ambos fallan o ambos funcionan según qué
antena/operadora siga en pie. **No se encontró evidencia de que SMS sea
claramente más confiable que datos móviles en el escenario de este proyecto**,
así que el argumento de "SMS como respaldo para zonas sin datos" es más débil
de lo que suena a primera vista — sí existen zonas rurales con solo cobertura
2G/voz y sin 3G/4G donde SMS sería la única vía, pero es un caso de borde, no
el caso general.

## 5. Precedente real: terremoto de Turquía 2023

Se encontraron varios patrones documentados, todos con WhatsApp como
herramienta *informal* (no vía Business API/bot oficial en la mayoría de los
casos, sino grupos y chats manuales):

- **AKUT** (la asociación de búsqueda y rescate más reconocida de Turquía)
  usó una línea de WhatsApp dedicada para difundir información sobre cómo
  ser voluntario y sobre operaciones de rescate.
- Coordinación médica de base: un doctor (Dr. Kanatlı) organizó respuesta de
  emergencia contactando colegas médicos por WhatsApp — coordinación
  totalmente informal, sin herramienta central.
- Grupos de voluntarios: organizaciones como Circolo Roma sumaban
  voluntarios a grupos de WhatsApp para gestionar operaciones de ayuda.
- El patrón más parecido a lo que este documento evalúa: **Afetsaglikharitasi.org**,
  un mapa GIS de centros de salud que se alimentaba en parte de un
  **chatbot de WhatsApp integrado**, permitiendo reportar y consultar el
  estado de centros de salud incluso con conectividad limitada. Para el 30 de
  marzo de 2023 el mapa ya tenía datos de 537 centros de salud y había
  alcanzado a más de 800.000 personas por redes sociales.

**Lecciones aplicables a "El Mundo Te Busca":**
1. Los grupos de WhatsApp informales **sí funcionan** para movilizar gente
   rápido, pero se fragmentan (grupos duplicados, información desactualizada,
   nadie sabe cuál es "el" grupo oficial) — el patrón que mejor escaló fue
   justo el que **combinó WhatsApp como canal de entrada con una base de
   datos/mapa central como fuente de verdad**, que es exactamente la
   arquitectura descrita en la sección 2 de este documento (webhook → dato
   estructurado → sitio único).
2. La falta de sistemas de información en tiempo real fue señalada como una
   de las brechas más importantes de la respuesta — reforzando que vale la
   pena invertir en centralizar (no en sumar más grupos de chat sueltos).
3. Ninguno de los casos documentados menciona haber pasado por el proceso
   formal de verificación de Meta Business — probablemente usaron WhatsApp
   normal/grupos, no la Cloud API — lo cual es coherente con que ese trámite
   es una fricción real que muchas iniciativas de emergencia optan por
   evitar.

## 6. Recomendación final priorizada

Dado que esto lo mantiene una persona (o equipo muy chico) sobre un sitio ya
en producción, y que el propio estado del proyecto prioriza ahora mismo
**seguridad/estabilidad sobre features nuevas**:

1. **Fase 0 (ya existe, no tocar)**: `wa.me` deep links para *compartir* el
   sitio — es unidireccional (salida), no requiere nada nuevo, ya cumple su
   función.
2. **Fase 1 — Telegram Bot, MVP de un solo flujo** (recomendado primero):
   reportar disponibilidad de un punto de ayuda ("Sí hay" / "Se acabó") vía
   comandos simples o botones. Sin dependencias externas de aprobación, costo
   $0. Estimado: **2-3 días** de desarrollo para alguien que ya conoce
   `src/lib/data.ts` y el patrón de consenso de puntos de ayuda. Riesgo
   principal: adopción baja si no se promociona (Telegram no es el hábito por
   defecto en Venezuela).
3. **Fase 2 — arrancar el trámite de verificación de Meta Business en
   paralelo**, sin bloquear nada: si el usuario tiene o puede conseguir un
   documento válido (RIF, registro, factura de servicios a nombre de la
   organización), vale la pena iniciar el proceso ahora porque el tiempo de
   espera no depende de nosotros. Si se aprueba, el mismo código del webhook
   de Telegram se adapta a WhatsApp Cloud API (arquitectura idéntica, cambia
   el formato del payload) — probablemente **1-2 días adicionales** de
   adaptación, no un desarrollo desde cero.
4. **SMS: no priorizar ahora.** Costo alto ($0,23/mensaje a Venezuela),
   beneficio de resiliencia dudoso para el escenario real (antenas dañadas
   afectan datos y voz por igual en la mayoría de los casos), y no se encontró
   un proveedor local claramente mejor que Twilio en esta investigación. Si en
   el futuro aparece evidencia concreta de zonas con solo cobertura 2G/SMS,
   vale la pena retomarlo — el desarrollo del webhook sería reutilizable del
   trabajo ya hecho para Telegram/WhatsApp.
5. **No perseguir un BSP de pago fijo (360dialog, Wati) todavía** — el
   volumen actual no lo justifica; si se va a WhatsApp, la API directa de
   Meta o Twilio (pago por uso) alcanzan.

**Riesgo transversal a vigilar en cualquier fase** (coherente con la prioridad
actual de "seguridad > features nuevas" del proyecto): un webhook público que
puede escribir datos (votos, reportes) es una superficie nueva de abuso —
alguien podría automatizar mensajes falsos de "se acabó el agua" para sembrar
pánico o vandalizar el consenso. Hay que aplicar el mismo criterio de dedup
por dispositivo/rate-limit que ya existe para votos web, y probablemente
mantener estos reportes como "sin verificar" (igual que cualquier reporte
anónimo) en vez de que cambien el estado directamente sin pasar por moderación,
al menos en la primera versión.

## Fuentes

- [WhatsApp API Pricing Explained (2026) — Authgear](https://www.authgear.com/post/whatsapp-api-pricing/)
- [WhatsApp Business API Pricing 2026 — Blueticks](https://blueticks.co/blog/whatsapp-business-api-pricing-2026)
- [WhatsApp Business Per-Message Pricing 2026 — Blueticks](https://blueticks.co/blog/whatsapp-business-pricing-change-2026-per-message)
- [WhatsApp Business API Pricing 2026 — EngageLab](https://www.engagelab.com/blog/whatsapp-business-api-pricing)
- [WhatsApp Business Costs 2026 — Chatarmin](https://chatarmin.com/en/blog/whatsapp-business-costs)
- [WhatsApp Cloud API: Setup & Cost Guide 2026 — Chatarmin](https://chatarmin.com/en/blog/whatsapp-cloudapi)
- [WhatsApp Business Pricing 2026: Free App vs API Costs — Kanal](https://getkanal.com/blog/whatsapp-business-pricing-guide)
- [Best WhatsApp Business API Providers 2026 — 12 BSPs — Kanal](https://getkanal.com/blog/whatsapp-business-api-providers-compared)
- [Twilio vs 360Dialog: WhatsApp API Pricing and Features — Kommunicate](https://www.kommunicate.io/blog/twilio-vs-360dialog-a-comparison/)
- [WhatsApp for NGOs & Non-Profits 2026 — AiSensy](https://m.aisensy.com/blog/whatsapp-for-ngos-and-non-profits/)
- [Meta Business Verification Documents — save office](https://saveoffice.io/blog/meta-business-verification-documents)
- [Meta Business Verification — docs.360dialog.com](https://docs.360dialog.com/docs/resources/meta-business-verification)
- [About Meta Business Verification — ActiveCampaign Help Center](https://help.activecampaign.com/hc/en-us/articles/20678074776476-About-Meta-Business-Verification)
- [SMS Pricing in Venezuela — Twilio](https://www.twilio.com/en-us/sms/pricing/ve)
- [SMS Pricing in Colombia — Twilio](https://www.twilio.com/en-us/sms/pricing/co)
- [Twilio Pricing](https://www.twilio.com/en-us/pricing)
- [Las aplicaciones de mensajería más populares en cada país — Sinch](https://sinch.com/es/blog/aplicaciones-mensajeria-populares-paises/)
- [DatosUN: 4 de cada 10 personas se informan a través de apps de mensajería — Últimas Noticias](https://ultimasnoticias.com.ve/datos-un/datosun-4-de-cada-10-personas-se-informan-a-traves-de-apps-de-mensajeria/)
- [Estadísticas de WhatsApp 2026 — AffiliateBooster](https://affiliatebooster.com/es/whatsapp-statistics/)
- [Turkey earthquake: Four ways tech is being used to help victims — Context by TRF](https://www.context.news/big-tech/turkey-earthquake-four-ways-tech-is-being-used-to-help-victims)
- [Deploying a user-friendly GIS mapping tool in post-earthquake Turkey and Syria — Journal of Global Health Economics and Policy](https://jogh-ep.org/article/125043-deploying-a-user-friendly-gis-mapping-tool-in-post-earthquake-turkey-and-syria)
- [Digital Battlegrounds: Social Media, State Power, and Influencers in Türkiye's Earthquake Response — SAGE Journals](https://journals.sagepub.com/doi/full/10.1177/20563051241269305)
- [Write a simple Telegram Bot in Next.js — Medium](https://bhairabeniwal.medium.com/write-a-simple-telegram-bot-in-next-js-2ed3814abc62)
- [How to build a Telegram API integration — Rollout](https://rollout.com/integration-guides/telegram/quick-guide-to-implementing-webhooks-in-telegram)
- [GitHub - jsjoeio/telegram-bot-template](https://github.com/jsjoeio/telegram-bot-template)
