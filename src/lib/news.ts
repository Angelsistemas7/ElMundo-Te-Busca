import "server-only";
import { COUNTRIES, DEFAULT_COUNTRY, type CountryCode } from "./countries";
import { reportServerError } from "./error-reporting";

// Noticias y reportes de ayuda humanitaria desde dos APIs públicas y GRATUITAS,
// sin clave:
//   • ReliefWeb (ONU/OCHA): reportes oficiales de respuesta humanitaria.
//   • GDELT 2.0 Doc API: titulares de prensa de todo el mundo.
// Todo se FILTRA para quedarnos solo con lo relacionado al país/sismo activo
// (ver `COUNTRIES[country].news` en countries.ts: patrón de filtro, query de
// búsqueda y `gl` de Google Noticias por país).
// Si una API falla, se devuelve [] y la UI muestra un aviso suave (igual que USGS).
// Nunca inventamos contenido: cada artículo conserva su fuente y su enlace.

export interface NewsArticle {
  id: string;
  title: string;
  /** Medio o fuente (p. ej. "Reuters", "OCHA"). */
  source: string;
  url: string;
  /** Fecha de publicación en ISO; null si la API no la entrega. */
  publishedAt: string | null;
  image: string | null;
}

// Coincide si el texto habla del país/sismo activo. Sirve de colador final
// aunque la consulta ya venga orientada al tema. Patrón por país en
// `COUNTRIES[country].news.matchPattern` (countries.ts).
function matchesCountry(country: CountryCode, ...text: (string | null | undefined)[]): boolean {
  const pattern = new RegExp(COUNTRIES[country].news.matchPattern, "i");
  return pattern.test(text.filter(Boolean).join(" "));
}


/** Decodifica entidades y CDATA básicos de un RSS. */
function decodeXml(s: string): string {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#34;|&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .trim();
}

/**
 * Prensa mundial sobre el sismo del país activo vía Google Noticias (RSS
 * público, gratis, sin clave). Devuelve titulares reales con su medio y
 * ENLACE que abre la nota completa. Mucho más fiable que GDELT y se
 * actualiza solo.
 */
export async function getWorldPress(limit = 14, country: CountryCode = DEFAULT_COUNTRY): Promise<NewsArticle[]> {
  try {
    const { searchQuery, gl } = COUNTRIES[country].news;
    const q = encodeURIComponent(searchQuery);
    const url = `https://news.google.com/rss/search?q=${q}&hl=es-419&gl=${gl}&ceid=${gl}:es`;
    const res = await fetch(url, {
      next: { revalidate: 1800 }, // refresca cada 30 min
      signal: AbortSignal.timeout(6000),
      headers: { "user-agent": "Mozilla/5.0 (compatible; ElMundoTeBusca/1.0)" },
    });
    if (!res.ok) return [];
    const xml = await res.text();
    // Regex literales por etiqueta (un RegExp dinámico con escapes fallaba).
    const RE = {
      title: /<title[^>]*>([\s\S]*?)<\/title>/,
      link: /<link[^>]*>([\s\S]*?)<\/link>/,
      source: /<source[^>]*>([\s\S]*?)<\/source>/,
      pubDate: /<pubDate[^>]*>([\s\S]*?)<\/pubDate>/,
    } as const;
    const seen = new Set<string>();
    const out: NewsArticle[] = [];
    for (const chunk of xml.split("<item>").slice(1)) {
      const block = chunk.split("</item>")[0];
      const pick = (tag: keyof typeof RE) => {
        const m = RE[tag].exec(block);
        return m ? decodeXml(m[1]) : "";
      };
      const link = pick("link");
      let title = pick("title");
      const source = pick("source") || "Prensa";
      const pub = pick("pubDate");
      if (!link || !title || seen.has(link)) continue;
      // Google News trae el titular como "Titular - Fuente"; quita ese sufijo.
      if (source && title.endsWith(` - ${source}`)) title = title.slice(0, -(source.length + 3));
      // Solo prensa: descartamos fuentes de redes sociales.
      if (/facebook|twitter|x\.com|instagram|tiktok|youtube|reddit/i.test(source)) continue;
      if (!matchesCountry(country, title, source)) continue;
      seen.add(link);
      out.push({
        id: link,
        title,
        source,
        url: link,
        publishedAt: pub ? new Date(pub).toISOString() : null,
        image: null,
      });
      if (out.length >= limit) break;
    }
    return out;
  } catch (error) {
    reportServerError("news.google-rss.parse", error, { country });
    return [];
  }
}

