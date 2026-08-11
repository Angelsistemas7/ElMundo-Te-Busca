import Link from "next/link";
import Image from "next/image";
import nextDynamic from "next/dynamic";
import { HandHeart, Mail, MapPin, Phone, Search } from "lucide-react";
import { getVolunteersPage, type VolunteerSort } from "@/lib/data";
import { VOLUNTEER_TYPE_EMOJI, VOLUNTEER_TYPE_LABEL, type VolunteerType } from "@/lib/types";
import { getCountry } from "@/lib/countries";
import { getActiveCountry } from "@/lib/country-server";
import { cn, clampPageSize, timeAgo } from "@/lib/utils";
const RegisterVolunteerButton = nextDynamic(() =>
  import("@/components/RegisterVolunteerButton").then((m) => m.RegisterVolunteerButton),
);
import { CommunityTabs } from "@/components/CommunityTabs";
import { EmptyState } from "@/components/EmptyState";
import { Pagination } from "@/components/Pagination";
import { PageSizeSelect } from "@/components/PageSizeSelect";
import { SwipeStaticRow } from "@/components/SwipeHint";
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

const FILTERS: { value: VolunteerType | "all"; label: string }[] = [
  { value: "all", label: "Todas" },
  ...(Object.keys(VOLUNTEER_TYPE_LABEL) as VolunteerType[]).map((t) => ({
    value: t,
    label: `${VOLUNTEER_TYPE_EMOJI[t]} ${VOLUNTEER_TYPE_LABEL[t]}`,
  })),
];

const buildFilterFields = (regions: readonly string[]): FilterField[] => [
  {
    kind: "select",
    key: "estado",
    label: "Estado (región)",
    placeholder: "Todos",
    options: regions.map((e) => ({ value: e, label: e })),
  },
  {
    kind: "chips",
    key: "sort",
    label: "Ordenar por",
    defaultValue: "recent",
    options: [
      { value: "recent", label: "Más recientes" },
      { value: "oldest", label: "Más antiguos" },
      { value: "name", label: "Nombre (A–Z)" },
    ],
  },
  { kind: "dateRange", fromKey: "dateFrom", toKey: "dateTo", label: "Registrado entre" },
];

