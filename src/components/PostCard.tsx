"use client";

import { memo, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ExternalLink, Loader2, MapPin, MessageCircle, Pin, Trash2 } from "lucide-react";
import type { Comment, Post, ReactionKind } from "@/lib/types";
import { POST_ORIGIN_EMOJI, POST_ORIGIN_LABEL, POST_TYPE_EMOJI, POST_TYPE_LABEL, REACTION_EMOJI } from "@/lib/types";
import { cn, timeAgo } from "@/lib/utils";
import { isTweetUrl } from "@/lib/socialEmbed";
import { reactToPostAction } from "@/app/actions";
import { deletePostModAction } from "@/app/admin/actions";
import { Avatar } from "./Avatar";
import { CommentSection } from "./CommentSection";
import { ExternalLinkGuard } from "./ExternalLinkGuard";
import { PhotoView } from "./PhotoView";
import { SaveButton } from "./SaveButton";
import { TweetEmbed } from "./TweetEmbed";

const TYPE_STYLE: Record<Post["type"], string> = {
  necesito: "bg-rose-50 text-rose-700 border-rose-200",
  ofrezco: "bg-emerald-50 text-emerald-700 border-emerald-200",
  rescate: "bg-red-100 text-red-800 border-red-300",
  medico: "bg-sky-50 text-sky-700 border-sky-200",
  caravana: "bg-violet-50 text-violet-700 border-violet-200",
  identificar: "bg-zinc-100 text-zinc-700 border-zinc-200",
  info: "bg-amber-50 text-amber-700 border-amber-200",
};

const REACTIONS: ReactionKind[] = ["apoyo", "corazon", "hecho"];