/** "20260714T234500Z" (formato de GDELT) → ISO 8601 normal. */
function parseGdeltDate(s: string): string | null {
  const m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z?$/.exec(s);
  if (!m) return null;
  const [, y, mo, d, h, mi, se] = m;
  return `${y}-${mo}-${d}T${h}:${mi}:${se}Z`;
}

// Caché COMPARTIDA entre las dos fuentes con foto (GDELT y GNews) — lo que
// responda primero se guarda igual, sin duplicar la lógica de caché por
// fuente. Ambas son gratis y sin garantía real de disponibilidad (a GDELT ya
// le pasó estar horas fallando seguido); con tráfico real es fácil toparse
// con un mal momento de cualquiera de las dos.
//
// Además de vivir en memoria, se espeja a un archivo en disco: la caché en
// memoria se BORRA cada vez que el proceso se reinicia (cada deploy), y si
// justo en ese momento la fuente en turno está fallando, el sitio se queda
// sin fotos hasta que se recupere — le pasó varias veces seguidas en
// producción. Con el archivo, un reinicio recupera la última lista buena al
// instante en vez de arrancar de cero.
type VerifiedNewsCache = { articles: NewsArticle[]; fetchedAt: number };
// Cachés SEPARADAS por país activo — antes había un solo balde global, así
// que ver Colombia con Venezuela ya cacheada (o viceversa) mostraba las
// noticias del país equivocado hasta que venciera el TTL.
const verifiedNewsCacheByCountry: Partial<Record<CountryCode, VerifiedNewsCache>> = {};
const diskCacheLoadedByCountry: Partial<Record<CountryCode, boolean>> = {};
// 30 min pegaba peticiones cada rato — estas APIs son gratis y sin garantía
// de disponibilidad, y a más peticiones más riesgo de toparse con un mal
// momento suyo (confirmado con GDELT: tuvo horas fallando seguido). Con
// noticias de un terremoto de hace semanas, una lista de varias horas de
// antigüedad sigue siendo información real y vigente — no hace falta
// refrescar tan seguido.
const NEWS_TTL_MS = 6 * 60 * 60 * 1000;
// Ruta fija (no `os.tmpdir()`/`path.join()`): esos módulos de Node, igual que
// `fs`, no existen en el runtime Edge — Next compilaba instrumentation.ts
// (que llamaba a este archivo) también para Edge, y un import ESTÁTICO de
// cualquiera de los tres rompía ese build aunque nunca se ejecutara ahí. Por
// eso, además, `fs` se importa DINÁMICO dentro de cada función en vez de
// arriba del archivo: así Next lo deja fuera del paquete de Edge en vez de
// intentar resolverlo igual.
function diskCacheFile(country: CountryCode) {
  return `/tmp/elmundotebusca-news-cache-${country}.json`;
}

async function loadDiskCacheOnce(country: CountryCode) {
  if (diskCacheLoadedByCountry[country]) return;
  diskCacheLoadedByCountry[country] = true;
  try {
    const { readFile } = await import("node:fs/promises");
    const raw = await readFile(diskCacheFile(country), "utf-8");
    const parsed = JSON.parse(raw) as VerifiedNewsCache;
    if (Array.isArray(parsed.articles) && parsed.articles.length > 0 && !verifiedNewsCacheByCountry[country]) {
      verifiedNewsCacheByCountry[country] = parsed;
      console.log(`[news] (${country}) caché recuperada de disco, edad ms:`, Date.now() - parsed.fetchedAt);
    }
  } catch (error) {
    const code = error instanceof Error && "code" in error ? String(error.code) : "";
    if (code !== "ENOENT") reportServerError("news.cache.read", error, { country });
  }
}

