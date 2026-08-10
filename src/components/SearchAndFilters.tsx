"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Search, X } from "lucide-react";
import { PERSON_STATUS_LABEL, type PersonStatus } from "@/lib/types";
import { getCountry } from "@/lib/countries";
import { cn } from "@/lib/utils";
import { FilterModal, type FilterField } from "./FilterModal";

const STATUS_CHIPS: { value: PersonStatus | "all"; label: string }[] = [
  { value: "all", label: "Todos" },
  { value: "por_localizar", label: PERSON_STATUS_LABEL.por_localizar },
  { value: "localizado", label: PERSON_STATUS_LABEL.localizado },
  { value: "hospitalizado", label: PERSON_STATUS_LABEL.hospitalizado },
  { value: "fallecido", label: PERSON_STATUS_LABEL.fallecido },
];

// Chips rápidos por grupo de edad (atajos a minAge/maxAge). Útil para buscar
// niños perdidos primero, que es lo más urgente.
const AGE_CHIPS: { label: string; min: string; max: string }[] = [
  { label: "Todas las edades", min: "", max: "" },
  { label: "👶 Niños y niñas (0–11)", min: "0", max: "11" },
  { label: "🧒 Adolescentes (12–17)", min: "12", max: "17" },
  { label: "🧑 Jóvenes (18–29)", min: "18", max: "29" },
  { label: "🧔 Adultos (30–59)", min: "30", max: "59" },
  { label: "🧓 Adultos mayores (60+)", min: "60", max: "" },
];

function buildFilterFields(regions: readonly string[]): FilterField[] {
  return [
  {
    kind: "select",
    key: "estado",
    label: "Estado (región)",
    placeholder: "Todos",
    options: regions.map((e) => ({ value: e, label: e })),
  },
  {
    kind: "select",
    key: "gender",
    label: "Género",
    placeholder: "Todos",
    options: [
      { value: "masculino", label: "Masculino" },
      { value: "femenino", label: "Femenino" },
      { value: "otro", label: "Otro" },
    ],
  },
  { kind: "numberRange", fromKey: "minAge", toKey: "maxAge", label: "Edad exacta (opcional)", min: 0, max: 120 },
  {
    kind: "chips",
    key: "sort",
    label: "Ordenar por",
    defaultValue: "recent",
    options: [
      { value: "recent", label: "Más recientes" },
      { value: "name", label: "Nombre (A–Z)" },
      { value: "estado", label: "Estado (región)" },
    ],
  },
  { kind: "dateRange", fromKey: "dateFrom", toKey: "dateTo", label: "Registrado entre" },
  ];
}

export function SearchAndFilters({
  unidentified = false,
  country = "ve",
}: { unidentified?: boolean; country?: string } = {}) {
  const regions = getCountry(country).regions;
  const filterFields = buildFilterFields(regions);
  // En "¿La reconoces?" solo se listan casos AÚN NO resueltos (ver
  // `unresolvedOnly` en data.ts): "Localizado" y "Confirmado sin vida" no
  // aplican como filtro ahí, porque esos casos no aparecen en esa pestaña.
  const statusChips = unidentified
    ? STATUS_CHIPS.filter((c) => c.value !== "localizado" && c.value !== "fallecido")
    : STATUS_CHIPS;

  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const [searchValue, setSearchValue] = useState(params.get("q") ?? "");

  const status = params.get("status") ?? "all";
  const minAge = params.get("minAge") ?? "";
  const maxAge = params.get("maxAge") ?? "";
  const estado = params.get("estado") ?? "all";

  const setParams = useCallback(
    (updates: Record<string, string | null>) => {
      const next = new URLSearchParams(params.toString());
      for (const [key, value] of Object.entries(updates)) {
        if (value === null || value === "" || value === "all") next.delete(key);
        else next.set(key, value);
      }
      next.delete("page"); // cualquier cambio de filtro vuelve a la página 1
      startTransition(() => {
        router.push(`${pathname}?${next.toString()}`, { scroll: false });
      });
    },
    [params, pathname, router],
  );

  // Búsqueda con "debounce" para no consultar en cada tecla.
  useEffect(() => {
    const current = params.get("q") ?? "";
    if (searchValue === current) return;
    const t = setTimeout(() => setParams({ q: searchValue }), 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchValue]);

  // "view" decide Se busca / ¿La reconoces? en la misma ruta — hay que
  // conservarlo siempre o el modal te devolvería a "Se busca" al aplicar.
  const currentParams: Record<string, string> = {};
  for (const key of ["view", "estado", "gender", "sort", "minAge", "maxAge", "dateFrom", "dateTo", "q", "status", "pageSize"]) {
    const v = params.get(key);
    if (v) currentParams[key] = v;
  }

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
          <input
            value={searchValue}
            onChange={(e) => setSearchValue(e.target.value)}
            placeholder={unidentified ? "Buscar nombre, rasgos o lugar" : "Buscar nombre, cédula o ubicación"}
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
        <FilterModal basePath={pathname} currentParams={currentParams} fields={filterFields} />
      </div>

      {/* Chips rápidos por estado de localización */}
      <div className="no-scrollbar flex gap-2 overflow-x-auto pb-0.5">
        {statusChips.map((chip) => (
          <button
            key={chip.value}
            onClick={() => setParams({ status: chip.value })}
            className={cn(
              "press whitespace-nowrap rounded-full border px-2.5 py-1 text-xs font-medium transition",
              status === chip.value
                ? "border-brand-400 bg-brand-50 text-brand-700"
                : "border-zinc-200 bg-white text-zinc-600 hover:border-zinc-300",
            )}
          >
            {chip.label}
          </button>
        ))}
      </div>

      {/* Chips rápidos por grupo de edad */}
      <div className="no-scrollbar flex gap-2 overflow-x-auto pb-0.5">
        {AGE_CHIPS.map((chip) => {
          const active = minAge === chip.min && maxAge === chip.max;
          return (
            <button
              key={chip.label}
              onClick={() => setParams({ minAge: chip.min || null, maxAge: chip.max || null })}
              className={cn(
                "press whitespace-nowrap rounded-full border px-2.5 py-1 text-xs font-medium transition",
                active
                  ? "border-sky-400 bg-sky-50 text-sky-700"
                  : "border-zinc-200 bg-white text-zinc-600 hover:border-zinc-300",
              )}
            >
              {chip.label}
            </button>
          );
        })}
      </div>

      {/* Chips rápidos por estado (región) — acota la búsqueda por lugar. */}
      <div className="no-scrollbar flex gap-2 overflow-x-auto pb-0.5">
        <button
          onClick={() => setParams({ estado: null })}
          className={cn(
            "whitespace-nowrap rounded-full border px-2.5 py-1 text-xs font-medium transition",
            estado === "all"
              ? "border-emerald-400 bg-emerald-50 text-emerald-700"
              : "border-zinc-200 bg-white text-zinc-600 hover:border-zinc-300",
          )}
        >
          Todos los estados
        </button>
        {regions.map((e) => (
          <button
            key={e}
            onClick={() => setParams({ estado: e })}
            className={cn(
              "press whitespace-nowrap rounded-full border px-2.5 py-1 text-xs font-medium transition",
              estado === e
                ? "border-emerald-400 bg-emerald-50 text-emerald-700"
                : "border-zinc-200 bg-white text-zinc-600 hover:border-zinc-300",
            )}
          >
            {e}
          </button>
        ))}
      </div>

      {isPending && <p className="text-xs text-zinc-400">Actualizando resultados…</p>}
    </div>
  );
}
