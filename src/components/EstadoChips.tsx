import Link from "next/link";
import { MapPin } from "lucide-react";
import { getCountsByEstado } from "@/lib/data";

// Acceso rápido por estado/región, con el conteo de personas registradas.
export async function EstadoChips({ country = "ve" }: { country?: string }) {
  const counts = await getCountsByEstado(country);
  const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  if (entries.length === 0) return null;

  return (
    <section>
      <h2 className="mb-3 flex items-center gap-2 font-bold text-zinc-900">
        <MapPin className="h-4.5 w-4.5 text-zinc-500" />
        Por estado
      </h2>
      <div className="flex flex-wrap gap-2">
        {entries.map(([estado, count]) => (
          <Link
            key={estado}
            href={`/se-busca?estado=${encodeURIComponent(estado)}`}
            className="press group flex items-center gap-2 rounded-full border border-zinc-200 bg-white px-3.5 py-1.5 text-sm font-medium text-zinc-700 transition hover:border-brand-400 hover:bg-brand-50"
          >
            {estado}
            <span className="rounded-full bg-zinc-100 px-1.5 text-xs font-semibold text-zinc-500 group-hover:bg-brand-100 group-hover:text-brand-700">
              {count.toLocaleString("es-VE")}
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}
