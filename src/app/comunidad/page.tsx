import { Megaphone, Users2 } from "lucide-react";
import { getCommentsForEntities, getPosts, getPostsPage, type PostSort } from "@/lib/data";
import { POST_TYPE_EMOJI, POST_TYPE_LABEL, type PostType } from "@/lib/types";
import { getActiveCountry } from "@/lib/country-server";
import { getCountry } from "@/lib/countries";
import { clampPageSize } from "@/lib/utils";
import { CreatePostButton } from "@/components/CreatePostButton";
import { CommunityTabs } from "@/components/CommunityTabs";
import { EmptyState } from "@/components/EmptyState";
import { PostCard } from "@/components/PostCard";
import { PinnedPostCard } from "@/components/PinnedPostCard";
import { PageSizeSelect } from "@/components/PageSizeSelect";
import { Pagination } from "@/components/Pagination";
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
    type === "all" ? getPosts({ country, pinnedOnly: true, search: q }) : Promise.resolve([]),
    type === "all" ? getPosts({ country, type: "rescate", search: q }) : Promise.resolve([]),
    // Antes: hasta 100 publicaciones completas en cada visita, sin límite —
    // pasados los 100 posts no había forma de ver algo más antiguo. Ahora
    // pagina de verdad (10/20/50 a elegir), con orden real en la base de datos.
    getPostsPage({ country, type, search: q, estado, dateFrom, dateTo }, page, pageSize, sort),
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

      {/* Lo primero que se ve al entrar: reportar algo urgente no debe esperar
          a que alguien baje hasta el final de la página. */}
      <section className="reveal-up mb-5 flex flex-col items-center gap-3 rounded-3xl border border-teal-200 bg-teal-50 p-5 text-center">
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
        <CreatePostButton variant="urgent" initialType="rescate" country={country} />
      </section>

      <div className="mb-5">
        <CreatePostButton variant="bar" country={country} />
      </div>

      <div className="mb-5 flex items-center justify-between gap-2">
        <CommunitySearchBar currentParams={currentParams} fields={FILTER_FIELDS} />
      </div>
      <div className="-mt-3 mb-5 flex justify-end">
        <PageSizeSelect value={pageSize} />
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
                  <PinnedPostCard key={post.id} post={post} comments={post.comments} tone="red" />
                ))}
                {withComments(featured).map((post) => (
                  <PinnedPostCard key={post.id} post={post} comments={post.comments} tone="amber" />
                ))}
              </SwipeStaticRow>
            </section>
          )}

          <div className="space-y-4">
            {withComments(restPosts).map((post) => (
              <PostCard key={post.id} post={post} comments={post.comments} />
            ))}
          </div>
          <div className="mt-6">
            <Pagination page={pageResult.page} pageSize={pageResult.pageSize} total={pageResult.total} />
          </div>
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
