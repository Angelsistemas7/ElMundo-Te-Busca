"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { DEFAULT_PAGE_SIZE, PAGE_SIZE_OPTIONS } from "@/lib/utils";

// Selector de "cuánto mostrar por página" (10/20/50). Cambiar el tamaño
// siempre vuelve a la página 1 (si no, se podría caer fuera de rango).
// `defaultValue` es el tamaño que esta sección usa cuando no hay `pageSize`
// en la URL (10 en casi todas; Comunidad usa 20) — solo afecta cuándo se
// omite el parámetro de la URL por quedar implícito, no las opciones en sí.
export function PageSizeSelect({ value, defaultValue = DEFAULT_PAGE_SIZE }: { value: number; defaultValue?: number }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  function change(size: number) {
    const next = new URLSearchParams(params.toString());
    if (size === defaultValue) next.delete("pageSize");
    else next.set("pageSize", String(size));
    next.delete("page");
    router.push(`${pathname}?${next.toString()}`, { scroll: false });
  }

  return (
    <label className="flex shrink-0 items-center gap-1.5 text-xs text-zinc-500">
      Mostrar
      <select
        value={value}
        onChange={(e) => change(Number(e.target.value))}
        className="rounded-lg border border-zinc-300 bg-white px-2 py-1 text-xs font-medium text-zinc-700 outline-none transition focus:border-brand-400"
      >
        {PAGE_SIZE_OPTIONS.map((n) => (
          <option key={n} value={n}>
            {n} por página
          </option>
        ))}
      </select>
    </label>
  );
}