async function saveDiskCache(country: CountryCode) {
  const cache = verifiedNewsCacheByCountry[country];
  if (!cache) return;
  try {
    const { writeFile } = await import("node:fs/promises");
    await writeFile(diskCacheFile(country), JSON.stringify(cache));
  } catch (error) {
    reportServerError("news.cache.write", error, { country });
  }
}

/**
 * Traduce titulares al español con OpenAI (mismo proveedor/modelo que ya usa
 * scripts/fetch-social-posts.mjs para los posts importados). Una sola llamada
 * por lote en vez de una por titular: más barato y rápido. Si falla o no hay
 * OPENAI_API_KEY, devuelve {} y el llamador se queda con el titular original
 * — nunca bloquea el carrusel por esto.
 */
async function translateTitles(items: { id: string; title: string }[]): Promise<Record<string, string>> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey || items.length === 0) return {};
  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
      // Con ~40 titulares en un solo lote (ver fetchLimit en getGdeltNews) tarda
      // más de 10s; medido en logs reales, se estaba cortando siempre antes de
      // responder y por eso nunca se aplicaba ninguna traducción.
      signal: AbortSignal.timeout(25000),
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content:
              'Traduces titulares de prensa al español neutro, manteniendo el sentido y el tono periodístico, sin agregar ni quitar información. Recibes un array JSON de {id, title}. Respondes SOLO con {"traducciones": {"<id>": "<titular traducido>", ...}}, una entrada por cada id recibido.',
          },
          { role: "user", content: JSON.stringify(items) },
        ],
      }),
    });
    if (!res.ok) {
      console.error("[news.translate.http]", { status: res.status });
      return {};
    }
    const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    const content = data.choices?.[0]?.message?.content ?? "{}";
    const parsed = JSON.parse(content) as { traducciones?: Record<string, string> };
    const result = parsed.traducciones && typeof parsed.traducciones === "object" ? parsed.traducciones : {};
    console.log("[news] traducción OpenAI ok:", Object.keys(result).length, "titulares traducidos");
    return result;
  } catch (error) {
    reportServerError("news.translate", error);
    return {};
  }
}

/**
 * Prensa mundial vía GDELT 2.0 Doc API (RSS público, gratis, sin clave). A
 * diferencia de Google Noticias, GDELT trae la URL directa del artículo (no
 * un enlace intermediario) y una foto real (`socialimage`, la misma que usa
 * el propio medio para compartir en redes). Sin caché propia — la maneja
 * `getVerifiedNews`, que también prueba GNews si esto no alcanza.
 */
