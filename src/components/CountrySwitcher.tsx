"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { setActiveCountryAction } from "@/app/actions";
import { COUNTRIES, COUNTRY_CODES, type CountryCode } from "@/lib/countries";
import { FlagIcon } from "./FlagIcon";

/**
 * Widget de banderas para elegir el país/tragedia activo. Cambia una cookie
 * (ver `country-server.ts`) y refresca: el resto del sitio (portada,
 * listados, mapa, emergencias, noticias) ya lee esa cookie del lado del
 * servidor y filtra sus datos por país.
 */
export function CountrySwitcher({ active }: { active: CountryCode }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function choose(code: CountryCode) {
    if (code === active || isPending) return;
    startTransition(async () => {
      await setActiveCountryAction(code);
      router.refresh();
    });
  }

  return (
    <div className="inline-flex items-center gap-1 rounded-full border border-zinc-200 bg-white/80 p-1 shadow-sm backdrop-blur-sm">
      {COUNTRY_CODES.map((code) => {
        const c = COUNTRIES[code];
        const isActive = code === active;
        return (
          <button
            key={code}
            type="button"
            onClick={() => choose(code)}
            disabled={isPending}
            aria-pressed={isActive}
            aria-label={`Ver ${c.name}`}
            title={c.name}
            className={`press flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-semibold transition ${
              isActive
                ? "bg-navy-700 text-white shadow-sm"
                : "text-zinc-500 hover:bg-zinc-100 disabled:opacity-50"
            }`}
          >
            <FlagIcon code={code} className="h-4 w-6 shrink-0 rounded-sm" />
            <span className={isActive ? "" : "hidden sm:inline"}>{c.name}</span>
          </button>
        );
      })}
    </div>
  );
}
