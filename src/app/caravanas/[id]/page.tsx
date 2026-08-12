import Link from "next/link";
import { notFound } from "next/navigation";
import {
  CalendarClock,
  HandHeart,
  MapPin,
  MessageSquare,
  Navigation,
  Phone,
  Settings,
  Users,
} from "lucide-react";
import { canManageMarch, getAidPointById, getComments, getMarchById } from "@/lib/data";
import { formatDateTime } from "@/lib/utils";
import { LikeButton } from "@/components/LikeButton";
import { CommentSection } from "@/components/CommentSection";
import { BackLink } from "@/components/BackLink";

export const dynamic = "force-dynamic";

export default async function CaravanaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const march = await getMarchById(id);
  if (!march) notFound();
  const [comments, canManage, linkedAidPoint] = await Promise.all([
    getComments("march", id),
    canManageMarch(id),
    march.aidPointId ? getAidPointById(march.aidPointId) : Promise.resolve(null),
  ]);
  const isPast = new Date(march.departAt).getTime() < Date.now();

  return (
    <div className="mx-auto max-w-2xl px-4 py-6">
      <BackLink label="Volver a caravanas" fallbackHref="/caravanas" />

      <article className="space-y-4 rounded-2xl border border-zinc-200 bg-white p-5">
        <div className="flex items-start justify-between gap-3">
          <h1 className="text-2xl font-bold tracking-tight text-navy-700">{march.title}</h1>
          <span
            className={
              isPast
                ? "shrink-0 rounded-full bg-zinc-100 px-2.5 py-0.5 text-xs font-medium text-zinc-500"
                : "shrink-0 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-700"
            }
          >
            {isPast ? "Finalizada" : "Próxima"}
          </span>
        </div>

        <p className="flex items-center gap-2 text-sm font-medium text-brand-700">
          <CalendarClock className="h-4 w-4" />
          {formatDateTime(march.departAt)}
        </p>

        <div className="space-y-1.5 text-sm text-zinc-600">
          <p className="flex items-start gap-2">
            <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-zinc-400" />
            <span><span className="font-medium text-zinc-500">Salida:</span> {march.originText}</span>
          </p>
          <p className="flex items-start gap-2">
            <Navigation className="mt-0.5 h-4 w-4 shrink-0 text-zinc-400" />
            <span><span className="font-medium text-zinc-500">Destino:</span> {march.destinationText}</span>
          </p>
        </div>

        {march.description && <p className="text-sm text-zinc-600">{march.description}</p>}

        {linkedAidPoint && (
          <Link
            href={`/ayuda/${linkedAidPoint.id}`}
            className="inline-flex items-center gap-1.5 rounded-full border border-brand-200 bg-brand-50 px-2.5 py-1 text-xs font-medium text-brand-700 transition hover:bg-brand-100"
          >
            <HandHeart className="h-3.5 w-3.5" />
            Vinculada a {linkedAidPoint.name}
          </Link>
        )}

        {march.whatsappUrl && (
          <a
            href={march.whatsappUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="press inline-flex items-center gap-2 rounded-xl bg-[#25D366] px-4 py-2.5 text-sm font-semibold text-white transition hover:brightness-95"
          >
            <MessageSquare className="h-4 w-4" />
            Unirse al grupo de WhatsApp
          </a>
        )}

        <div className="flex items-center justify-between border-t border-zinc-100 pt-3">
          <div className="flex items-center gap-3">
            <LikeButton kind="march" id={march.id} likes={march.likes} />
            <span className="flex items-center gap-1.5 text-sm text-zinc-500">
              <Users className="h-4 w-4 text-zinc-400" />
              {march.attendeesCount}
            </span>
          </div>
          <a href={`tel:${march.organizerPhone}`} className="press inline-flex items-center gap-1.5 text-sm font-medium text-brand-700 transition hover:underline">
            <Phone className="h-4 w-4" />
            {march.organizerName}
          </a>
        </div>

        {canManage && (
          <Link
            href={`/caravanas/${march.id}/gestion`}
            className="press inline-flex items-center gap-1.5 rounded-lg border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50"
          >
            <Settings className="h-4 w-4" />
            Gestionar esta caravana
          </Link>
        )}
      </article>

      <div className="mt-6">
        <CommentSection
          entityType="march"
          entityId={march.id}
          initialComments={comments}
          title="Coordinación y comentarios"
          placeholder="¿Qué vas a llevar? ¿Te sumas? Coordina aquí o sube una foto."
        />
      </div>
    </div>
  );
}
