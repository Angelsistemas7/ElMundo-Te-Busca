import Link from "next/link";
import nextDynamic from "next/dynamic";
import { PawPrint, Search } from "lucide-react";
import { getCommentsForEntities, getPets, type PetSort } from "@/lib/data";
import { ESTADOS, PET_STATUS_EMOJI, PET_STATUS_LABEL, type PetStatus } from "@/lib/types";
import { cn, clampPageSize } from "@/lib/utils";
import { PetCard } from "@/components/PetCard";
const RegisterPetButton = nextDynamic(() =>
  import("@/components/RegisterPetButton").then((m) => m.RegisterPetButton),
);
import { EmptyState } from "@/components/EmptyState";
import { SwipeHintRow } from "@/components/SwipeHint";
import { Pagination } from "@/components/Pagination";
import { PageSizeSelect } from "@/components/PageSizeSelect";
import { FilterModal, type FilterField } from "@/components/FilterModal";
import { PageHeader } from "@/components/PageHeader";
import { PullToRefresh } from "@/components/PullToRefresh";

export const dynamic = "force-dynamic";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;
const str = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
const num = (v: string | string[] | undefined) => {
  const s = str(v);
  const n = s ? Number(s) : NaN;
  return Number.isFinite(n) ? n : undefined;
};

const FILTERS: { value: PetStatus | "all"; label: string }[] = [
  { value: "all", label: "Todas" },
  ...(Object.keys(PET_STATUS_LABEL) as PetStatus[]).map((s) => ({
    value: s,
    label: `${PET_STATUS_EMOJI[s]} ${PET_STATUS_LABEL[s]}`,
  })),
];

const FILTER_FIELDS: FilterField[] = [
  {
    kind: "select",
    key: "estado",
    label: "Estado (región)",
    placeholder: "Todos",
    options: ESTADOS.map((e) => ({ value: e, label: e })),
  },
  {
    kind: "chips",
    key: "sort",
    label: "Ordenar por",
    defaultValue: "recent",
    options: [
      { value: "recent", label: "Más recientes" },
      { value: "oldest", label: "Más antiguas" },
    ],
  },
  { kind: "dateRange", fromKey: "dateFrom", toKey: "dateTo", label: "Registrado entre" },
];

export default async function MascotasPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const status = (str(sp.status) as PetStatus | "all") ?? "all";
  const q = str(sp.q);
  const estado = str(sp.estado) ?? "all";
  const sort = (str(sp.sort) as PetSort) ?? "recent";
  const dateFrom = str(sp.dateFrom);
  const dateTo = str(sp.dateTo);
  const page = num(sp.page) ?? 1;
  const pageSize = clampPageSize(num(sp.pageSize));

  const { items: pets, total } = await getPets(
    { status, search: q, estado, dateFrom, dateTo },
    page,
    pageSize,
    sort,
  );
  const commentsByPet = await getCommentsForEntities("pet", pets.map((p) => p.id));

  const statusHref = (s: PetStatus | "all") => {
    const params = new URLSearchParams();
    if (s !== "all") params.set("status", s);
    if (sort !== "recent") params.set("sort", sort);
    if (estado !== "all") params.set("estado", estado);
    if (dateFrom) params.set("dateFrom", dateFrom);
    if (dateTo) params.set("dateTo", dateTo);
    if (q) params.set("q", q);
    if (pageSize !== 10) params.set("pageSize", String(pageSize));
    const qs = params.toString();
    return qs ? `/mascotas?${qs}` : "/mascotas";
  };

  const currentParams: Record<string, string> = {};
  if (status !== "all") currentParams.status = status;
  if (sort !== "recent") currentParams.sort = sort;
  if (estado !== "all") currentParams.estado = estado;
  if (dateFrom) currentParams.dateFrom = dateFrom;
  if (dateTo) currentParams.dateTo = dateTo;
  if (q) currentParams.q = q;
  if (pageSize !== 10) currentParams.pageSize = String(pageSize);

  return (
    <PullToRefresh>
    <div className="mx-auto max-w-5xl px-4 py-6">
      <div className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <PageHeader
          icon={PawPrint}
          title="Mascotas"
          description="¿Perdiste o encontraste una mascota tras el terremoto? Repórtala con foto y ubicación para reunirla con su familia."
        />
        <div className="shrink-0">
          <RegisterPetButton />
        </div>
      </div>

      <form action="/mascotas" className="mb-3 flex gap-2">
        {status !== "all" && <input type="hidden" name="status" value={status} />}
        {sort !== "recent" && <input type="hidden" name="sort" value={sort} />}
        {estado !== "all" && <input type="hidden" name="estado" value={estado} />}
        {dateFrom && <input type="hidden" name="dateFrom" value={dateFrom} />}
        {dateTo && <input type="hidden" name="dateTo" value={dateTo} />}
        {pageSize !== 10 && <input type="hidden" name="pageSize" value={pageSize} />}
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
          <input
            name="q"
            defaultValue={q ?? ""}
            placeholder="Buscar por nombre, ciudad o zona..."
            className="w-full rounded-xl border border-zinc-300 bg-white py-2.5 pl-10 pr-3 text-base outline-none sm:text-sm focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
          />
        </div>
        <button type="submit" className="press rounded-xl bg-zinc-900 px-4 text-sm font-semibold text-white transition hover:bg-zinc-800">
          Buscar
        </button>
      </form>

      <SwipeHintRow className="no-scrollbar mb-4 flex gap-2 overflow-x-auto pb-1">
        {FILTERS.map((f) => (
          <Link
            key={f.value}
            href={statusHref(f.value)}
            className={cn(
              "press whitespace-nowrap rounded-full border px-3 py-1 text-sm font-medium transition",
              status === f.value
                ? "border-brand-400 bg-brand-50 text-brand-700"
                : "border-zinc-200 bg-white text-zinc-600 hover:border-zinc-300",
            )}
          >
            {f.label}
          </Link>
        ))}
      </SwipeHintRow>

      <div className="mb-4 flex items-center justify-end gap-2">
        <FilterModal basePath="/mascotas" currentParams={currentParams} fields={FILTER_FIELDS} />
        <PageSizeSelect value={pageSize} />
      </div>

      {pets.length === 0 ? (
        <EmptyState
          icon={PawPrint}
          title={total === 0 ? "No hay mascotas reportadas aquí" : "Ninguna mascota coincide"}
          description={
            total === 0
              ? "¿Perdiste o encontraste una mascota tras el sismo? Repórtala para reunirla con su familia."
              : "Prueba con otro estado o cambia el término de búsqueda."
          }
        />
      ) : (
        <>
          <div className="animate-rise grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {pets.map((p) => (
              <PetCard key={p.id} pet={p} commentCount={(commentsByPet[p.id] ?? []).length} />
            ))}
          </div>
          <div className="mt-6">
            <Pagination page={page} pageSize={pageSize} total={total} />
          </div>
        </>
      )}
    </div>
    </PullToRefresh>
  );
}
