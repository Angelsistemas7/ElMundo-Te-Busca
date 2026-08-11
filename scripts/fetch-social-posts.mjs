#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────
// Ingesta automática de publicaciones de otras redes sociales por hashtag
// ("El Mundo Te Busca"), UNA búsqueda separada por cada país activo.
//
// Busca el hashtag/palabra clave (p. ej. #TerremotoVE, #TerremotoColombia) en
// las APIs PÚBLICAS Y OFICIALES de Bluesky, Mastodon y Reddit —nada de
// scraping ni de X/Twitter, cuya única vía automatizada por hashtag requiere
// pagar su API (tier "Basic", ~$200/mes)— y guarda cada resultado nuevo en la
// tabla `posts` con moderation_status = "pending" y el `country` del que salió
// la búsqueda. NO se publica nada directo: un moderador aprueba o rechaza
// cada uno en /admin antes de que aparezca en /comunidad (ver
// `getPendingExternalPosts`/`getPosts` en src/lib/data.ts).
//
// Uso:
//   node scripts/fetch-social-posts.mjs             # busca e inserta
//   node scripts/fetch-social-posts.mjs --dry-run    # solo imprime, no escribe
//
// Pensado para correr por cron en el VPS (ver docs/DESPLIEGUE-VPS.md), p. ej.
// cada 15 min: */15 * * * * cd /ruta/app && npm run fetch:social >> logs/social-fetch.log 2>&1
//
// Variables de entorno (todas opcionales, con valores por defecto razonables):
//   SOCIAL_HASHTAGS_VE    Hashtags/palabras clave de Venezuela, separados por
//                         coma. Default: "TerremotoVE,TerremotoVenezuela,laguaira"
//   SOCIAL_HASHTAGS_CO    Hashtags/palabras clave de Colombia, separados por
//                         coma. Default: "TerremotoColombia,SismoColombia,TerremotoChoco"
//                         (ajústalos si ves que no traen resultados reales —
//                         son un punto de partida razonable, no una lista
//                         verificada de hashtags que la gente esté usando).
//   SOCIAL_HASHTAGS       Nombre viejo (antes de multi-país): si está definida
//                         y SOCIAL_HASHTAGS_VE no, se usa como hashtags de
//                         Venezuela — compatibilidad con el .env ya
//                         configurado en el VPS, sin obligar a tocarlo ya mismo.
//   MASTODON_INSTANCES    Instancias Mastodon a consultar, separadas por coma.
//                         Default: "mastodon.social"
//   BLUESKY_IDENTIFIER    Usuario y "app password" de Bluesky. Sin esto la
//   BLUESKY_APP_PASSWORD  búsqueda por hashtag en Bluesky no trae resultados
//                         (su endpoint público de búsqueda exige sesión,
//                         a diferencia del resto de su API); Mastodon no
//                         necesita nada de esto. Se genera gratis en
//                         bsky.app → Ajustes → App passwords.
//   REDDIT_CLIENT_ID      Credenciales de una app tipo "script" de Reddit,
//   REDDIT_CLIENT_SECRET  gratis: reddit.com/prefs/apps → "create app" →
//                         tipo "script". Sin esto, Reddit simplemente no
//                         aporta resultados (igual que Bluesky sin sesión).
//   OPENAI_API_KEY        Filtro de IA (gpt-4o-mini) que clasifica cada post
//                         nuevo en aprobar / rechazar / revisar (ver
//                         `classifyPost`). SIN esto, todo queda "pending"
//                         como antes — el filtro es opcional, no rompe nada.
// ─────────────────────────────────────────────────────────────────────────

import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
// Node 20 no trae WebSocket global nativo; supabase-js igual intenta montar
// su cliente de Realtime al crear el cliente (aunque este script solo hace
// upserts REST, nunca se suscribe a nada). Sin esto, createClient() revienta
// con "Node.js 20 detected without native WebSocket support".
import ws from "ws";

const DRY_RUN = process.argv.includes("--dry-run");

