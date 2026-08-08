"use client";

import { memo, useState } from "react";
import { BadgeCheck, Clock, ExternalLink, MapPin, MessageCircle } from "lucide-react";
import type { Comment, Hero } from "@/lib/types";
import { HERO_CATEGORY_EMOJI, HERO_CATEGORY_LABEL } from "@/lib/types";
import { cn, timeAgo } from "@/lib/utils";
import { LikeButton } from "./LikeButton";
import { CommentSection } from "./CommentSection";
import { ExternalLinkGuard } from "./ExternalLinkGuard";
import { PhotoView } from "./PhotoView";
import { SaveButton } from "./SaveButton";

export const HeroCard = memo(function HeroCard({ hero, comments }: { hero: Hero; comments: Comment[] }) {
  const [showComments, setShowComments] = useState(false);

  return (
    <article
      className={cn(
        "tap-card rounded-3xl border bg-white p-4 sm:p-5",
        hero.verified ? "border-zinc-200" : "border-dashed border-warning-300",
      )}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-xs font-semibold text-amber-700">
          <span>{HERO_CATEGORY_EMOJI[hero.category]}</span>
          {HERO_CATEGORY_LABEL[hero.category]}
        </span>
        {hero.verified ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700">
            <BadgeCheck className="h-3.5 w-3.5" />
            Verificado
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-semibold text-zinc-500">
            <Clock className="h-3.5 w-3.5" />
            Propuesto por la comunidad · sin verificar
          </span>
        )}
        <span className="ml-auto text-xs text-zinc-400">{timeAgo(hero.createdAt)}</span>
      </div>

      <h3 className="mt-3 text-lg font-bold text-zinc-900">{hero.title}</h3>
      <p className="mt-1 whitespace-pre-wrap text-[15px] leading-relaxed text-zinc-700">{hero.body}</p>

      {hero.photoUrl && (
        <PhotoView src={hero.photoUrl} className="mt-3 max-h-96 w-full rounded-xl object-cover" />
      )}

      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-zinc-500">
        {(hero.locationText || hero.estado) && (
          <span className="inline-flex items-center gap-1">
            <MapPin className="h-3.5 w-3.5" />
            {[hero.locationText, hero.estado].filter(Boolean).join(", ")}
          </span>
        )}
        {hero.sourceName &&
          (hero.sourceUrl ? (
            <ExternalLinkGuard
              href={hero.sourceUrl}
              className="inline-flex items-center gap-1 font-medium text-brand-700 hover:underline"
            >
              Fuente: {hero.sourceName}
              <ExternalLink className="h-3 w-3" />
            </ExternalLinkGuard>
          ) : (
            <span>Fuente: {hero.sourceName}</span>
          ))}
        <span>Propuesto por {hero.authorName}</span>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-zinc-100 pt-3">
        <LikeButton kind="hero" id={hero.id} likes={hero.likes} />
        <SaveButton type="hero" id={hero.id} title={hero.title} className="ml-auto" showLabel={false} />
        <button
          onClick={() => setShowComments((v) => !v)}
          className="press flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium text-zinc-600 transition hover:bg-zinc-50"
        >
          <MessageCircle className="h-4 w-4" />
          {comments.length > 0 ? `${comments.length} comentarios` : "Comentar"}
        </button>
      </div>

      {showComments && (
        <div className="mt-3 animate-fade-in">
          <CommentSection
            entityType="hero"
            entityId={hero.id}
            initialComments={comments}
            title="Comentarios"
            placeholder="Agradece o aporta contexto sobre este reconocimiento."
          />
        </div>
      )}
    </article>
  );
});
