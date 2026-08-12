import Link from "next/link";
import { MapPin, Search } from "lucide-react";
import { cn } from "@/lib/utils";

// Interruptor entre las dos formas de buscar personas, ambas en la portada:
//  • "Se busca": gente CON datos (nombre/cédula), falta saber dónde está.
//  • "¿La reconoces?": gente que alguien VIO, falta saber quién es (foto/rasgos).
export function PersonViewToggle({ view }: { view: "busca" | "reconoces" }) {
  const base =
    "press flex flex-1 items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-sm font-semibold transition";
  return (
    <div className="flex gap-1 rounded-2xl border border-zinc-200 bg-zinc-100 p-1">
      <Link
        href="/se-busca?view=busca"
        aria-current={view === "busca" ? "page" : undefined}
        className={cn(base, view === "busca" ? "bg-white text-zinc-900 shadow-sm" : "text-zinc-500 hover:text-zinc-800")}
      >
        <Search className="h-4 w-4" />
        🔍 Se busca
      </Link>
      <Link
        href="/se-busca?view=reconoces"
        data-tour="sebusca-tab-reconoces"
        aria-current={view === "reconoces" ? "page" : undefined}
        className={cn(base, view === "reconoces" ? "bg-white text-zinc-900 shadow-sm" : "text-zinc-500 hover:text-zinc-800")}
      >
        <MapPin className="h-4 w-4" />
        📍 ¿La reconoces?
      </Link>
    </div>
  );
}