async function fetchFromGdelt(fetchLimit: number, country: CountryCode): Promise<NewsArticle[]> {
  try {
    const q = encodeURIComponent(COUNTRIES[country].news.searchQuery);
    const url = `https://api.gdeltproject.org/api/v2/doc/doc?query=${q}&mode=artlist&maxrecords=${fetchLimit}&format=json&sort=datedesc`;
    const res = await fetch(url, {
      cache: "no-store", // el cacheo lo maneja getVerifiedNews; así una respuesta fallida (429) no queda pegada
      // GDELT puede tardar bastante más que otras APIs (medido: ~10s en pruebas
      // reales); 6s la cortaba siempre antes de responder.
      signal: AbortSignal.timeout(15000),
      headers: { "user-agent": "Mozilla/5.0 (compatible; ElMundoTeBusca/1.0)" },
    });
    if (!res.ok) {
      console.error("[news.gdelt.http]", { status: res.status });
      return [];
    }
    const json = (await res.json()) as {
      articles?: {
        url: string;
        title: string;
        seendate?: string;
        domain?: string;
        socialimage?: string;
        language?: string;
      }[];
    };
    const seen = new Set<string>();
    const spanish: NewsArticle[] = [];
    const other: NewsArticle[] = [];
    for (const a of json.articles ?? []) {
      if (!a.url || !a.title || seen.has(a.url)) continue;
      if (/facebook|twitter|x\.com|instagram|tiktok|youtube|reddit/i.test(a.domain ?? "")) continue;
      // Mismo colador que `getWorldPress` (matchesCountry) — ver nota igual
      // en `fetchGdeltForCrisisStats` más abajo.
      if (!matchesCountry(country, a.title, a.domain)) continue;
      seen.add(a.url);
      const article: NewsArticle = {
        id: a.url,
        title: a.title.trim(),
        source: (a.domain ?? "Prensa").replace(/^www\./, ""),
        url: a.url,
        publishedAt: a.seendate ? parseGdeltDate(a.seendate) : null,
        // Solo se usa si es una URL http(s) real — nunca se confía a ciegas
        // en un campo de un tercero para algo que termina en un <img src>.
        image: a.socialimage && /^https?:\/\//.test(a.socialimage) ? a.socialimage : null,
      };
      // Prioriza fuentes en español (audiencia del sitio); el resto solo se
      // usa para completar si no alcanzan las noticias en español.
      (a.language === "Spanish" ? spanish : other).push(article);
    }

    // En la práctica, GDELT casi no indexa prensa en español reciente para
    // este tema (verificado): casi siempre "other" es toda la lista. En vez
    // de perder esa cobertura real, se traducen sus titulares en un solo
    // lote — el enlace de "Ver fuente" sigue yendo al artículo original.
    console.log("[news] GDELT trajo", spanish.length, "en español y", other.length, "en otro idioma");
    if (other.length > 0) {
      const translations = await translateTitles(other.map((a) => ({ id: a.id, title: a.title })));
      let applied = 0;
      for (const a of other) {
        const t = translations[a.id];
        if (t) {
          a.title = t;
          applied++;
        }
      }
      console.log("[news] traducciones aplicadas:", applied, "de", other.length);
    }

    return [...spanish, ...other];
  } catch (error) {
    reportServerError("news.gdelt", error);
    return [];
  }
}

/**
 * Prensa vía GNews.io (necesita GNEWS_API_KEY — capa gratis: 100
 * peticiones/día, hasta 10 artículos por petición). Respaldo de GDELT: más
 * confiable (no es un proyecto de investigación gratis sin garantía) y ya
 * entrega en español (`lang=es`), sin necesitar traducción aparte. Si no hay
 * clave configurada, devuelve [] — el resto de la cadena de respaldo sigue
 * funcionando igual sin ella.
 */
