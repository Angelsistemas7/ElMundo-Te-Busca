import { Suspense } from "react";
import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import { BadgeCheck, Clock3, MapPin, Phone, ShieldQuestion, Settings } from "lucide-react";
import { canManageAidPoint, getAidPointById, getComments, getMarches, getPosts } from "@/lib/data";
import {
  AID_POINT_TYPE_LABEL,
  AID_STOCK_LEVEL_EMOJI,
  AID_STOCK_LEVEL_LABEL,
  POST_TYPE_EMOJI,
  POST_TYPE_LABEL,
} from "@/lib/types";
import { timeAgo } from "@/lib/utils";
import { AidConsensusVote } from "@/components/AidConsensusVote";
import { LikeButton } from "@/components/LikeButton";
import { CommentSection } from "@/components/CommentSection";
import { BackLink } from "@/components/BackLink";
import { CommentSectionSkeleton } from "@/components/ListSkeletons";

export const dynamic = "force-dynamic";

// "Gestionar este punto" depende de sesión/rol (hasta 3 consultas
// encadenadas en `canManageAidPoint`) — en su propio Suspense para no
// retrasar el primer pintado de la ficha por un enlace secundario.
async function GestionarLink({ pointId }: { pointId: string }) {
  const canManage = await canManageAidPoint(pointId);
  if (!canManage) return null;
  return (
    <Link
      href={`/ayuda/${pointId}/gestion`}
      className="press inline-flex items-center gap-1.5 rounded-lg border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50"
    >
      <Settings className="h-4 w-4" />
      Gestionar este punto
    </Link>
  );
}

// Publicaciones/caravanas vinculadas + comentarios: lo menos urgente de la
// ficha, en un solo Suspense (mismo criterio que la ficha de persona).
async function AyudaSecondary({ pointId, country }: { pointId: string; country: string }) {
  const [comments, linkedPosts, allMarches] = await Promise.all([
    getComments("aid_point", pointId),
    getPosts({ country, aidPointId: pointId }),
    getMarches(),
  ]);
  const linkedMarches = allMarches.filter((m) => m.aidPointId === pointId);

  return (
    <>
      {(linkedPosts.length > 0 || linkedMarches.length > 0) && (
        <div className="mt-6 rounded-2xl border border-zinc-200 bg-white p-5">
          <h2 className="font-bold text-zinc-900">Necesidades y caravanas vinculadas a este punto</h2>
          <p className="mt-1 text-sm text-zinc-500">
            Publicaciones de la comunidad que la gente vinculó a este punto de ayuda al publicar.
          </p>
          <ul className="mt-3 space-y-2">
            {linkedPosts.map((p) => (
              <li key={`post-${p.id}`}>
                <Link
                  href="/comunidad"
                  className="flex items-start gap-2 rounded-xl border border-zinc-200 px-3 py-2.5 text-sm transition hover:bg-zinc-50"
                >
                  <span className="shrink-0">{POST_TYPE_EMOJI[p.type]}</span>
                  <span className="min-w-0">
                    <span className="block font-medium text-zinc-800">{POST_TYPE_LABEL[p.type]}</span>
                    <span className="line-clamp-2 text-zinc-600">{p.body}</span>
                  </span>
                </Link>
              </li>
            ))}
            {linkedMarches.map((m) => (
              <li key={`march-${m.id}`}>
                <Link
                  href={`/caravanas/${m.id}`}
                  className="flex items-start gap-2 rounded-xl border border-zinc-200 px-3 py-2.5 text-sm transition hover:bg-zinc-50"
                >
                  <span className="shrink-0">🚐</span>
                  <span className="min-w-0">
                    <span className="block font-medium text-zinc-800">{m.title}</span>
                    <span className="text-zinc-600">
                      {m.originText} → {m.destinationText}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-6">
        <CommentSection
          entityType="aid_point"
          entityId={pointId}
          initialComments={comments}
          title="Comentarios y evidencias"
          placeholder="¿Estuviste aquí? Confirma, agradece o sube una foto como evidencia."
        />
      </div>
    </>
  );
}

export default async function AidPointPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const point = await getAidPointById(id);
  if (!point) notFound();

  return (
    <div className="mx-auto max-w-2xl px-4 py-6">
      <BackLink label="Volver a puntos de ayuda" fallbackHref="/ayuda" />

      <article className="overflow-hidden rounded-2xl border border-zinc-200 bg-white">
        {point.photoUrl && (
          <div
            className="relative h-72 w-full"
            style={{ viewTransitionName: `aid-photo-${point.id}` } as React.CSSProperties}
          >
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
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">
              Existencias por recurso
            </p>
            <ul className="space-y-1.5">
              {point.types.map((t) => {
                const level = point.categoryStatus?.[t] ?? "cubierto";
                return (
                  <li key={t} className="flex items-center justify-between gap-2 text-sm">
                    <span className="text-zinc-700">{AID_POINT_TYPE_LABEL[t]}</span>
                    <span className="font-medium text-zinc-600">
                      {AID_STOCK_LEVEL_EMOJI[level]} {AID_STOCK_LEVEL_LABEL[level]}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>

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

          <Suspense fallback={null}>
            <GestionarLink pointId={point.id} />
          </Suspense>
        </div>
      </article>

      <Suspense fallback={<CommentSectionSkeleton />}>
        <AyudaSecondary pointId={point.id} country={point.country ?? "ve"} />
      </Suspense>
    </div>
  );
}