// ── Carga manual de variables de entorno ────────────────────────────────────
// En local usamos `.env.local` (igual que scripts/import-data.mjs). En el VPS
// el archivo real es `.env` (el mismo que carga PM2 con --env-file=.env; ver
// ecosystem.config.cjs) — cron no hereda esas variables por su cuenta, así
// que el script las carga él mismo. Prueba ambos nombres, en ese orden.
function loadEnv() {
  for (const name of ["../.env.local", "../.env"]) {
    try {
      const raw = readFileSync(new URL(name, import.meta.url), "utf8");
      for (const line of raw.split("\n")) {
        const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
        if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
      }
      return;
    } catch {
      /* prueba el siguiente nombre */
    }
  }
}
loadEnv();

// ── Países activos ───────────────────────────────────────────────────────
// Copia mínima de lo que hace falta de `src/lib/countries.ts` — este script
// es Node plano sin paso de build (para no complicar el cron del VPS con
// TypeScript), así que no puede importar ese archivo .ts directamente.
const DEFAULT_HASHTAGS = {
  ve: "TerremotoVE,TerremotoVenezuela,laguaira",
  co: "TerremotoColombia,SismoColombia,TerremotoChoco,Quibdo,Quibdó,Choco,Chocó,Pereira,Risaralda,Manizales,Cali,hidroituango,SOScolombia,Dosquebradas",
};
const COUNTRY_META = {
  ve: { name: "Venezuela", quakeLabel: "el terremoto de Venezuela del 24-25 de junio de 2026" },
  co: { name: "Colombia", quakeLabel: "el terremoto de Colombia del 10 de agosto de 2026" },
};
const COUNTRY_CODES = Object.keys(COUNTRY_META);

// ── Palabra clave TEMPORAL, solo Colombia (pedido puntual del dueño) ───────
// "JhonArias" se agrega SOLO el 10 y 11 de agosto de 2026 (hora de Colombia,
// UTC-5); pasada esa fecha deja de buscarse sola, sin que haga falta
// acordarse de venir a quitarla a mano. Sin espacio (a diferencia de "Jhon
// Arias") porque Mastodon busca por hashtag exacto (no admite espacios) y
// así el mismo término funciona igual en las 3 fuentes — puede que se pierda
// algún post que escriba el nombre en dos palabras sin hashtag, pero es la
// forma que sí funciona en las tres a la vez.
const TEMP_KEYWORD_CO = {
  term: "JhonArias",
  from: "2026-08-10T00:00:00-05:00",
  to: "2026-08-12T00:00:00-05:00", // exclusivo: deja de aplicar al empezar el 12
};

function hashtagsFor(country) {
  const envKey = `SOCIAL_HASHTAGS_${country.toUpperCase()}`;
  // Compatibilidad: el nombre viejo `SOCIAL_HASHTAGS` (antes de multi-país)
  // se toma como los hashtags de Venezuela si no se definió el nuevo.
  const legacy = country === "ve" ? process.env.SOCIAL_HASHTAGS : undefined;
  const raw = process.env[envKey] || legacy || DEFAULT_HASHTAGS[country] || "";
  const list = raw
    .split(",")
    .map((h) => h.trim())
    .filter(Boolean);
  if (country === "co") {
    const now = new Date();
    if (now >= new Date(TEMP_KEYWORD_CO.from) && now < new Date(TEMP_KEYWORD_CO.to)) {
      list.push(TEMP_KEYWORD_CO.term);
    }
  }
  return list;
}

const MASTODON_INSTANCES = (process.env.MASTODON_INSTANCES || "mastodon.social")
  .split(",")
  .map((h) => h.trim())
  .filter(Boolean);

const BODY_MAX = 1500; // mismo límite que postSchema (src/lib/validation.ts)

