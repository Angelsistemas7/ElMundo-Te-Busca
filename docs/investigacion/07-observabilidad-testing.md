# 07 — Observabilidad y testing

Investigación desde cero (no existía nada previo en `docs/investigacion/`). Cubre:
paquetes de Vercel muertos en un VPS propio, ausencia total de tests automatizados
(con un smoke test de Playwright real y listo para usar), un endpoint `/api/health`
+ monitor externo gratis, Sentry en el plan gratis 2026, y cómo enchufar el smoke
test al workflow de deploy para que un cambio que rompe el flujo crítico no llegue
a producción.

Prioridad de cada hallazgo: **Alta** (hazlo pronto, riesgo real hoy) / **Media** /
**Baja**.

---

## 1. `@vercel/analytics` y `@vercel/speed-insights`: peso muerto en el VPS — **Alta**

### Qué hay hoy

`package.json` los tiene como dependencias de producción:

```json
"@vercel/analytics": "^2.0.1",
"@vercel/speed-insights": "^2.0.0",
```

Y `src/app/layout.tsx` los monta en TODAS las páginas, para TODOS los visitantes:

```tsx
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
// ...
<Analytics />
<SpeedInsights />
```

### Por qué es peso muerto en este proyecto

El sitio se despliega en un **VPS propio** (Oracle Cloud, PM2 + nginx, ver
`.github/workflows/deploy.yml`), no en la infraestructura de Vercel. Ambos paquetes
funcionan enviando datos ("beacons") a rutas que **Vercel inyecta automáticamente
solo cuando el proyecto está desplegado en Vercel y con Analytics/Speed Insights
activado en su dashboard** — típicamente `/_vercel/insights/*` y `/_vercel/speed-insights/*`.
Fuera de Vercel esas rutas no existen: el propio servidor de Next.js (o nginx delante)
no las reconoce, así que las peticiones del cliente a esos endpoints simplemente
fallan (404 o similar). Los scripts están escritos para tragarse ese error en
silencio, así que nadie lo nota — pero **no se recolecta ningún dato real**, ni de
tráfico ni de Web Vitals.

Confirmado en la documentación/comunidad de Vercel: *"Web Analytics must be enabled
for a project in the Vercel Dashboard"* y el paquete *"does not track data in
development mode"* — es decir, está acoplado al dashboard de Vercel, no es un SDK de
analítica genérico. Un hilo de la comunidad de Vercel sobre analytics roto confirma
el mismo patrón de fallo silencioso cuando falta esa integración de plataforma.

### Costo real

No es solo "no sirve": es JavaScript que se descarga y ejecuta en el navegador de
**cada visitante** (dos scripts adicionales, llamadas de red que siempre fallan) en
una plataforma donde el tiempo de carga en un celular con mala señal, en zona de
sismo, importa de verdad. Es bytes y ciclos gastados en algo que no aporta ni una
sola métrica.

### Recomendación

Quitar ambos paquetes:

```bash
npm uninstall @vercel/analytics @vercel/speed-insights
```

Y en `src/app/layout.tsx`, eliminar las dos importaciones y las dos etiquetas
(`<Analytics />`, `<SpeedInsights />`) del final del `<body>` (líneas 3-4 y 87-88 hoy).

Si en algún momento se quiere analítica de tráfico real, la opción coherente con
"VPS propio" es algo self-hosted y privacy-friendly (Plausible o Umami, ambos se
pueden correr en el mismo VPS o en un contenedor aparte) — no un SDK que asume la
plataforma de Vercel. Eso es una decisión aparte, fuera del alcance de esta limpieza.

