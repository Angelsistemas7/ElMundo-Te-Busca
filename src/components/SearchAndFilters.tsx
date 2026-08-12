"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Baby, ChevronDown, Search, User, UserRound, Users, X } from "lucide-react";
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

// Brackets de edad rápidos (atajos a minAge/maxAge). Iconos en vez de emoji
// (línea de diseño: estilo iOS, no emoji) — útil para buscar niños perdidos
// primero, que es lo más urgente.
const AGE_CHIPS: { label: string; min: string; max: string; icon: typeof Baby }[] = [
  { label: "Todas las edades", min: "", max: "", icon: Users },
  { label: "Niños y niñas (0–11)", min: "0", max: "11", icon: Baby },
  { label: "Adolescentes (12–17)", min: "12", max: "17", icon: UserRound },
  { label: "Jóvenes (18–29)", min: "18", max: "29", icon: User },
  { label: "Adultos (30–59)", min: "30", max: "59", icon: User },
  { label: "Adultos mayores (60+)", min: "60", max: "", icon: UserRound },
];

function buildFilterFields(regions: readonly string[], statusChips: typeof STATUS_CHIPS): FilterField[] {
  return [
    {
      kind: "chips",
      key: "status",
      label: "Estado de localización",
      defaultValue: "all",
      options: statusChips.map((c) => ({ value: c.value, label: c.label })),
    },
    {
      kind: "chipsRange",
      fromKey: "minAge",
      toKey: "maxAge",
      label: "Edad",
      options: AGE_CHIPS.map((c) => ({ label: c.label, min: c.min, max: c.max, icon: c.icon })),
    },
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
    {
      kind: "chips",
      key: "cause",
      label: "¿Por qué se publicó?",
      defaultValue: "all",
      options: [
        { value: "all", label: "Todos" },
        { value: "desastre", label: "Ligado al terremoto" },
        { value: "otra", label: "Otro motivo" },
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
        { value: "distance", label: "Más cercanas" },
      ],
    },
    {
      kind: "mapPoint",
      latKey: "nearLat",
      lngKey: "nearLng",
      sortKey: "sort",
      sortValue: "distance",
      label: "Buscar cerca de un punto",
      radiusKey: "radiusKm",
      radiusOptions: [5, 10, 20, 50],
    },
    { kind: "dateRange", fromKey: "dateFrom", toKey: "dateTo", label: "Registrado entre" },
  ];
}

export function SearchAndFilters({
  unidentified = false,
  country = "ve",
  children,
}: { unidentified?: boolean; country?: string; children?: React.ReactNode } = {}) {
  const regions = getCountry(country).regions;
  // En "¿La reconoces?" solo se listan casos AÚN NO resueltos (ver
  // `unresolvedOnly` en data.ts): "Localizado" y "Confirmado sin vida" no
  // aplican como filtro ahí, porque esos casos no aparecen en esa pestaña.
  const statusChips = unidentified
    ? STATUS_CHIPS.filter((c) => c.value !== "localizado" && c.value !== "fallecido")
    : STATUS_CHIPS;
  const filterFields = buildFilterFields(regions, statusChips);

  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const [searchValue, setSearchValue] = useState(params.get("q") ?? "");
  // Ocultable: esconde de un tirón la barra de búsqueda, el botón de
  // filtros y "Publicar persona" (visible por defecto).
  const [expanded, setExpanded] = useState(true);

  const setParams = useCallback(
    (updates: Record<string, string | null>) => {
      const next = new URLSearchParams(params.toString());
      for (const [key, value] of Object.entries(updates)) {
        if (value === null || value === "" || value === "all") next.delete(key);
        else next.set(key, value);
      }
      next.delete("page"); // cualquier cambio de filtro vuelve a la página 1
      startTransition(() => {
        // "replace", no "push": esta función solo la usa la búsqueda con
        // debounce de abajo. Con "push" cada letra "asentada" apilaba una
        // entrada de historial nueva, así que "atrás" del navegador tenía
        // que presionarse muchas veces para salir de la propia búsqueda en
        // vez de volver una sola vez a la página anterior real.
        router.replace(`${pathname}?${next.toString()}`, { scroll: false });
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
  for (const key of ["view", "estado", "gender", "cause", "sort", "minAge", "maxAge", "dateFrom", "dateTo", "q", "status", "pageSize", "nearLat", "nearLng", "radiusKm"]) {
    const v = params.get(key);
    if (v) currentParams[key] = v;
  }

  return (
    <div>
      {/* Fila colapsada: píldora compacta del mismo alto que la barra de
          búsqueda; tocarla expande todo lo demás. */}
      {!expanded && (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="press flex w-full items-center gap-2 rounded-xl border border-zinc-300 bg-white py-2 pl-3.5 pr-3 text-sm text-zinc-500 transition hover:border-zinc-400"
        >
          <Search className="h-4 w-4 shrink-0 text-zinc-400" />
          <span className="flex-1 text-left">Buscar y filtrar</span>
          <ChevronDown className="h-4 w-4 shrink-0 text-zinc-400" />
        </button>
      )}

      <div
        className="grid transition-[grid-template-rows] duration-300 ease-out"
        style={{ gridTemplateRows: expanded ? "1fr" : "0fr" }}
      >
        <div className={cn("overflow-hidden transition-opacity duration-200", expanded ? "opacity-100" : "opacity-0")}>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex flex-1 gap-2">
              <div className="relative flex-1">
                <button
                  type="button"
                  onClick={() => setExpanded(false)}
                  aria-label="Ocultar búsqueda y filtros"
                  className="press absolute left-1 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full text-zinc-400 transition hover:bg-zinc-100 hover:text-zinc-700"
                >
                  <ChevronDown className="h-4 w-4 rotate-180" />
                </button>
                <Search className="pointer-events-none absolute left-9 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
                <input
                  value={searchValue}
                  onChange={(e) => setSearchValue(e.target.value)}
                  placeholder={unidentified ? "Buscar nombre, rasgos o lugar" : "Buscar nombre, cédula o ubicación"}
                  className="w-full rounded-xl border border-zinc-300 bg-white py-2 pl-16 pr-9 text-base outline-none sm:text-sm focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
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
            {children && <div className="shrink-0">{children}</div>}
          </div>

          {isPending && <p className="mt-2 text-xs text-zinc-400">Actualizando resultados…</p>}
        </div>
      </div>
    </div>
  );
}
