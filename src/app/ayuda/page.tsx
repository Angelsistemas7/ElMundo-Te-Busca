import { Suspense } from "react";
import nextDynamic from "next/dynamic";
import { HeartHandshake } from "lucide-react";
import { getAidPointsPage, getCommentsForEntities, getHeroes, getNewsItems } from "@/lib/data";
import { getRecentQuakes } from "@/lib/usgs";
import { isAdmin } from "@/lib/admin";
import { getActiveCountry } from "@/lib/country-server";
import { getCountry } from "@/lib/countries";
import { AID_POINT_TYPE_LABEL, type AidPointType } from "@/lib/types";
import { clampPageSize } from "@/lib/utils";
import { AidPointCard } from "@/components/AidPointCard";
const RegisterAidPointButton = nextDynamic(() =>
  import("@/components/RegisterAidPointButton").then((m) => m.RegisterAidPointButton),
);
import { Pagination } from "@/components/Pagination";
import { PageSizeSelect } from "@/components/PageSizeSelect";
import { FilterModal, type FilterField } from "@/components/FilterModal";
import { AyudaExtras } from "@/components/AyudaExtras";
import { AyudaTabs } from "@/components/AyudaTabs";
import { PageHeader } from "@/components/PageHeader";
import { PullToRefresh } from "@/components/PullToRefresh";
import { CardGridSkeleton } from "@/components/ListSkeletons";
import { withServerFallback } from "@/lib/error-reporting";

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
      kind: "chips",
      key: "type",
      label: "Tipo de ayuda",
      defaultValue: "all",
      options: TYPE_CHIPS,
    },
    {
      kind: "chips",
      key: "avail",
      label: "Disponibilidad",
      defaultValue: "0",
      options: [
        { value: "0", label: "Todos los puntos" },
        { value: "1", label: "Solo disponibles" },
      ],
    },
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

// Grilla principal, separada del resto (ver comentario en ComunidadPage: mismo
// patrón) para que no espere a los héroes/sismos/noticias curadas, que viven
// en su propio Suspense más abajo.
async function AidPointsGrid({
  country,
  type,
  availOnly,
  estado,
  dateFrom,
  dateTo,
  page,
  pageSize,
}: {
  country: string;
  type: AidPointType | "all";
  availOnly: boolean;
  estado: string;
  dateFrom: string | undefined;
  dateTo: string | undefined;
  page: number;
  pageSize: number;
}) {
  // Antes: `getAidPoints()` traía la tabla ENTERA sin límite ni paginación en
  // cada visita. Ahora pagina de verdad (10/20/50 a elegir), en vivo.
  const { items: points, total } = await getAidPointsPage(
    { country, type, availOnly, estado, dateFrom, dateTo },
    page,
    pageSize,
  );

  return points.length === 0 ? (
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
  );
}

// Héroes, sismos recientes (API externa USGS) y noticias curadas: contenido
// secundario que puede tardar más (llamada externa) sin tapar la grilla.
async function AyudaExtrasSection({ country }: { country: string }) {
  const [heroes, quakes, curatedAyuda, admin] = await Promise.all([
    withServerFallback("page.aid.heroes", getHeroes(country), []),
    withServerFallback("page.aid.quakes", getRecentQuakes(country), []),
    withServerFallback("page.aid.news", getNewsItems("ayuda", country), []),
    withServerFallback("page.aid.admin", isAdmin(), false),
  ]);
  // Independientes entre sí: en paralelo en vez de una detrás de otra.
  const [heroComments, newsComments] = await Promise.all([
    withServerFallback(
      "page.aid.hero-comments",
      getCommentsForEntities("hero", heroes.map((h) => h.id)),
      {},
    ),
    withServerFallback(
      "page.aid.news-comments",
      getCommentsForEntities("news_item", curatedAyuda.map((n) => n.id)),
      {},
    ),
  ]);

  return (
    <AyudaExtras
      curatedAyuda={curatedAyuda}
      newsComments={newsComments}
      heroes={heroes}
      heroComments={heroComments}
      quakes={quakes}
      isAdmin={admin}
      country={country}
    />
  );
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

  const currentParams: Record<string, string> = {};
  if (type !== "all") currentParams.type = type;
  if (availOnly) currentParams.avail = "1";
  if (estado !== "all") currentParams.estado = estado;
  if (dateFrom) currentParams.dateFrom = dateFrom;
  if (dateTo) currentParams.dateTo = dateTo;
  if (pageSize !== 10) currentParams.pageSize = String(pageSize);

  const gridKey = JSON.stringify({ type, availOnly, estado, dateFrom, dateTo, page, pageSize });

  return (
    <PullToRefresh>
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

      <div className="mb-4 flex items-center justify-end gap-2">
        <FilterModal basePath="/ayuda" currentParams={currentParams} fields={FILTER_FIELDS} />
        <PageSizeSelect value={pageSize} />
      </div>

      <Suspense key={gridKey} fallback={<CardGridSkeleton variant="photo" />}>
        <AidPointsGrid
          country={country}
          type={type}
          availOnly={availOnly}
          estado={estado}
          dateFrom={dateFrom}
          dateTo={dateTo}
          page={page}
          pageSize={pageSize}
        />
      </Suspense>

      <Suspense fallback={<div className="mt-8 h-64 animate-pulse rounded-3xl bg-zinc-100" />}>
        <AyudaExtrasSection country={country} />
      </Suspense>
    </div>
    </PullToRefresh>
  );
}
