import { Suspense } from "react";
import { Users2 } from "lucide-react";
import { getAidPoints, getCommentsForEntities, getPosts, getPostsPage, type PostSort } from "@/lib/data";
import { POST_TYPE_EMOJI, POST_TYPE_LABEL, type PostType } from "@/lib/types";
import { getActiveCountry } from "@/lib/country-server";
import { getAdminLevel } from "@/lib/admin";
import { getCountry } from "@/lib/countries";
import { clampPageSize } from "@/lib/utils";
import { CreatePostButton } from "@/components/CreatePostButton";
import { CommunityTabs } from "@/components/CommunityTabs";
import { EmptyState } from "@/components/EmptyState";
import { PinnedPostCard } from "@/components/PinnedPostCard";
import { PostCard } from "@/components/PostCard";
import { Pagination } from "@/components/Pagination";
import { PageSizeSelect } from "@/components/PageSizeSelect";
import { SwipeStaticRow } from "@/components/SwipeHint";
import { CommunitySearchBar } from "@/components/CommunitySearchBar";
import type { FilterField } from "@/components/FilterModal";
import { MapPreviewCard } from "@/components/MapPreviewCard";
import { FaqAccordion } from "@/components/FaqAccordion";
import { CommunityIllustration } from "@/components/illustrations/CommunityIllustration";
import { PageHeader } from "@/components/PageHeader";
import { PullToRefresh } from "@/components/PullToRefresh";
import { PostFeedSkeleton } from "@/components/ListSkeletons";
import { withServerFallback } from "@/lib/error-reporting";

export const dynamic = "force-dynamic";

// Por defecto se muestran 20 por página (el resto de listados usa 10) —
// pedido explícito del dueño, Comunidad suele tener más volumen.
const COMMUNITY_DEFAULT_PAGE_SIZE = 20;

type SearchParams = Promise<Record<string, string | string[] | undefined>>;
const str = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
const num = (v: string | string[] | undefined) => {
  const s = str(v);
  const n = s ? Number(s) : NaN;
  return Number.isFinite(n) ? n : undefined;
};

function buildFilterFields(regions: readonly string[]): FilterField[] {
  return [
    {
      kind: "chips",
      key: "type",
      label: "¿Qué es?",
      defaultValue: "all",
      options: [
        { value: "all", label: "Todo" },
        ...(Object.keys(POST_TYPE_LABEL) as PostType[]).map((t) => ({
          value: t,
          label: `${POST_TYPE_EMOJI[t]} ${POST_TYPE_LABEL[t]}`,
        })),
      ],
    },
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
      options: regions.map((e) => ({ value: e, label: e })),
    },
    { kind: "dateRange", fromKey: "dateFrom", toKey: "dateTo", label: "Publicado entre" },
  ];
}

// Todo lo que depende de datos (destacados/rescates, el muro paginado y sus
// comentarios) vive aparte del cascarón de la página (pestañas, buscador,
// botón de publicar) para que ESE cascarón aparezca de inmediato al navegar
// en vez de esperar, junto con el resto, a que termine la consulta más lenta
// — mismo patrón ya usado en Inicio (ver HomeHero/VerifiedNewsCarousel).
async function CommunityFeed({
  type,
  q,
  sort,
  estado,
  dateFrom,
  dateTo,
  page,
  pageSize,
  country,
}: {
  type: PostType | "all";
  q: string | undefined;
  sort: PostSort;
  estado: string;
  dateFrom: string | undefined;
  dateTo: string | undefined;
  page: number;
  pageSize: number;
  country: string;
}) {
  const postFilter = { type, search: q, estado, dateFrom, dateTo };

  // Destacados (fijados por el equipo) y rescates: se ven SIEMPRE arriba, en
  // una fila que se desliza de lado — antes se apilaban uno debajo del otro y
  // había que bajar mucho para llegar al muro normal. Un rescate se queda ahí
  // hasta que su autor (o el admin) lo borre — no hay límite de tiempo: un
  // rescate sigue siendo urgente mientras exista, sin importar cuánto lleve.
  const [featuredPosts, rescuePosts, pageResult, adminLevel, aidPoints] = await Promise.all([
    type === "all"
      ? withServerFallback("page.community.featured", getPosts({ country, pinnedOnly: true, search: q }), [])
      : Promise.resolve([]),
    type === "all"
      ? withServerFallback("page.community.rescues", getPosts({ country, type: "rescate", search: q }), [])
      : Promise.resolve([]),
    getPostsPage({ ...postFilter, country }, page, pageSize, sort),
    withServerFallback("page.community.admin-level", getAdminLevel(), null),
    withServerFallback("page.community.aid-points", getAidPoints(country), []),
  ]);
  const aidPointNameById = new Map(aidPoints.map((p) => [p.id, p.name]));
  // Admin o moderador: puede eliminar cualquier post directo desde el muro,
  // sin necesitar el enlace privado del autor (ver deletePostModAction).
  const canModerate = adminLevel !== null;
  const featured = featuredPosts;
  const featuredIds = new Set(featured.map((p) => p.id));
  const pinned = rescuePosts.filter((p) => !featuredIds.has(p.id));
  const pinnedIds = new Set([...featuredIds, ...pinned.map((p) => p.id)]);
  // El muro no repite lo que ya se muestra fijo arriba.
  const restPosts = pageResult.items.filter((p) => !pinnedIds.has(p.id));

  const allShown = [...featured, ...pinned, ...restPosts];
  // Una sola consulta para los comentarios de todo lo que se ve en esta carga (evita el N+1).
  const commentsByPost = await withServerFallback(
    "page.community.comments",
    getCommentsForEntities("post", allShown.map((p) => p.id)),
    {},
  );
  const withComments = (posts: typeof allShown) => posts.map((post) => ({ ...post, comments: commentsByPost[post.id] ?? [] }));

  return (
    <>
      {q && (
        <p className="mb-3 text-sm text-zinc-500">
          {pageResult.total} {pageResult.total === 1 ? "resultado" : "resultados"} para "{q}".
        </p>
      )}

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
              <SwipeStaticRow className="no-scrollbar flex snap-x snap-mandatory gap-3 overflow-x-auto scroll-smooth pb-1">
                {withComments(pinned).map((post) => (
                  <PinnedPostCard
                    key={post.id}
                    post={post}
                    comments={post.comments}
                    tone="red"
                    canModerate={canModerate}
                    aidPointName={post.aidPointId ? aidPointNameById.get(post.aidPointId) : undefined}
                  />
                ))}
                {withComments(featured).map((post) => (
                  <PinnedPostCard
                    key={post.id}
                    post={post}
                    comments={post.comments}
                    tone="amber"
                    canModerate={canModerate}
                    aidPointName={post.aidPointId ? aidPointNameById.get(post.aidPointId) : undefined}
                  />
                ))}
              </SwipeStaticRow>
            </section>
          )}

          <div className="animate-rise space-y-4">
            {withComments(restPosts).map((post) => (
              <PostCard
                key={post.id}
                post={post}
                comments={post.comments}
                canModerate={canModerate}
                aidPointName={post.aidPointId ? aidPointNameById.get(post.aidPointId) : undefined}
              />
            ))}
          </div>
          <div className="mt-6">
            <Pagination page={page} pageSize={pageSize} total={pageResult.total} />
          </div>
        </>
      )}
    </>
  );
}

