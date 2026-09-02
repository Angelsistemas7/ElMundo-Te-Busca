# Investigación: observabilidad (errores/uptime) y testing automatizado

> Documento de investigación. **No incluye cambios de código.** Objetivo: el
> sitio ya está en vivo en un VPS propio (PM2 fork + nginx + Cloudflare) sin
> equipo de operaciones — hoy el desarrollador se entera de bugs porque
> "alguien le escribe por Facebook". Evaluar cómo enterarse antes (Sentry +
> monitor de caída + alerta a Telegram) y cómo tener una red mínima que evite
> publicar un `npm run build` roto (Playwright + GitHub Actions). Fecha de la
> investigación: 2026-08-12.

## Resumen ejecutivo

**Frente 1 (observabilidad):** instalar `@sentry/nextjs` (plan gratis: 5.000
errores/mes, 1 usuario, retención 30 días — de sobra para el tráfico actual) y
un monitor externo gratis con alerta a **Telegram**, que es más simple que
WhatsApp Business (sin verificación de negocio) y más rápido de configurar que
email para algo urgente. Recomiendo **UptimeRobot** (gratis, 50 monitores,
exento de la restricción "solo uso no-comercial" porque el proyecto es
sin fines de lucro) con su integración nativa de Telegram, más un endpoint
`/api/health` real que compruebe Supabase. De regalo: se confirmó que
`@vercel/analytics`/`@vercel/speed-insights` (ya instalados en
`src/app/layout.tsx`) **no recolectan datos en este VPS** — sus scripts solo
funcionan si el sitio corre en la infraestructura de Vercel, así que hoy son
peso muerto en el bundle del cliente sin ningún beneficio.

**Frente 2 (testing):** no existe ninguna carpeta `tests/`, `.spec.ts`/
`.test.ts` propio del proyecto, ni workflow de CI que corra pruebas — solo
`deploy.yml` (despliega directo a producción en cada push a `main`, sin gate
alguno) y `sync-legacy-sites.yml`. Se investigó y **se descubrió algo
importante propio de este código**: `verifyTurnstile()`
(`src/lib/turnstile.ts`) ya falla-abierto en modo no-producción sin clave
configurada, así que un smoke test de Playwright corriendo contra `next dev`
**no necesita ni las claves de prueba de Cloudflare ni tocar Supabase** —
basta con no definir `.env.local` (modo demostración, datos en memoria) y
`NODE_ENV` distinto de `production`. Recomiendo UN test de humo mínimo
("publicar una persona → aparece en `/`") con Playwright, corrido en GitHub
Actions **antes** del job de `deploy.yml` (o como gate del mismo workflow),
gratis dentro de las 2.000 minutos/mes de GitHub Actions.

---

## Frente 1 — Observabilidad

### 1. Sentry para Next.js 15 App Router

**Instalación (wizard, la vía recomendada):**
```bash
npx @sentry/wizard@latest -i nextjs
```
El wizard: instala `@sentry/nextjs`, crea `sentry.server.config.ts` y
`sentry.edge.config.ts` (más `instrumentation-client.ts` para el lado
cliente — en versiones recientes del SDK reemplazó a
`sentry.client.config.ts`), envuelve `next.config.ts` con
`withSentryConfig` (sube source maps automáticamente para que los stack
traces se vean con el código real, no minificado), crea `instrumentation.ts`
en la raíz (o `src/`) exportando `onRequestError`, y pide/guarda
`SENTRY_DSN`, `SENTRY_ORG`, `SENTRY_PROJECT` en `.env.local`.

Instalación manual (si se prefiere no correr el wizard):
```bash
npm install @sentry/nextjs --save
```

**`instrumentation.ts`** (raíz del proyecto, junto a `next.config.ts`):
```ts
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./sentry.server.config");
  }
  if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config");
  }
}

export const onRequestError = Sentry.captureRequestError;
```
Este hook (requiere Next.js 15+ y SDK 8.28+) captura automáticamente errores
de **Server Components**, middleware y proxies. Next.js 15.3+ ya trae activado
por defecto el flag que antes era experimental (`instrumentationHook`), así
que en este proyecto (Next `^15.1.3` en `package.json` — conviene subir al
menos a 15.3 antes de instalar Sentry, o activar el flag a mano en
`next.config.ts`).

