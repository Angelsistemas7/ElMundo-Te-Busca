import Link from "next/link";
import Image from "next/image";
import { memo } from "react";
import { MapPin, MessageCircle, Phone } from "lucide-react";
import type { Pet, PetStatus } from "@/lib/types";
import { PET_SPECIES_LABEL, PET_STATUS_EMOJI, PET_STATUS_LABEL } from "@/lib/types";
import { cn, timeAgo } from "@/lib/utils";
import { SaveButton } from "./SaveButton";

const STATUS_STYLE: Record<PetStatus, string> = {
  perdida: "bg-rose-50 text-rose-700 border-rose-200",
  encontrada: "bg-emerald-50 text-emerald-700 border-emerald-200",
  refugio: "bg-sky-50 text-sky-700 border-sky-200",
  veterinario: "bg-amber-50 text-amber-700 border-amber-200",
};

export const PetCard = memo(function PetCard({ pet, commentCount }: { pet: Pet; commentCount: number }) {
  return (
    <article className="tap-card overflow-hidden rounded-3xl border border-zinc-200 bg-white">
      {pet.photoUrl ? (
        <div className="relative h-44 w-full">
          <Image
            src={pet.photoUrl}
            alt={pet.name || "Mascota"}
            fill
            sizes="(min-width: 1024px) 320px, (min-width: 640px) 45vw, 100vw"
            className="object-cover"
          />
        </div>
      ) : (
        <div className="flex h-28 items-center justify-center bg-gradient-to-br from-zinc-50 to-amber-50 text-5xl">
          {pet.species === "gato" ? "🐈" : pet.species === "perro" ? "🐕" : "🐾"}
        </div>
      )}

      <div className="space-y-2 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={cn(
              "inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-semibold",
              STATUS_STYLE[pet.status],
            )}
          >
            {PET_STATUS_EMOJI[pet.status]} {PET_STATUS_LABEL[pet.status]}
          </span>
          <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-600">
            {PET_SPECIES_LABEL[pet.species]}
          </span>
          <span className="ml-auto text-xs text-zinc-400">{timeAgo(pet.createdAt)}</span>
        </div>

        {pet.name && <h3 className="font-semibold text-zinc-900">{pet.name}</h3>}
        <p className="line-clamp-3 text-sm text-zinc-600">{pet.description}</p>

        {(pet.locationText || pet.estado) && (
          <p className="flex items-start gap-1.5 text-sm text-zinc-500">
            <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-zinc-400" />
            {[pet.locationText, pet.estado].filter(Boolean).join(", ")}
          </p>
        )}

        <div className="flex items-center justify-between border-t border-zinc-100 pt-2.5">
          {pet.contactPhone ? (
            <a
              href={`tel:${pet.contactPhone}`}
              className="press inline-flex items-center gap-1.5 text-sm font-medium text-brand-700 transition hover:underline"
            >
              <Phone className="h-4 w-4" />
              {pet.contactPhone}
            </a>
          ) : (
            <span className="text-xs text-zinc-400">Sin teléfono</span>
          )}
          <div className="flex items-center gap-2">
            <SaveButton
              type="pet"
              id={pet.id}
              title={pet.name || pet.description}
              showLabel={false}
              className="border-0 px-1.5 py-1"
            />
            <Link
              href={`/mascotas/${pet.id}`}
              className="press flex items-center gap-1.5 text-sm font-medium text-zinc-600 transition hover:text-zinc-900"
            >
              <MessageCircle className="h-4 w-4" />
              {commentCount > 0 ? `${commentCount}` : "Ver y comentar"}
            </Link>
          </div>
        </div>
      </div>
    </article>
  );
});