export default async function VoluntariosPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const type = (str(sp.type) as VolunteerType | "all") ?? "all";
  const q = str(sp.q);
  const estado = str(sp.estado) ?? "all";
  const sort = (str(sp.sort) as VolunteerSort) ?? "recent";
  const dateFrom = str(sp.dateFrom);
  const dateTo = str(sp.dateTo);
  const page = num(sp.page) ?? 1;
  const pageSize = clampPageSize(num(sp.pageSize));
  const country = await getActiveCountry();
  const regions = getCountry(country).regions;

  // Antes: hasta 300 voluntarios sin límite de página, cacheados 60s (te
  // acababas de ofrecer y podías no verte en la lista por un minuto). Ahora
  // pagina de verdad (10/20/50 a elegir) y consulta en vivo.
  const { items: volunteers, total } = await getVolunteersPage(
    { country, type, search: q, estado, dateFrom, dateTo },
    page,
    pageSize,
    sort,
  );

  const typeHref = (t: VolunteerType | "all") => {
    const params = new URLSearchParams();
    if (t !== "all") params.set("type", t);
    if (sort !== "recent") params.set("sort", sort);
    if (estado !== "all") params.set("estado", estado);
    if (dateFrom) params.set("dateFrom", dateFrom);
    if (dateTo) params.set("dateTo", dateTo);
    if (q) params.set("q", q);
    if (pageSize !== 10) params.set("pageSize", String(pageSize));
    const qs = params.toString();
    return qs ? `/voluntarios?${qs}` : "/voluntarios";
  };

  const currentParams: Record<string, string> = {};
  if (type !== "all") currentParams.type = type;
  if (sort !== "recent") currentParams.sort = sort;
  if (estado !== "all") currentParams.estado = estado;
  if (dateFrom) currentParams.dateFrom = dateFrom;
  if (dateTo) currentParams.dateTo = dateTo;
  if (q) currentParams.q = q;
  if (pageSize !== 10) currentParams.pageSize = String(pageSize);

  return (
    <PullToRefresh>
    <div className="mx-auto max-w-3xl px-4 py-6">
      <CommunityTabs />
      <div className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <PageHeader
          icon={HandHeart}
          tone="emerald"
          title="Voluntarios"
          description="Personas que ofrecen su tiempo y conocimiento: médicos, rescatistas, conductores, traductores y más. Ofrécete o encuentra a quien pueda ayudar."
        />
        <div className="shrink-0">
          <RegisterVolunteerButton country={country} />
        </div>
      </div>

      <form action="/voluntarios" className="mb-3 flex gap-2">
        {type !== "all" && <input type="hidden" name="type" value={type} />}
        {sort !== "recent" && <input type="hidden" name="sort" value={sort} />}
        {estado !== "all" && <input type="hidden" name="estado" value={estado} />}
        {dateFrom && <input type="hidden" name="dateFrom" value={dateFrom} />}
        {dateTo && <input type="hidden" name="dateTo" value={dateTo} />}
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
          <input
            name="q"
            defaultValue={q ?? ""}
            placeholder="Buscar por nombre, ciudad o habilidad..."
            className="w-full rounded-xl border border-zinc-300 bg-white py-2.5 pl-10 pr-3 text-base outline-none sm:text-sm focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
          />
        </div>
        <button type="submit" className="press rounded-xl bg-zinc-900 px-4 text-sm font-semibold text-white transition hover:bg-zinc-800">
          Buscar
        </button>
      </form>

      <div className="mb-5 flex flex-wrap items-center justify-between gap-2">
        <SwipeStaticRow className="no-scrollbar flex gap-2 overflow-x-auto pb-1">
          {FILTERS.map((f) => (
            <Link
              key={f.value}
              href={typeHref(f.value)}
              className={cn(
                "press whitespace-nowrap rounded-full border px-3 py-1 text-sm font-medium transition",
                type === f.value
                  ? "border-emerald-400 bg-emerald-50 text-emerald-700"
                  : "border-zinc-200 bg-white text-zinc-600 hover:border-zinc-300",
              )}
            >
              {f.label}
            </Link>
          ))}
        </SwipeStaticRow>
        <div className="flex shrink-0 items-center gap-2">
          <FilterModal basePath="/voluntarios" currentParams={currentParams} fields={buildFilterFields(regions)} />
          <PageSizeSelect value={pageSize} />
        </div>
      </div>

      {volunteers.length === 0 ? (
        <EmptyState
          icon={HandHeart}
          title="Aún no hay voluntarios aquí"
          description="¿Puedes ayudar con tu tiempo o tu oficio? Sé el primero en ofrecerte."
        />
      ) : (
        <ul className="animate-rise space-y-3">
          {volunteers.map((v) => (
            <li key={v.id} className="flex gap-3 rounded-2xl border border-zinc-200 bg-white p-4">
              {v.photoUrl && (
                <Image
                  src={v.photoUrl}
                  alt=""
                  width={56}
                  height={56}
                  className="h-14 w-14 shrink-0 rounded-full object-cover"
                />
              )}
              <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-700">
                  {VOLUNTEER_TYPE_EMOJI[v.type]} {VOLUNTEER_TYPE_LABEL[v.type]}
                </span>
                <span className="font-semibold text-zinc-900">{v.name}</span>
                <span className="ml-auto text-xs text-zinc-400">{timeAgo(v.createdAt)}</span>
              </div>

              {v.skillsText && <p className="mt-2 text-sm text-zinc-600">{v.skillsText}</p>}

              <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-zinc-500">
                {v.availabilityText && (
                  <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-600">
                    {v.availabilityText}
                  </span>
                )}
                {(v.locationText || v.estado) && (
                  <span className="inline-flex items-center gap-1 text-xs">
                    <MapPin className="h-3.5 w-3.5 text-zinc-400" />
                    {[v.locationText, v.estado].filter(Boolean).join(", ")}
                  </span>
                )}
                {v.contactPhone && (
                  <a href={`tel:${v.contactPhone}`} className="press inline-flex items-center gap-1 text-xs font-medium text-brand-700 transition hover:underline">
                    <Phone className="h-3.5 w-3.5" />
                    {v.contactPhone}
                  </a>
                )}
                {v.contactEmail && (
                  <a href={`mailto:${v.contactEmail}`} className="press inline-flex items-center gap-1 text-xs font-medium text-brand-700 transition hover:underline">
                    <Mail className="h-3.5 w-3.5" />
                    {v.contactEmail}
                  </a>
                )}
              </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-6">
        <Pagination page={page} pageSize={pageSize} total={total} />
      </div>
    </div>
    </PullToRefresh>
  );
}