**Qué se captura solo vs. qué exige código manual — el matiz importante para
este repo:**
- **Automático:** errores no capturados en Server Components, en render de
  React (si se crea `app/global-error.tsx`), en middleware.
- **Manual — esto SÍ aplica directo a `src/app/actions.ts`:** las **Server
  Actions** (`registerPersonAction`, `reportStatusAction`, etc. — hay 16+ en
  este archivo, cada una con su propio `try/catch` que hoy solo devuelve
  `{ ok: false, error: "..." }` sin dejar rastro del error real) necesitan
  envolverse con `Sentry.withServerActionInstrumentation()` para que el
  error viaje a Sentry y además conecte el trace cliente↔servidor:
```ts
"use server";
import * as Sentry from "@sentry/nextjs";

export async function registerPersonAction(form: FormData) {
  return await Sentry.withServerActionInstrumentation(
    "registerPersonAction",
    { formData: form, recordResponse: true },
    async () => {
      // ... cuerpo actual de la función
    },
  );
}
```
Sin este envoltorio, un `catch { return { ok:false, ... } }` como los que ya
existen en `actions.ts` **traga el error silenciosamente** — ni Sentry ni los
logs de PM2 se enteran de qué pasó. Es el punto de mayor valor para este
proyecto: instrumentar primero las acciones que ya el propio `CLAUDE.md`
marca como críticas — publicar persona y cambiar estado.

**Plan gratis (Developer, 2026):** 5.000 errores/mes, 10.000 unidades de
performance (transacciones), 5 GB de logs, 5 GB de métricas, 5M de spans, 50
replays de sesión, **1 monitor de uptime**, 1 cron monitor, 20 metric
monitors, retención de 30 días, 1 solo usuario. De sobra para el volumen
actual del sitio; si el tráfico crece mucho, el primer límite en tocarse
probablemente sea el de errores si hay un bug repetitivo sin arreglar (Sentry
agrupa por huella, así que un mismo error masivo no explota la cuota tan
rápido como parece).

**¿Cambia algo estar en VPS propio y no en Vercel?** No para la integración
con Next.js — el SDK de Sentry instrumenta la app igual sin importar dónde
corra (VPS, Vercel, cualquier Node). Sentry SaaS (sentry.io, la opción
gratis) es un servicio aparte al que la app le manda eventos por HTTPS; no
hace falta auto-hosting de Sentry (que si acaso sí pesa: mínimo 8 GB RAM, 4
vCPU para la versión self-hosted — completamente fuera de escala para este
proyecto). Conclusión: usar Sentry SaaS gratis, sin tocar la infraestructura
del VPS más allá de añadir el DSN como variable de entorno.

**Aparte, hallazgo relevante para "observabilidad" que ya estaba instalado:**
`@vercel/analytics` y `@vercel/speed-insights` están en
`src/app/layout.tsx` (líneas 3-4, 87-88) pero **sus scripts solo funcionan
si el proyecto está desplegado en la infraestructura de Vercel** — el
beacon que mandan (`/_vercel/insights/...`) lo intercepta el edge de Vercel;
en un VPS con nginx esa ruta no existe, así que el POST falla en silencio y
**no se recolecta ningún dato**. Hoy es JS que viaja al cliente sin ningún
beneficio. No es parte del alcance de este documento cambiar código, pero
vale la pena marcarlo para una limpieza futura (quitarlos, o cambiar a algo
autohospedable tipo Umami/Plausible si se quiere analítica de visitas).

### 2. Endpoint `/api/health`

Patrón recomendado: no basta con devolver `{ ok: true }` sin más (eso solo
confirma que el proceso Node responde, no que la app funcione de verdad) —
conviene ejercitar la conexión real a Supabase con la consulta más barata
posible.