export default async function ComunidadPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const country = await getActiveCountry();
  const FILTER_FIELDS = buildFilterFields(getCountry(country).regions);
  const type = (str(sp.type) as PostType | "all") ?? "all";
  const q = str(sp.q);
  const sort = (str(sp.sort) as PostSort) ?? "recent";
  const estado = str(sp.estado) ?? "all";
  const dateFrom = str(sp.dateFrom);
  const dateTo = str(sp.dateTo);
  const page = num(sp.page) ?? 1;
  const pageSize = clampPageSize(num(sp.pageSize), COMMUNITY_DEFAULT_PAGE_SIZE);

  // Los widgets decorativos (temas, mapa, FAQ) solo aportan en la vista
  // limpia — igual que en el inicio, para no estorbar cuando alguien ya
  // está filtrando o buscando algo puntual dentro del muro.
  const hasActiveQuery = Boolean(q || type !== "all" || sort !== "recent" || estado !== "all" || dateFrom || dateTo);

  const currentParams: Record<string, string> = {};
  if (type !== "all") currentParams.type = type;
  if (sort !== "recent") currentParams.sort = sort;
  if (estado !== "all") currentParams.estado = estado;
  if (dateFrom) currentParams.dateFrom = dateFrom;
  if (dateTo) currentParams.dateTo = dateTo;
  if (q) currentParams.q = q;
  if (pageSize !== COMMUNITY_DEFAULT_PAGE_SIZE) currentParams.pageSize = String(pageSize);

  // Clave estable por combinación de filtros: al cambiar de página/filtro,
  // React trata el feed como una subrama nueva y vuelve a mostrar el
  // esqueleto mientras llega el resultado, en vez de dejar pegado el anterior.
  const feedKey = JSON.stringify({ type, q, sort, estado, dateFrom, dateTo, page, pageSize });

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
        <CreatePostButton variant="bar" country={country} />
      </div>

      <div className="mb-2 flex items-center justify-between gap-2">
        <CommunitySearchBar currentParams={currentParams} fields={FILTER_FIELDS} />
      </div>
      <div className="mb-5 flex items-center justify-end">
        <PageSizeSelect value={pageSize} defaultValue={COMMUNITY_DEFAULT_PAGE_SIZE} />
      </div>

      <Suspense key={feedKey} fallback={<PostFeedSkeleton />}>
        <CommunityFeed
          type={type}
          q={q}
          sort={sort}
          estado={estado}
          dateFrom={dateFrom}
          dateTo={dateTo}
          page={page}
          pageSize={pageSize}
          country={country}
        />
      </Suspense>

      {!hasActiveQuery && (
        <div className="mt-8 flex flex-col gap-4 border-t border-zinc-100 pt-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <Suspense fallback={<div className="h-72 animate-pulse rounded-3xl bg-zinc-100" />}>
              <MapPreviewCard />
            </Suspense>
            <Suspense fallback={<div className="h-72 animate-pulse rounded-3xl bg-zinc-100" />}>
              <FaqAccordion country={country} />
            </Suspense>
          </div>
        </div>
      )}
    </div>
    </PullToRefresh>
  );
}
