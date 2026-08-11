import { ShieldCheck } from "lucide-react";
import { getVerifiedNews, getWorldPress } from "@/lib/news";
import type { CountryCode } from "@/lib/countries";
import { NewsCarouselTrack, type CarouselItem } from "./NewsCarouselTrack";

// Trae noticias reales y vigentes en vez de una lista fija: así el carrusel
// no requiere curar contenido a mano ni corre el riesgo de mostrar una fuente
// o URL inventada. getVerifiedNews prueba GDELT y GNews (ambas con foto real
// de portada) con caché compartida POR PAÍS; Google Noticias no trae foto en
// su feed, así que solo se usa para completar si las otras dos dan pocos
// resultados (caídas, con límite de peticiones, etc.).
export async function VerifiedNewsCarousel({ country }: { country: CountryCode }) {
  const verified = await getVerifiedNews(10, country);
  let articles = verified;
  if (articles.length < 4) {
    const fallback = await getWorldPress(10, country);
    const seen = new Set(articles.map((a) => a.url));
    articles = [...articles, ...fallback.filter((a) => !seen.has(a.url))].slice(0, 10);
  }
  if (articles.length === 0) return null;

  const items: CarouselItem[] = articles.map((a) => ({
    id: a.id,
    image: a.image,
    source: a.source,
    title: a.title,
    url: a.url,
  }));

  return (
    <section className="reveal-up rounded-3xl border-2 border-navy-700 bg-white p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-lg font-bold text-navy-700">
          Noticias verificadas
          <span className="flex items-center gap-1 text-xs font-medium text-zinc-400">
            <ShieldCheck className="h-3.5 w-3.5" />
            Información real, de fuentes confiables
          </span>
        </h2>
      </div>
      <div className="mt-4">
        <NewsCarouselTrack items={items} />
      </div>
    </section>
  );
}
