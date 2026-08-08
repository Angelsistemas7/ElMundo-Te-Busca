import Link from "next/link";
import { memo } from "react";
import { CalendarClock, MapPin, MessageCircle, MessageSquare, Navigation, Users } from "lucide-react";
import type { March } from "@/lib/types";
import { formatDateTime } from "@/lib/utils";
import { LikeButton } from "./LikeButton";
import { SaveButton } from "./SaveButton";

export const MarchCard = memo(function MarchCard({ march }: { march: March }) {
  const isPast = new Date(march.departAt).getTime() < Date.now();

  return (
    <article className={`tap-card flex flex-col gap-3 rounded-3xl border border-zinc-200 bg-white p-5 ${isPast ? "opacity-70" : ""}`}>
      <div className="flex items-start justify-between gap-3">
        <h3 className="font-semibold text-zinc-900">{march.title}</h3>
        {isPast ? (
          <span className="shrink-0 rounded-full bg-zinc-100 px-2.5 py-0.5 text-xs font-medium text-zinc-500">
            Finalizada
          </span>
        ) : (
          <span className="shrink-0 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-700">
            Próxima
          </span>
        )}
      </div>

      <p className="flex items-center gap-2 text-sm font-medium text-brand-700">
        <CalendarClock className="h-4 w-4" />
        {formatDateTime(march.departAt)}
      </p>

      <div className="space-y-1.5 text-sm text-zinc-600">
        <p className="flex items-start gap-2">
          <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-zinc-400" />
          <span>
            <span className="font-medium text-zinc-500">Salida:</span> {march.originText}
          </span>
        </p>
        <p className="flex items-start gap-2">
          <Navigation className="mt-0.5 h-4 w-4 shrink-0 text-zinc-400" />
          <span>
            <span className="font-medium text-zinc-500">Destino:</span> {march.destinationText}
          </span>
        </p>
      </div>

      {march.description && <p className="text-sm text-zinc-500">{march.description}</p>}

      {march.whatsappUrl && (
        <a
          href={march.whatsappUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="press inline-flex w-fit items-center gap-1.5 rounded-lg bg-[#25D366] px-3 py-1.5 text-sm font-semibold text-white transition hover:brightness-95"
        >
          <MessageSquare className="h-4 w-4" />
          Grupo de WhatsApp
        </a>
      )}

      <div className="mt-auto flex items-center justify-between border-t border-zinc-100 pt-3">
        <div className="flex items-center gap-2">
          <LikeButton kind="march" id={march.id} likes={march.likes} />
          <SaveButton type="march" id={march.id} title={march.title} showLabel={false} />
          <span className="flex items-center gap-1 text-sm text-zinc-500">
            <Users className="h-4 w-4 text-zinc-400" />
            {march.attendeesCount}
          </span>
        </div>
        <Link
          href={`/caravanas/${march.id}`}
          className="press flex items-center gap-1.5 text-sm font-medium text-zinc-600 transition hover:text-zinc-900"
        >
          <MessageCircle className="h-4 w-4" />
          Ver y comentar
        </Link>
      </div>
    </article>
  );
});
