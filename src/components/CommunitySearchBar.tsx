"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Search, X } from "lucide-react";
import { FilterModal, type FilterField } from "./FilterModal";

// Barra de búsqueda + botón "Filtros" de Comunidad, con el mismo patrón que
// "Se busca" (SearchAndFilters): búsqueda con debounce, sin recargar la
// página a mano con un botón "Buscar". Antes era un <form> nativo con envío
// explícito — se reemplaza para que ambas secciones se sientan como una sola
// plataforma, no dos hechas por separado.
export function CommunitySearchBar({
  currentParams,
  fields,
}: {
  currentParams: Record<string, string>;
  fields: FilterField[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const [searchValue, setSearchValue] = useState(params.get("q") ?? "");

  const setParams = useCallback(
    (updates: Record<string, string | null>) => {
      const next = new URLSearchParams(params.toString());
      for (const [key, value] of Object.entries(updates)) {
        if (value === null || value === "") next.delete(key);
        else next.set(key, value);
      }
      next.delete("page");
      startTransition(() => {
        // "replace": esta función solo la usa la búsqueda con debounce de
        // abajo. Con "push" cada letra "asentada" apilaba una entrada de
        // historial nueva, y "atrás" del navegador había que presionarlo
        // varias veces para salir de la propia búsqueda en vez de una sola.
        router.replace(`${pathname}?${next.toString()}`, { scroll: false });
      });
    },
    [params, pathname, router],
  );

  useEffect(() => {
    const current = params.get("q") ?? "";
    if (searchValue === current) return;
    const t = setTimeout(() => setParams({ q: searchValue }), 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchValue]);

  return (
    <div className="mb-5 flex items-center gap-2">
      <div className="relative flex-1">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
        <input
          value={searchValue}
          onChange={(e) => setSearchValue(e.target.value)}
          placeholder="Buscar en el muro: necesidad, sector, nombre..."
          className="w-full rounded-xl border border-zinc-300 bg-white py-2 pl-10 pr-9 text-base outline-none sm:text-sm focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
        />
        {searchValue && (
          <button
            onClick={() => setSearchValue("")}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-700"
            aria-label="Limpiar búsqueda"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
      <FilterModal basePath={pathname} currentParams={currentParams} fields={fields} />
      {isPending && <span className="sr-only">Actualizando resultados…</span>}
    </div>
  );
}