async function fetchFromGNews(fetchLimit: number, country: CountryCode): Promise<NewsArticle[]> {
  const apiKey = process.env.GNEWS_API_KEY;
  if (!apiKey) return [];
  try {
    const q = encodeURIComponent(COUNTRIES[country].news.searchQuery);
    const max = Math.min(Math.max(fetchLimit, 1), 25);
    const url = `https://gnews.io/api/v4/search?q=${q}&lang=es&max=${max}&sortby=publishedAt&apikey=${apiKey}`;
    const res = await fetch(url, {
      cache: "no-store",
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) {
      console.error("[news.gnews.http]", { status: res.status });
      return [];
    }
    const json = (await res.json()) as {
      articles?: {
        title: string;
        url: string;
        image?: string | null;
        publishedAt?: string;
        source?: { name?: string };
      }[];
    };
    const seen = new Set<string>();
    const out: NewsArticle[] = [];
    for (const a of json.articles ?? []) {
      if (!a.url || !a.title || seen.has(a.url)) continue;
      // Mismo colador que `getWorldPress` (matchesCountry) — ver nota igual
      // en `fetchGdeltForCrisisStats` más abajo.
      if (!matchesCountry(country, a.title, a.source?.name)) continue;
      seen.add(a.url);
      out.push({
        id: a.url,
        title: a.title.trim(),
        source: a.source?.name ?? "Prensa",
        url: a.url,
        publishedAt: a.publishedAt ?? null,
        image: a.image && /^https?:\/\//.test(a.image) ? a.image : null,
      });
    }
    console.log("[news] GNews trajo", out.length, "artículos");
    return out;
  } catch (error) {
    reportServerError("news.gnews", error);
    return [];
  }
}

/**
 * Noticias verificadas CON foto real, para el carrusel del home. Prueba GDELT
 * primero (gratis, sin clave, buena cobertura, pero sin garantía de
 * disponibilidad); si falla o no trae nada, prueba GNews (necesita
 * GNEWS_API_KEY, más confiable, ya en español). Si ambas fallan, sirve la
 * última lista buena guardada (memoria o disco) — solo si NUNCA hubo una
 * lista buena devuelve [] (y el carrusel cae a Google Noticias sin foto).
 */
// Pedido en curso para refrescar la caché, compartido entre llamadas
// concurrentes: sin esto, dos visitas que llegan justo cuando la caché venció
// disparan cada una su propia ronda de GDELT/GNews/OpenAI en paralelo — gasto
// duplicado, y GNews solo da 100 peticiones/día gratis. Con esto, la segunda
// llamada espera el mismo resultado que ya disparó la primera en vez de
// repetirlo. Se limpia apenas termina (éxito o error) para no quedar pegado.
const verifiedNewsInflightByCountry: Partial<Record<CountryCode, Promise<NewsArticle[]>>> = {};

// Hace el refresco real UNA sola vez (guarda en caché de memoria/disco
// adentro) sin importar cuántas llamadas concurrentes esperen esta misma
// promesa — así no se repite el `saveDiskCache()` por cada una.
async function refreshVerifiedNews(fetchLimit: number, fetchedAt: number, country: CountryCode): Promise<NewsArticle[]> {
  let fresh = await fetchFromGdelt(fetchLimit, country);
  let sourceUsed = "GDELT";
  if (fresh.length === 0) {
    fresh = await fetchFromGNews(fetchLimit, country);
    sourceUsed = "GNews";
  }

  if (fresh.length === 0) {
    console.error(`[news] (${country}) getVerifiedNews: GDELT y GNews fallaron, usando última caché si hay`);
    return verifiedNewsCacheByCountry[country]?.articles ?? [];
  }

  console.log(`[news] (${country}) getVerifiedNews: usando`, sourceUsed, "-", fresh.length, "artículos");
  verifiedNewsCacheByCountry[country] = { articles: fresh, fetchedAt };
  await saveDiskCache(country);
  return fresh;
}

export async function getVerifiedNews(limit = 10, country: CountryCode = DEFAULT_COUNTRY): Promise<NewsArticle[]> {
  await loadDiskCacheOnce(country);
  const now = Date.now();
  const cached = verifiedNewsCacheByCountry[country];
  if (cached && now - cached.fetchedAt < NEWS_TTL_MS) {
    console.log(`[news] (${country}) getVerifiedNews: caché válida (edad ms):`, now - cached.fetchedAt);
    return cached.articles.slice(0, limit);
  }

  // Se pide bastante más de lo que hace falta (ambas fuentes rastrean prensa
  // mundial en cualquier idioma) porque GDELT después prioriza español y
  // descarta el resto si hay suficiente.
  const fetchLimit = Math.max(limit * 2, 20);

  if (!verifiedNewsInflightByCountry[country]) {
    verifiedNewsInflightByCountry[country] = refreshVerifiedNews(fetchLimit, now, country).finally(() => {
      delete verifiedNewsInflightByCountry[country];
    });
  }
  const articles = await verifiedNewsInflightByCountry[country]!;
  return articles.slice(0, limit);
}

/**
 * Cifras reales del terremoto (fallecidos, heridos, desaparecidos, personas
 * afectadas), extraídas de titulares reales de prensa (GDELT). Cada cifra
 * conserva el titular exacto de donde salió como cita: el modelo NUNCA
 * inventa una fuente, solo puede señalar uno de los titulares que le dimos
 * (por índice) — si no hay un titular con un número explícito para un dato,
 * ese campo queda en null. No hay estimaciones ni sumas propias.
 */
export interface CrisisStat {
  value: number;
  label: string;
  source: string;
  sourceUrl: string;
  asOf: string | null;
}

export interface CrisisStats {
  fallecidos: CrisisStat | null;
  heridos: CrisisStat | null;
  desaparecidos: CrisisStat | null;
  afectados: CrisisStat | null;
}

const EMPTY_CRISIS_STATS: CrisisStats = {
  fallecidos: null,
  heridos: null,
  desaparecidos: null,
  afectados: null,
};

type CrisisStatsCache = { stats: CrisisStats; fetchedAt: number };
const crisisStatsCacheByCountry: Partial<Record<CountryCode, CrisisStatsCache>> = {};
const crisisStatsDiskLoadedByCountry: Partial<Record<CountryCode, boolean>> = {};
// Cifras de víctimas cambian más rápido que la cobertura de prensa en general
// (ver NEWS_TTL_MS): una tabla de menos horas para no quedarse con un dato
// viejo durante la fase aguda de la emergencia.
const CRISIS_STATS_TTL_MS = 3 * 60 * 60 * 1000;
function crisisStatsDiskCacheFile(country: CountryCode) {
  return `/tmp/elmundotebusca-crisis-stats-cache-${country}.json`;
}

async function loadCrisisStatsDiskCacheOnce(country: CountryCode) {
  if (crisisStatsDiskLoadedByCountry[country]) return;
  crisisStatsDiskLoadedByCountry[country] = true;
  try {
    const { readFile } = await import("node:fs/promises");
    const raw = await readFile(crisisStatsDiskCacheFile(country), "utf-8");
    const parsed = JSON.parse(raw) as CrisisStatsCache;
    if (parsed.stats && !crisisStatsCacheByCountry[country]) crisisStatsCacheByCountry[country] = parsed;
  } catch (error) {
    const code = error instanceof Error && "code" in error ? String(error.code) : "";
    if (code !== "ENOENT") reportServerError("news.crisis-cache.read", error, { country });
  }
}

async function saveCrisisStatsDiskCache(country: CountryCode) {
  const cache = crisisStatsCacheByCountry[country];
  if (!cache) return;
  try {
    const { writeFile } = await import("node:fs/promises");
    await writeFile(crisisStatsDiskCacheFile(country), JSON.stringify(cache));
  } catch (error) {
    reportServerError("news.crisis-cache.write", error, { country });
  }
}

/** Titulares de GDELT enfocados en víctimas/afectados (no en ayuda o política). */
async function fetchGdeltForCrisisStats(
  limit: number,
  country: CountryCode,
): Promise<{ title: string; source: string; url: string; publishedAt: string | null }[]> {
  try {
    const q = encodeURIComponent(
      `${COUNTRIES[country].news.searchQuery} (muertos OR fallecidos OR heridos OR desaparecidos OR damnificados OR dead OR killed OR injured OR missing)`,
    );
    const url = `https://api.gdeltproject.org/api/v2/doc/doc?query=${q}&mode=artlist&maxrecords=${limit}&format=json&sort=datedesc`;
    const res = await fetch(url, {
      cache: "no-store",
      signal: AbortSignal.timeout(15000),
      headers: { "user-agent": "Mozilla/5.0 (compatible; ElMundoTeBusca/1.0)" },
    });
    if (!res.ok) {
      console.error("[news.crisis-gdelt.http]", { status: res.status });
      return [];
    }
    const json = (await res.json()) as {
      articles?: { url: string; title: string; seendate?: string; domain?: string }[];
    };
    const seen = new Set<string>();
    const out: { title: string; source: string; url: string; publishedAt: string | null }[] = [];
    for (const a of json.articles ?? []) {
      if (!a.url || !a.title || seen.has(a.url)) continue;
      if (/facebook|twitter|x\.com|instagram|tiktok|youtube|reddit/i.test(a.domain ?? "")) continue;
      // Mismo colador que `getVerifiedNews`/`getWorldPress` (matchesCountry): la
      // búsqueda de GDELT ya viene orientada al país, pero eso no basta — un
      // titular que solo lo menciona de pasada (o es del otro sismo) puede
      // colarse igual. Sin esto, con dos países activos compitiendo por los
      // mismos términos ("terremoto", "sismo"), la IA podía sacarle a un país
      // una cifra de víctimas que en realidad era del otro.
      if (!matchesCountry(country, a.title, a.domain)) continue;
      seen.add(a.url);
      out.push({
        title: a.title.trim(),
        source: (a.domain ?? "Prensa").replace(/^www\./, ""),
        url: a.url,
        publishedAt: a.seendate ? parseGdeltDate(a.seendate) : null,
      });
    }
    return out;
  } catch (error) {
    reportServerError("news.crisis-gdelt", error);
    return [];
  }
}

/**
 * Le pide al modelo que señale, de la lista de titulares REALES que le damos
 * (por índice), cuál trae la cifra correcta para cada dato — nunca que
 * redacte un número o una fuente por su cuenta. Prioriza la cifra que
 * CORROBORAN varios titulares de fuentes distintas por encima de un titular
 * suelto más reciente (un solo medio con una cifra desactualizada no debe
 * ganarle a tres medios que ya coinciden en la cifra nueva). Devuelve {} si
 * no hay OPENAI_API_KEY o si la llamada falla; el llamador se queda con null
 * en todo, nunca con un placeholder inventado.
 */
async function extractCrisisFigures(
  articles: { title: string; source: string; publishedAt: string | null }[],
): Promise<Record<string, { value: number; articleIndex: number }>> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey || articles.length === 0) return {};
  try {
    const indexed = articles.map((a, i) => ({ i, title: a.title, source: a.source, publishedAt: a.publishedAt }));
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(25000),
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content:
              "Analizas titulares REALES de prensa sobre un terremoto para señalar (nunca redactar) " +
              "cifras oficiales. Recibes un array JSON de titulares {i, title, source, publishedAt}. " +
              "Para cada uno de estos datos: fallecidos (muertes confirmadas), heridos, desaparecidos, " +
              "afectados (damnificados/evacuados/sin hogar), sigue este orden de prioridad: " +
              "1) Cuenta, para cada cifra distinta que encuentres de ese dato, en cuántos titulares de " +
              "FUENTES DISTINTAS aparece exactamente esa cifra (dos titulares del mismo medio cuentan " +
              "como una sola fuente). 2) Elige la cifra con MÁS fuentes distintas coincidiendo — así sea " +
              "de un titular más viejo que uno suelto de un solo medio con una cifra diferente y más " +
              "reciente. 3) Si hay empate en número de fuentes, ahí sí usa la del titular más reciente " +
              "(publishedAt). Si ningún titular declara el dato con un número EXPLÍCITO, o es ambiguo " +
              "(\"cientos\", \"varios\"), omite ese campo. NO sumes, calcules ni estimes cifras propias. " +
              "NO inventes un titular: solo puedes citar el índice \"i\" de uno que te dieron — de entre " +
              "los que coincidan en la cifra elegida, usa el de publishedAt más reciente como cita. " +
              'Responde SOLO JSON: {"fallecidos": {"value": number, "i": number} | null, "heridos": ..., ' +
              '"desaparecidos": ..., "afectados": ...}',
          },
          { role: "user", content: JSON.stringify(indexed) },
        ],
      }),
    });
    if (!res.ok) {
      console.error("[news] extractCrisisFigures OpenAI falló", res.status, await res.text());
      return {};
    }
    const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    const content = data.choices?.[0]?.message?.content ?? "{}";
    const parsed = JSON.parse(content) as Record<
      string,
      { value?: unknown; i?: unknown } | null | undefined
    >;
    const out: Record<string, { value: number; articleIndex: number }> = {};
    for (const key of ["fallecidos", "heridos", "desaparecidos", "afectados"]) {
      const entry = parsed[key];
      if (!entry || typeof entry !== "object") continue;
      const value = Number(entry.value);
      const idx = Number(entry.i);
      if (!Number.isFinite(value) || value <= 0) continue;
      if (!Number.isInteger(idx) || idx < 0 || idx >= articles.length) continue;
      out[key] = { value, articleIndex: idx };
    }
    return out;
  } catch (error) {
    reportServerError("news.crisis-figures", error);
    return {};
  }
}

