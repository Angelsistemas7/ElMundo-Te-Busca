import Link from "next/link";
import { Megaphone, Search, Users2 } from "lucide-react";
import { getCommentsForEntities, getPosts, getPostsPage, type PostSort } from "@/lib/data";
import { ESTADOS, POST_TYPE_EMOJI, POST_TYPE_LABEL, type PostType } from "@/lib/types";
import { cn, clampPageSize } from "@/lib/utils";
import { CreatePostButton } from "@/components/CreatePostButton";
import { CommunityTabs } from "@/components/CommunityTabs";
import { EmptyState } from "@/components/EmptyState";
import { InfiniteFeed } from "@/components/InfiniteFeed";
import { PinnedPostCard } from "@/components/PinnedPostCard";
import { PageSizeSelect } from "@/components/PageSizeSelect";
import { SwipeStaticRow } from "@/components/SwipeHint";
import { FilterModal, type FilterField } from "@/components/FilterModal";
import { TopicChips } from "@/components/TopicChips";
import { MapPreviewCard } from "@/components/MapPreviewCard";
import { FaqAccordion } from "@/components/FaqAccordion";
import { CommunityIllustration } from "@/components/illustrations/CommunityIllustration";
import { HandsIllustration } from "@/components/illustrations/HandsIllustration";
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

const FILTERS: { value: PostType | "all"; label: string }[] = [
  { value: "all", label: "Todo" },
  ...(Object.keys(POST_TYPE_LABEL) as PostType[]).map((t) => ({
    value: t,
    label: `${POST_TYPE_EMOJI[t]} ${POST_TYPE_LABEL[t]}`,
  })),
];

const FILTER_FIELDS: FilterField[] = [
  {
    kind: "chips",
    key: "sort",
    label: "Ordenar por",
    defaultValue: "recent",
    options: [
      { value: "recent", label: "Recientes" },
      { value: "popular", label: "Más apoyadas" },
      { value: "least_popular", label: "Menos apoyadas" },
      { value: "oldest", label: "Más antiguas" },
    ],
  },
  {
    kind: "select",
    key: "estado",
    label: "Estado (región)",
    placeholder: "Todos",
    options: ESTADOS.map((e) => ({ value: e, label: e })),
  },
  { kind: "dateRange", fromKey: "dateFrom", toKey: "dateTo", label: "Publicado entre" },
];

