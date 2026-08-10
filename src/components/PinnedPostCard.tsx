"use client";

import { useState } from "react";
import type { Comment, Post } from "@/lib/types";
import { POST_TYPE_EMOJI, POST_TYPE_LABEL } from "@/lib/types";
import { timeAgo } from "@/lib/utils";
import { Modal } from "./Modal";
import { PostCard } from "./PostCard";

// Vista compacta de un post fijado/destacado, para una fila que se desliza de
// lado en vez de apilarse verticalmente (antes había que bajar y bajar antes
// de llegar al muro normal). Al tocarla se abre la publicación completa —con
// foto, reacciones y comentarios— en un modal; no hay ficha propia por post.
export function PinnedPostCard({ post, comments, tone }: { post: Post; comments: Comment[]; tone: "amber" | "red" }) {
  const [open, setOpen] = useState(false);
  const toneClass =
    tone === "red"
      ? "border-red-200 bg-white hover:border-red-300"
      : "border-amber-200 bg-white hover:border-amber-300";

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className={`tap-card flex w-64 shrink-0 snap-start flex-col gap-1.5 rounded-2xl border p-3 text-left ${toneClass}`}
      >
        <div className="flex items-center gap-1.5 text-xs font-semibold text-zinc-500">
          <span>{POST_TYPE_EMOJI[post.type]}</span>
          {POST_TYPE_LABEL[post.type]}
          <span className="ml-auto font-normal text-zinc-400">{timeAgo(post.createdAt)}</span>
        </div>
        <p className="line-clamp-3 text-sm text-zinc-800">{post.body}</p>
        {post.locationText && <p className="line-clamp-1 text-xs text-zinc-500">📍 {post.locationText}</p>}
      </button>

      <Modal open={open} onClose={() => setOpen(false)} title={POST_TYPE_LABEL[post.type]}>
        <PostCard post={post} comments={comments} />
      </Modal>
    </>
  );
}
