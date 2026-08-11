import Link from "next/link";
import type { DashboardStats as Stats } from "@/lib/data";
import { AnimatedNumber } from "./AnimatedNumber";
import { SwipeHintNestedOnce } from "./SwipeHint";

type Tone = "rose" | "amber" | "emerald" | "sky" | "violet" | "zinc";

const TONES: Record<Tone, string> = {
  rose: "from-rose-50 to-white border-rose-200 text-rose-700",
  amber: "from-amber-50 to-white border-amber-200 text-amber-700",
  emerald: "from-emerald-50 to-white border-emerald-200 text-emerald-700",
  sky: "from-sky-50 to-white border-sky-200 text-sky-700",
  violet: "from-violet-50 to-white border-violet-200 text-violet-700",
  zinc: "from-zinc-50 to-white border-zinc-200 text-zinc-700",
};

// Cada cifra es un enlace a su filtro o sección. En móvil van en una fila que
// se desliza a mano (con un pequeño empujoncito al cargar, para insinuar que
// se puede deslizar); en pantallas grandes forman la rejilla de 8.
function Card({ value, label, tone, href }: { value: number; label: string; tone: Tone; href: string }) {
  return (
    <Link
      href={href}
      className={`tap-card block w-28 shrink-0 rounded-2xl border bg-gradient-to-b p-2.5 text-center sm:w-auto sm:p-3 ${TONES[tone]}`}
    >
      <div className="text-xl font-bold tabular-nums sm:text-3xl">
        <AnimatedNumber value={value} />
      </div>
      <div className="mt-0.5 text-[10px] font-medium leading-tight text-zinc-600 sm:text-xs">{label}</div>
    </Link>
  );
}

export function DashboardStats({ stats }: { stats: Stats }) {
  const cards: { value: number; label: string; tone: Tone; href: string }[] = [
    { value: stats.desaparecidos, label: "Desaparecidos", tone: "rose", href: "/?status=por_localizar" },
    { value: stats.enHospitales, label: "En hospitales", tone: "amber", href: "/?status=hospitalizado" },
    { value: stats.aSalvo, label: "A salvo", tone: "emerald", href: "/?status=localizado" },
    { value: stats.ninos, label: "Niños", tone: "sky", href: "/?maxAge=11" },
    { value: stats.fallecidos, label: "Fallecidos", tone: "zinc", href: "/?status=fallecido" },
    { value: stats.denuncias, label: "Denuncias", tone: "violet", href: "/denuncias" },
    { value: stats.necesidades, label: "Necesidades", tone: "amber", href: "/comunidad?type=necesito" },
    { value: stats.voluntarios, label: "Ofrecen ayuda", tone: "emerald", href: "/voluntarios" },
  ];

  return (
    <section>
      {/* Móvil: fila deslizable a mano. Escritorio: rejilla de 8. */}
      <SwipeHintNestedOnce
        outerClassName="no-scrollbar -mx-4 overflow-x-auto px-4 sm:mx-0 sm:overflow-visible sm:px-0"
        innerClassName="flex w-max gap-2 sm:w-auto sm:[animation:none] sm:grid sm:grid-cols-4 sm:gap-3 lg:grid-cols-8"
      >
        {cards.map((c) => (
          <Card key={c.label} {...c} />
        ))}
      </SwipeHintNestedOnce>
    </section>
  );
}