```ts
// src/app/api/health/route.ts
import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = getSupabase();

  // Sin credenciales configuradas: el sitio corre en modo demostración
  // (memoria) a propósito — no es una falla.
  if (!supabase) {
    return NextResponse.json({ status: "ok", mode: "demo" });
  }

  try {
    // head:true + count "exact": no trae filas, solo confirma que la
    // conexión/auth funcionan. Debe tener timeout para no colgar el healthcheck
    // si Supabase está lento (mismo criterio que ya usa verifyTurnstile con
    // AbortSignal.timeout).
    const { error } = await Promise.race([
      supabase.from("people").select("id", { count: "exact", head: true }),
      new Promise<{ error: Error }>((_, reject) =>
        setTimeout(() => reject(new Error("timeout")), 3000),
      ),
    ]);
    if (error) throw error;
    return NextResponse.json({ status: "ok", mode: "supabase" });
  } catch (err) {
    return NextResponse.json(
      { status: "error", detail: err instanceof Error ? err.message : "unknown" },
      { status: 503 },
    );
  }
}
```
Este es exactamente el endpoint que apunta el monitor externo (sección
siguiente) y el que Sentry podría usar como su "1 monitor de uptime" gratis
incluido en el plan Developer, si se prefiere no dar de alta un servicio
aparte.

### 3. Monitor externo gratis + alerta a Telegram

| | UptimeRobot | Better Uptime (Better Stack) | Freshping |
|---|---|---|---|
| Estado 2026 | activo | activo | **cerrado el 6 de marzo de 2026** (Freshworks lo descontinuó) |
| Plan gratis | 50 monitores, cada 5 min | ~10 monitores, cada 3 min (mkt dice "30s" en algunos planes pero el free actual es más lento) | — |
| Restricción de uso | desde oct-2024/dic-2024, **prohibido uso comercial** en el plan gratis — pero **proyectos sin fines de lucro están explícitamente exentos** | sin esa restricción | — |
| Telegram nativo | **sí**, integración nativa en "Integrations & API" | no tiene Telegram nativo (solo email/Slack; requiere un puente tipo Albato/Zapier, con su propio límite gratis) | — |

**Recomendación: UptimeRobot.** Con Freshping fuera de juego, la decisión es
entre UptimeRobot y Better Uptime. Better Uptime no ofrece Telegram nativo
(el pedido explícito del usuario era justamente evitar el rodeo de más
servicios/webhooks intermedios), y la restricción de "solo uso no comercial"
de UptimeRobot no aplica aquí: "El Mundo Te Busca" es, según el propio
`CLAUDE.md`, una "plataforma ciudadana sin fines de lucro" — cae dentro de la
excepción publicada. Aun así, si el usuario quiere blindarse, puede escribirle
a soporte de UptimeRobot para confirmarlo por escrito antes de depender de
ello a largo plazo.

**Pasos concretos para la alerta a Telegram (nativa, sin webhook manual):**
1. En UptimeRobot: `Integrations & API` → `Add integration` → elegir
   `Telegram`.
2. Sigue el enlace `t.me/uptimerobot_bot` (el bot oficial de UptimeRobot) y
   dale `/start` desde la cuenta de Telegram que va a recibir las alertas
   (o añade el bot a un grupo si varias personas del equipo deben verlo).
3. Copia el código que te da el bot y pégalo en el campo que pide UptimeRobot
   al crear la integración — así vincula tu chat/grupo de Telegram con tu
   cuenta.
4. Crea el monitor tipo "HTTP(s)" apuntando a
   `https://elmundotebusca.com/api/health`, intervalo de 5 minutos (el
   mínimo del plan gratis), y asigna la alerta de Telegram recién creada
   como "Alert Contact" del monitor.
5. Opcional pero recomendable: crea un segundo monitor a la home
   (`https://elmundotebusca.com/`) — así, si `/api/health` sigue arriba pero
   algo rompe el render de la home (p. ej. un error en Server Component no
   capturado por el healthcheck), también avisa.

Alternativa sin dar de alta un servicio nuevo: usar el **1 monitor de uptime
gratis que ya viene incluido en el plan Developer de Sentry** (sección
anterior) apuntando también a `/api/health`, con su **Telegram Alerts Bot**
oficial (`docs.sentry.io/integrations/notification-incidents/telegram-alerts-bot`)
para las alertas de caída Y de errores en el mismo canal de Telegram. Es más
simple de mantener (un solo panel), a costa de tener un solo monitor en vez
de varios.

### 4. Logging estructurado mínimo viable para Server Actions críticas