export default async function ComunidadPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const type = (str(sp.type) as PostType | "all") ?? "all";
  const q = str(sp.q);
  const sort = (str(sp.sort) as PostSort) ?? "recent";
  const estado = str(sp.estado) ?? "all";
  const dateFrom = str(sp.dateFrom);
  const dateTo = str(sp.dateTo);
  const page = num(sp.page) ?? 1;
  const pageSize = clampPageSize(num(sp.pageSize));

  // Los widgets decorativos (temas, mapa, FAQ) solo aportan en la vista
  // limpia — igual que en el inicio, para no estorbar cuando alguien ya
  // está filtrando o buscando algo puntual dentro del muro.
  const hasActiveQuery = Boolean(
    q || type !== "all" || sort !== "recent" || estado !== "all" || dateFrom || dateTo || page > 1,
  );

  // Destacados (fijados por el equipo) y rescates: se ven SIEMPRE arriba, en
  // una fila que se desliza de lado — antes se apilaban uno debajo del otro y
  // había que bajar mucho para llegar al muro normal. Un rescate se queda ahí
  // hasta que su autor (o el admin) lo borre — no hay límite de tiempo: un
  // rescate sigue siendo urgente mientras exista, sin importar cuánto lleve.
  const [featuredPosts, rescuePosts, pageResult] = await Promise.all([
    type === "all" ? getPosts({ pinnedOnly: true, search: q }) : Promise.resolve([]),
    type === "all" ? getPosts({ type: "rescate", search: q }) : Promise.resolve([]),
    // Antes: hasta 100 publicaciones completas en cada visita, sin límite —
    // pasados los 100 posts no había forma de ver algo más antiguo. Ahora
    // pagina de verdad (10/20/50 a elegir), con orden real en la base de datos.
    getPostsPage({ type, search: q, estado, dateFrom, dateTo }, page, pageSize, sort),
  ]);
  const featured = featuredPosts;
  const featuredIds = new Set(featured.map((p) => p.id));
  const pinned = rescuePosts.filter((p) => !featuredIds.has(p.id));
  const pinnedIds = new Set([...featuredIds, ...pinned.map((p) => p.id)]);
  // El muro no repite lo que ya se muestra fijo arriba.
  const restPosts = pageResult.items.filter((p) => !pinnedIds.has(p.id));

  const allShown = [...featured, ...pinned, ...restPosts];
  // Una sola consulta para los comentarios de todo lo que se ve en esta carga (evita el N+1).
  const commentsByPost = await getCommentsForEntities("post", allShown.map((p) => p.id));
  const withComments = (posts: typeof allShown) => posts.map((post) => ({ ...post, comments: commentsByPost[post.id] ?? [] }));

  // Enlaces que conservan la búsqueda/orden/tamaño activos al cambiar el otro
  // filtro. Cambiar tipo siempre vuelve a la página 1.
  const buildHref = (overrides: { type?: PostType | "all" }) => {
    const params = new URLSearchParams();
    const t = overrides.type ?? type;
    if (t !== "all") params.set("type", t);
    if (sort !== "recent") params.set("sort", sort);
    if (estado !== "all") params.set("estado", estado);
    if (dateFrom) params.set("dateFrom", dateFrom);
    if (dateTo) params.set("dateTo", dateTo);
    if (q) params.set("q", q);
    if (pageSize !== 10) params.set("pageSize", String(pageSize));
    const qs = params.toString();
    return qs ? `/comunidad?${qs}` : "/comunidad";
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
    <div className="mx-auto max-w-2xl px-4 py-6">
      <CommunityTabs />
      <div className="mb-5 flex items-start justify-between gap-3">
        <PageHeader
          icon={Users2}
          title={
            <>
              La fuerza está en nuestra <span className="text-brand-500">comunidad</span>
            </>
          }
          description="Comparte información, pide de ayuda, da soluciones y seamos esperanza para quienes lo necesitan."
        />
        <CommunityIllustration className="hidden h-20 w-28 shrink-0 sm:block" />
      </div>

      <div className="mb-5">
        <CreatePostButton variant="bar" />
      </div>

      {!hasActiveQuery && (
        <div className="mb-6 flex flex-col gap-4 sm:flex-row">
          <div className="flex-1">
            <TopicChips />
          </div>
          <div className="flex flex-col items-center justify-center rounded-3xl border border-brand-200 bg-brand-50 p-5 text-center sm:w-64 sm:shrink-0">
            <HandsIllustration className="h-16 w-16" />
            <h3 className="font-heading mt-1 text-base font-bold text-navy-700">
              Tu voz puede hacer <span className="text-brand-600">la diferencia</span>
            </h3>
            <p className="mt-1.5 text-xs text-zinc-600">
              Cada mensaje, cada dato y cada experiencia puede convertirse en esperanza para
              alguien más.
            </p>
          </div>
        </div>
      )}

      <form action="/comunidad" className="mb-3 flex gap-2">
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
            placeholder="Buscar en el muro: necesidad, sector, nombre..."
            className="w-full rounded-xl border border-zinc-300 bg-white py-2.5 pl-10 pr-3 text-base outline-none sm:text-sm focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
          />
        </div>
        <button type="submit" className="press rounded-xl bg-zinc-900 px-4 text-sm font-semibold text-white transition hover:bg-zinc-800">
          Buscar
        </button>
      </form>

      {q && (
        <p className="mb-3 text-sm text-zinc-500">
          {pageResult.total} {pageResult.total === 1 ? "resultado" : "resultados"} para “{q}”.{" "}
          <Link href={buildHref({})} className="font-medium text-brand-700 hover:underline">
            Limpiar
          </Link>
        </p>
      )}

      <SwipeStaticRow wrapperClassName="mb-3" className="no-scrollbar flex gap-2 overflow-x-auto pb-1">
        {FILTERS.map((f) => (
          <Link
            key={f.value}
            href={buildHref({ type: f.value })}
            className={cn(
              "press whitespace-nowrap rounded-full border px-3 py-1 text-sm font-medium transition",
              type === f.value
                ? "border-brand-400 bg-brand-50 text-brand-700"
                : "border-zinc-200 bg-white text-zinc-600 hover:border-zinc-300",
            )}
          >
            {f.label}
          </Link>
        ))}
      </SwipeStaticRow>

      <div className="mb-5 flex flex-wrap items-center justify-between gap-2">
        <FilterModal basePath="/comunidad" currentParams={currentParams} fields={FILTER_FIELDS} />
        <PageSizeSelect value={pageSize} />
      </div>

      {allShown.length === 0 ? (
        <EmptyState
          icon={Users2}
          title="Aún no hay publicaciones aquí"
          description="Pide o ofrece ayuda, reporta un rescate o comparte información. Sé el primero."
        />
      ) : (
        <>
          {(pinned.length > 0 || featured.length > 0) && (
            <section className="mb-5">
              <h2 className="mb-2 flex items-center gap-1.5 px-1 text-sm font-bold text-amber-700">
                <span>📌</span> Destacado
                {pinned.length > 0 && (
                  <span className="ml-1 inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 text-xs font-bold text-red-700">
                    🚨 {pinned.length} {pinned.length === 1 ? "rescate activo" : "rescates activos"}
                  </span>
                )}
              </h2>
              <SwipeStaticRow className="no-scrollbar flex gap-3 overflow-x-auto pb-1">
                {withComments(pinned).map((post) => (
                  <PinnedPostCard key={post.id} post={post} comments={post.comments} tone="red" />
                ))}
                {withComments(featured).map((post) => (
                  <PinnedPostCard key={post.id} post={post} comments={post.comments} tone="amber" />
                ))}
              </SwipeStaticRow>
            </section>
          )}

          <InfiniteFeed
            key={`${type}-${sort}-${estado}-${dateFrom ?? ""}-${dateTo ?? ""}-${q ?? ""}-${pageSize}-${page}`}
            initialItems={withComments(restPosts)}
            initialPage={page}
            pageSize={pageSize}
            hasMoreInitially={page * pageSize < pageResult.total}
            filter={{ type, search: q, estado, dateFrom, dateTo }}
            sort={sort}
            excludeIds={Array.from(pinnedIds)}
          />
        </>
      )}

      {!hasActiveQuery && (
        <div className="mt-8 flex flex-col gap-4 border-t border-zinc-100 pt-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <MapPreviewCard />
            <FaqAccordion />
          </div>

          <section className="reveal-up flex flex-col items-center gap-3 rounded-3xl border border-zinc-200 bg-white p-6 text-center">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-teal-500 text-white">
              <Megaphone className="h-5 w-5" />
            </span>
            <div>
              <h3 className="font-bold text-zinc-900">¿Tienes información urgente?</h3>
              <p className="text-sm text-zinc-600">
                Si ves una emergencia o situación crítica, repórtala para que la comunidad y los
                equipos de ayuda puedan actuar lo más rápido posible.
              </p>
            </div>
            <CreatePostButton variant="urgent" initialType="rescate" />
          </section>
        </div>
      )}
    </div>
    </PullToRefresh>
  );
}
