import Link from "next/link";
import nextDynamic from "next/dynamic";
import { Building2 } from "lucide-react";
import { getHospitals, getHospitalsPage, getPatientCounts, type HospitalSort } from "@/lib/data";
import { ESTADOS, HOSPITAL_STATUS_LABEL, type HospitalStatus } from "@/lib/types";
import { cn, clampPageSize } from "@/lib/utils";
import { HospitalCard, HOSPITAL_STATUS_STYLE } from "@/components/HospitalCard";
const RegisterHospitalButton = nextDynamic(() =>
  import("@/components/RegisterHospitalButton").then((m) => m.RegisterHospitalButton),
);
import { Pagination } from "@/components/Pagination";
import { PageSizeSelect } from "@/components/PageSizeSelect";
import { FilterModal, type FilterField } from "@/components/FilterModal";
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
    defaultValue: "name",
    options: [
      { value: "name", label: "Nombre (A–Z)" },
      { value: "recent", label: "Más recientes" },
      { value: "oldest", label: "Más antiguos" },
    ],
  },
  { kind: "dateRange", fromKey: "dateFrom", toKey: "dateTo", label: "Registrado entre" },
];

export default async function HospitalesPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const status = str(sp.status) as HospitalStatus | undefined;
  const estado = str(sp.estado) ?? "all";
  const sort = (str(sp.sort) as HospitalSort) ?? "name";
  const dateFrom = str(sp.dateFrom);
  const dateTo = str(sp.dateTo);
  const page = num(sp.page) ?? 1;
  const pageSize = clampPageSize(num(sp.pageSize));

  const [{ items: shown, total }, counts, allHospitals] = await Promise.all([
    getHospitalsPage({ status, estado, dateFrom, dateTo }, page, pageSize, sort),
    getPatientCounts(),
    // Conteos del resumen por estado: siempre sobre el total (cacheada 60s),
    // sin los demás filtros, para que sigan sirviendo de acceso rápido.
    getHospitals(),
  ]);
  const byStatus = (s: HospitalStatus) => allHospitals.filter((h) => h.status === s).length;
  const summary: HospitalStatus[] = ["operativo", "saturado", "lleno", "cerrado"];

  const statusHref = (s: HospitalStatus) => {
    const params = new URLSearchParams(currentParams);
    if (status === s) return params.toString() ? `/hospitales?${params.toString()}` : "/hospitales";
    params.set("status", s);
    return `/hospitales?${params.toString()}`;
  };

  const currentParams: Record<string, string> = {};
  if (estado !== "all") currentParams.estado = estado;
  if (sort !== "name") currentParams.sort = sort;
  if (dateFrom) currentParams.dateFrom = dateFrom;
  if (dateTo) currentParams.dateTo = dateTo;
  if (pageSize !== 10) currentParams.pageSize = String(pageSize);

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <AyudaTabs />
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <PageHeader
          icon={Building2}
          title="Hospitales"
          description="Capacidad en tiempo real, especialidades e insumos que necesitan, para saber a dónde trasladar a cada persona. Abre un hospital para ver la lista de personas atendidas."
        />
        <RegisterHospitalButton />
      </div>

      {/* Resumen de capacidad: fila horizontal (antes iba en rejilla 2x2, se veía
          apilada y grande en móvil). Cada uno filtra la lista de abajo; tocar el
          que ya está activo lo quita. Sin movimiento (a diferencia de otras filas). */}
      <div className="no-scrollbar mb-6 flex gap-2 overflow-x-auto pb-1 sm:grid sm:grid-cols-4">
        {summary.map((s) => (
          <Link
            key={s}
            href={statusHref(s)}
            className={cn(
              "press w-24 shrink-0 rounded-xl border p-1.5 text-center transition sm:w-auto sm:p-2",
              status === s
                ? "border-zinc-900 bg-zinc-900/[0.03] ring-1 ring-zinc-900"
                : "border-zinc-200 bg-white hover:border-zinc-300",
            )}
          >
            <div className="flex items-center justify-center gap-1.5">
              <span className={`h-2 w-2 rounded-full ${HOSPITAL_STATUS_STYLE[s].dot}`} />
              <span className="text-base font-bold text-zinc-900 sm:text-lg">{byStatus(s)}</span>
            </div>
            <div className="mt-0.5 text-[11px] text-zinc-500">{HOSPITAL_STATUS_LABEL[s]}</div>
          </Link>
        ))}
      </div>

      <div className="mb-4 flex items-center justify-end gap-2">
        <FilterModal basePath="/hospitales" currentParams={currentParams} fields={FILTER_FIELDS} />
        <PageSizeSelect value={pageSize} />
      </div>

      {shown.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-zinc-300 bg-white py-16 text-center text-zinc-500">
          {total === 0
            ? "Aún no hay hospitales registrados. Sé el primero en publicar uno."
            : "Ningún hospital coincide con el filtro."}
        </div>
      ) : (
        <>
          <div className="animate-rise grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {shown.map((h) => (
              <HospitalCard key={h.id} hospital={h} patientCount={counts[h.id] ?? 0} />
            ))}
          </div>
          <div className="mt-6">
            <Pagination page={page} pageSize={pageSize} total={total} />
          </div>
        </>
      )}
    </div>
  );
}
