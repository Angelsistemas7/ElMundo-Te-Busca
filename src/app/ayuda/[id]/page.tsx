import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import { BadgeCheck, Clock3, MapPin, Phone, ShieldQuestion, Settings } from "lucide-react";
import { canManageAidPoint, getAidPointById, getComments } from "@/lib/data";
import { AID_POINT_TYPE_LABEL } from "@/lib/types";
import { timeAgo } from "@/lib/utils";
import { AidConsensusVote } from "@/components/AidConsensusVote";
import { LikeButton } from "@/components/LikeButton";
import { CommentSection } from "@/components/CommentSection";
import { BackLink } from "@/components/BackLink";

export const dynamic = "force-dynamic";

export default async function AidPointPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const point = await getAidPointById(id);
  if (!point) notFound();
  const [comments, canManage] = await Promise.all([
    getComments("aid_point", id),
    canManageAidPoint(id),
  ]);

  return (
    <div className="mx-auto max-w-2xl px-4 py-6">
      <BackLink label="Volver a puntos de ayuda" fallbackHref="/ayuda" />

      <article className="overflow-hidden rounded-2xl border border-zinc-200 bg-white">
        {point.photoUrl && (
          <div className="relative h-72 w-full">
            <Image
              src={point.photoUrl}
              alt={point.name}
              fill
              sizes="(min-width: 640px) 42rem, 100vw"
              className="object-cover"
              priority
            />
          </div>
        )}
        <div className="space-y-3 p-5">
          <div className="flex flex-wrap items-center gap-2">
            {point.types.map((t) => (
              <span key={t} className="rounded-full bg-zinc-100 px-2.5 py-0.5 text-xs font-medium text-zinc-600">
                {AID_POINT_TYPE_LABEL[t]}
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
            <span
              className={
                point.available
                  ? "rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700"
                  : "rounded-full bg-zinc-200 px-2 py-0.5 text-xs font-medium text-zinc-600"
              }
            >
              {point.available ? "Disponible" : "Agotado"}
            </span>
          </div>

          <h1 className="text-2xl font-bold tracking-tight text-navy-700">{point.name}</h1>

          <p className="flex items-start gap-1.5 text-sm text-zinc-600">
            <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-zinc-400" />
            {point.locationText}
            {point.estado ? `, ${point.estado}` : ""}
          </p>
          {point.scheduleText && (
            <p className="flex items-center gap-1.5 text-sm text-zinc-600">
              <Clock3 className="h-4 w-4 shrink-0 text-zinc-400" />
              {point.scheduleText}
            </p>
          )}
          {point.description && <p className="text-sm text-zinc-600">{point.description}</p>}

          <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-3">
            <AidConsensusVote id={point.id} votesAvailable={point.votesAvailable} votesDepleted={point.votesDepleted} />
          </div>

          <div className="flex items-center justify-between pt-1">
            <LikeButton kind="aid" id={point.id} likes={point.likes} />
            {point.contactPhone && (
              <a href={`tel:${point.contactPhone}`} className="press inline-flex items-center gap-1.5 text-sm font-medium text-brand-700 transition hover:underline">
                <Phone className="h-4 w-4" />
                {point.contactPhone}
              </a>
            )}
          </div>
          <p className="text-xs text-zinc-400">Actualizado {timeAgo(point.updatedAt)}</p>

          {canManage && (
            <Link
              href={`/ayuda/${point.id}/gestion`}
              className="press inline-flex items-center gap-1.5 rounded-lg border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50"
            >
              <Settings className="h-4 w-4" />
              Gestionar este punto
            </Link>
          )}
        </div>
      </article>

      <div className="mt-6">
        <CommentSection
          entityType="aid_point"
          entityId={point.id}
          initialComments={comments}
          title="Comentarios y evidencias"
          placeholder="¿Estuviste aquí? Confirma, agradece o sube una foto como evidencia."
        />
      </div>
    </div>
  );
}
