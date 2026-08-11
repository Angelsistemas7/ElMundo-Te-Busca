"use client";

import { useMemo, useRef, useState } from "react";
import { ChevronDown, Search } from "lucide-react";
import { cn } from "@/lib/utils";

export type SearchableSelectOption = { value: string; label: string };

function normalize(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

// Picker propio (no <select> del sistema): botón que despliega, EN EL MISMO
// LUGAR (sin modal anidado sobre el de Filtros), un buscador + lista con
// scroll. Escribir "bolivar" encuentra "Bolívar" (comparación sin acentos).
export function SearchableSelect({
  value,
  onChange,
  options,
  placeholder = "Todos",
}: {
  value: string;
  onChange: (value: string) => void;
  options: SearchableSelectOption[];
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const selectedLabel = options.find((o) => o.value === value)?.label ?? placeholder;

  const filtered = useMemo(() => {
    if (!query.trim()) return options;
    const q = normalize(query);
    return options.filter((o) => normalize(o.label).includes(q));
  }, [options, query]);

  function toggle() {
    setOpen((o) => {
      const next = !o;
      if (next) {
        setQuery("");
        requestAnimationFrame(() => inputRef.current?.focus());
      }
      return next;
    });
  }

  function pick(v: string) {
    onChange(v);
    setOpen(false);
  }

  return (
    <div>
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        className={cn(
          "flex w-full items-center justify-between rounded-lg border px-3 py-2 text-sm outline-none transition",
          open
            ? "border-brand-400 ring-2 ring-brand-100"
            : "border-zinc-300 hover:border-zinc-400",
          value ? "text-zinc-900" : "text-zinc-400",
        )}
      >
        <span className="truncate">{selectedLabel}</span>
        <ChevronDown className={cn("h-4 w-4 shrink-0 text-zinc-400 transition-transform", open && "rotate-180")} />
      </button>

      {open && (
        <div className="mt-1.5 overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-sm">
          <div className="relative border-b border-zinc-100 p-2">
            <Search className="pointer-events-none absolute left-4.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-400" />
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar…"
              className="w-full rounded-md border-none bg-zinc-50 py-1.5 pl-7 pr-2 text-sm outline-none focus:ring-2 focus:ring-brand-100"
            />
          </div>
          <div className="max-h-56 overflow-y-auto p-1">
            <button
              type="button"
              onClick={() => pick("")}
              className={cn(
                "block w-full rounded-md px-3 py-1.5 text-left text-sm transition",
                !value ? "bg-brand-50 font-semibold text-brand-700" : "text-zinc-600 hover:bg-zinc-50",
              )}
            >
              {placeholder}
            </button>
            {filtered.length === 0 && (
              <p className="px-3 py-2 text-sm text-zinc-400">Sin resultados</p>
            )}
            {filtered.map((o) => (
              <button
                key={o.value}
                type="button"
                onClick={() => pick(o.value)}
                className={cn(
                  "block w-full rounded-md px-3 py-1.5 text-left text-sm transition",
                  value === o.value ? "bg-brand-50 font-semibold text-brand-700" : "text-zinc-600 hover:bg-zinc-50",
                )}
              >
                {o.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