**Fuentes:**
- [@vercel/analytics — npm](https://www.npmjs.com/package/@vercel/analytics)
- [Getting started with Vercel Web Analytics](https://vercel.com/docs/analytics/quickstart)
- [SpeedInsights and Analytics not working — Vercel Community](https://community.vercel.com/t/speedinsights-and-analytics-not-working/9303)
- [Vercel Web Analytics Troubleshooting](https://vercel.com/docs/analytics/troubleshooting)

---

## 2. No hay ningún test automatizado — **Alta**

Confirmado: `Glob` sobre `**/*.test.ts`, `**/*.spec.ts`, `playwright.config.*` y
`vitest.config.*` en el repo (excluyendo `node_modules`) no devuelve nada. Cero
cobertura. Cada deploy va a producción sin que nada verifique que el sitio sigue
funcionando (ver `.github/workflows/deploy.yml`: build → rsync → `pm2 reload`, sin
ningún paso intermedio de verificación).

### El flujo más crítico de la plataforma

Publicar una persona y que aparezca en el listado ("Se busca", `/se-busca`). Si esto
se rompe, la plataforma deja de cumplir su propósito aunque compile y el resto del
sitio cargue perfecto — es el peor tipo de fallo posible para este proyecto.

### Dos obstáculos reales que hay que sortear (y por qué la solución obvia no basta)

**a) Turnstile.** Sin `NEXT_PUBLIC_TURNSTILE_SITE_KEY`, `src/components/Turnstile.tsx`
no renderiza el widget (solo un texto). Sin `TURNSTILE_SECRET_KEY` en el servidor,
`src/lib/turnstile.ts` hace:

```ts
if (!secret) {
  return process.env.NODE_ENV !== "production";
}
```

O sea: **falla-abierto en desarrollo, falla-cerrado en producción.** Confirmado
leyendo el archivo.

El problema: `process.env.NODE_ENV` no es una variable que se pueda "engañar" en
tiempo de ejecución sobre un build ya compilado — Next.js (como prácticamente todo
el ecosistema basado en webpack) **reemplaza `process.env.NODE_ENV` por el literal
`"production"` en tiempo de build**, tanto en el bundle de cliente como en el de
servidor, cuando se corre `next build`. Es decir, en cualquier build de producción
(el que efectivamente se despliega, incluido `.next/standalone`), esa condición ya
quedó fijada en `false` dentro del JavaScript compilado — no hay manera de
resucitar el "falla-abierto" corriendo `node server.js` con `NODE_ENV` distinto
después del build. El falla-abierto **solo existe bajo `next dev`**.

**b) El estado en memoria puede desincronizarse.** Ya hay una nota de proyecto sobre
esto (memoria del usuario, `project_demo_mode_mem_divergence`): sin Supabase, la
Server Action que crea el registro y el render de la página pueden terminar usando
**copias distintas** del store en memoria (`mem` en `src/lib/data.ts`) — la
recomendación ya registrada es usar el lanzador `standalone` (`.claude/launch.json`),
no `next start`, para probar el modo demo de forma confiable. `next dev` es
justamente el modo donde esta clase de problema (módulos recompilados/aislados por
ruta) es más probable.

**Estos dos puntos chocan entre sí**: el falla-abierto de Turnstile solo existe en
`next dev`, pero `next dev` es el modo con más riesgo de desincronizar `mem`. Correr
el smoke test contra `next dev` y confiar en el falla-abierto es lo más simple, pero
no es lo que de verdad se despliega.

### Diseño elegido: dos modos, con la puerta de CI usando el build real

- **Modo local rápido (`next dev`)** — para iterar mientras se programa: rápido,
  aprovecha el falla-abierto, aceptando que es "best effort" (puede que algún día
  falle por la desincronización de `mem` documentada arriba; si eso pasa, es una
  señal para investigar ese bug, no para ignorarlo).
- **Modo de compuerta en CI (`standalone`, modo producción real)** — el que de
  verdad bloquea el deploy. Corre exactamente `.next/standalone/server.js`, el mismo
  artefacto que se sube al VPS (mismo build, mismo singleton de módulos, mismo
  paquete de `sharp` para ARM64, etc. — ver paso "Empaquetar salida standalone" en
  `deploy.yml`). Como es un build de producción, Turnstile falla cerrado por
  defecto — así que en vez de pelear contra eso, se usan las **claves de prueba
  oficiales de Cloudflare Turnstile**, documentadas para exactamente este caso
  (pruebas automatizadas / CI, funcionan también en `localhost`):

  | Uso | Site key (pública, se hornea en el build) | Secret key (privada, solo en runtime) |
  |---|---|---|
  | Siempre pasa, sin widget visible | `1x00000000000000000000BB` | `1x0000000000000000000000000000000AA` |

  La site key **sí** hay que hornearla en el build de CI dedicado al smoke test
  (es `NEXT_PUBLIC_*`, Next la inlinea en el bundle de cliente). La secret key
  **no** hace falta en build-time — es server-only, se lee de `process.env` en
  cada request, así que basta con exportarla antes de arrancar `server.js`.

  Importante: verificar estas claves contra la documentación oficial de Cloudflare
  antes de usarlas (pueden cambiar) — están citadas abajo.

### Instalación

```bash
npm install -D @playwright/test
npx playwright install --with-deps chromium
```

Y en `package.json`:

```json
"scripts": {
  "test:e2e": "playwright test",
  "test:e2e:ci": "PW_TARGET=standalone playwright test"
}
```

(en PowerShell/Windows local, usar `cross-env PW_TARGET=standalone playwright test`
o simplemente `$env:PW_TARGET="standalone"; npx playwright test` — en GitHub
Actions, que corre en `ubuntu-latest`, la sintaxis de arriba funciona tal cual).

### `playwright.config.ts` (raíz del proyecto)

```ts
import { defineConfig, devices } from "@playwright/test";

// Dos formas de levantar el sitio para el smoke test:
//  - "dev"        (por defecto, uso local): `next dev`, rápido, aprovecha el
//    falla-abierto de Turnstile en desarrollo (src/lib/turnstile.ts). Sirve para
//    iterar rápido, pero next dev es el modo donde el estado en memoria (`mem` en
//    src/lib/data.ts) puede desincronizarse entre la Server Action y el render
//    (ver memoria del proyecto: project_demo_mode_mem_divergence).
//  - "standalone" (CI, compuerta real antes de desplegar): build de producción
//    real (.next/standalone/server.js), el mismo artefacto que sube deploy.yml al
//    VPS. Turnstile no puede fallar-abierto aquí (NODE_ENV queda fijado en
//    "production" dentro del bundle compilado), así que se usan las claves de
//    PRUEBA oficiales de Cloudflare Turnstile (siempre pasan, funcionan en
//    localhost) — ver docs/investigacion/07-observabilidad-testing.md.
const target = process.env.PW_TARGET === "standalone" ? "standalone" : "dev";
const PORT = 3100; // distinto de 3000, evita chocar con un `npm run dev` ya abierto
const baseURL = `http://127.0.0.1:${PORT}`;

// Claves de prueba oficiales de Cloudflare Turnstile ("siempre pasa", sin widget
// visible). Confirmar contra https://developers.cloudflare.com/turnstile/troubleshooting/testing/
// antes de usarlas — Cloudflare puede cambiarlas.
const TURNSTILE_TEST_SITE_KEY = "1x00000000000000000000BB";
const TURNSTILE_TEST_SECRET_KEY = "1x0000000000000000000000000000000AA";

const devCommand = `npx next dev -p ${PORT}`;
// Reusa exactamente el empaquetado que hace deploy.yml (build + copiar estáticos +
// public dentro de .next/standalone) y luego arranca ese server.js real.
const standaloneCommand = [
  "npm run build",
  "cp -r .next/static .next/standalone/.next/static",
  "cp -r public .next/standalone/public",
  `PORT=${PORT} HOSTNAME=127.0.0.1 node .next/standalone/server.js`,
].join(" && ");

export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  expect: { timeout: 5_000 },
  fullyParallel: false, // un solo flujo crítico, no hace falta paralelismo
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL,
    trace: "retain-on-failure",
  },
  webServer: {
    command: target === "standalone" ? standaloneCommand : devCommand,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000, // el build de producción puede tardar
    env: {
      // Sin estas dos, isSupabaseConfigured es false (src/lib/supabase.ts) y la
      // app usa datos de ejemplo en memoria (src/lib/seed.ts) — el modo demo.
      NEXT_PUBLIC_SUPABASE_URL: "",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "",
      ...(target === "standalone"
        ? {
            NEXT_PUBLIC_TURNSTILE_SITE_KEY: TURNSTILE_TEST_SITE_KEY,
            TURNSTILE_SECRET_KEY: TURNSTILE_TEST_SECRET_KEY,
          }
        : {
            NEXT_PUBLIC_TURNSTILE_SITE_KEY: "",
            TURNSTILE_SECRET_KEY: "",
          }),
    },
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
```

### `e2e/publicar-persona.spec.ts` (el smoke test real)

```ts
import { test, expect } from "@playwright/test";

// Flujo más crítico de "El Mundo Te Busca": alguien publica una persona
// ("Busco a una persona") y esa persona aparece de inmediato en el listado
// público /se-busca. Si esto se rompe, la plataforma deja de cumplir su
// propósito aunque el resto del sitio compile y cargue bien.
test("publicar una persona y verla en el listado de Se busca", async ({
  page,
  context,
  baseURL,
}) => {
  // Evita el modal de bienvenida "¿Qué tragedia quieres ver?" (aparece solo en
  // la primera visita, sin la cookie emb_country — ver
  // src/lib/country-server.ts / src/components/CountryIntroModal.tsx) para que
  // el resto del flujo no dependa de cerrarlo primero.
  await context.addCookies([{ name: "emb_country", value: "ve", url: baseURL! }]);

  // Nombre único por corrida: permite buscarlo luego sin ambigüedad y sin
  // ensuciar corridas futuras (el store en memoria no persiste entre procesos).
  const uniqueName = `E2ESmoke${Date.now()}`;

  await page.goto("/se-busca");

  // Hay dos botones "Publicar persona" en el DOM: uno flotante para móvil
  // (oculto en escritorio) y otro de escritorio (oculto en móvil) — ver
  // RegisterPersonButton.tsx. Con el viewport de escritorio por defecto de
  // Playwright, solo el segundo está realmente visible/interactuable.
  await page.getByRole("button", { name: "Publicar persona" }).last().click();

  // Paso 1 del modal: elegir intención. "Busco a una persona" implica
  // isUnidentified=false y nombre obligatorio (ver personSchema en
  // src/lib/validation.ts).
  await page.getByText("Busco a una persona", { exact: true }).click();

  // Paso 2: formulario mínimo (solo lo obligatorio + algo de contexto).
  await page.locator("#firstName").fill(uniqueName);
  await page.locator("#lastName").fill("Playwright");
  await page.locator("#locationText").fill("La Guaira, sector de prueba");
  await page
    .locator("#description")
    .fill("Registro creado por el smoke test automatizado. Ignorar / borrar.");
  await page.locator("#contactPhone").fill("04121234567");

  // Turnstile: en modo standalone de CI usa la site key de prueba de
  // Cloudflare (siempre pasa, sin interacción); en modo dev local no hay site
  // key y el servidor falla-abierto (ver playwright.config.ts). En ningún caso
  // hace falta resolver un captcha real aquí.
  await page.getByRole("button", { name: "Publicar búsqueda" }).click();

  await expect(
    page.getByText("Registro publicado. Gracias por ayudar a localizar a esta persona."),
  ).toBeVisible();

  // El botón de texto "Cerrar" del panel de éxito NO es el único con ese
  // nombre accesible: el modal también tiene un botón "X" con
  // aria-label="Cerrar" (ver Modal.tsx). .last() apunta al de texto, que
  // aparece después en el DOM.
  await page.getByRole("button", { name: "Cerrar" }).last().click();

  // Lo que de verdad importa: no solo que guardar no truene, sino que la
  // persona sea visible para quien la está buscando.
  await page.goto(`/se-busca?q=${encodeURIComponent(uniqueName)}`);
  await expect(
    page.getByRole("heading", { name: new RegExp(uniqueName) }),
  ).toBeVisible();
});
```

Notas de diseño:
- No sube foto a propósito: `uploadPhoto`/Supabase Storage no están disponibles en
  modo demo (o requieren credenciales reales), y no es necesaria para el flujo
  mínimo (`isUnidentified=false` no exige foto, solo nombre).
- No pasa por `checkPersonDuplicatesAction` de forma especial: como el nombre es
  único por timestamp, nunca debería encontrar coincidencias — si algún día lo
  hace (por ejemplo por colisión de reloj en corridas paralelas), el test fallaría
  ahí de forma clara, no en silencio.
- Es intencionalmente **un solo test de un solo flujo**. No es el lugar para
  cobertura extensa — es la última red antes de deploy. Cobertura más amplia
  (formularios de ayuda, caravanas, hospitales, votos) es trabajo aparte, con
  Vitest/Testing Library para unidades (`personSchema`, `data.ts` en memoria) y
  más specs de Playwright si se decide invertir en eso.

**Fuentes:**
- [Test your Turnstile implementation — Cloudflare Docs](https://developers.cloudflare.com/turnstile/troubleshooting/testing/)
- [Exclude Turnstile from E2E tests — Cloudflare Turnstile docs](https://developers.cloudflare.com/turnstile/tutorials/excluding-turnstile-from-e2e-tests/)

---

## 3. Endpoint `/api/health` + monitor externo gratis — **Alta**

### Diseño del endpoint

Barato a propósito: en modo demo no toca nada (no tiene sentido "chequear" datos en
memoria), y con Supabase configurado hace la consulta más barata posible con
timeout corto, para no bloquear el healthcheck si Supabase está lento en vez de
caído.

`src/app/api/health/route.ts`:

```ts
import { NextResponse } from "next/server";
import { getSupabase, isSupabaseConfigured } from "@/lib/supabase";

export const dynamic = "force-dynamic";

// Healthcheck barato para un monitor externo (UptimeRobot, etc.). NO valida
// lógica de negocio, solo que el proceso responde y, si Supabase está
// configurado, que la base de datos contesta. Igual que registerPersonAction en
// src/app/actions.ts, se le pone timeout explícito a la única llamada de red:
// sin esto, un Supabase colgado deja el healthcheck (y por tanto el monitor)
// esperando indefinidamente en vez de reportar el problema.
export async function GET() {
  const startedAt = Date.now();

  if (!isSupabaseConfigured) {
    return NextResponse.json({
      ok: true,
      mode: "demo",
      supabase: null,
      ms: Date.now() - startedAt,
    });
  }

  try {
    const supabase = getSupabase();
    if (!supabase) throw new Error("getSupabase() devolvió null pese a isSupabaseConfigured");

    // La consulta más barata posible: pide un solo campo, un solo registro, sin
    // contar el total. `head: true` evita traer filas, solo confirma que la
    // tabla responde.
    const { error } = await Promise.race([
      supabase.from("persons").select("id", { head: true, count: "exact" }).limit(1),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("timeout")), 4000),
      ),
    ]);

    if (error) throw error;

    return NextResponse.json({
      ok: true,
      mode: "supabase",
      supabase: "up",
      ms: Date.now() - startedAt,
    });
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        mode: "supabase",
        supabase: "down",
        error: err instanceof Error ? err.message : "error desconocido",
        ms: Date.now() - startedAt,
      },
      { status: 503 },
    );
  }
}
```

El patrón de `Promise.race` con timeout replica el que ya usa
`verifyTurnstile` en `src/lib/turnstile.ts` (`AbortSignal.timeout(6000)`) — mismo
espíritu: ningún `fetch`/consulta de red sin límite de tiempo.

Middleware: `src/middleware.ts` ya excluye estáticos pero no rutas de API, así que
`/api/health` pasa por el middleware normal (refresco de sesión de Supabase) — no
hay problema, es barato, pero si se quiere ahorrar hasta esa consulta se puede
excluir con un ajuste al `matcher`. No es necesario para el volumen de este
proyecto.

### Monitor externo recomendado: UptimeRobot (plan gratis)

Comparado con Better Stack/Better Uptime (que unificó su marca; algunas fuentes de
2026 aún la nombran por separado):

| | UptimeRobot free | Better Stack free |
|---|---|---|
| Monitores | 50 | 10 (antes "Better Uptime" ofrecía menos, 5, según otra fuente — el número exacto varía por fuente/momento, confirmar en el dashboard) |
| Intervalo mínimo | 5 minutos | Similar, varía por plan |
| Alertas | Email, Slack, Telegram, SMS (limitada), webhooks | Email, Slack, Telegram, incident management |
| Extra | — | Páginas de estado, gestión de incidentes más completa |

Para este proyecto, **UptimeRobot** es la opción más simple: un solo monitor HTTP
apuntando a `https://elmundotebusca.com/api/health`, cada 5 minutos, con alerta por
Telegram (crear un bot con @BotFather, conectar el chat ID en UptimeRobot) y/o
email de respaldo. El plan gratis de 50 monitores es más que suficiente (solo hace
falta 1) y ya soporta Telegram de forma nativa, sin necesidad de las funciones de
gestión de incidentes de Better Stack, que son más de lo que este proyecto necesita
hoy.

