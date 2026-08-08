import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import { Clock3, MapPin, Phone, Settings } from "lucide-react";
import { canManagePet, getComments, getPetById } from "@/lib/data";
import { PET_SPECIES_LABEL, PET_STATUS_EMOJI, PET_STATUS_LABEL, type PetStatus } from "@/lib/types";
import { cn, timeAgo } from "@/lib/utils";
import { SaveButton } from "@/components/SaveButton";
import { PetShareButton } from "@/components/PetShareButton";
import { CommentSection } from "@/components/CommentSection";
import { BackLink } from "@/components/BackLink";

export const dynamic = "force-dynamic";

const STATUS_STYLE: Record<PetStatus, string> = {
  perdida: "bg-rose-50 text-rose-700 border-rose-200",
  encontrada: "bg-emerald-50 text-emerald-700 border-emerald-200",
  refugio: "bg-sky-50 text-sky-700 border-sky-200",
  veterinario: "bg-amber-50 text-amber-700 border-amber-200",
};

export default async function PetPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const pet = await getPetById(id);
  if (!pet) notFound();
  const [comments, canManage] = await Promise.all([getComments("pet", id), canManagePet(id)]);

  return (
    <div className="mx-auto max-w-2xl px-4 py-6">
      <BackLink label="Volver a mascotas" fallbackHref="/mascotas" />

      <article className="overflow-hidden rounded-2xl border border-zinc-200 bg-white">
        {pet.photoUrl ? (
          <div className="relative h-72 w-full">
            <Image
              src={pet.photoUrl}
              alt={pet.name || "Mascota"}
              fill
              sizes="(min-width: 640px) 42rem, 100vw"
              className="object-cover"
              priority
            />
          </div>
        ) : (
          <div className="flex h-40 items-center justify-center bg-gradient-to-br from-zinc-50 to-amber-50 text-6xl">
            {pet.species === "gato" ? "🐈" : pet.species === "perro" ? "🐕" : "🐾"}
          </div>
        )}
        <div className="space-y-3 p-5">
          <div className="flex flex-wrap items-center gap-2">
            <span className={cn("inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-semibold", STATUS_STYLE[pet.status])}>
              {PET_STATUS_EMOJI[pet.status]} {PET_STATUS_LABEL[pet.status]}
            </span>
            <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-600">
              {PET_SPECIES_LABEL[pet.species]}
            </span>
          </div>

          <h1 className="text-2xl font-bold tracking-tight text-zinc-900">{pet.name || "Mascota sin nombre"}</h1>

          <p className="text-sm text-zinc-600">{pet.description}</p>

          {(pet.locationText || pet.estado) && (
            <p className="flex items-start gap-1.5 text-sm text-zinc-600">
              <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-zinc-400" />
              {[pet.locationText, pet.estado].filter(Boolean).join(", ")}
            </p>
          )}
          <p className="flex items-center gap-1.5 text-sm text-zinc-500">
            <Clock3 className="h-4 w-4 shrink-0 text-zinc-400" />
            Actualizado {timeAgo(pet.updatedAt)}
          </p>

          <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
            <div className="flex items-center gap-2">
              <SaveButton type="pet" id={pet.id} title={pet.name || pet.description} showLabel={false} />
              <PetShareButton name={pet.name || "esta mascota"} />
            </div>
            {pet.contactPhone && (
              <a href={`tel:${pet.contactPhone}`} className="press inline-flex items-center gap-1.5 text-sm font-medium text-brand-700 transition hover:underline">
                <Phone className="h-4 w-4" />
                {pet.contactPhone}
              </a>
            )}
          </div>

          {canManage && (
            <Link
              href={`/mascotas/${pet.id}/gestion`}
              className="press inline-flex items-center gap-1.5 rounded-lg border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50"
            >
              <Settings className="h-4 w-4" />
              Gestionar esta mascota
            </Link>
          )}
        </div>
      </article>

      <div className="mt-6">
        <CommentSection
          entityType="pet"
          entityId={pet.id}
          initialComments={comments}
          title="Comentarios"
          placeholder="¿La viste? Aporta dónde y cuándo, o sube una foto."
        />
      </div>
    </div>
  );
}
