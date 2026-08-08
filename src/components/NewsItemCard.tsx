"use client";

import { memo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ExternalLink, Loader2, MessageCircle, Trash2 } from "lucide-react";
import type { Comment, NewsItem } from "@/lib/types";
import { timeAgo } from "@/lib/utils";
import { deleteNewsItemAction } from "@/app/admin/actions";
import { LikeButton } from "./LikeButton";
import { CommentSection } from "./CommentSection";
import { ExternalLinkGuard } from "./ExternalLinkGuard";
import { PhotoView } from "./PhotoView";

export const NewsItemCard = memo(function NewsItemCard({
  item,
  comments,
  isAdmin = false,
}: {
  item: NewsItem;
  comments: Comment[];
  isAdmin?: boolean;
}) {
  const router = useRouter();
  const [showComments, setShowComments] = useState(false);
  const [pending, startTransition] = useTransition();

  return (
    <article className="tap-card rounded-3xl border border-zinc-200 bg-white p-4 sm:p-5">
      <div className="flex items-start gap-3">
        {item.photoUrl && (
          <PhotoView src={item.photoUrl} className="h-16 w-16 shrink-0 rounded-lg" />
        )}
        <div className="min-w-0 flex-1">
          <h3 className="font-bold text-zinc-900">{item.title}</h3>
          <p className="mt-1 whitespace-pre-wrap text-[15px] leading-relaxed text-zinc-700">{item.body}</p>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-zinc-500">
        {item.sourceName &&
          (item.sourceUrl ? (
            <ExternalLinkGuard
              href={item.sourceUrl}
              className="inline-flex items-center gap-1 font-medium text-brand-700 hover:underline"
            >
              Fuente: {item.sourceName}
              <ExternalLink className="h-3 w-3" />
            </ExternalLinkGuard>
          ) : (
            <span>Fuente: {item.sourceName}</span>
          ))}
        <span>{timeAgo(item.createdAt)}</span>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-zinc-100 pt-3">
        <LikeButton kind="news" id={item.id} likes={item.likes} />
        <button
          onClick={() => setShowComments((v) => !v)}
          className="press flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium text-zinc-600 transition hover:bg-zinc-50"
        >
          <MessageCircle className="h-4 w-4" />
          {comments.length > 0 ? `${comments.length} comentarios` : "Comentar"}
        </button>
        {isAdmin && (
          <button
            onClick={() =>
              startTransition(async () => {
                await deleteNewsItemAction(item.id);
                router.refresh();
              })
            }
            disabled={pending}
            className="press ml-auto flex items-center gap-1.5 rounded-full border border-rose-200 px-3 py-1.5 text-sm font-medium text-rose-600 transition hover:bg-rose-50 disabled:opacity-50"
          >
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
            Eliminar
          </button>
        )}
      </div>

      {showComments && (
        <div className="mt-3 animate-fade-in">
          <CommentSection
            entityType="news_item"
            entityId={item.id}
            initialComments={comments}
            title="Comentarios"
            placeholder="Comenta esta noticia."
          />
        </div>
      )}
    </article>
  );
});
