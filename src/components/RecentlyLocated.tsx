import Link from "next/link";
import { CheckCircle2, HeartPulse } from "lucide-react";
import type { Person } from "@/lib/types";
import { timeAgo } from "@/lib/utils";

// "Localizados recientemente": personas que estaban desaparecidas y ya fueron
// ubicadas. Da esperanza e incentiva a la gente a usar la plataforma.
export function RecentlyLocated({ persons }: { persons: Person[] }) {
  if (persons.length === 0) return null;

  return (
    <section className="rounded-2xl border border-emerald-200 bg-emerald-50/50 p-4 sm:p-5">
      <h2 className="flex items-center gap-2 font-bold text-emerald-800">
        <CheckCircle2 className="h-5 w-5" />
        Localizados recientemente
      </h2>
      <p className="mt-1 text-sm text-emerald-700/80">
        Personas que estaban desaparecidas y ya fueron ubicadas. Toca para ver su ficha.
      </p>
      {/* Una sola fila que se desliza de lado — antes era una cuadrícula que se
          partía en 1/2/3 columnas (varias filas) según el tamaño de pantalla. */}
      <ul className="no-scrollbar mt-3 flex snap-x snap-mandatory gap-2 overflow-x-auto scroll-smooth pb-1">
        {persons.map((p) => {
          const name = `${p.firstName} ${p.lastName}`.trim() || "Persona sin identificar";
          const hospital = p.status === "hospitalizado";
          return (
            <li key={p.id} className="w-64 shrink-0 snap-start">
              <Link
                href={`/persona/${p.id}`}
                className="press flex items-center gap-2.5 rounded-xl border border-emerald-100 bg-white px-3 py-2.5 transition hover:border-emerald-300 hover:shadow-sm"
              >
                <span
                  className={
                    hospital
                      ? "flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-700"
                      : "flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-700"
                  }
                >
                  {hospital ? <HeartPulse className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold text-zinc-900">{name}</span>
                  <span className="block text-xs text-zinc-500">
                    {hospital ? "Ahora en un hospital" : "Ahora a salvo"} · {timeAgo(p.updatedAt)}
                  </span>
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
