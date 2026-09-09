import { Suspense } from "react";
import { notFound } from "next/navigation";
import {
  BadgeCheck,
  IdCard,
  MapPin,
  Phone,
  Mail,
  Clock,
  Stethoscope,
  ShieldQuestion,
} from "lucide-react";
import { getComments, getMyPublications, getPersonById, getStatusReports } from "@/lib/data";
import { getCurrentUser } from "@/lib/auth";
import { PERSON_STATUS_LABEL } from "@/lib/types";
import { cn, formatDateTime, statusStyle, timeAgo } from "@/lib/utils";
import { ReportStatusButton } from "@/components/ReportStatusButton";
import { SaveButton } from "@/components/SaveButton";
import { CommentSection } from "@/components/CommentSection";
import { PersonPhoto } from "@/components/PersonPhoto";
import { PersonReactions } from "@/components/PersonReactions";
import { PersonShareButton } from "@/components/PersonShareButton";
import { BackLink } from "@/components/BackLink";
import { MiniMap } from "@/components/map/MiniMap";
import { CommentSectionSkeleton, SaveButtonSkeleton } from "@/components/ListSkeletons";

export const dynamic = "force-dynamic";

// El botón "Guardar" es para seguir un caso AJENO. Si eres el autor (por
// cuenta) ya lo sigues, así que se oculta. Separado en su propio Suspense
// (columna izquierda) para no bloquear el primer pintado del resto de la
// ficha con `getCurrentUser` + `getMyPublications` (esta última trae TODAS
// las publicaciones del usuario solo para un booleano).
async function SaveButtonSlot({ personId, title }: { personId: string; title: string }) {
  const user = await getCurrentUser();
  if (!user) {
    return <SaveButton type="person" id={personId} title={title} className="w-full justify-center" />;
  }
  const mine = await getMyPublications(user.id);
  const isOwner = mine.some((p) => p.type === "person" && p.id === personId);
  if (isOwner) return null;
  return <SaveButton type="person" id={personId} title={title} className="w-full justify-center" />;
}

// Comentarios + reportes de estado: la parte más pesada (y menos urgente que
// el nombre/foto/estado) de la ficha, en su propio Suspense (columna derecha).
async function PersonForumSection({ personId }: { personId: string }) {
  const [comments, reports] = await Promise.all([
    getComments("person", personId),
    getStatusReports(personId),
  ]);

  return (
    <CommentSection
      entityType="person"
      entityId={personId}
      initialComments={comments}
      title="Información de la comunidad"
      placeholder="¿La reconoces? ¿Sabes algo? Comparte de forma responsable."
      prefix={
        reports.length > 0 ? (
          <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-4">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-amber-900">
              <ShieldQuestion className="h-4 w-4" />
              Reportes de estado ({reports.length})
            </h3>
            <p className="mt-1 text-xs text-amber-700">
              Se muestran de inmediato; un reporte <strong>verificado</strong> ha sido
              confirmado por un moderador.
            </p>
            <ul className="mt-3 space-y-2">
              {reports.map((r) => (
                <li key={r.id} className="rounded-xl border border-amber-200 bg-white p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-700">
                      {PERSON_STATUS_LABEL[r.reportedStatus]}
                    </span>
                    {r.verified ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700">
                        <BadgeCheck className="h-3.5 w-3.5" /> Verificado
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-700">
                        <ShieldQuestion className="h-3.5 w-3.5" /> Sin verificar
                      </span>
                    )}
                    <span className="text-xs text-zinc-400">{timeAgo(r.createdAt)}</span>
                  </div>
                  <p className="mt-1.5 text-sm text-zinc-700">
                    <span className="font-medium">{r.reporterRelationship}:</span>{" "}
                    {r.locationFound}
                  </p>
                  {r.notes && <p className="mt-0.5 text-sm text-zinc-500">“{r.notes}”</p>}
                </li>
              ))}
            </ul>
          </div>
        ) : undefined
      }
    />
  );
}

