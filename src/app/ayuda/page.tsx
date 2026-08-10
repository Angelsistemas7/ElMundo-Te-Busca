import Link from "next/link";
import nextDynamic from "next/dynamic";
import { HeartHandshake } from "lucide-react";
import { getAidPointsPage, getCommentsForEntities, getHeroes, getNewsItems } from "@/lib/data";
import { getRecentQuakes } from "@/lib/usgs";
import { isAdmin } from "@/lib/admin";
import { getActiveCountry } from "@/lib/country-server";
import { getCountry } from "@/lib/countries";
import { AID_POINT_TYPE_LABEL, type AidPointType } from "@/lib/types";
import { cn, clampPageSize } from "@/lib/utils";
import { AidPointCard } from "@/components/AidPointCard";
const RegisterAidPointButton = nextDynamic(() =>
  import("@/components/RegisterAidPointButton").then((m) => m.RegisterAidPointButton),
);
import { SwipeHintRow } from "@/components/SwipeHint";
import { Pagination } from "@/components/Pagination";
import { PageSizeSelect } from "@/components/PageSizeSelect";
import { FilterModal, type FilterField } from "@/components/FilterModal";
import { AyudaExtras } from "@/components/AyudaExtras";
import { AyudaTabs } from "@/components/AyudaTabs";
import { PageHeader } from "@/components/PageHeader";

export const dynamic = "force-dynamic";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;
const str = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
const num = (v: string | string[] | undefined) => {
  const s = str(v);
  const n = s ? Number(s) : NaN;
  return Number.isFinite(n) ? n : undefined;
};

const TYPE_EMOJI: Record<AidPointType, string> = {
  comida: "🍲",
  agua: "💧",
  medicina: "💊",
  refugio: "🏠",
  alojamiento: "🛏️",
  ropa: "👕",
  otro: "📦",
};

const TYPE_CHIPS: { value: AidPointType | "all"; label: string }[] = [
  { value: "all", label: "Todos" },
  ...(Object.keys(AID_POINT_TYPE_LABEL) as AidPointType[]).map((t) => ({
    value: t,
    label: `${TYPE_EMOJI[t]} ${AID_POINT_TYPE_LABEL[t]}`,
  })),
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
    { kind: "dateRange", fromKey: "dateFrom", toKey: "dateTo", label: "Registrado entre" },
  ];
}

export default async function AyudaPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const country = await getActiveCountry();
  const FILTER_FIELDS = buildFilterFields(getCountry(country).regions);
  const type = (str(sp.type) as AidPointType | "all") ?? "all";
  const availOnly = str(sp.avail) === "1";
  const estado = str(sp.estado) ?? "all";
  const dateFrom = str(sp.dateFrom);
  const dateTo = str(sp.dateTo);
  const page = num(sp.page) ?? 1;
  const pageSize = clampPageSize(num(sp.pageSize));

  // Antes: `getAidPoints()` traía la tabla ENTERA sin límite ni paginación en
  // cada visita. Ahora pagina de verdad (10/20/50 a elegir), en vivo.
  const [{ items: points, total }, heroes, quakes, curatedAyuda, admin] = await Promise.all([
    getAidPointsPage({ country, type, availOnly, estado, dateFrom, dateTo }, page, pageSize),
    getHeroes(),
    getRecentQuakes(country),
    // Si la tabla aún no existe (esquema sin migrar), no rompemos la página.
    getNewsItems("ayuda").catch(() => []),
    isAdmin(),
  ]);
  // Independientes entre sí: en paralelo en vez de una detrás de otra.
  const [heroComments, newsComments] = await Promise.all([
    getCommentsForEntities("hero", heroes.map((h) => h.id)),
    getCommentsForEntities("news_item", curatedAyuda.map((n) => n.id)),
  ]);

  const chipHref = (t: AidPointType | "all") => {
    const params = new URLSearchParams();
    if (t !== "all") params.set("type", t);
    if (availOnly) params.set("avail", "1");
    if (estado !== "all") params.set("estado", estado);
    if (dateFrom) params.set("dateFrom", dateFrom);
    if (dateTo) params.set("dateTo", dateTo);
    if (pageSize !== 10) params.set("pageSize", String(pageSize));
    const qs = params.toString();
    return qs ? `/ayuda?${qs}` : "/ayuda";
  };
  const availHref = () => {
    const params = new URLSearchParams();
    if (type !== "all") params.set("type", type);
    if (!availOnly) params.set("avail", "1");
    if (estado !== "all") params.set("estado", estado);
    if (dateFrom) params.set("dateFrom", dateFrom);
    if (dateTo) params.set("dateTo", dateTo);
    if (pageSize !== 10) params.set("pageSize", String(pageSize));
    const qs = params.toString();
    return qs ? `/ayuda?${qs}` : "/ayuda";
  };

  const currentParams: Record<string, string> = {};
  if (type !== "all") currentParams.type = type;
  if (availOnly) currentParams.avail = "1";
  if (estado !== "all") currentParams.estado = estado;
  if (dateFrom) currentParams.dateFrom = dateFrom;
  if (dateTo) currentParams.dateTo = dateTo;
  if (pageSize !== 10) currentParams.pageSize = String(pageSize);

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <AyudaTabs />
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <PageHeader
          icon={HeartHandshake}
          title={
            <>
              Puntos de <span className="text-brand-500">ayuda</span>
            </>
          }
          description="Donatones de comida, agua, refugios y medicinas. Registra un punto físico real con foto y datos de contacto para que la comunidad lo verifique y la ayuda llegue a donde se necesita."
        />
        <RegisterAidPointButton country={country} />
      </div>

      <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <SwipeHintRow className="no-scrollbar flex gap-2 overflow-x-auto pb-1">
          {TYPE_CHIPS.map((c) => (
            <Link
              key={c.value}
              href={chipHref(c.value)}
              className={cn(
                "press whitespace-nowrap rounded-full border px-3 py-1 text-sm font-medium transition",
                type === c.value
                  ? "border-brand-400 bg-brand-50 text-brand-700"
                  : "border-zinc-200 bg-white text-zinc-600 hover:border-zinc-300",
              )}
            >
              {c.label}
            </Link>
          ))}
        </SwipeHintRow>
        <Link
          href={availHref()}
          className={cn(
            "press inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-3 py-1 text-sm font-medium transition",
            availOnly
              ? "border-emerald-400 bg-emerald-50 text-emerald-700"
              : "border-zinc-200 bg-white text-zinc-600 hover:border-zinc-300",
          )}
        >
          {availOnly ? "✓ " : ""}Solo disponibles
        </Link>
      </div>

      <div className="mb-4 flex items-center justify-end gap-2">
        <FilterModal basePath="/ayuda" currentParams={currentParams} fields={FILTER_FIELDS} />
        <PageSizeSelect value={pageSize} />
      </div>

      {points.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-zinc-300 bg-white py-16 text-center text-zinc-500">
          {total === 0
            ? "Aún no hay puntos registrados. Sé el primero en publicar uno."
            : "Ningún punto coincide con el filtro. Prueba con otro recurso o quita “solo disponibles”."}
        </div>
      ) : (
        <>
          <div className="animate-rise grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {points.map((point) => (
              <AidPointCard key={point.id} point={point} />
            ))}
          </div>
          <div className="mt-6">
            <Pagination page={page} pageSize={pageSize} total={total} />
          </div>
        </>
      )}

      <AyudaExtras
        curatedAyuda={curatedAyuda}
        newsComments={newsComments}
        heroes={heroes}
        heroComments={heroComments}
        quakes={quakes}
        isAdmin={admin}
      />
    </div>
  );
}
