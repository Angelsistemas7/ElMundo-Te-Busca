import { Suspense } from "react";
import nextDynamic from "next/dynamic";
import { MapPinned } from "lucide-react";
import { getMarchesPage } from "@/lib/data";
import { getActiveCountry } from "@/lib/country-server";
import { clampPageSize } from "@/lib/utils";
import { MarchCard } from "@/components/MarchCard";
const RegisterMarchButton = nextDynamic(() =>
  import("@/components/RegisterMarchButton").then((m) => m.RegisterMarchButton),
);
import { CommunityTabs } from "@/components/CommunityTabs";
import { EmptyState } from "@/components/EmptyState";
import { Pagination } from "@/components/Pagination";
import { PageSizeSelect } from "@/components/PageSizeSelect";
import { FilterModal, type FilterField } from "@/components/FilterModal";
import { PageHeader } from "@/components/PageHeader";
import { PullToRefresh } from "@/components/PullToRefresh";
import { CardGridSkeleton } from "@/components/ListSkeletons";

export const dynamic = "force-dynamic";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;
const str = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
const num = (v: string | string[] | undefined) => {
  const s = str(v);
  const n = s ? Number(s) : NaN;
  return Number.isFinite(n) ? n : undefined;
};

const SHOWS = ["all", "upcoming", "past"] as const;
type Show = (typeof SHOWS)[number];

const buildFilterFields = (upcomingCount: number, pastCount: number): FilterField[] => [
  {
    kind: "chips",
    key: "show",
    label: "Mostrar",
    defaultValue: "all",
    options: [
      { value: "all", label: `Todas (${upcomingCount + pastCount})` },
      { value: "upcoming", label: `Próximas (${upcomingCount})` },
      { value: "past", label: `Finalizadas (${pastCount})` },
    ],
  },
  { kind: "dateRange", fromKey: "dateFrom", toKey: "dateTo", label: "Salida entre" },
];

// Filtro (sus etiquetas usan los conteos reales) + grilla: separado del
// cascarón (encabezado, botón de registrar) para que ese cascarón aparezca de
// inmediato al navegar — mismo patrón que Comunidad/Ayuda/Se busca/etc.
async function CaravanasContent({
  show,
  dateFrom,
  dateTo,
  page,
  pageSize,
  country,
  currentParams,
}: {
  show: Show;
  dateFrom: string | undefined;
  dateTo: string | undefined;
  page: number;
  pageSize: number;
  country: string;
  currentParams: Record<string, string>;
}) {
  const {
    items: marches,
    total,
    upcomingCount,
    pastCount,
  } = await getMarchesPage(show, page, pageSize, dateFrom, dateTo, country);

  return (
    <>
      <div className="mb-4 flex items-center justify-end gap-2">
        <FilterModal
          basePath="/caravanas"
          currentParams={currentParams}
          fields={buildFilterFields(upcomingCount, pastCount)}
        />
        <PageSizeSelect value={pageSize} />
      </div>

      {marches.length === 0 ? (
        <EmptyState
          icon={MapPinned}
          title={total === 0 ? "Aún no hay caravanas" : "No hay caravanas en esta vista"}
          description="Organiza una ida en grupo a la zona afectada: publica el punto de salida y la hora."
        />
      ) : (
        <>
          <div className="animate-rise grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {marches.map((m) => (
              <MarchCard key={m.id} march={m} />
            ))}
          </div>
          <div className="mt-6">
            <Pagination page={page} pageSize={pageSize} total={total} />
          </div>
        </>
      )}
    </>
  );
}

export default async function CaravanasPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const raw = str(sp.show);
  const show: Show = SHOWS.includes(raw as Show) ? (raw as Show) : "all";
  const dateFrom = str(sp.dateFrom);
  const dateTo = str(sp.dateTo);
  const page = num(sp.page) ?? 1;
  const pageSize = clampPageSize(num(sp.pageSize));
  const country = await getActiveCountry();

  const currentParams: Record<string, string> = {};
  if (show !== "all") currentParams.show = show;
  if (dateFrom) currentParams.dateFrom = dateFrom;
  if (dateTo) currentParams.dateTo = dateTo;
  if (pageSize !== 10) currentParams.pageSize = String(pageSize);

  const contentKey = JSON.stringify({ show, dateFrom, dateTo, page, pageSize });

  return (
    <PullToRefresh>
    <div className="mx-auto max-w-6xl px-4 py-6">
      <CommunityTabs />
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <PageHeader
          icon={MapPinned}
          title={
            <>
              Caravanas <span className="text-brand-500">benéficas</span>
            </>
          }
          description="Coordina idas en grupo a la zona afectada: brigadas, caravanas de ayuda y traslados solidarios. Publica el punto de salida y la hora para que la gente vaya junta y segura."
        />
        <RegisterMarchButton country={country} />
      </div>

      <Suspense key={contentKey} fallback={<CardGridSkeleton variant="text" />}>
        <CaravanasContent
          show={show}
          dateFrom={dateFrom}
          dateTo={dateTo}
          page={page}
          pageSize={pageSize}
          country={country}
          currentParams={currentParams}
        />
      </Suspense>
    </div>
    </PullToRefresh>
  );
}