export default async function PersonPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const person = await getPersonById(id);
  if (!person) notFound();

  const s = statusStyle(person.status);
  const fullName = `${person.firstName} ${person.lastName}`.trim();
  const displayName = person.isUnidentified && !fullName ? "Persona sin identificar" : fullName;

  return (
    <div className="mx-auto max-w-5xl px-4 py-6">
      <BackLink label="Volver al listado" fallbackHref="/se-busca" />

      <div className="grid gap-6 lg:grid-cols-[360px_1fr]">
        {/* Columna izquierda: foto + acciones */}
        <div className="space-y-4">
          <div
            className="relative aspect-square overflow-hidden rounded-2xl border border-zinc-200 bg-zinc-100"
            style={{ viewTransitionName: `person-photo-${person.id}` } as React.CSSProperties}
          >
            <PersonPhoto
              src={person.photoUrl}
              firstName={person.firstName}
              lastName={person.lastName}
              isUnidentified={person.isUnidentified}
              fallbackTextClass="text-6xl"
              zoomable
            />
            <span
              className={cn(
                "absolute left-4 top-4 inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-semibold shadow-sm",
                s.bg,
                s.text,
              )}
            >
              <span className={cn("h-2 w-2 rounded-full", s.dot)} />
              {PERSON_STATUS_LABEL[person.status]}
            </span>
          </div>

          <ReportStatusButton personId={person.id} personName={displayName} personCountry={person.country} />

          <Suspense fallback={<SaveButtonSkeleton />}>
            <SaveButtonSlot personId={person.id} title={displayName} />
          </Suspense>
          <PersonShareButton
            personId={person.id}
            name={displayName}
            unidentified={person.isUnidentified}
            className="w-full"
          />

          {(person.contactName || person.contactPhone || person.contactEmail) && (
            <div className="rounded-2xl border border-zinc-200 bg-white p-4">
              <h3 className="text-sm font-semibold text-zinc-900">Contacto de quien reporta</h3>
              <ul className="mt-3 space-y-2 text-sm text-zinc-600">
                {person.contactName && <li>{person.contactName}</li>}
                {person.contactPhone && (
                  <li>
                    <a
                      href={`tel:${person.contactPhone}`}
                      className="flex items-center gap-2 font-medium text-zinc-800 hover:text-brand-700"
                    >
                      <Phone className="h-4 w-4" />
                      {person.contactPhone}
                    </a>
                  </li>
                )}
                {person.contactEmail && (
                  <li>
                    <a
                      href={`mailto:${person.contactEmail}`}
                      className="flex items-center gap-2 hover:text-brand-700"
                    >
                      <Mail className="h-4 w-4" />
                      {person.contactEmail}
                    </a>
                  </li>
                )}
              </ul>
            </div>
          )}
        </div>

        {/* Columna derecha: datos + foro */}
        <div className="space-y-6">
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-3xl font-bold tracking-tight text-navy-700">{displayName}</h1>
              {person.verified && (
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">
                  <BadgeCheck className="h-4 w-4" />
                  Verificado
                </span>
              )}
            </div>
            <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-sm text-zinc-600">
              {person.cedula && (
                <span className="flex items-center gap-1.5">
                  <IdCard className="h-4 w-4 text-zinc-400" />
                  {person.cedula}
                </span>
              )}
              {person.age != null && <span>{person.age} años</span>}
              {person.gender && <span className="capitalize">{person.gender}</span>}
              {(person.locationText || person.estado) && (
                <span className="flex items-center gap-1.5">
                  <MapPin className="h-4 w-4 text-zinc-400" />
                  {[person.locationText, person.estado].filter(Boolean).join(", ")}
                </span>
              )}
            </div>
            {person.status === "hospitalizado" && person.hospitalName && (
              <p className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-sky-50 px-3 py-1.5 text-sm font-medium text-sky-700">
                <Stethoscope className="h-4 w-4" />
                {person.hospitalName}
              </p>
            )}
            <p className="mt-3 flex items-center gap-1.5 text-xs text-zinc-400">
              <Clock className="h-3.5 w-3.5" />
              Registrado el {formatDateTime(person.createdAt)}
            </p>

            <div className="mt-4">
              <PersonReactions personId={person.id} reactions={person.reactions} />
            </div>
          </div>

          {person.lat != null && person.lng != null && (
            <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white">
              <div className="flex items-center gap-2 p-4 pb-0">
                <MapPin className="h-4 w-4 text-zinc-400" />
                <h2 className="text-sm font-semibold text-zinc-900">Ubicación señalada en el mapa</h2>
              </div>
              <div className="mt-3 h-56 w-full">
                <MiniMap
                  zones={[]}
                  hospitals={[]}
                  aidPoints={[
                    {
                      id: person.id,
                      lat: person.lat,
                      lng: person.lng,
                      label: person.locationText || displayName,
                    },
                  ]}
                  center={[person.lat, person.lng]}
                  zoom={14}
                />
              </div>
            </div>
          )}

          {person.description && (
            <div className="rounded-2xl border border-zinc-200 bg-white p-5">
              <h2 className="text-sm font-semibold text-zinc-900">Descripción y contexto</h2>
              <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-zinc-600">
                {person.description}
              </p>
            </div>
          )}

          <Suspense fallback={<CommentSectionSkeleton />}>
            <PersonForumSection personId={person.id} />
          </Suspense>
        </div>
      </div>
    </div>
  );
}
