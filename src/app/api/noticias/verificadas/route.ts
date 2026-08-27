import { NextResponse } from "next/server";
import { getVerifiedNews, getWorldPress } from "@/lib/news";
import { DEFAULT_COUNTRY, isCountryCode } from "@/lib/countries";
import { reportServerError } from "@/lib/error-reporting";

// Endpoint público de solo lectura para la app móvil (Flutter): envuelve
// getVerifiedNews/getWorldPress —la misma caché GDELT/GNews de 6h, el mismo
// fallback y la misma traducción que ya usa el carrusel del home— en JSON.
// La app leía GDELT directo desde cada teléfono y heredaba su límite por IP
// (429 con una petición cada 5s) y sus 12-25s de latencia; leer de aquí le
// da la lista ya cocinada en una respuesta de caché. Sin secreto: es la misma
// información que ya se sirve en la página pública, solo que como datos en
// vez de HTML. No expone GNEWS_API_KEY ni OPENAI_API_KEY: esas llaves las usa
// `src/lib/news.ts` del lado del servidor, nunca viajan en la respuesta.
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const countryParam = searchParams.get("country");
    const country = isCountryCode(countryParam) ? countryParam : DEFAULT_COUNTRY;
    const limit = Math.min(Math.max(Number(searchParams.get("limit")) || 10, 1), 20);

    // Mismo fallback que VerifiedNewsCarousel: si lo verificado (con foto) no
    // alcanza, se completa con Google Noticias (sin foto) en vez de devolver
    // una lista corta.
    let articles = await getVerifiedNews(limit, country);
    if (articles.length < 4) {
      const fallback = await getWorldPress(limit, country);
      const seen = new Set(articles.map((a) => a.url));
      articles = [...articles, ...fallback.filter((a) => !seen.has(a.url))].slice(0, limit);
    }

    return NextResponse.json(
      { country, articles },
      // La caché real (6h) ya vive dentro de getVerifiedNews; esta cabecera solo
      // evita pegarle al proceso de Next en cada refresh del carrusel móvil.
      { headers: { "Cache-Control": "public, max-age=600, stale-while-revalidate=1800" } },
    );
  } catch (error) {
    reportServerError("api.verified-news", error);
    return NextResponse.json(
      { ok: false, code: "service_unavailable", error: "Noticias no disponibles temporalmente." },
      { status: 503 },
    );
  }
}
