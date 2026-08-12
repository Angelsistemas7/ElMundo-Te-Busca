import { Suspense } from "react";
import Link from "next/link";
import { HeartHandshake, MapPinned, ShieldCheck, Users2 } from "lucide-react";
import { getAidPoints, getDashboardStats, getStats } from "@/lib/data";
import { getCrisisStats, type CrisisStat } from "@/lib/news";
import { getActiveCountry } from "@/lib/country-server";
import { COUNTRIES, type CountryConfig, type CountryCode } from "@/lib/countries";
import { timeAgo } from "@/lib/utils";
import { AnimatedNumber } from "./AnimatedNumber";
import { ExternalLinkGuard } from "./ExternalLinkGuard";
import { CountrySwitcher } from "./CountrySwitcher";

function StatRow({
  icon: Icon,
  value,
  label,
  tone,
}: {
  icon: typeof Users2;
  value: number;
  label: string;
  tone: "brand" | "emerald" | "violet" | "sky";
}) {
  const tones = {
    brand: "bg-brand-50 text-brand-700",
    emerald: "bg-emerald-50 text-emerald-700",
    violet: "bg-violet-50 text-violet-700",
    sky: "bg-sky-50 text-sky-700",
  } as const;
  return (
    <div className="flex items-center gap-3">
      <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${tones[tone]}`}>
        <Icon className="h-4.5 w-4.5" />
      </span>
      <div>
        <div className="text-lg font-bold tabular-nums leading-tight text-navy-700">
          <AnimatedNumber value={value} />
        </div>
        <div className="text-xs leading-tight text-zinc-500">{label}</div>
      </div>
    </div>
  );
}

// Cita chica y sin protagonismo: a diferencia de las cifras de la plataforma
// (exactas, de nuestra propia base de datos), esta es la lectura de UN
// titular real de prensa — puede quedar desactualizada o no coincidir con
// otra fuente. Por eso va más pequeña, sin animación grande, y siempre con su
// fuente y fecha a la vista en vez de presentarse como un dato oficial.
function CrisisStatLine({ stat }: { stat: CrisisStat }) {
  return (
    <p className="text-xs leading-relaxed text-zinc-500">
      <span className="font-semibold text-zinc-700">{stat.value.toLocaleString("es-VE")}</span>{" "}
      {stat.label.toLowerCase()}
      {" — "}
      <ExternalLinkGuard href={stat.sourceUrl} className="inline text-zinc-400 hover:text-brand-700 hover:underline">
        {stat.source}
        {stat.asOf && `, ${timeAgo(stat.asOf)}`}
      </ExternalLinkGuard>
    </p>
  );
}

// Bloque estático (sin fetch, instantáneo): cifra curada a mano por país en
// `countries.ts`. Es el fallback del Suspense de abajo Y lo que se muestra si
// la extracción en vivo de prensa no trae nada útil.
function StaticQuakeStat({ active }: { active: CountryConfig }) {
  return (
    <div className="mt-4 space-y-1 border-t border-zinc-100 pt-3">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-400">
        Sismo M{active.quakeInfo.magnitude}
      </p>
      <p className="text-xs leading-relaxed text-zinc-500">
        <span className="font-semibold text-zinc-700">{active.quakeInfo.deaths.toLocaleString("es")}</span>{" "}
        fallecidos, <span className="font-semibold text-zinc-700">{active.quakeInfo.injured.toLocaleString("es")}</span>{" "}
        heridos — {active.quakeInfo.sourceName}
      </p>
    </div>
  );
}

// Una cifra corroborada por varias fuentes puede seguir citando un titular de
// semanas atrás si nadie publicó una cifra distinta desde entonces (a
// propósito: ver `extractCrisisFigures` en `lib/news.ts`, prioriza
// corroboración sobre novedad). Es honesto, pero una fecha muy vieja en el
// banner del inicio da la impresión de que el sitio no se actualiza. Pasado
// este límite, mejor caer al bloque estático curado (sin fecha de prensa) que
// mostrar una cita de hace más de un mes como si fuera "según prensa reciente".
const CRISIS_STAT_FRESHNESS_MS = 30 * 24 * 60 * 60 * 1000;
function isFreshStat(stat: CrisisStat): boolean {
  if (!stat.asOf) return true; // sin fecha: no hay forma de juzgar antigüedad, se deja pasar
  const publishedAt = new Date(stat.asOf).getTime();
  return Number.isFinite(publishedAt) && Date.now() - publishedAt <= CRISIS_STAT_FRESHNESS_MS;
}

// Extraído en su propio Suspense: GDELT puede tardar varios segundos (o
// agotar su tiempo de espera y caer a GNews, otros varios segundos más) en
// una caché fría. Antes esto bloqueaba TODO el hero (país, cifras propias,
// botones) hasta que la prensa respondiera; ahora el hero aparece de
// inmediato con la cifra curada estática y esta franja se actualiza sola
// cuando la extracción en vivo termine.
async function CrisisStatsPanel({ country }: { country: CountryCode }) {
  const active = COUNTRIES[country];
  const crisisStats = await getCrisisStats(country);
  // `news.ts` ya filtra por país (ver countries.ts), pero de todos modos el
  // banner sigue mostrando SOLO la cifra curada y corroborada de `countries.ts`
  // para el país activo, no la extracción en vivo de prensa: esta última es
  // más ruidosa (depende de que OpenAI/GDELT acierten un titular reciente) y
  // el sitio ya tiene una cifra verificada a mano para cada país. La
  // extracción en vivo sigue alimentando el carrusel de noticias, donde sí
  // tiene sentido (títulos reales, no un número resumen).
  const crisisRows =
    country === "ve"
      ? [crisisStats.fallecidos, crisisStats.heridos, crisisStats.desaparecidos, crisisStats.afectados]
          .filter((s): s is CrisisStat => Boolean(s))
          .filter(isFreshStat)
      : [];
  if (crisisRows.length === 0) return <StaticQuakeStat active={active} />;
  return (
    <div className="mt-4 space-y-1.5 border-t border-zinc-100 pt-3">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-400">
        Según prensa reciente
      </p>
      {crisisRows.map((stat) => (
        <CrisisStatLine key={stat.label} stat={stat} />
      ))}
    </div>
  );
}

export async function HomeHero() {
  const country = await getActiveCountry();
  const [stats, dashboardStats, aidPoints] = await Promise.all([
    getStats(country),
    getDashboardStats(country),
    getAidPoints(country),
  ]);
  const active = COUNTRIES[country];

  return (
    <section className="reveal-up relative overflow-hidden rounded-3xl border-2 border-navy-700 bg-white">
      {/* Fondo ilustrado: sin foto (no hay una con derechos de uso todavía),
          formas suaves en los colores de marca más el corazón del logo como
          marca de agua, para que el hero no se sienta vacío. */}
      <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -right-24 -top-24 h-72 w-72 rounded-full bg-gold-100" />
        <div className="absolute -bottom-32 right-10 h-64 w-64 rounded-full bg-brand-50" />
        <svg
          className="absolute -right-10 top-1/2 h-[22rem] w-[22rem] -translate-y-1/2 text-navy-700/[0.05]"
          viewBox="0 0 1080 1080"
          fill="currentColor"
        >
          <path d="M540,940 C260,760 90,560 90,360 C90,220 200,110 340,110 C420,110 490,150 540,220 C590,150 660,110 740,110 C880,110 990,220 990,360 C990,560 820,760 540,940 Z" />
        </svg>
      </div>

      <div className="relative grid gap-6 p-6 sm:p-8 lg:grid-cols-[1fr_320px] lg:gap-8">
        <div className="flex flex-col justify-center">
          <div className="mb-4" data-tour="home-country">
            <CountrySwitcher active={country} />
          </div>
          <h1 className="font-heading text-3xl font-bold leading-[1.1] tracking-tight text-navy-700 sm:text-4xl lg:text-[2.75rem]">
            Cuando el mundo se detiene,{" "}
            <span className="text-brand-500">la solidaridad nos encuentra.</span>
          </h1>
          <p className="mt-4 max-w-xl text-zinc-600">
            Plataforma ciudadana de ayuda y búsqueda ante emergencias en cualquier parte del mundo.
            Activa ahora para el terremoto en {active.name}, {active.quakeInfo.date}.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              href="/voluntarios/guia"
              className="press rounded-full bg-brand-500 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-600"
            >
              ¿Cómo puedo ayudar?
            </Link>
            <Link
              href="/mapa"
              className="press flex items-center gap-2 rounded-full border border-navy-700 bg-white px-5 py-2.5 text-sm font-semibold text-navy-700 transition hover:bg-navy-50"
            >
              Ver mapa EN VIVO
              <span className="h-2 w-2 animate-pulse rounded-full bg-rose-500" />
            </Link>
          </div>
        </div>

        <div className="rounded-2xl border border-zinc-200 bg-white/90 p-5 backdrop-blur-sm">
          <h2 className="text-sm font-bold uppercase tracking-wide text-navy-700">
            Juntos somos más fuertes
          </h2>
          <div className="mt-4 flex flex-col gap-4">
            <StatRow icon={Users2} value={stats.registered} label="Personas buscadas" tone="sky" />
            <StatRow icon={ShieldCheck} value={stats.located} label="Reportes verificados" tone="emerald" />
            <StatRow
              icon={HeartHandshake}
              value={dashboardStats.voluntarios}
              label="Voluntarios activos"
              tone="violet"
            />
            <StatRow icon={MapPinned} value={aidPoints.length} label="Puntos de ayuda" tone="brand" />
          </div>
          <p className="mt-4 flex items-center justify-end gap-1.5 text-right text-xs text-zinc-400">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
            Cifras en vivo
          </p>

          <Suspense fallback={<StaticQuakeStat active={active} />}>
            <CrisisStatsPanel country={country} />
          </Suspense>
        </div>
      </div>
    </section>
  );
}
