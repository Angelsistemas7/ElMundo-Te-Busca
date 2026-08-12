import { notFound } from "next/navigation";
import Image from "next/image";
import { BadgeCheck, Clock3, MapPin, Phone, ShieldQuestion, Stethoscope } from "lucide-react";
import { BackLink } from "@/components/BackLink";
import { getComments, getHospitalById, getHospitalPatients } from "@/lib/data";
import { HOSPITAL_STATUS_LABEL } from "@/lib/types";
import { cn, formatDateTime } from "@/lib/utils";
import { HOSPITAL_STATUS_STYLE } from "@/components/HospitalCard";
import { HospitalStatusControl } from "@/components/HospitalStatusControl";
import { HospitalSuppliesVote } from "@/components/HospitalSuppliesVote";
import { HospitalPatients } from "@/components/HospitalPatients";
import { LikeButton } from "@/components/LikeButton";
import { SaveButton } from "@/components/SaveButton";
import { CommentSection } from "@/components/CommentSection";

export const dynamic = "force-dynamic";

export default async function HospitalPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const hospital = await getHospitalById(id);
  if (!hospital) notFound();

  const [patients, comments] = await Promise.all([
    getHospitalPatients(id),
    getComments("hospital", id),
  ]);
  const s = HOSPITAL_STATUS_STYLE[hospital.status];

  return (
    <div className="mx-auto max-w-3xl px-4 py-6">
      <BackLink label="Volver a hospitales" fallbackHref="/hospitales" />

      <div className="rounded-2xl border border-zinc-200 bg-white p-5">
        {hospital.photoUrl && (
          <div className="relative -mx-5 -mt-5 mb-4 h-56 w-[calc(100%+2.5rem)] overflow-hidden rounded-t-2xl">
            <Image src={hospital.photoUrl} alt={hospital.name} fill sizes="(min-width: 768px) 672px, 100vw" className="object-cover" />
          </div>
        )}
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-navy-700">{hospital.name}</h1>
            {(hospital.locationText || hospital.estado) && (
              <p className="mt-1 flex items-center gap-1.5 text-sm text-zinc-500">
                <MapPin className="h-4 w-4 text-zinc-400" />
                {[hospital.locationText, hospital.estado].filter(Boolean).join(", ")}
              </p>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {hospital.verified ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700">
                <BadgeCheck className="h-3.5 w-3.5" /> Verificado
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700">
                <ShieldQuestion className="h-3.5 w-3.5" /> Por verificar
              </span>
            )}
            <span className={cn("inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm font-semibold", s.chip)}>
              <span className={cn("h-2 w-2 rounded-full", s.dot)} />
              {HOSPITAL_STATUS_LABEL[hospital.status]}
            </span>
          </div>
        </div>

        {hospital.specialties.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-1.5">
            {hospital.specialties.map((sp) => (
              <span key={sp} className="inline-flex items-center gap-1 rounded-full bg-sky-50 px-2.5 py-1 text-xs font-medium text-sky-700">
                <Stethoscope className="h-3.5 w-3.5" />
                {sp}
              </span>
            ))}
          </div>
        )}

        {hospital.needsText && (
          <p className="mt-4 rounded-lg bg-amber-50 px-3 py-2.5 text-sm text-amber-800">{hospital.needsText}</p>
        )}

        <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-zinc-600">
          {hospital.contactPhone && (
            <a href={`tel:${hospital.contactPhone}`} className="flex items-center gap-1.5 font-medium text-brand-700 hover:underline">
              <Phone className="h-4 w-4" />
              {hospital.contactPhone}
              {hospital.contactName ? ` · ${hospital.contactName}` : ""}
            </a>
          )}
          <span className="flex items-center gap-1.5 text-xs text-zinc-400">
            <Clock3 className="h-3.5 w-3.5" />
            Actualizado {formatDateTime(hospital.updatedAt)}
          </span>
        </div>

        <div className="mt-4 rounded-xl border border-zinc-200 bg-zinc-50 p-3">
          <HospitalSuppliesVote
            id={hospital.id}
            votesSupplies={hospital.votesSupplies}
            votesNoSupplies={hospital.votesNoSupplies}
          />
        </div>

        <div className="mt-4">
          <HospitalStatusControl id={hospital.id} status={hospital.status} needsText={hospital.needsText} />
        </div>

        <div className="mt-4 flex items-center gap-2 border-t border-zinc-100 pt-3">
          <LikeButton kind="hospital" id={hospital.id} likes={hospital.likes} />
          <SaveButton type="hospital" id={hospital.id} title={hospital.name} />
        </div>
      </div>

      <div className="mt-6">
        <HospitalPatients hospitalId={hospital.id} patients={patients} />
      </div>

      <div className="mt-6">
        <CommentSection
          entityType="hospital"
          entityId={hospital.id}
          initialComments={comments}
          title="Comentarios, fotos y listas"
          placeholder="Personal y comunidad: aporta el estado, sube una foto de la lista de atendidos. Por favor, verifica que la información sea verídica: hay familias buscando con desesperación."
        />
      </div>
    </div>
  );
}