No hace falta un stack de logging completo (Pino/Winston + agregador) para
este tamaño de proyecto — PM2 ya escribe todo el `stdout`/`stderr` del
proceso a archivo (`~/.pm2/logs/elmundotebusca-{out,error}.log`, según
`ecosystem.config.cjs`). Lo mínimo viable es simplemente loguear una línea
JSON por evento crítico en las Server Actions que ya identifica el
`CLAUDE.md` como el corazón del sitio (publicar persona, cambiar estado):

```ts
// src/lib/log.ts — sin dependencias nuevas
export function logEvent(event: string, data: Record<string, unknown>) {
  // Una línea JSON por evento: grepable en los logs de PM2 tal cual
  // (`pm2 logs elmundotebusca | grep person.created`), e ingerible sin
  // esfuerzo si algún día se agrega Loki/Datadog/lo que sea.
  console.log(JSON.stringify({ ts: new Date().toISOString(), event, ...data }));
}
```
```ts
// en registerPersonAction, tras crear el registro:
logEvent("person.created", { id: person.id, isUnidentified: parsed.data.isUnidentified, country: parsed.data.country });

// en el catch:
logEvent("person.create_failed", { error: err instanceof Error ? err.message : String(err) });
```
Si más adelante el volumen justifica algo más serio, el camino natural es
**Pino** (`npm install pino`): mismo formato JSON por línea, pero más rápido
y con niveles/redacción de campos sensibles (útil para no loguear por
accidente `contactPhone`/`contactEmail`). No es necesario ahora — la
recomendación es empezar con `console.log(JSON.stringify(...))` (cero
dependencias, cero riesgo de romper el build) y subir a Pino solo si se nota
falta.

**Prioridad recomendada del Frente 1:** (1) Sentry con
`withServerActionInstrumentation` en `registerPersonAction` y
`reportStatusAction`/las de cambio de estado — es lo que más rápido convierte
"me escribieron por Facebook" en una alerta automática con el stack trace
real; (2) `/api/health` + UptimeRobot con Telegram — barato y rápido de
montar, cubre el caso "el proceso se cayó" que Sentry no cubre solo; (3) log
estructurado mínimo — gratis, cero riesgo, complementa a Sentry para eventos
que no son errores (p. ej. contar publicaciones por día).

---

## Frente 2 — Testing

### 5. Playwright + Server Actions de Next.js 15: matices reales

- **Las Server Actions no se "mockean" al estilo API REST** — el servidor
  real ES el límite de la prueba. Playwright dirige un navegador real contra
  la app real corriendo (`next dev` o `next start`); no hay forma de
  interceptar la Server Action en sí desde el test como se haría con
  `page.route()` sobre una llamada `fetch` a una API REST (aunque si en algún
  punto la acción llama a algo externo — Cloudflare Turnstile, OpenAI, GNews —
  eso sí se puede interceptar con `page.route()`, porque esas sí son
  llamadas HTTP normales... del lado servidor, que Playwright no ve. Para
  esas hay que controlarlas por variables de entorno, como se hace en este
  proyecto con Turnstile — ver punto 6).
- Los formularios en este proyecto no son un `<form action={serverAction}>`
  plano: `RegisterPersonButton.tsx` intercepta el `submit` con
  `preventDefault()`, arma el `FormData` a mano y llama a
  `registerPersonAction(form)` vía `fetch` interno de Next.js (Server
  Action como RPC). Para Playwright esto es transparente — igual se rellenan
  los `<input>` visibles y se hace clic en "Publicar"; solo importa esperar
  el resultado final visible (mensaje de éxito, no una llamada de red
  interna).
- Patrón recomendado: **esperar el resultado visible para el usuario**, no
  la request de red — en este caso, tras enviar el formulario de
  `RegisterPersonButton`, esperar a que aparezca el estado `done` (mensaje
  "Registro publicado..." + `ManageLinkBox` con el enlace de gestión), no
  intentar interceptar la respuesta del Server Action.
- Selectores por rol/label/texto visible en vez de clases CSS (las clases de
  Tailwind de este proyecto son puramente de estilo y cambian seguido).

### 6. Diseño del test de humo: "publicar una persona → aparece en la lista"