function truncate(text, max = BODY_MAX) {
  const s = text.trim();
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

// Mastodon devuelve `content` en HTML (<p>, <br>, menciones...). Lo pasamos a
// texto plano porque PostCard no interpreta HTML (evita tener que sanitizar
// HTML de terceros para poder mostrarlo en el cliente).
function stripHtml(html) {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// ── Bluesky (AT Protocol) ────────────────────────────────────────────────
// `public.api.bsky.app` sirve sin cuenta la mayoría de endpoints de lectura,
// pero `searchPosts` en concreto exige sesión autenticada (confirmado: sin
// login devuelve 403). Por eso, a diferencia de Mastodon, Bluesky SOLO
// funciona si defines BLUESKY_IDENTIFIER/BLUESKY_APP_PASSWORD (gratis: se
// genera en bsky.app -> Ajustes -> App passwords, no hace falta pagar nada).
// Sin esas variables, esta fuente simplemente no aporta resultados y el
// script sigue con las demás con normalidad.
async function bskySession() {
  const identifier = process.env.BLUESKY_IDENTIFIER;
  const password = process.env.BLUESKY_APP_PASSWORD;
  if (!identifier || !password) return null;
  try {
    const res = await fetch("https://bsky.social/xrpc/com.atproto.server.createSession", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ identifier, password }),
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) {
      console.error(`⚠️  No se pudo iniciar sesión en Bluesky: ${res.status}`);
      return null;
    }
    const data = await res.json();
    return { token: data.accessJwt, base: "https://bsky.social" };
  } catch (e) {
    console.error("⚠️  Bluesky: error iniciando sesión:", e.message);
    return null;
  }
}

