import { Users2 } from "lucide-react";
import { getCommentsForEntities, getPosts, getPostsPage, type PostSort } from "@/lib/data";
import { POST_TYPE_EMOJI, POST_TYPE_LABEL, type PostType } from "@/lib/types";
import { getActiveCountry } from "@/lib/country-server";
import { getAdminLevel } from "@/lib/admin";
import { getCountry } from "@/lib/countries";
import { CreatePostButton } from "@/components/CreatePostButton";
import { CommunityTabs } from "@/components/CommunityTabs";
import { EmptyState } from "@/components/EmptyState";
import { PinnedPostCard } from "@/components/PinnedPostCard";
import { InfiniteFeed } from "@/components/InfiniteFeed";
import { SwipeStaticRow } from "@/components/SwipeHint";
import { CommunitySearchBar } from "@/components/CommunitySearchBar";
import type { FilterField } from "@/components/FilterModal";
import { MapPreviewCard } from "@/components/MapPreviewCard";
import { FaqAccordion } from "@/components/FaqAccordion";
import { CommunityIllustration } from "@/components/illustrations/CommunityIllustration";
import { PageHeader } from "@/components/PageHeader";
import { PullToRefresh } from "@/components/PullToRefresh";

export const dynamic = "force-dynamic";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;
const str = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

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
  // Tamaño de cada tanda del scroll infinito (ver InfiniteFeed) — a
  // diferencia de mascotas/ayuda/hospitales, esta sección se quiere sentir
  // como un feed de red social común, no como una lista con paginación
  // numerada: no hay un tamaño de página que elegir, solo seguir bajando.
  const PAGE_SIZE = 10;
  const postFilter = { type, search: q, estado, dateFrom, dateTo };

  // Los widgets decorativos (temas, mapa, FAQ) solo aportan en la vista
  // limpia — igual que en el inicio, para no estorbar cuando alguien ya
  // está filtrando o buscando algo puntual dentro del muro.
  const hasActiveQuery = Boolean(q || type !== "all" || sort !== "recent" || estado !== "all" || dateFrom || dateTo);

  // Destacados (fijados por el equipo) y rescates: se ven SIEMPRE arriba, en
  // una fila que se desliza de lado — antes se apilaban uno debajo del otro y
  // había que bajar mucho para llegar al muro normal. Un rescate se queda ahí
  // hasta que su autor (o el admin) lo borre — no hay límite de tiempo: un
  // rescate sigue siendo urgente mientras exista, sin importar cuánto lleve.
  const [featuredPosts, rescuePosts, pageResult, adminLevel] = await Promise.all([
    type === "all" ? getPosts({ country, pinnedOnly: true, search: q }) : Promise.resolve([]),
    type === "all" ? getPosts({ country, type: "rescate", search: q }) : Promise.resolve([]),
    // Primera tanda en el servidor (SEO, enlaces compartibles, funciona sin
    // JS); el resto lo trae InfiniteFeed vía scroll, igual que Instagram/X.
    getPostsPage({ ...postFilter, country }, 1, PAGE_SIZE, sort),
    getAdminLevel(),
  ]);
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
  const commentsByPost = await getCommentsForEntities("post", allShown.map((p) => p.id));
  const withComments = (posts: typeof allShown) => posts.map((post) => ({ ...post, comments: commentsByPost[post.id] ?? [] }));

  const currentParams: Record<string, string> = {};
  if (type !== "all") currentParams.type = type;
  if (sort !== "recent") currentParams.sort = sort;
  if (estado !== "all") currentParams.estado = estado;
  if (dateFrom) currentParams.dateFrom = dateFrom;
  if (dateTo) currentParams.dateTo = dateTo;
  if (q) currentParams.q = q;

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

      <div className="mb-5 flex items-center justify-between gap-2">
        <CommunitySearchBar currentParams={currentParams} fields={FILTER_FIELDS} />
      </div>

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
                  <PinnedPostCard key={post.id} post={post} comments={post.comments} tone="red" canModerate={canModerate} />
                ))}
                {withComments(featured).map((post) => (
                  <PinnedPostCard key={post.id} post={post} comments={post.comments} tone="amber" canModerate={canModerate} />
                ))}
              </SwipeStaticRow>
            </section>
          )}

          <InfiniteFeed
            initialItems={withComments(restPosts)}
            initialPage={1}
            pageSize={PAGE_SIZE}
            hasMoreInitially={PAGE_SIZE < pageResult.total}
            filter={postFilter}
            sort={sort}
            excludeIds={[...pinnedIds]}
            canModerate={canModerate}
          />
        </>
      )}

      {!hasActiveQuery && (
        <div className="mt-8 flex flex-col gap-4 border-t border-zinc-100 pt-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <MapPreviewCard />
            <FaqAccordion country={country} />
          </div>
        </div>
      )}
    </div>
    </PullToRefresh>
  );
}