**El hallazgo clave para simplificar esto muchísimo, específico de este
repo:** `verifyTurnstile()` (`src/lib/turnstile.ts:8-13`) ya tiene este
comportamiento:
```ts
const secret = process.env.TURNSTILE_SECRET_KEY;
if (!secret) {
  return process.env.NODE_ENV !== "production"; // true en dev/test
}
```
Y del lado cliente, `Turnstile.tsx` (líneas 100-106): si
`NEXT_PUBLIC_TURNSTILE_SITE_KEY` no está configurada, el componente **ni
siquiera renderiza el widget** — muestra una nota de texto y el formulario
sigue funcionando sin bloquear el envío. O sea: **si el smoke test corre
contra `next dev` (o cualquier proceso con `NODE_ENV` distinto de
`"production"`) sin `.env.local`, Turnstile queda completamente fuera del
camino sin tocar nada de Cloudflare.** Esto es más simple que el patrón
genérico que documenta Cloudflare (claves de prueba
`1x00000000000000000000AA` / `1x0000000000000000000000000000000AA`, que sí
haría falta si el test corriera contra `next start` con
`NODE_ENV=production`, porque ahí `verifyTurnstile` pasa a fail-closed a
propósito — ver el comentario en el propio código: "en PRODUCCIÓN se
rechaza (fail-closed) para no quedar sin anti-bot"). Para un smoke test
contra el build de producción real (`next start`), sí habría que usar esas
claves de Cloudflare, inyectadas como variables de entorno **en el paso de
build** (igual que ya hace `deploy.yml` con las `NEXT_PUBLIC_*`):
```yaml
env:
  NEXT_PUBLIC_TURNSTILE_SITE_KEY: 1x00000000000000000000AA
  TURNSTILE_SECRET_KEY: 1x0000000000000000000000000000000AA
```

**Tampoco hace falta Supabase real:** sin `.env.local`, la app corre en modo
demostración con el seed en memoria (`src/lib/seed.ts`), tal como ya describe
`CLAUDE.md`. El smoke test más simple no necesita ningún secreto de Supabase
ni cuenta de prueba — corre 100% contra el modo demo.

**Pasos concretos de Playwright** (contra `next dev`, el camino más simple —
no exige claves de Cloudflare):
```ts
// e2e/publicar-persona.spec.ts
import { test, expect } from "@playwright/test";

test("publicar una persona aparece en la lista de Se busca", async ({ page }) => {
  const nombreUnico = `Prueba E2E ${Date.now()}`;

  await page.goto("/");

  // 1. Abrir el modal de publicación (botón "Publicar" / RegisterPersonButton).
  await page.getByRole("button", { name: /publicar/i }).click();

  // 2. Elegir la intención "Busco a una persona" (isUnidentified=false).
  await page.getByRole("button", { name: /busco a una persona/i }).click();

  // 3. Rellenar los campos obligatorios del esquema (personSchema).
  await page.getByLabel(/nombre/i).fill(nombreUnico);
  await page.getByLabel(/apellido/i).fill("Apellido Prueba");
  await page.getByLabel(/dónde|ubicación|lugar/i).fill("La Guaira, Vargas");
  await page.getByLabel(/descripción/i).fill("Registro de prueba automatizada — smoke test.");

  // 4. Enviar y esperar el resultado visible (no una request de red).
  await page.getByRole("button", { name: /publicar registro|enviar/i }).click();
  await expect(page.getByText(/registro publicado/i)).toBeVisible({ timeout: 10_000 });

  // 5. Cerrar el modal y verificar que aparece en la portada ("Se busca").
  await page.getByRole("button", { name: /cerrar/i }).click();
  await page.reload();
  await expect(page.getByText(nombreUnico)).toBeVisible();
});
```
Notas sobre los selectores exactos: hay que ajustarlos al texto real de los
botones (`Modal.tsx`, `RegisterPersonButton.tsx`) al implementarlo — el
snippet de arriba es la forma, no el texto literal verificado carácter por
carácter. Dato importante encontrado en `registerPersonAction`
(`src/app/actions.ts:466-479`): si se elige "sighting" (avistamiento) en vez
de "search", el nombre es opcional pero exige foto, descripción **o**
lugar — para el test de humo conviene usar el flujo "search" (nombre
obligatorio) por ser el más simple de verificar con aserciones deterministas.

Con datos en memoria (modo demo), cada corrida del test **reinicia el
estado** solo si el proceso de `next dev` se reinicia entre corridas — dentro
de una misma corrida de CI (un solo arranque del servidor) los registros
creados por el test se acumulan en memoria. Usar un nombre único con
timestamp (`nombreUnico` arriba) evita falsos positivos por datos de un run
anterior.

### 7. Workflow de GitHub Actions

Mínimo, gratis (dentro de las 2.000 min/mes de cuenta gratis; Ubuntu runner),
pensado para correr **antes** de que `deploy.yml` publique — dos opciones:

**Opción A — job separado que bloquea el merge a `main`** (recomendado si se
empieza a usar Pull Requests; hoy el repo pushea directo a `main`, así que
esta opción exige adoptar el hábito de trabajar en rama):
```yaml
# .github/workflows/smoke-test.yml
name: Smoke test (Playwright)

on:
  pull_request:
    branches: [main]
  push:
    branches: [main]

jobs:
  smoke-test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
      - run: npm ci
      - run: npx playwright install --with-deps chromium
      - run: npm run build
      - name: Levantar el servidor y correr el smoke test
        run: |
          npm run start & npx wait-on http://127.0.0.1:3000
          npx playwright test
        env:
          PORT: 3000
          # Claves de prueba de Cloudflare (siempre pasan, nunca reales):
          NEXT_PUBLIC_TURNSTILE_SITE_KEY: 1x00000000000000000000AA
          TURNSTILE_SECRET_KEY: 1x0000000000000000000000000000000AA
      - uses: actions/upload-artifact@v4
        if: failure()
        with:
          name: playwright-report
          path: playwright-report/
```

**Opción B — gate dentro del propio `deploy.yml`**, más simple de adoptar
hoy porque no cambia el flujo de trabajo actual (push directo a `main`):
insertar un paso de smoke test **entre** "Build (Next.js standalone)" y
"Subir al VPS (rsync)" en `.github/workflows/deploy.yml`, de forma que si el
smoke test falla, el job entero falla y el `rsync`/`pm2 startOrReload` nunca
se ejecutan — nada llega a producción roto. Es la opción que más se alinea
con "un desarrollador sin equipo de operaciones": un solo workflow, un solo
lugar donde mirar si algo falló.

Cualquiera de las dos cabe cómoda en el tier gratis (un smoke test de un solo
flujo tarda entre 30 s y 2 min con Chromium ya cacheado).

**Prioridad recomendada del Frente 2:** (1) UN test de humo (el de arriba)
corriendo como gate en `deploy.yml` (Opción B) — evita el peor escenario, un
`npm run build` roto o una regresión en el flujo más crítico llegando a
producción sin que nadie se entere hasta que alguien escribe por Facebook;
(2) si el proyecto crece, sumar 1-2 tests más para los otros flujos que
`CLAUDE.md` marca como sensibles (gestión de persona por token, voto de
consenso en puntos de ayuda) antes de invertir en más cobertura general.

---

## Fuentes

- [Manual Setup — Sentry for Next.js](https://docs.sentry.io/platforms/javascript/guides/nextjs/manual-setup/)
- [Nextjs App Router Auto instrumentation — GitHub Discussion](https://github.com/getsentry/sentry-javascript/discussions/13442)
- [Sentry + Next.js: Complete Error Monitoring Guide (2026) — StackNotice](https://stacknotice.com/blog/sentry-nextjs-complete-guide-2026)
- [Complete Guide to Next.js Production Monitoring — BetterLink Blog](https://eastondev.com/blog/en/posts/dev/20251220-nextjs-production-monitoring/)
- [Sentry Pricing 2026: Event-Based Billing from Free to $80/Month](https://sentrypricing.com/free-plan)
- [Is Sentry Free? Developer Plan Limits & Upgrade Triggers (2026) — costbench](https://costbench.com/software/developer-tools/sentry/free-plan/)
- [Sentry Pricing 2026 — Last9](https://last9.io/blog/sentry-pricing/)
- [Self-Hosted Sentry Deployment Guide — RamNode VPS](https://ramnode.com/guides/sentry)
- [System Requirements — getsentry/self-hosted (DeepWiki)](https://deepwiki.com/getsentry/self-hosted/3.1-system-requirements)
- [Telegram — Sentry Integrations](https://docs.sentry.io/integrations/notification-incidents/telegram-alerts-bot/)
- [Your Next.js health check is lying to you (and how to fix it) — DEV Community](https://dev.to/ohyeah_d04cd4c2cd46a1ad2c/your-nextjs-health-check-is-lying-to-you-and-how-to-fix-it-1ho4)
- [Next.js Health Check: Complete Guide to /api/health (2026) — Nurbak](https://nurbak.com/en/blog/how-to-add-health-checks-nextjs-app/)
- [Realtime healthchecker as a NextJS API route for Datadog API monitoring — supabase Discussion](https://github.com/orgs/supabase/discussions/18122)
- [Top 10 Freshping Alternatives in 2026 — Better Stack Community](https://betterstack.com/community/comparisons/freshping-alternatives/)
- [Best UptimeRobot Alternatives in 2026 — Hyperping](https://hyperping.com/blog/best-uptimerobot-alternatives)
- [UptimeRobot Free Plan Limits in 2026: What You Actually Get — stillup.org](https://stillup.org/blog/uptimerobot-free-plan-limits)
- [UptimeRobot's Commercial Use Restriction: What Changed — Blacksight Scanner](https://scanner.blacksight.io/blog/uptimerobot-commercial-use-alternatives)
- [UptimeRobot Pricing 2026 — notifier.so](https://notifier.so/guides/uptimerobot-pricing-2026/)
- [Real-Time Downtime Alerts with UptimeRobot's Webhook Integration](https://uptimerobot.com/integrations/webhooks-integration/)
- [Instant Downtime Alerts with UptimeRobot's Telegram Integration](https://uptimerobot.com/integrations/telegram-integration/)
- [New Feature - Telegram Integration — UptimeRobot Blog](https://uptimerobot.com/blog/new-feature-telegram-integration/)
- [Better Stack vs UptimeRobot: A Complete Comparison for 2026 — Better Stack Community](https://betterstack.com/community/comparisons/better-stack-vs-uptimerobot/)
- [@vercel/speed-insights — npm](https://www.npmjs.com/package/@vercel/speed-insights)
- [Limits and Pricing for Speed Insights — Vercel Docs](https://vercel.com/docs/speed-insights/limits-and-pricing)
- [Vercel's Hidden Costs Add Up. Self-Host for $5/mo — servercompass](https://servercompass.app/blog/vercel-pricing-explained-hidden-costs)
- [A Complete Guide to Pino Logging in Node.js — Better Stack Community](https://betterstack.com/community/guides/logging/how-to-install-setup-and-use-pino-to-log-node-js-applications/)
- [Logging in Node.js: A Comparison of the Top 8 Libraries — Better Stack Community](https://betterstack.com/community/guides/logging/best-nodejs-logging-libraries/)
- [Testing a Next.js Form Component with Playwright — BrowserStack](https://www.browserstack.com/guide/nextjs-playwright)
- [Intercepting and mocking server-actions during e2e tests — vercel/next.js Discussion #67136](https://github.com/vercel/next.js/discussions/67136)
- [Testing: Playwright — Next.js Docs](https://nextjs.org/docs/pages/guides/testing/playwright)
- [E2E Testing Next.js Apps with Playwright: Setup, Patterns, and CI Integration](https://www.matthewswong.com/en/blog/e2e-testing-playwright-nextjs/)
- [Exclude Turnstile from E2E tests — Cloudflare Turnstile docs](https://developers.cloudflare.com/turnstile/tutorials/excluding-turnstile-from-e2e-tests/)
- [Test your Turnstile implementation — Cloudflare Docs](https://developers.cloudflare.com/turnstile/troubleshooting/testing/)
- [Clarify usage of testing sitekeys and secret keys — cloudflare-docs Issue #13785](https://github.com/cloudflare/cloudflare-docs/issues/13785)
- [Cloudflare Turnstile Killing Your Playwright Tests? Real Fixes (2026)](https://tayyabakmal.com/blog/cloudflare-turnstile-playwright-tests/)
- [Getting Started with Integrating Playwright and GitHub Actions — Autify](https://autify.com/blog/playwright-github-actions)
- [GitHub Actions with Playwright: Automate Browser Testing Like a Pro — Peerlist](https://peerlist.io/jagss/articles/github-actions-with-playwright-automate-browser-testing-like)