// Cada fuente se envuelve en try/catch: un timeout o error de red en UN
// hashtag/instancia no debe tumbar toda la corrida (las demás fuentes deben
// seguir intentándolo igual).
async function fetchBluesky(hashtag, session, country) {
  try {
    const base = session?.base ?? "https://public.api.bsky.app";
    const url = `${base}/xrpc/app.bsky.feed.searchPosts?q=${encodeURIComponent("#" + hashtag)}&limit=25`;
    const res = await fetch(url, {
      headers: session ? { authorization: `Bearer ${session.token}` } : {},
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) {
      console.error(`⚠️  Bluesky (#${hashtag}): ${res.status} ${res.statusText}`);
      return [];
    }
    const data = await res.json();
    return (data.posts ?? []).map((p) => {
      const handle = p.author?.handle ?? "desconocido";
      const display = p.author?.displayName || handle;
      // uri: at://did:plc:xxx/app.bsky.feed.post/<rkey>
      const rkey = p.uri?.split("/").pop();
      return {
        external_id: `bluesky:${p.uri}`,
        origin: "bluesky",
        country,
        author_name: `${display} (@${handle})`,
        body: truncate(p.record?.text ?? ""),
        link_url: rkey ? `https://bsky.app/profile/${handle}/post/${rkey}` : null,
        created_at: p.record?.createdAt ?? new Date().toISOString(),
      };
    });
  } catch (e) {
    console.error(`⚠️  Bluesky (#${hashtag}): error de red:`, e.message);
    return [];
  }
}

// ── Mastodon ──────────────────────────────────────────────────────────────
// Los timelines por hashtag son por-instancia (no existe un índice global de
// todo el fediverso): se recorre una lista corta y configurable de
// instancias. Endpoint público, sin token en la gran mayoría de instancias.
async function fetchMastodon(instance, hashtag, country) {
  try {
    const url = `https://${instance}/api/v1/timelines/tag/${encodeURIComponent(hashtag)}?limit=25`;
    const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
    if (!res.ok) {
      console.error(`⚠️  Mastodon ${instance} (#${hashtag}): ${res.status} ${res.statusText}`);
      return [];
    }
    const data = await res.json();
    return (Array.isArray(data) ? data : []).map((status) => {
      const acct = status.account?.acct ?? "desconocido";
      const display = status.account?.display_name || acct;
      return {
        external_id: `mastodon:${instance}:${status.id}`,
        origin: "mastodon",
        country,
        author_name: `${display} (@${acct})`,
        body: truncate(stripHtml(status.content ?? "")),
        link_url: status.url ?? status.uri ?? null,
        created_at: status.created_at ?? new Date().toISOString(),
      };
    });
  } catch (e) {
    console.error(`⚠️  Mastodon ${instance} (#${hashtag}): error de red:`, e.message);
    return [];
  }
}

// ── Reddit ────────────────────────────────────────────────────────────────
// API oficial gratis (OAuth "client_credentials", app tipo "script" creada en
// reddit.com/prefs/apps). Reddit no tiene hashtags: usamos la misma palabra
// clave como búsqueda de texto libre en TODO Reddit (`/search`, sin acotar a
// un subreddit). Sin REDDIT_CLIENT_ID/SECRET, esta fuente simplemente no
// aporta resultados, igual que Bluesky sin sesión.
const REDDIT_USER_AGENT = "ElMundoTeBusca/1.0 (ingesta ciudadana sin fines de lucro; contacto: atencionsentralabs@gmail.com)";

async function redditToken() {
  const id = process.env.REDDIT_CLIENT_ID;
  const secret = process.env.REDDIT_CLIENT_SECRET;
  if (!id || !secret) return null;
  try {
    const res = await fetch("https://www.reddit.com/api/v1/access_token", {
      method: "POST",
      headers: {
        authorization: `Basic ${Buffer.from(`${id}:${secret}`).toString("base64")}`,
        "content-type": "application/x-www-form-urlencoded",
        "user-agent": REDDIT_USER_AGENT,
      },
      body: "grant_type=client_credentials",
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) {
      console.error(`⚠️  No se pudo autenticar con Reddit: ${res.status}`);
      return null;
    }
    const data = await res.json();
    return data.access_token ?? null;
  } catch (e) {
    console.error("⚠️  Error autenticando con Reddit:", e.message);
    return null;
  }
}

async function fetchReddit(keyword, token, country) {
  if (!token) return [];
  try {
    const url = `https://oauth.reddit.com/search?q=${encodeURIComponent(keyword)}&sort=new&limit=25&type=link`;
    const res = await fetch(url, {
      headers: { authorization: `Bearer ${token}`, "user-agent": REDDIT_USER_AGENT },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) {
      console.error(`⚠️  Reddit ("${keyword}"): ${res.status} ${res.statusText}`);
      return [];
    }
    const data = await res.json();
    return (data.data?.children ?? []).map(({ data: p }) => {
      const title = (p.title ?? "").trim();
      const selftext = (p.selftext ?? "").trim();
      return {
        external_id: `reddit:${p.id}`,
        origin: "reddit",
        country,
        author_name: `u/${p.author ?? "desconocido"}`,
        body: truncate(selftext ? `${title}\n\n${selftext}` : title),
        link_url: p.permalink ? `https://reddit.com${p.permalink}` : (p.url ?? null),
        created_at: p.created_utc ? new Date(p.created_utc * 1000).toISOString() : new Date().toISOString(),
      };
    });
  } catch (e) {
    console.error(`⚠️  Reddit ("${keyword}"): error de red:`, e.message);
    return [];
  }
}

// ── Filtro de IA (opcional) ──────────────────────────────────────────────
// Clasifica cada post NUEVO antes de guardarlo: "approve" se publica solo,
// "reject" se descarta (ni se guarda), "review" queda pendiente en /admin
// por si algún día se quiere revisar. Ante cualquier duda o fallo de la API,
// se trata como "review" — nunca se publica solo algo que no se pudo
// clasificar con confianza. El prompt se arma por país (nombre y fecha del
// sismo) para no rechazar por error contenido real de un país que no sea
// Venezuela — antes el prompt estaba fijo a "el terremoto de Venezuela" y
// habría descartado activamente cualquier post real sobre Colombia.
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

function classifierPrompt(country) {
  const meta = COUNTRY_META[country] ?? COUNTRY_META.ve;
  return `Eres un filtro de moderación para el muro comunitario de "El Mundo Te Busca", un sitio ciudadano sin fines de lucro que ayuda a coordinar la respuesta a ${meta.quakeLabel}. Vas a recibir el texto de una publicación encontrada por palabra clave en Bluesky, Mastodon o Reddit.

Clasifícala en una de tres categorías:

- "approve": información clara y relevante sobre el terremoto, sus consecuencias, o la respuesta a la emergencia (noticias, rescates, estado de servicios, ayuda humanitaria, testimonios, denuncias de irregularidades en la zona), sin señales de spam o daño.

- "reject": SOLO cuando haya evidencia textual clara y explícita, no una sospecha. Ejemplos de evidencia clara: el texto mismo pide dinero, cripto o datos bancarios directamente; es publicidad de un producto sin relación con la emergencia; contiene insultos, odio o acoso; o el tema no tiene NINGUNA relación con ${meta.name} ni el terremoto (p. ej. coincidió con la palabra clave por casualidad, hablando de otro país o tema por completo).

- "review": todo lo demás — cualquier cosa relacionada con ${meta.name} o la crisis que no encaje claramente en "approve" (política, economía, denuncias, deportaciones, opinión, crítica al gobierno), cifras que no puedas verificar, o cualquier caso donde dudes si es spam/estafa pero el texto no lo confirma explícitamente.

MUY IMPORTANTE: nunca uses "reject" solo por sospecha o especulación ("podría ser", "parece", "no se puede verificar la fuente"). Que un enlace sea de un blog o medio independiente (no una fuente "oficial") NO es motivo de rechazo — el periodismo independiente es válido. Si tu única razón para dudar es que no reconoces la fuente o no puedes confirmar un dato, usa "review", no "reject". Reserva "reject" para cuando el texto mismo, sin necesidad de interpretación, ya es spam, estafa, odio o completamente ajeno al terremoto/${meta.name}.

Además, traduce el texto al español: el sitio es en español. Si el texto ya está en español, devuélvelo tal cual (no lo reescribas ni lo resumas, solo corrígelo si hiciera falta traducirlo). Si está en otro idioma, tradúcelo completo, conservando los hashtags al final tal como aparecen.

Responde SOLO un JSON con esta forma exacta: {"decision": "approve" | "reject" | "review", "reason": "una frase breve en español", "body_es": "el texto en español"}`;
}

async function classifyPost(body, country) {
  if (!OPENAI_API_KEY) return null;
  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: classifierPrompt(country) },
          { role: "user", content: body },
        ],
      }),
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) {
      console.error(`⚠️  Filtro IA: OpenAI respondió ${res.status} ${res.statusText}`);
      return null;
    }
    const data = await res.json();
    const parsed = JSON.parse(data.choices?.[0]?.message?.content ?? "{}");
    if (!["approve", "reject", "review"].includes(parsed.decision)) return null;
    return parsed;
  } catch (e) {
    console.error("⚠️  Filtro IA: error clasificando:", e.message);
    return null;
  }
}

