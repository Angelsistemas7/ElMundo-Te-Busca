import Image from "next/image";
import { memo } from "react";
import { BadgeCheck, Clock3, MapPin, MessageCircle, Phone, ShieldQuestion } from "lucide-react";
import type { AidPoint, AidPointType } from "@/lib/types";
import { AID_POINT_TYPE_LABEL } from "@/lib/types";
import { cn, timeAgo } from "@/lib/utils";
import { AidConsensusVote } from "./AidConsensusVote";
import { LikeButton } from "./LikeButton";
import { SaveButton } from "./SaveButton";
import { ViewTransitionLink } from "./ViewTransitionLink";

const TYPE_EMOJI: Record<AidPointType, string> = {
  comida: "🍲",
  agua: "💧",
  medicina: "💊",
  refugio: "🏠",
  alojamiento: "🛏️",
  ropa: "👕",
  otro: "📦",
};

export const AidPointCard = memo(function AidPointCard({ point }: { point: AidPoint }) {
  return (
    <article
      className={cn(
        "tap-card relative flex flex-col overflow-hidden rounded-3xl border bg-white",
        point.available ? "border-zinc-200" : "border-zinc-200 opacity-75",
      )}
    >
      {!point.available && (
        <div className="absolute right-3 top-3 z-10 rounded-full bg-zinc-900/85 px-2.5 py-1 text-xs font-bold text-white">
          Agotado
        </div>
      )}
      {point.photoUrl ? (
        <div
          className="relative h-40 w-full"
          style={{ viewTransitionName: `aid-photo-${point.id}` } as React.CSSProperties}
        >
          <Image
            src={point.photoUrl}
            alt={point.name}
            fill
            sizes="(min-width: 1024px) 320px, (min-width: 640px) 45vw, 100vw"
            className="object-cover"
          />
        </div>
      ) : (
        <div className="flex h-28 items-center justify-center gap-1 bg-gradient-to-br from-brand-50 to-amber-100 text-5xl">
          {point.types.map((t) => (
            <span key={t}>{TYPE_EMOJI[t]}</span>
          ))}
        </div>
      )}

      <div className="flex flex-1 flex-col gap-2 p-4">
        <div className="flex flex-wrap items-center gap-2">
          {point.types.map((t) => (
            <span key={t} className="rounded-full bg-zinc-100 px-2.5 py-0.5 text-xs font-medium text-zinc-600">
              {TYPE_EMOJI[t]} {AID_POINT_TYPE_LABEL[t]}
            </span>
          ))}
          {point.verified ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-700">
              <BadgeCheck className="h-3.5 w-3.5" /> Verificado
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-medium text-amber-700">
              <ShieldQuestion className="h-3.5 w-3.5" /> Por verificar
            </span>
          )}
          {point.available ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
              Disponible
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 rounded-full bg-zinc-200 px-2 py-0.5 text-xs font-medium text-zinc-600">
              Agotado
            </span>
          )}
        </div>

        <AidConsensusVote
          id={point.id}
          votesAvailable={point.votesAvailable}
          votesDepleted={point.votesDepleted}
        />

        <h3 className="font-semibold text-zinc-900">{point.name}</h3>

        <p className="flex items-start gap-1.5 text-sm text-zinc-600">
          <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-zinc-400" />
          <span>
            {point.locationText}
            {point.estado ? `, ${point.estado}` : ""}
          </span>
        </p>

        {point.scheduleText && (
          <p className="flex items-center gap-1.5 text-sm text-zinc-600">
            <Clock3 className="h-4 w-4 shrink-0 text-zinc-400" />
            {point.scheduleText}
          </p>
        )}

        {point.description && (
          <p className="line-clamp-3 text-sm text-zinc-500">{point.description}</p>
        )}

        <div className="flex items-center justify-between pt-1">
          {point.contactPhone ? (
            <a
              href={`tel:${point.contactPhone}`}
              className="press inline-flex items-center gap-1.5 text-sm font-medium text-brand-700 transition hover:underline"
            >
              <Phone className="h-4 w-4" />
              {point.contactPhone}
            </a>
          ) : (
            <span />
          )}
          <span className="text-xs text-zinc-400">act. {timeAgo(point.updatedAt)}</span>
        </div>

        <div className="mt-auto flex items-center justify-between border-t border-zinc-100 pt-3">
          <div className="flex items-center gap-2">
            <LikeButton kind="aid" id={point.id} likes={point.likes} />
            <SaveButton type="aid_point" id={point.id} title={point.name} showLabel={false} />
          </div>
          <ViewTransitionLink
            href={`/ayuda/${point.id}`}
            className="press flex items-center gap-1.5 text-sm font-medium text-zinc-600 transition hover:text-zinc-900"
          >
            <MessageCircle className="h-4 w-4" />
            Ver y comentar
          </ViewTransitionLink>
        </div>
      </div>
    </article>
  );
});