Configuración recomendada del monitor:
- Tipo: HTTP(s), URL `https://elmundotebusca.com/api/health`.
- Palabra clave esperada (opcional pero recomendable): buscar `"ok":true` en el
  cuerpo de la respuesta, no solo el código 200 — así un 200 con `ok:false`
  (Supabase caído) también dispara la alerta.
- Intervalo: 5 minutos (el mínimo del plan gratis).
- Alertas: Telegram como principal (push casi instantáneo al teléfono), email como
  respaldo.

**Fuentes:**
- [UptimeRobot Pricing 2026: Free (50 Monitors) + Paid](https://www.saaspricepulse.com/tools/uptimerobot)
- [11 Best Uptime Monitoring Tools in 2026 — UptimeRobot Knowledge Hub](https://uptimerobot.com/knowledge-hub/monitoring/11-best-uptime-monitoring-tools-compared/)
- [7 Best Uptime Robot Alternatives in 2026 — Better Stack Community](https://betterstack.com/community/comparisons/uptime-robot-alternatives/)

---

## 4. Sentry: plan gratis 2026 e integración con Next.js 15 App Router — **Media**

### Límites del plan gratis ("Developer") en 2026

Según fuentes consultadas: **1 usuario, 5.000 eventos de error al mes, 10.000
"performance units" (transacciones) al mes, 50 replays de sesión, retención de 30
días, 1 monitor de cron.**

### ¿Alcanza para este proyecto?

Para el tamaño actual (plataforma ciudadana, sin cobrar, tráfico moderado), 5.000
errores/mes suena generoso en el día a día — pero el riesgo real es un **bug que
genera un error por cada intento** de una acción popular (por ejemplo, un fallo en
`registerPersonAction` o en `voteAidPointAction` durante un pico de tráfico real
tras un sismo): eso puede quemar el cupo mensual en horas, justo cuando más
importa tener visibilidad. Recomendación práctica:
- Poner `tracesSampleRate` en 0 (o muy bajo, ej. 0.05) desde el día uno: el
  proyecto no necesita trazas de performance por ahora, y así el cupo de 10.000
  "performance units" no compite por presupuesto — se reserva TODO el presupuesto
  de atención para errores reales.
- Filtrar ruido conocido con `beforeSend` (errores de extensiones del navegador,
  `ResizeObserver loop limit exceeded`, etc.) antes de que cuenten contra el cupo.
- Si el cupo se queda corto en un incidente real, es una señal de que ya vale la
  pena el primer plan pago (Team, según las fuentes consultadas empieza más o
  menos en la franja de bajo costo, escalado por evento) — no antes.

Para un proyecto sin fines de lucro y en esta etapa, el plan gratis es razonable
como punto de partida, con la salvedad del punto anterior.

### Integración recomendada

La forma más confiable de no pelear contra cambios de versión del SDK es el asistente
oficial:

```bash
npx @sentry/wizard@latest -i nextjs
```

Genera automáticamente `sentry.server.config.ts`, `sentry.edge.config.ts`, el
`instrumentation.ts` en la raíz (o `src/`) con el hook `onRequestError` — que Next.js
15 dispara para errores en route handlers, Server Actions, Server Components y
middleware — y envuelve `next.config.ts` con `withSentryConfig` (source maps,
tunneling, etc.).

**Punto importante para este proyecto: las Server Actions no quedan
instrumentadas automáticamente** solo por el hook global — Sentry recomienda
envolver cada Server Action sensible con `Sentry.withServerActionInstrumentation`
para capturar errores y (opcionalmente) el `FormData` de contexto. Ejemplo aplicado
a `registerPersonAction` en `src/app/actions.ts` (línea 430 actual):

```ts
import * as Sentry from "@sentry/nextjs";

export async function registerPersonAction(form: FormData): Promise<ActionResult> {
  return Sentry.withServerActionInstrumentation(
    "registerPersonAction",
    { formData: form, recordResponse: false }, // recordResponse:false — no hay
    // nada sensible que valga la pena mandar a Sentry desde el FormData (nombre,
    // teléfono, foto de una persona desaparecida), así que solo se etiqueta la
    // acción, no se adjunta el payload completo.
    async () => {
      const token = getField(form, "cf-turnstile-response") || null;
      if (!(await verifyTurnstile(token))) {
        return { ok: false, error: "No se pudo verificar que eres una persona. Intenta de nuevo." };
      }
      // ... resto de la función sin cambios ...
    },
  );
}
```

Dado que hay **16+ Server Actions** en `src/app/actions.ts` (ver todas las llamadas
a `verifyTurnstile` encontradas), no hace falta envolver las 16 el primer día:
priorizar `registerPersonAction`, `reportStatusAction` y las de creación de
recursos (`aid_point`, `hospital`, `march`) — son las que, si fallan en silencio,
más directamente afectan el propósito de la plataforma.

Configuración recomendada en `sentry.server.config.ts`:

```ts
import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  tracesSampleRate: 0.05, // cupo de "performance units" reservado casi entero para errores
  replaysSessionSampleRate: 0, // no hace falta grabar sesiones normales
  replaysOnErrorSampleRate: 0.1, // solo cuando algo ya falló, y con cupo bajo
  environment: process.env.NODE_ENV,
});
```

**Fuentes:**
- [Is Sentry Free? Developer Plan Limits & Upgrade Triggers (2026)](https://costbench.com/software/developer-tools/sentry/free-plan/)
- [Sentry Pricing 2026: 4 Plans from Free–$80/month](https://costbench.com/software/developer-tools/sentry/)
- [Automatic Instrumentation — Sentry for Next.js](https://docs.sentry.io/platforms/javascript/guides/nextjs/tracing/instrumentation/automatic-instrumentation/)
- [Manual Setup — Sentry for Next.js](https://docs.sentry.io/platforms/javascript/guides/nextjs/manual-setup)
- [Nextjs App Router Auto instrumentation — GitHub Discussion #13442](https://github.com/getsentry/sentry-javascript/discussions/13442)

---

## 5. Enchufar el smoke test al deploy: que un cambio roto no llegue a producción — **Alta**

`.github/workflows/deploy.yml` hoy va directo de "Build" a "Subir al VPS (rsync)" a
"Reiniciar con PM2" — nada se verifica en el medio. El cambio propuesto agrega un
paso de smoke test **entre el build y el SSH/rsync**, en el mismo job (así se
reutiliza exactamente el build ya hecho, sin gastar minutos de CI compilando dos
veces) y **antes** de cualquier paso que toque el VPS — si el smoke test falla, el
job entero falla y ni el `rsync` ni el `pm2 startOrReload` llegan a correr.

Diff conceptual sobre `.github/workflows/deploy.yml` (insertar después del paso
"Empaquetar salida standalone", antes de "Dependencias del script de ingesta" o de
"Preparar SSH" — el orden exacto entre esos dos no importa, lo que importa es que
sea antes de "Preparar SSH"):

```yaml
      - name: Empaquetar salida standalone
        run: |
          cp -r .next/static .next/standalone/.next/static
          cp -r public .next/standalone/public
          cp ecosystem.config.cjs .next/standalone/
          cp -r scripts .next/standalone/scripts

      # ── Compuerta: smoke test del flujo crítico contra el build real ──────────
      # Si esto falla, el job se detiene AQUÍ — nunca llega a "Preparar SSH" ni a
      # "Subir al VPS (rsync)", así que un cambio que rompe "publicar persona" no
      # se despliega, aunque `npm run build` haya compilado sin errores.
      - name: Instalar navegadores de Playwright
        run: npx playwright install --with-deps chromium

      - name: Smoke test (publicar persona → aparece en el listado)
        run: npm run test:e2e:ci
        env:
          CI: "true"
          PW_TARGET: standalone
          # Nota: playwright.config.ts arranca su PROPIA copia de
          # .next/standalone/server.js en el puerto 3100 (no el 3200 de
          # producción) con NEXT_PUBLIC_SUPABASE_URL/ANON_KEY vacíos (fuerza modo
          # demo en memoria) y las claves de PRUEBA de Cloudflare Turnstile — no
          # las reales del sitio. No comparte proceso ni datos con producción.

      - name: Dependencias del script de ingesta (separadas del recorte de Next)
        run: npm install --omit=dev --no-audit --no-fund --prefix .next/standalone/scripts
```

Consideraciones sobre este diseño:

- **No reconstruye el standalone para el smoke test**: en `playwright.config.ts`,
  el modo `standalone` corre `npm run build` de nuevo dentro de su propio
  `webServer.command`, lo cual sí duplica el build. Si el tiempo de CI importa,
  la alternativa es que el smoke test reutilice el `.next/standalone` que YA
  produjo el paso "Build" de arriba en lugar de reconstruir — mueve el
  `webServer.command` de Playwright a solo `PORT=3100 node .next/standalone/server.js`
  (sin el `npm run build &&` inicial) cuando detecta que ya corre en CI dentro de
  este job. Se documenta la versión "autocontenida" (rebuild propio) arriba porque
  es la que funciona también corriendo el smoke test **suelto**, fuera de este
  workflow (por ejemplo, un desarrollador verificando localmente antes de
  hacer push); ajustar según cuánto pese el minuto extra de build en la cuenta de
  GitHub Actions del proyecto.
- El smoke test corre con las claves de prueba de Turnstile, **nunca** con
  `secrets.NEXT_PUBLIC_TURNSTILE_SITE_KEY` real — no debe aparecer ese secret en
  este paso.
- Como ya reusa el mismo runner y el mismo checkout, no hace falta un job aparte
  ni `needs:` — el propio flujo secuencial del job ya es la compuerta.

---

## Resumen de prioridades

| # | Hallazgo | Prioridad | Esfuerzo |
|---|---|---|---|
| 1 | Quitar `@vercel/analytics` / `@vercel/speed-insights` (no funcionan fuera de Vercel) | Alta | Minutos |
| 2 | Smoke test de Playwright del flujo "publicar persona" | Alta | 1-2 horas |
| 5 | Enchufar el smoke test como compuerta antes del deploy | Alta | 30 min (una vez hecho el punto 2) |
| 3 | `/api/health` + monitor externo (UptimeRobot, Telegram) | Alta | 1 hora + cuenta gratis |
| 4 | Sentry (plan gratis) con `withServerActionInstrumentation` | Media | 2-3 horas |