// ── Ejecución ────────────────────────────────────────────────────────────
async function main() {
  const found = [];

  const session = await bskySession();
  const redditAccessToken = await redditToken();

  for (const country of COUNTRY_CODES) {
    const hashtags = hashtagsFor(country);
    if (hashtags.length === 0) continue;
    for (const hashtag of hashtags) {
      found.push(...(await fetchBluesky(hashtag, session, country)));
    }
    for (const instance of MASTODON_INSTANCES) {
      for (const hashtag of hashtags) {
        found.push(...(await fetchMastodon(instance, hashtag, country)));
      }
    }
    for (const hashtag of hashtags) {
      found.push(...(await fetchReddit(hashtag, redditAccessToken, country)));
    }
  }

  // Descarta cuerpos vacíos (posts que son solo una imagen, por ejemplo: sin
  // texto no hay nada útil que mostrar en el muro).
  const rows = found.filter((r) => r.body && r.body.trim().length > 0);
  const byCountry = COUNTRY_CODES.map((c) => `${c}: ${rows.filter((r) => r.country === c).length}`).join(", ");
  console.log(`🔎 ${rows.length} publicaciones encontradas (${byCountry}).`);

  if (DRY_RUN) {
    for (const r of rows) {
      const verdict = await classifyPost(r.body, r.country);
      const tag = verdict ? `[${verdict.decision}] ${verdict.reason}` : "[sin filtro IA configurado]";
      const translated = verdict?.body_es && verdict.body_es !== r.body ? `\n→ ES: ${verdict.body_es}` : "";
      console.log(
        `\n[${r.origin}/${r.country}] ${r.author_name}\n${r.body}${translated}\n${r.link_url ?? ""}\n${tag}`,
      );
    }
    console.log("\n(--dry-run: no se escribió nada en la base de datos.)");
    return;
  }

  if (rows.length === 0) return;

  const URL_SB = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!URL_SB || !SERVICE_KEY) {
    console.error(
      "❌ Falta configuración. Define NEXT_PUBLIC_SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY en .env.local",
    );
    process.exit(1);
  }
  const sb = createClient(URL_SB, SERVICE_KEY, {
    auth: { persistSession: false },
    realtime: { transport: ws },
  });

  // No reclasifica (ni vuelve a gastar llamadas a OpenAI) lo que ya se
  // procesó en una corrida anterior — el .upsert() de más abajo ya lo
  // ignoraría por `external_id`, pero clasificar de nuevo cada 15 min sería
  // tirar dinero en llamadas repetidas a OpenAI.
  const { data: existing, error: existingError } = await sb
    .from("posts")
    .select("external_id")
    .in(
      "external_id",
      rows.map((r) => r.external_id),
    );
  if (existingError) {
    console.error("❌ Error consultando publicaciones existentes:", existingError.message);
    process.exit(1);
  }
  const knownIds = new Set((existing ?? []).map((r) => r.external_id));
  const newRows = rows.filter((r) => !knownIds.has(r.external_id));
  console.log(`🆕 ${newRows.length} de ${rows.length} son nuevas (el resto ya estaban).`);

  const classified = [];
  let rejected = 0;
  for (const r of newRows) {
    const verdict = await classifyPost(r.body, r.country);
    if (verdict?.decision === "reject") {
      rejected++;
      continue;
    }
    classified.push({
      ...r,
      // Traducción de paso: viene en la misma llamada que clasifica, sin
      // gastar una llamada aparte a OpenAI. Si el filtro no está configurado
      // o no trajo traducción, se guarda el texto original tal cual.
      body: truncate(verdict?.body_es || r.body),
      moderationStatus: verdict?.decision === "approve" ? "approved" : "pending",
    });
  }
  if (rejected > 0) console.log(`🚫 ${rejected} descartadas por el filtro de IA (spam/estafa/fuera de tema).`);

  if (classified.length === 0) return;

  const payload = classified.map((r) => ({
    country: r.country,
    type: "info",
    body: r.body,
    estado: null,
    location_text: "",
    photo_url: null,
    link_url: r.link_url,
    author_name: r.author_name,
    contact_phone: null,
    reactions: { apoyo: 0, corazon: 0, hecho: 0 },
    origin: r.origin,
    moderation_status: r.moderationStatus,
    external_id: r.external_id,
    created_at: r.created_at,
  }));

  const { data, error } = await sb
    .from("posts")
    .upsert(payload, { onConflict: "external_id", ignoreDuplicates: true })
    .select("id");

  if (error) {
    console.error("❌ Error insertando en Supabase:", error.message);
    process.exit(1);
  }
  const approved = classified.filter((r) => r.moderationStatus === "approved").length;
  console.log(
    `✅ ${data?.length ?? 0} publicaciones nuevas guardadas (${approved} publicadas solas, ${(data?.length ?? 0) - approved} en la cola de /admin).`,
  );
}

main().catch((e) => {
  console.error("❌", e.message);
  process.exit(1);
});
