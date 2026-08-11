"use client";

import { useRef } from "react";
import Image from "next/image";
import { ChevronLeft, ChevronRight, ExternalLink } from "lucide-react";
import { ExternalLinkGuard } from "./ExternalLinkGuard";
import { SwipeHintNestedOnce } from "./SwipeHint";

export type CarouselItem = {
  id: string;
  image: string | null;
  source: string;
  title: string;
  url: string;
};

export function NewsCarouselTrack({ items }: { items: CarouselItem[] }) {
  const trackRef = useRef<HTMLDivElement>(null);

  function scrollByCard(dir: 1 | -1) {
    const track = trackRef.current;
    if (!track) return;
    const card = track.querySelector(":scope > * > *") as HTMLElement | null;
    const step = (card?.offsetWidth ?? 240) + 16;
    track.scrollBy({ left: dir * step, behavior: "smooth" });
  }

  if (items.length === 0) return null;

  return (
    <div className="relative">
      <SwipeHintNestedOnce
        ref={trackRef}
        outerClassName="no-scrollbar snap-x snap-mandatory overflow-x-auto scroll-smooth pb-1"
        innerClassName="flex w-max gap-4"
      >
        {items.map((item) => (
          <ExternalLinkGuard
            key={item.id}
            href={item.url}
            className="group flex w-56 shrink-0 snap-start flex-col overflow-hidden rounded-2xl border border-zinc-200 bg-white text-left transition hover:border-zinc-300 hover:shadow-sm sm:w-64"
          >
            <div className="relative aspect-[16/10] w-full overflow-hidden bg-zinc-100">
              {item.image ? (
                <Image
                  src={item.image}
                  alt=""
                  fill
                  unoptimized
                  sizes="(min-width: 640px) 16rem, 14rem"
                  className="object-cover transition duration-300 group-hover:scale-105"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-brand-50 to-gold-100">
                  <Image src="/logo-icon.svg" alt="" width={40} height={40} className="h-10 w-10 opacity-40" />
                </div>
              )}
              <span className="absolute left-2 top-2 rounded-full bg-black/65 px-2 py-0.5 text-[11px] font-semibold text-white">
                {item.source}
              </span>
            </div>
            <div className="flex flex-1 flex-col p-3">
              <p className="line-clamp-3 flex-1 text-[13px] font-semibold leading-snug text-zinc-800">
                {item.title}
              </p>
              <span className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-brand-700">
                Ver fuente
                <ExternalLink className="h-3.5 w-3.5" />
              </span>
            </div>
          </ExternalLinkGuard>
        ))}
      </SwipeHintNestedOnce>

      {items.length > 3 && (
        <div className="mt-2 flex justify-end gap-2">
          <button
            type="button"
            onClick={() => scrollByCard(-1)}
            aria-label="Ver noticias anteriores"
            className="press flex h-8 w-8 items-center justify-center rounded-full border border-zinc-200 bg-white text-zinc-500 transition hover:bg-zinc-50"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => scrollByCard(1)}
            aria-label="Ver más noticias"
            className="press flex h-8 w-8 items-center justify-center rounded-full border border-zinc-200 bg-white text-zinc-500 transition hover:bg-zinc-50"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
  );
}
