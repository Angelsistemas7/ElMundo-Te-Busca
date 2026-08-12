"use client";

import { useMemo, useState, type ComponentType } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { Crosshair, ListFilter, Loader2, MapPin, X as XIcon } from "lucide-react";
import { Modal } from "./Modal";
import { SearchableSelect } from "./SearchableSelect";
import { cn } from "@/lib/utils";

const PickerMap = dynamic(() => import("./map/LocationPickerMap"), {
  ssr: false,
  loading: () => (
    <div className="flex h-56 w-full items-center justify-center rounded-xl bg-zinc-100 text-sm text-zinc-400">
      Cargando mapa…
    </div>
  ),
});

export type FilterOption = { value: string; label: string; icon?: ComponentType<{ className?: string }> };

export type FilterField =
  | { kind: "chips"; key: string; label: string; options: FilterOption[]; defaultValue?: string }
  | { kind: "select"; key: string; label: string; options: FilterOption[]; placeholder?: string; defaultValue?: string }
  | {
      kind: "chipsRange";
      fromKey: string;
      toKey: string;
      label: string;
      options: { label: string; min: string; max: string; icon?: ComponentType<{ className?: string }> }[];
    }
  | { kind: "dateRange"; fromKey: string; toKey: string; label: string }
  | { kind: "numberRange"; fromKey: string; toKey: string; label: string; min?: number; max?: number }
  | {
      kind: "mapPoint";
      latKey: string;
      lngKey: string;
      /** Campo "Ordenar" a activar automáticamente al marcar un punto (y a soltar si se quita el punto). */
      sortKey: string;
      sortValue: string;
      label: string;
      defaultCenter?: [number, number];
      /** Radio opcional (km) para excluir a quien quede más lejos del punto marcado. */
      radiusKey?: string;
      radiusOptions?: number[];
    };