const CRISIS_LABELS: Record<string, string> = {
  fallecidos: "Fallecidos",
  heridos: "Heridos",
  desaparecidos: "Desaparecidos",
  afectados: "Personas afectadas",
};

// Mismo candado que verifiedNewsInflight (ver ahí el porqué): sin esto, dos
// visitas llegando justo cuando la caché de cifras vence disparan cada una su
// propia llamada a OpenAI (la más cara de las dos cachés de este archivo).
const crisisStatsInflightByCountry: Partial<Record<CountryCode, Promise<CrisisStats>>> = {};

async function refreshCrisisStats(fetchedAt: number, country: CountryCode): Promise<CrisisStats> {
  // Se combinan dos fuentes de titulares: la búsqueda dedicada a víctimas
  // (más cobertura de esos términos específicos) y el mismo pool "verificado"
  // que ya se muestra en el carrusel del home. Así la cifra del banner nunca
  // contradice lo que la persona ve un scroll más abajo, y una cifra que
  // aparece en varios titulares de ambas fuentes gana más corroboración.
  const [casualtyArticles, verifiedArticles] = await Promise.all([
    fetchGdeltForCrisisStats(30, country),
    getVerifiedNews(10, country),
  ]);
  const seenUrls = new Set<string>();
  const articles: { title: string; source: string; url: string; publishedAt: string | null }[] = [];
  for (const a of [
    ...casualtyArticles,
    ...verifiedArticles.map((v) => ({ title: v.title, source: v.source, url: v.url, publishedAt: v.publishedAt })),
  ]) {
    if (seenUrls.has(a.url)) continue;
    seenUrls.add(a.url);
    articles.push(a);
  }

  if (articles.length === 0) {
    // Sin titulares no hay de dónde sacar nada real; se sirve la última
    // caché buena si hay, en vez de mostrar ceros o inventar.
    return crisisStatsCacheByCountry[country]?.stats ?? EMPTY_CRISIS_STATS;
  }

  const figures = await extractCrisisFigures(articles);
  const stats: CrisisStats = { ...EMPTY_CRISIS_STATS };
  for (const key of ["fallecidos", "heridos", "desaparecidos", "afectados"] as const) {
    const found = figures[key];
    if (!found) continue;
    const article = articles[found.articleIndex];
    stats[key] = {
      value: found.value,
      label: CRISIS_LABELS[key],
      source: article.source,
      sourceUrl: article.url,
      asOf: article.publishedAt,
    };
  }

  // Si no se pudo extraer NADA nuevo, mejor quedarse con la última caché
  // buena (si hay) que reemplazarla por puros null.
  const gotSomething = Object.values(stats).some(Boolean);
  const existing = crisisStatsCacheByCountry[country];
  if (!gotSomething && existing) return existing.stats;

  crisisStatsCacheByCountry[country] = { stats, fetchedAt };
  await saveCrisisStatsDiskCache(country);
  return stats;
}

export async function getCrisisStats(country: CountryCode = DEFAULT_COUNTRY): Promise<CrisisStats> {
  await loadCrisisStatsDiskCacheOnce(country);
  const now = Date.now();
  const cached = crisisStatsCacheByCountry[country];
  if (cached && now - cached.fetchedAt < CRISIS_STATS_TTL_MS) {
    return cached.stats;
  }

  if (!crisisStatsInflightByCountry[country]) {
    crisisStatsInflightByCountry[country] = refreshCrisisStats(now, country).finally(() => {
      delete crisisStatsInflightByCountry[country];
    });
  }
  return crisisStatsInflightByCountry[country]!;
}
