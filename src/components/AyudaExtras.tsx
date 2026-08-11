"use client";

import { useState } from "react";
import { Activity, HandHeart, Star } from "lucide-react";
import type { Comment, Hero, NewsItem } from "@/lib/types";
import type { Quake } from "@/lib/usgs";
import { cn } from "@/lib/utils";
import { HeroCard } from "./HeroCard";
import { ProposeHeroButton } from "./ProposeHeroButton";
import { NewsItemCard } from "./NewsItemCard";
import { AddNewsItemButton } from "./AddNewsItemButton";
import { RecentQuakes } from "./RecentQuakes";

type TabKey = "humanitaria" | "heroes" | "sismos";

const TABS: { key: TabKey; label: string; icon: typeof Star }[] = [
  { key: "humanitaria", label: "Ayuda humanitaria", icon: HandHeart },
  { key: "heroes", label: "Héroes", icon: Star },
  { key: "sismos", label: "Sismos", icon: Activity },
];

export function AyudaExtras({
  curatedAyuda,
  newsComments,
  heroes,
  heroComments,
  quakes,
  isAdmin,
  country = "ve",
}: {
  curatedAyuda: NewsItem[];
  newsComments: Record<string, Comment[]>;
  heroes: Hero[];
  heroComments: Record<string, Comment[]>;
  quakes: Quake[];
  isAdmin: boolean;
  country?: string;
}) {
  const [tab, setTab] = useState<TabKey>("humanitaria");

  return (
    <section className="mt-10 border-t border-zinc-100 pt-8">
      <div className="no-scrollbar mb-5 flex gap-2 overflow-x-auto pb-1">
        {TABS.map(({ key, label, icon: Icon }) => {
          const active = tab === key;
          return (
            <button
              key={key}
              onClick={() => setTab(key)}
              aria-current={active ? "page" : undefined}
              className={cn(
                "press flex items-center gap-1.5 whitespace-nowrap rounded-full border px-4 py-2 text-sm font-semibold transition",
                active
                  ? "border-navy-700 bg-navy-700 text-white shadow-sm"
                  : "border-zinc-200 bg-white text-zinc-600 hover:border-zinc-300 hover:bg-zinc-50",
              )}
            >
              <Icon className="h-4 w-4" />
              {label}
            </button>
          );
        })}
      </div>

      <div key={tab} className="animate-fade-in">
        {tab === "humanitaria" && (
          <section className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm text-zinc-500">
                Respuesta humanitaria que llegó, va en camino o fue anunciada. Cada entrada cita su
                fuente.
              </p>
              {isAdmin && <AddNewsItemButton kind="ayuda" />}
            </div>

            {curatedAyuda.length > 0 ? (
              <div className="space-y-4">
                {curatedAyuda.map((n) => (
                  <NewsItemCard key={n.id} item={n} comments={newsComments[n.id] ?? []} isAdmin={isAdmin} />
                ))}
              </div>
            ) : (
              <p className="rounded-xl border border-dashed border-zinc-200 bg-zinc-50 py-6 text-center text-sm text-zinc-500">
                Aún no hay reportes de ayuda humanitaria publicados.
              </p>
            )}
          </section>
        )}

        {tab === "heroes" && (
          <section>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-zinc-500">
                Reconocimiento a quienes ayudan: bomberos, rescatistas, perros de búsqueda, personal de
                salud y donantes. Cualquiera puede proponer uno; un moderador lo verifica.
              </p>
              <ProposeHeroButton country={country} />
            </div>
            {heroes.length === 0 ? (
              <p className="rounded-xl border border-dashed border-zinc-200 bg-zinc-50 py-6 text-center text-sm text-zinc-500">
                Aún no hay héroes publicados. ¿Conoces a alguien que merece reconocimiento? Propónlo.
              </p>
            ) : (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                {heroes.map((h) => (
                  <HeroCard key={h.id} hero={h} comments={heroComments[h.id] ?? []} />
                ))}
              </div>
            )}
          </section>
        )}

        {tab === "sismos" && (
          <section>
            <RecentQuakes quakes={quakes} />
          </section>
        )}
      </div>
    </section>
  );
}