// Ventana de filtros reutilizable: mismo diseño en toda la app (Comunidad,
// Se busca, Voluntarios, Caravanas...), pero cada página decide qué campos
// expone según sus propios datos. Los chips de tipo/categoría que ya existen
// y funcionan bien en cada sección (Todo/Necesito/Ofrezco, etc.) se quedan
// donde están, sueltos y de un toque — este modal es para lo que no cabía
// bien ahí: orden, rango de fechas, filtro por estado/región.
export function FilterModal({
  basePath,
  currentParams,
  fields,
  triggerLabel = "Filtros",
}: {
  basePath: string;
  currentParams: Record<string, string>;
  fields: FilterField[];
  triggerLabel?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Record<string, string>>(currentParams);
  const [mapOpenFor, setMapOpenFor] = useState<string | null>(null);
  const [locating, setLocating] = useState(false);

  const activeCount = useMemo(() => {
    let n = 0;
    for (const f of fields) {
      if (f.kind === "dateRange" || f.kind === "numberRange" || f.kind === "chipsRange") {
        if (currentParams[f.fromKey] || currentParams[f.toKey]) n++;
      } else if (f.kind === "mapPoint") {
        if (currentParams[f.latKey] && currentParams[f.lngKey]) n++;
      } else if ((currentParams[f.key] ?? "") !== (f.defaultValue ?? "")) {
        n++;
      }
    }
    return n;
  }, [fields, currentParams]);

  function openModal() {
    setDraft(currentParams);
    setMapOpenFor(null);
    setOpen(true);
  }

  function apply() {
    const defaultOf = (key: string) => {
      for (const f of fields) {
        if ((f.kind === "chips" || f.kind === "select") && f.key === key) return f.defaultValue ?? "";
      }
      return "";
    };
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(draft)) {
      if (k === "page") continue;
      if (v && v !== defaultOf(k)) params.set(k, v);
    }
    const qs = params.toString();
    router.push(qs ? `${basePath}?${qs}` : basePath);
    setOpen(false);
  }

  function clear() {
    const cleared = { ...draft };
    for (const f of fields) {
      if (f.kind === "dateRange" || f.kind === "numberRange" || f.kind === "chipsRange") {
        delete cleared[f.fromKey];
        delete cleared[f.toKey];
      } else if (f.kind === "mapPoint") {
        delete cleared[f.latKey];
        delete cleared[f.lngKey];
        if (f.radiusKey) delete cleared[f.radiusKey];
        if (cleared[f.sortKey] === f.sortValue) delete cleared[f.sortKey];
      } else {
        delete cleared[f.key];
      }
    }
    setDraft(cleared);
  }

  function setPoint(field: Extract<FilterField, { kind: "mapPoint" }>, lat: number, lng: number) {
    setDraft((d) => ({ ...d, [field.latKey]: String(lat), [field.lngKey]: String(lng), [field.sortKey]: field.sortValue }));
  }

  function clearPoint(field: Extract<FilterField, { kind: "mapPoint" }>) {
    setDraft((d) => {
      const next = { ...d };
      delete next[field.latKey];
      delete next[field.lngKey];
      if (field.radiusKey) delete next[field.radiusKey];
      if (next[field.sortKey] === field.sortValue) delete next[field.sortKey];
      return next;
    });
  }

  function useMyLocation(field: Extract<FilterField, { kind: "mapPoint" }>) {
    if (!("geolocation" in navigator)) return;
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setPoint(field, p.coords.latitude, p.coords.longitude);
        setLocating(false);
      },
      () => setLocating(false),
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={openModal}
        data-tour="filtros-btn"
        className="press relative inline-flex items-center gap-1.5 rounded-full border border-zinc-300 bg-white px-3.5 py-1.5 text-sm font-medium text-zinc-700 transition hover:border-zinc-400"
      >
        <ListFilter className="h-4 w-4" />
        {triggerLabel}
        {activeCount > 0 && (
          <span className="flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-brand-400 px-1 text-xs font-bold text-zinc-900">
            {activeCount}
          </span>
        )}
      </button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Filtros"
        subtitle="Ajusta el orden y los filtros; el resto de la búsqueda se mantiene."
        footer={
          <>
            <button
              type="button"
              onClick={clear}
              className="press rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50"
            >
              Limpiar
            </button>
            <button
              type="button"
              onClick={apply}
              className="press rounded-lg bg-zinc-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-zinc-800"
            >
              Aplicar
            </button>
          </>
        }
      >
        <div className="space-y-5">
          {fields.map((f) => {
            if (f.kind === "dateRange") {
              return (
                <div key={f.fromKey}>
                  <p className="mb-1.5 text-sm font-semibold text-zinc-900">{f.label}</p>
                  <div className="flex items-center gap-2">
                    <input
                      type="date"
                      value={draft[f.fromKey] ?? ""}
                      onChange={(e) => setDraft((d) => ({ ...d, [f.fromKey]: e.target.value }))}
                      className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-700 outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
                    />
                    <span className="text-sm text-zinc-400">a</span>
                    <input
                      type="date"
                      value={draft[f.toKey] ?? ""}
                      onChange={(e) => setDraft((d) => ({ ...d, [f.toKey]: e.target.value }))}
                      className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-700 outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
                    />
                  </div>
                </div>
              );
            }

            if (f.kind === "numberRange") {
              return (
                <div key={f.fromKey}>
                  <p className="mb-1.5 text-sm font-semibold text-zinc-900">{f.label}</p>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min={f.min}
                      max={f.max}
                      placeholder="Mín."
                      value={draft[f.fromKey] ?? ""}
                      onChange={(e) => setDraft((d) => ({ ...d, [f.fromKey]: e.target.value }))}
                      className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-700 outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
                    />
                    <span className="text-sm text-zinc-400">–</span>
                    <input
                      type="number"
                      min={f.min}
                      max={f.max}
                      placeholder="Máx."
                      value={draft[f.toKey] ?? ""}
                      onChange={(e) => setDraft((d) => ({ ...d, [f.toKey]: e.target.value }))}
                      className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-700 outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
                    />
                  </div>
                </div>
              );
            }

            if (f.kind === "select") {
              return (
                <div key={f.key}>
                  <p className="mb-1.5 text-sm font-semibold text-zinc-900">{f.label}</p>
                  <SearchableSelect
                    value={draft[f.key] ?? ""}
                    onChange={(v) => setDraft((d) => ({ ...d, [f.key]: v }))}
                    options={f.options}
                    placeholder={f.placeholder ?? "Todos"}
                  />
                </div>
              );
            }

            if (f.kind === "mapPoint") {
              const lat = draft[f.latKey] ? Number(draft[f.latKey]) : null;
              const lng = draft[f.lngKey] ? Number(draft[f.lngKey]) : null;
              const point: [number, number] | null = lat != null && lng != null ? [lat, lng] : null;
              const mapOpen = mapOpenFor === f.latKey;
              return (
                <div key={f.latKey}>
                  <p className="mb-1.5 text-sm font-semibold text-zinc-900">{f.label}</p>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setMapOpenFor(mapOpen ? null : f.latKey)}
                      className="press inline-flex items-center gap-1.5 rounded-full border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-zinc-700 transition hover:border-zinc-400"
                    >
                      <MapPin className="h-4 w-4" />
                      {point ? "Editar punto" : "Elegir en el mapa"}
                    </button>
                    {point && (
                      <button
                        type="button"
                        onClick={() => clearPoint(f)}
                        className="press inline-flex items-center gap-1 text-sm font-medium text-rose-600 transition hover:underline"
                      >
                        <XIcon className="h-3.5 w-3.5" />
                        Quitar
                      </button>
                    )}
                  </div>
                  {mapOpen && (
                    <div className="mt-2 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-zinc-500">
                          {point ? `Marcado: ${point[0].toFixed(4)}, ${point[1].toFixed(4)}` : "Toca el mapa para marcar"}
                        </span>
                        <button
                          type="button"
                          onClick={() => useMyLocation(f)}
                          disabled={locating}
                          className="press inline-flex items-center gap-1.5 rounded-lg border border-zinc-300 px-2.5 py-1 text-xs font-semibold text-zinc-700 transition hover:bg-zinc-50 disabled:opacity-60"
                        >
                          {locating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Crosshair className="h-3.5 w-3.5" />}
                          Mi ubicación
                        </button>
                      </div>
                      <PickerMap
                        value={point}
                        center={point ?? f.defaultCenter ?? [10.601, -66.931]}
                        onChange={(la, lo) => setPoint(f, la, lo)}
                      />
                    </div>
                  )}
                  {point && f.radiusKey && f.radiusOptions && (
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <span className="text-xs text-zinc-500">Radio:</span>
                      {f.radiusOptions.map((km) => {
                        const active = draft[f.radiusKey!] === String(km);
                        return (
                          <button
                            key={km}
                            type="button"
                            onClick={() => setDraft((d) => ({ ...d, [f.radiusKey!]: String(km) }))}
                            className={cn(
                              "press rounded-full border px-2.5 py-1 text-xs font-medium transition",
                              active
                                ? "border-brand-400 bg-brand-50 text-brand-700"
                                : "border-zinc-200 bg-white text-zinc-600 hover:border-zinc-300",
                            )}
                          >
                            {km} km
                          </button>
                        );
                      })}
                      {draft[f.radiusKey] && (
                        <button
                          type="button"
                          onClick={() => setDraft((d) => { const n = { ...d }; delete n[f.radiusKey!]; return n; })}
                          className="press text-xs font-medium text-rose-600 hover:underline"
                        >
                          Sin límite
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            }

            if (f.kind === "chipsRange") {
              const from = draft[f.fromKey] ?? "";
              const to = draft[f.toKey] ?? "";
              return (
                <div key={f.fromKey}>
                  <p className="mb-1.5 text-sm font-semibold text-zinc-900">{f.label}</p>
                  <div className="flex flex-wrap gap-2">
                    {f.options.map((o) => {
                      const active = from === o.min && to === o.max;
                      const Icon = o.icon;
                      return (
                        <button
                          key={o.label}
                          type="button"
                          onClick={() =>
                            setDraft((d) => ({ ...d, [f.fromKey]: o.min, [f.toKey]: o.max }))
                          }
                          className={cn(
                            "press flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium transition",
                            active
                              ? "border-brand-400 bg-brand-50 text-brand-700"
                              : "border-zinc-200 bg-white text-zinc-600 hover:border-zinc-300",
                          )}
                        >
                          {Icon && <Icon className="h-3.5 w-3.5" />}
                          {o.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            }

            return (
              <div key={f.key}>
                <p className="mb-1.5 text-sm font-semibold text-zinc-900">{f.label}</p>
                <div className="flex flex-wrap gap-2">
                  {f.options.map((o) => {
                    const active = (draft[f.key] ?? f.defaultValue ?? "") === o.value;
                    return (
                      <button
                        key={o.value}
                        type="button"
                        onClick={() => setDraft((d) => ({ ...d, [f.key]: o.value }))}
                        className={cn(
                          "press rounded-full border px-3 py-1.5 text-sm font-medium transition",
                          active
                            ? "border-brand-400 bg-brand-50 text-brand-700"
                            : "border-zinc-200 bg-white text-zinc-600 hover:border-zinc-300",
                        )}
                      >
                        {o.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </Modal>
    </>
  );
}
