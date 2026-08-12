"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import type { Comment, Post, PostType } from "@/lib/types";
import type { PostSort } from "@/lib/data";
import { getMorePostsAction } from "@/app/actions";
import { PostCard } from "./PostCard";

type FeedItem = Post & { comments: Comment[] };

export type PostFilter = {
  type?: PostType | "all";
  search?: string;
  estado?: string | "all";
  dateFrom?: string;
  dateTo?: string;
};

/**
 * Resto del muro con scroll infinito: la página sigue trayendo la página 1
 * completa en el servidor (SEO, enlaces compartibles, sin JS también
 * funciona); de ahí en adelante, este componente pide más con la MISMA
 * combinación de filtro/orden vía `getMorePostsAction` a medida que se
 * acerca al final. Un botón "Cargar más" queda como respaldo accesible si
 * el observer no dispara (pantallas muy altas, o sin scroll).
 */
export function InfiniteFeed({
  initialItems,
  initialPage,
  pageSize,
  hasMoreInitially,
  filter,
  sort,
  excludeIds = [],
  canModerate = false,
}: {
  initialItems: FeedItem[];
  initialPage: number;
  pageSize: number;
  hasMoreInitially: boolean;
  filter: PostFilter;
  sort: PostSort;
  /** Ids ya mostrados fuera de este feed (fijados/rescates arriba): si una
   *  página siguiente los vuelve a traer (posible con orden "popular"), no
   *  se duplican. */
  excludeIds?: string[];
  /** Admin o moderador: puede eliminar cualquier post directo desde el muro. */
  canModerate?: boolean;
}) {
  const [items, setItems] = useState(initialItems);
  const [page, setPage] = useState(initialPage);
  const [hasMore, setHasMore] = useState(hasMoreInitially);
  const [loading, setLoading] = useState(false);
  const seenIds = useRef(new Set([...initialItems.map((p) => p.id), ...excludeIds]));
  const sentinelRef = useRef<HTMLDivElement>(null);

  const loadMore = useCallback(async () => {
    if (loading || !hasMore) return;
    setLoading(true);
    try {
      const nextPage = page + 1;
      const res = await getMorePostsAction(filter, nextPage, pageSize, sort);
      // Defensa contra duplicados: un post fijado/rescate ya mostrado arriba
      // (o que cambió de página por un reordenamiento entre cargas) no se repite.
      const fresh = res.items.filter((p) => !seenIds.current.has(p.id));
      for (const p of fresh) seenIds.current.add(p.id);
      setItems((prev) => [...prev, ...fresh]);
      setPage(nextPage);
      setHasMore(res.hasMore);
    } finally {
      setLoading(false);
    }
  }, [loading, hasMore, page, filter, pageSize, sort]);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || !hasMore) return;
    const observer = new IntersectionObserver((entries) => entries[0]?.isIntersecting && loadMore(), {
      rootMargin: "600px",
    });
    observer.observe(el);
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasMore]);

  if (items.length === 0 && !hasMore) return null;

  return (
    <div className="animate-rise space-y-4">
      {items.map((post) => (
        <PostCard key={post.id} post={post} comments={post.comments} canModerate={canModerate} />
      ))}

      {hasMore ? (
        <div ref={sentinelRef} className="flex justify-center py-4">
          {loading ? (
            <Loader2 className="h-5 w-5 animate-spin text-zinc-400" />
          ) : (
            <button
              onClick={loadMore}
              className="press rounded-xl border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-600 transition hover:bg-zinc-50"
            >
              Cargar más
            </button>
          )}
        </div>
      ) : (
        <p className="py-4 text-center text-xs text-zinc-400">Ya viste todas las publicaciones.</p>
      )}
    </div>
  );
}
