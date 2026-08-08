import { memo } from "react";
import { BadgeCheck, Clock3, MapPin, PackageCheck, PackageX, Phone, ShieldQuestion, Stethoscope, Users } from "lucide-react";
import type { Hospital, HospitalStatus } from "@/lib/types";
import { HOSPITAL_STATUS_LABEL } from "@/lib/types";
import { cn, timeAgo } from "@/lib/utils";
import { Card } from "./Card";

export const HOSPITAL_STATUS_STYLE: Record<HospitalStatus, { dot: string; chip: string }> = {
  operativo: { dot: "bg-emerald-500", chip: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  saturado: { dot: "bg-amber-500", chip: "bg-amber-50 text-amber-700 border-amber-200" },
  lleno: { dot: "bg-rose-500", chip: "bg-rose-50 text-rose-700 border-rose-200" },
  cerrado: { dot: "bg-zinc-400", chip: "bg-zinc-100 text-zinc-600 border-zinc-200" },
};

export const HospitalCard = memo(function HospitalCard({ hospital, patientCount }: { hospital: Hospital; patientCount: number }) {
  const s = HOSPITAL_STATUS_STYLE[hospital.status];

  return (
    <Card href={`/hospitales/${hospital.id}`} className="gap-3 p-5">
      <div className="flex items-start justify-between gap-3">
        <h3 className="font-semibold text-zinc-900">{hospital.name}</h3>
        <span className={cn("inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold", s.chip)}>
          <span className={cn("h-1.5 w-1.5 rounded-full", s.dot)} />
          {HOSPITAL_STATUS_LABEL[hospital.status]}
        </span>
      </div>

      <div>
        {hospital.verified ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-700">
            <BadgeCheck className="h-3.5 w-3.5" /> Verificado
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-medium text-amber-700">
            <ShieldQuestion className="h-3.5 w-3.5" /> Por verificar
          </span>
        )}
      </div>

      {(hospital.locationText || hospital.estado) && (
        <p className="flex items-center gap-1.5 text-sm text-zinc-500">
          <MapPin className="h-4 w-4 shrink-0 text-zinc-400" />
          {[hospital.locationText, hospital.estado].filter(Boolean).join(", ")}
        </p>
      )}

      {hospital.specialties.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {hospital.specialties.map((sp) => (
            <span key={sp} className="inline-flex items-center gap-1 rounded-full bg-sky-50 px-2 py-0.5 text-xs font-medium text-sky-700">
              <Stethoscope className="h-3 w-3" />
              {sp}
            </span>
          ))}
        </div>
      )}

      {hospital.votesSupplies + hospital.votesNoSupplies > 0 && (
        <span
          className={cn(
            "inline-flex w-fit items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold",
            hospital.votesSupplies >= hospital.votesNoSupplies
              ? "bg-emerald-50 text-emerald-700"
              : "bg-rose-50 text-rose-700",
          )}
        >
          {hospital.votesSupplies >= hospital.votesNoSupplies ? (
            <PackageCheck className="h-3.5 w-3.5" />
          ) : (
            <PackageX className="h-3.5 w-3.5" />
          )}
          {hospital.votesSupplies >= hospital.votesNoSupplies ? "Con insumos" : "Faltan insumos"} · consenso
        </span>
      )}

      {hospital.needsText && (
        <p className="line-clamp-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
          {hospital.needsText}
        </p>
      )}

      <div className="mt-auto flex items-center justify-between border-t border-zinc-100 pt-3 text-sm">
        <span className="flex items-center gap-1.5 text-zinc-600">
          <Users className="h-4 w-4 text-zinc-400" />
          {patientCount} {patientCount === 1 ? "persona" : "personas"}
        </span>
        <span className="flex items-center gap-3 text-xs text-zinc-400">
          {hospital.contactPhone && (
            <span className="flex items-center gap-1 text-brand-700">
              <Phone className="h-3.5 w-3.5" />
              {hospital.contactPhone}
            </span>
          )}
          <span className="flex items-center gap-1">
            <Clock3 className="h-3.5 w-3.5" />
            {timeAgo(hospital.updatedAt)}
          </span>
        </span>
      </div>
    </Card>
  );
});