export const PostCard = memo(function PostCard({
  post,
  comments,
  canModerate = false,
}: {
  post: Post;
  comments: Comment[];
  /** Admin o moderador viendo el muro: puede eliminar cualquier post, sin ser el autor. */
  canModerate?: boolean;
}) {
  const router = useRouter();
  const [counts, setCounts] = useState(post.reactions);
  const [reacted, setReacted] = useState<Record<string, boolean>>({});
  const [showComments, setShowComments] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function moderatorDelete() {
    if (deleting) return;
    if (!window.confirm("¿Eliminar esta publicación? No se puede deshacer.")) return;
    setDeleting(true);
    const res = await deletePostModAction(post.id);
    if (res.ok) {
      router.refresh();
    } else {
      setDeleting(false);
    }
  }

  useEffect(() => {
    const state: Record<string, boolean> = {};
    for (const k of REACTIONS) {
      if (localStorage.getItem(`vtb_react_${post.id}_${k}`)) state[k] = true;
    }
    setReacted(state);
  }, [post.id]);

  async function react(kind: ReactionKind) {
    if (reacted[kind]) return;
    setReacted((r) => ({ ...r, [kind]: true }));
    setCounts((c) => ({ ...c, [kind]: (c[kind] ?? 0) + 1 }));
    localStorage.setItem(`vtb_react_${post.id}_${kind}`, "1");
    const res = await reactToPostAction(post.id, kind);
    if (!res.ok) {
      // El servidor no lo guardó: revertimos para no dejar el botón marcado
      // "para siempre" con un contador que en realidad nunca subió.
      setReacted((r) => ({ ...r, [kind]: false }));
      setCounts((c) => ({ ...c, [kind]: Math.max(0, (c[kind] ?? 1) - 1) }));
      localStorage.removeItem(`vtb_react_${post.id}_${kind}`);
    }
  }

  const urgent = post.type === "rescate";
  const totalReactions = REACTIONS.reduce((sum, k) => sum + (counts[k] ?? 0), 0);

  return (
    <article
      className={cn(
        "tap-card rounded-3xl border bg-white p-4 sm:p-5",
        urgent ? "border-danger-300 ring-1 ring-danger-200" : "border-zinc-200",
      )}
    >
      <div className="flex items-start gap-3">
        <Avatar src={post.authorAvatarUrl} username={post.authorUsername} size="md" className="mt-0.5" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-1.5">
            {post.authorUsername ? (
              <Link
                href={`/perfil/publico/${post.authorUsername}`}
                className="truncate text-sm font-semibold text-zinc-900 hover:underline"
              >
                {post.authorName}
              </Link>
            ) : (
              <span className="truncate text-sm font-semibold text-zinc-900">{post.authorName}</span>
            )}
            <span className="text-xs text-zinc-400">· {timeAgo(post.createdAt)}</span>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            {post.pinned && (
              <span className="inline-flex items-center gap-1 rounded-full border border-amber-300 bg-amber-50 px-2.5 py-0.5 text-xs font-semibold text-amber-700">
                <Pin className="h-3.5 w-3.5" />
                Fijado
              </span>
            )}
            <span className={cn("inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-semibold", TYPE_STYLE[post.type])}>
              <span>{POST_TYPE_EMOJI[post.type]}</span>
              {POST_TYPE_LABEL[post.type]}
            </span>
            {post.origin && post.origin !== "community" && (
              <span className="inline-flex items-center gap-1 rounded-full border border-sky-200 bg-sky-50 px-2.5 py-0.5 text-xs font-semibold text-sky-700">
                <span>{POST_ORIGIN_EMOJI[post.origin]}</span>
                Importado de {POST_ORIGIN_LABEL[post.origin]}
              </span>
            )}
            {(post.locationText || post.estado) && (
              <span className="inline-flex items-center gap-1 text-xs text-zinc-500">
                <MapPin className="h-3.5 w-3.5" />
                {[post.locationText, post.estado].filter(Boolean).join(", ")}
              </span>
            )}
            {post.contactPhone && (
              <a href={`tel:${post.contactPhone}`} className="text-xs font-medium text-brand-700 hover:underline">
                {post.contactPhone}
              </a>
            )}
          </div>
        </div>
      </div>

      <p className="mt-3 whitespace-pre-wrap text-[15px] leading-relaxed text-zinc-800">{post.body}</p>

      {post.photoUrl && (
        <PhotoView src={post.photoUrl} className="mt-3 h-64 w-full rounded-xl sm:h-80" />
      )}

      {post.linkUrl && (
        isTweetUrl(post.linkUrl) ? (
          <TweetEmbed url={post.linkUrl} />
        ) : (
          <ExternalLinkGuard
            href={post.linkUrl}
            className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-sky-700 hover:underline"
          >
            <ExternalLink className="h-4 w-4" />
            Ver enlace / video
          </ExternalLinkGuard>
        )
      )}

      {totalReactions > 0 && (
        <div className="mt-3 flex items-center gap-1.5 text-xs text-zinc-500">
          <span className="tracking-tight">
            {REACTIONS.filter((k) => counts[k] > 0)
              .map((k) => REACTION_EMOJI[k])
              .join(" ")}
          </span>
          <span>{totalReactions}</span>
        </div>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-zinc-100 pt-3">
        {REACTIONS.map((k) => (
          <button
            key={k}
            onClick={() => react(k)}
            disabled={reacted[k]}
            className={cn(
              "flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium transition",
              reacted[k]
                ? "border-brand-300 bg-brand-50 text-brand-700"
                : "border-zinc-200 text-zinc-600 hover:border-zinc-300 hover:bg-zinc-50 active:scale-95",
            )}
          >
            <span>{REACTION_EMOJI[k]}</span>
            <span className="tabular-nums">{counts[k] ?? 0}</span>
          </button>
        ))}
        <SaveButton type="post" id={post.id} title={post.body} className="ml-auto" showLabel={false} />
        <button
          onClick={() => setShowComments((v) => !v)}
          className="press flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium text-zinc-600 transition hover:bg-zinc-50"
        >
          <MessageCircle className="h-4 w-4" />
          {comments.length > 0 ? `${comments.length} comentarios` : "Comentar"}
        </button>
        {canModerate && (
          <button
            onClick={moderatorDelete}
            disabled={deleting}
            title="Eliminar publicación (admin/moderador)"
            className="press flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium text-rose-600 transition hover:bg-rose-50 disabled:opacity-50"
          >
            {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
            Eliminar
          </button>
        )}
      </div>

      {showComments && (
        <div className="mt-3 animate-fade-in">
          <CommentSection
            entityType="post"
            entityId={post.id}
            initialComments={comments}
            title="Comentarios"
            placeholder="Responde, coordina, aporta..."
          />
        </div>
      )}
    </article>
  );
});
