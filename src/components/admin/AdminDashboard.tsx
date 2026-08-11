"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import {
  BadgeCheck,
  Building2,
  Check,
  Clock,
  ExternalLink,
  FileWarning,
  HeartHandshake,
  Loader2,
  MapPin,
  MessagesSquare,
  Phone,
  Pin,
  PinOff,
  Share2,
  ShieldCheck,
  Star,
  Trash2,
  UserCheck,
  UserPlus,
  X,
} from "lucide-react";
import type {
  AidPoint,
  AppRole,
  AppRoleGrant,
  Complaint,
  Hero,
  Hospital,
  ManagedEntity,
  Person,
  PersonStatus,
  Post,
  ResourceManager,
  StatusReport,
} from "@/lib/types";
import {
  APP_ROLE_LABEL,
  COMPLAINT_CATEGORY_EMOJI,
  COMPLAINT_CATEGORY_LABEL,
  HERO_CATEGORY_EMOJI,
  HERO_CATEGORY_LABEL,
  MANAGED_ENTITY_LABEL,
  PERSON_STATUS_LABEL,
  POST_ORIGIN_LABEL,
  POST_TYPE_EMOJI,
  POST_TYPE_LABEL,
} from "@/lib/types";
import { timeAgo } from "@/lib/utils";
import { FlagIcon } from "@/components/FlagIcon";
import type { CountryCode } from "@/lib/countries";
import {
  approveExternalPostAction,
  approveReportAction,
  assignManagerAction,
  assignRoleAction,
  deleteComplaintAction,
  dismissReportAction,
  logoutAdminAction,
  rejectExternalPostAction,
  removeManagerAction,
  removeRoleAction,
  toggleAidPointVerifiedAction,
  toggleHeroVerifiedAction,
  deleteHeroAction,
  toggleHospitalVerifiedAction,
  togglePersonVerifiedAction,
  togglePostPinnedAction,
} from "@/app/admin/actions";

export type ReportWithName = StatusReport & { personName: string };

// El panel junta Venezuela + Colombia en una sola lista (ver `admin/page.tsx`):
// esta insignia deja claro a qué país pertenece cada fila.
function CountryBadge({ country }: { country?: CountryCode }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-zinc-100 px-1.5 py-0.5 text-[10px] font-bold uppercase text-zinc-500">
      <FlagIcon code={country ?? "ve"} className="h-2.5 w-4 shrink-0 rounded-[2px]" />
      {(country ?? "ve").toUpperCase()}
    </span>
  );
}

export function AdminDashboard({
  reports,
  persons,
  aidPoints,
  hospitals,
  managers,
  posts,
  heroes,
  complaints,
  roles,
  pendingExternalPosts,
  demoOpen,
}: {
  reports: ReportWithName[];
  persons: Person[];
  aidPoints: AidPoint[];
  hospitals: Hospital[];
  managers: ResourceManager[];
  posts: Post[];
  heroes: Hero[];
  complaints: Complaint[];
  roles: AppRoleGrant[];
  pendingExternalPosts: Post[];
  demoOpen: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState<string | null>(null);

  // Gestores agrupados por recurso: `${entityType}:${entityId}` → gestores.
  const managersByKey = useMemo(() => {
    const map: Record<string, ResourceManager[]> = {};
    for (const m of managers) {
      (map[`${m.entityType}:${m.entityId}`] ??= []).push(m);
    }
    return map;
  }, [managers]);

  function run(id: string, fn: () => Promise<unknown>) {
    setBusy(id);
    startTransition(async () => {
      await fn();
      router.refresh();
      setBusy(null);
    });
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-6">
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-zinc-900 text-white">
            <ShieldCheck className="h-5 w-5" />
          </span>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-zinc-900">Panel de moderación</h1>
            <p className="text-sm text-zinc-500">
              Verificar no es obligatorio para que algo aparezca: todo es visible de inmediato. Aquí
              solo confirmas información, das el visto bueno y asignas gestores.
            </p>
          </div>
        </div>
        <form action={logoutAdminAction}>
          <button className="press rounded-lg border border-zinc-300 px-3 py-2 text-sm font-medium text-zinc-600 hover:bg-zinc-50">
            Salir
          </button>
        </form>
      </div>

      {demoOpen && (
        <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <strong>Panel abierto (demo).</strong> Define <code className="rounded bg-amber-100 px-1">ADMIN_TOKEN</code>{" "}
          en <code className="rounded bg-amber-100 px-1">.env.local</code> para protegerlo con contraseña en producción.
          {" "}Los gestores requieren cuentas reales (Supabase): en modo demostración no se pueden asignar.
        </div>
      )}

      {/* Colaboradores: roles globales por cuenta (admin, moderador de
          hospitales/ayuda). Tu ADMIN_TOKEN sigue funcionando como llave
          maestra además de esto — no se reemplaza, es un segundo camino. */}
      <section className="mb-10">
        <h2 className="mb-1 flex items-center gap-2 font-bold text-zinc-900">
          <ShieldCheck className="h-4.5 w-4.5 text-zinc-500" />
          Colaboradores
          <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-bold text-zinc-600">
            {roles.length}
          </span>
        </h2>
        <p className="mb-3 text-sm text-zinc-500">
          Da acceso al panel o a moderar una categoría completa (todos los hospitales o todos los
          puntos de ayuda) a una cuenta, sin compartir tu contraseña de admin.
        </p>
        <RoleGrants roles={roles} demoOpen={demoOpen} />
      </section>

      {/* Cola de reportes por verificar */}
      <section className="mb-10">
        <h2 className="mb-3 flex items-center gap-2 font-bold text-zinc-900">
          <Clock className="h-4.5 w-4.5 text-zinc-500" />
          Reportes por verificar
          <span className="rounded-full bg-rose-100 px-2 py-0.5 text-xs font-bold text-rose-700">
            {reports.length}
          </span>
        </h2>

        {reports.length === 0 ? (
          <p className="rounded-xl border border-dashed border-zinc-300 bg-white py-10 text-center text-sm text-zinc-500">
            No hay reportes pendientes. Todo al día. 🤍
          </p>
        ) : (
          <ul className="space-y-3">
            {reports.map((r) => (
              <li key={r.id} className="rounded-2xl border border-zinc-200 bg-white p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link
                        href={`/persona/${r.personId}`}
                        className="font-semibold text-zinc-900 hover:underline"
                      >
                        {r.personName}
                      </Link>
                      <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-600">
                        Reporta: {PERSON_STATUS_LABEL[r.reportedStatus as PersonStatus]}
                      </span>
                      <span className="text-xs text-zinc-400">{timeAgo(r.createdAt)}</span>
                    </div>
                    <div className="mt-2 space-y-1 text-sm text-zinc-600">
                      <p className="flex items-center gap-1.5">
                        <UserCheck className="h-3.5 w-3.5 text-zinc-400" />
                        {r.reporterName} · <span className="text-zinc-500">{r.reporterRelationship}</span>
                      </p>
                      <p className="flex items-center gap-1.5">
                        <Phone className="h-3.5 w-3.5 text-zinc-400" />
                        <a href={`tel:${r.reporterPhone}`} className="hover:underline">
                          {r.reporterPhone}
                        </a>
                      </p>
                      <p className="flex items-start gap-1.5">
                        <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-zinc-400" />
                        {r.locationFound}
                      </p>
                      {r.notes && <p className="text-zinc-500">“{r.notes}”</p>}
                    </div>
                  </div>

                  <div className="flex shrink-0 gap-2">
                    <button
                      onClick={() => run(r.id, () => approveReportAction(r.id))}
                      disabled={pending && busy === r.id}
                      className="press flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                    >
                      <Check className="h-4 w-4" />
                      Verificar y aplicar
                    </button>
                    <button
                      onClick={() => run(r.id, () => dismissReportAction(r.id))}
                      disabled={pending && busy === r.id}
                      className="press flex items-center gap-1.5 rounded-lg border border-zinc-300 px-3 py-2 text-sm font-medium text-zinc-600 hover:bg-zinc-50 disabled:opacity-50"
                    >
                      <X className="h-4 w-4" />
                      Descartar
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Cola de moderación: publicaciones importadas de otras redes por
          hashtag (Bluesky/Mastodon, vía scripts/fetch-social-posts.mjs).
          Nunca se ven en /comunidad hasta que se aprueban aquí. */}
      <section className="mb-10">
        <h2 className="mb-3 flex items-center gap-2 font-bold text-zinc-900">
          <Share2 className="h-4.5 w-4.5 text-zinc-500" />
          Redes sociales (auto)
          <span className="rounded-full bg-rose-100 px-2 py-0.5 text-xs font-bold text-rose-700">
            {pendingExternalPosts.length}
          </span>
        </h2>

        {pendingExternalPosts.length === 0 ? (
          <p className="rounded-xl border border-dashed border-zinc-300 bg-white py-10 text-center text-sm text-zinc-500">
            No hay publicaciones importadas por revisar. 🤍
          </p>
        ) : (
          <ul className="space-y-3">
            {pendingExternalPosts.map((p) => (
              <li key={p.id} className="rounded-2xl border border-zinc-200 bg-white p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-zinc-900">{p.authorName}</span>
                      <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-600">
                        {POST_ORIGIN_LABEL[p.origin ?? "community"]}
                      </span>
                      <span className="text-xs text-zinc-400">{timeAgo(p.createdAt)}</span>
                    </div>
                    <p className="mt-2 whitespace-pre-wrap text-sm text-zinc-700">{p.body}</p>
                    {p.linkUrl && (
                      <a
                        href={p.linkUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-2 inline-flex items-center gap-1.5 text-xs font-medium text-sky-700 hover:underline"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                        Ver publicación original
                      </a>
                    )}
                  </div>

                  <div className="flex shrink-0 gap-2">
                    <button
                      onClick={() => run(p.id, () => approveExternalPostAction(p.id))}
                      disabled={pending && busy === p.id}
                      className="press flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                    >
                      <Check className="h-4 w-4" />
                      Publicar
                    </button>
                    <button
                      onClick={() => run(p.id, () => rejectExternalPostAction(p.id))}
                      disabled={pending && busy === p.id}
                      className="press flex items-center gap-1.5 rounded-lg border border-zinc-300 px-3 py-2 text-sm font-medium text-zinc-600 hover:bg-zinc-50 disabled:opacity-50"
                    >
                      <X className="h-4 w-4" />
                      Rechazar
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Visto bueno a registros recientes de personas */}
      <section className="mb-10">
        <h2 className="mb-3 flex items-center gap-2 font-bold text-zinc-900">
          <BadgeCheck className="h-4.5 w-4.5 text-zinc-500" />
          Registros recientes (personas)
        </h2>
        <ul className="divide-y divide-zinc-100 overflow-hidden rounded-2xl border border-zinc-200 bg-white">
          {persons.map((p) => {
            const name = `${p.firstName} ${p.lastName}`.trim() || "Sin identificar";
            return (
              <li key={p.id} className="flex items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Link href={`/persona/${p.id}`} className="font-medium text-zinc-900 hover:underline">
                      {name}
                    </Link>
                    <CountryBadge country={p.country} />
                  </div>
                  <p className="text-xs text-zinc-500">
                    {[p.estado, p.locationText].filter(Boolean).join(" · ")} · {timeAgo(p.createdAt)}
                  </p>
                </div>
                <button
                  onClick={() => run(p.id, () => togglePersonVerifiedAction(p.id, !p.verified))}
                  disabled={pending && busy === p.id}
                  className={
                    p.verified
                      ? "press flex items-center gap-1.5 rounded-lg bg-emerald-50 px-3 py-1.5 text-sm font-medium text-emerald-700 hover:bg-emerald-100 disabled:opacity-50"
                      : "press flex items-center gap-1.5 rounded-lg border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-600 hover:bg-zinc-50 disabled:opacity-50"
                  }
                >
                  <BadgeCheck className="h-4 w-4" />
                  {p.verified ? "Verificado" : "Dar visto bueno"}
                </button>
              </li>
            );
          })}
        </ul>
      </section>

      {/* Puntos de ayuda: verificar + gestores */}
      <section className="mb-10">
        <h2 className="mb-1 flex items-center gap-2 font-bold text-zinc-900">
          <HeartHandshake className="h-4.5 w-4.5 text-zinc-500" />
          Puntos de ayuda
          <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-bold text-zinc-600">
            {aidPoints.length}
          </span>
        </h2>
        <p className="mb-3 text-sm text-zinc-500">
          Revisa la evidencia (ubicación, contacto y foto) y da el visto bueno. Asigna un gestor para
          que una cuenta de confianza administre el punto.
        </p>
        {aidPoints.length === 0 ? (
          <p className="rounded-xl border border-dashed border-zinc-300 bg-white py-8 text-center text-sm text-zinc-500">
            Aún no hay puntos de ayuda.
          </p>
        ) : (
          <ul className="space-y-3">
            {aidPoints.map((point) => (
              <ResourceRow
                key={point.id}
                entityType="aid_point"
                id={point.id}
                name={point.name}
                country={point.country}
                href={`/ayuda/${point.id}`}
                verified={point.verified}
                photoUrl={point.photoUrl}
                location={[point.locationText, point.estado].filter(Boolean).join(", ")}
                contact={[point.contactName, point.contactPhone].filter(Boolean).join(" · ")}
                createdAt={point.createdAt}
                managers={managersByKey[`aid_point:${point.id}`] ?? []}
                demoOpen={demoOpen}
                onToggleVerified={(v) => toggleAidPointVerifiedAction(point.id, v)}
              />
            ))}
          </ul>
        )}
      </section>

      {/* Hospitales: verificar + gestores */}
      <section>
        <h2 className="mb-1 flex items-center gap-2 font-bold text-zinc-900">
          <Building2 className="h-4.5 w-4.5 text-zinc-500" />
          Hospitales
          <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-bold text-zinc-600">
            {hospitals.length}
          </span>
        </h2>
        <p className="mb-3 text-sm text-zinc-500">
          Da el visto bueno tras revisar el contacto y la ubicación. El gestor designado podrá
          actualizar capacidad e insumos oficiales del hospital.
        </p>
        {hospitals.length === 0 ? (
          <p className="rounded-xl border border-dashed border-zinc-300 bg-white py-8 text-center text-sm text-zinc-500">
            Aún no hay hospitales.
          </p>
        ) : (
          <ul className="space-y-3">
            {hospitals.map((hospital) => (
              <ResourceRow
                key={hospital.id}
                entityType="hospital"
                id={hospital.id}
                name={hospital.name}
                country={hospital.country}
                href={`/hospitales/${hospital.id}`}
                verified={hospital.verified}
                photoUrl={null}
                location={[hospital.locationText, hospital.estado].filter(Boolean).join(", ")}
                contact={[hospital.contactName, hospital.contactPhone].filter(Boolean).join(" · ")}
                createdAt={hospital.createdAt}
                managers={managersByKey[`hospital:${hospital.id}`] ?? []}
                demoOpen={demoOpen}
                onToggleVerified={(v) => toggleHospitalVerifiedAction(hospital.id, v)}
              />
            ))}
          </ul>
        )}
      </section>

      {/* Publicaciones de la comunidad: fijar/desfijar */}
      <section className="mt-10">
        <h2 className="mb-1 flex items-center gap-2 font-bold text-zinc-900">
          <MessagesSquare className="h-4.5 w-4.5 text-zinc-500" />
          Publicaciones (comunidad)
          <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-bold text-zinc-600">
            {posts.length}
          </span>
        </h2>
        <p className="mb-3 text-sm text-zinc-500">
          Fija arriba del muro los avisos importantes (📌 Destacado). Puedes desfijar cuando dejen de
          ser relevantes.
        </p>
        {posts.length === 0 ? (
          <p className="rounded-xl border border-dashed border-zinc-300 bg-white py-8 text-center text-sm text-zinc-500">
            Aún no hay publicaciones.
          </p>
        ) : (
          <ul className="divide-y divide-zinc-100 overflow-hidden rounded-2xl border border-zinc-200 bg-white">
            {posts.map((p) => (
              <li key={p.id} className="flex items-start justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-600">
                      {POST_TYPE_EMOJI[p.type]} {POST_TYPE_LABEL[p.type]}
                    </span>
                    <CountryBadge country={p.country} />
                    {p.pinned && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-700">
                        <Pin className="h-3 w-3" /> Fijado
                      </span>
                    )}
                    <span className="text-xs text-zinc-400">{timeAgo(p.createdAt)}</span>
                  </div>
                  <p className="mt-1 line-clamp-2 text-sm text-zinc-600">{p.body}</p>
                </div>
                <button
                  onClick={() => run(p.id, () => togglePostPinnedAction(p.id, !p.pinned))}
                  disabled={pending && busy === p.id}
                  className={
                    p.pinned
                      ? "press flex shrink-0 items-center gap-1.5 rounded-lg bg-amber-50 px-3 py-1.5 text-sm font-medium text-amber-700 hover:bg-amber-100 disabled:opacity-50"
                      : "press flex shrink-0 items-center gap-1.5 rounded-lg border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-600 hover:bg-zinc-50 disabled:opacity-50"
                  }
                >
                  {p.pinned ? <PinOff className="h-4 w-4" /> : <Pin className="h-4 w-4" />}
                  {p.pinned ? "Desfijar" : "Fijar"}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Héroes: dar visto bueno o eliminar propuestas falsas */}
      <section className="mt-10">
        <h2 className="mb-1 flex items-center gap-2 font-bold text-zinc-900">
          <Star className="h-4.5 w-4.5 text-amber-500" />
          Héroes
          <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-bold text-zinc-600">
            {heroes.length}
          </span>
        </h2>
        <p className="mb-3 text-sm text-zinc-500">
          Da el <strong>visto bueno</strong> a los que sean ciertos (pasan a «Verificado») y{" "}
          <strong>elimina</strong> los falsos o inapropiados. Los propuestos por la comunidad nacen
          «sin verificar».
        </p>
        {heroes.length === 0 ? (
          <p className="rounded-xl border border-dashed border-zinc-300 bg-white py-8 text-center text-sm text-zinc-500">
            Aún no hay héroes propuestos.
          </p>
        ) : (
          <ul className="divide-y divide-zinc-100 overflow-hidden rounded-2xl border border-zinc-200 bg-white">
            {heroes.map((h) => (
              <li key={h.id} className="flex items-start justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">
                      {HERO_CATEGORY_EMOJI[h.category]} {HERO_CATEGORY_LABEL[h.category]}
                    </span>
                    <CountryBadge country={h.country} />
                    {h.verified ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700">
                        <BadgeCheck className="h-3 w-3" /> Verificado
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-semibold text-zinc-500">
                        <Clock className="h-3 w-3" /> Sin verificar
                      </span>
                    )}
                    <span className="text-xs text-zinc-400">{timeAgo(h.createdAt)}</span>
                  </div>
                  <p className="mt-1 text-sm font-semibold text-zinc-800">{h.title}</p>
                  <p className="line-clamp-2 text-sm text-zinc-600">{h.body}</p>
                  <p className="mt-0.5 text-xs text-zinc-400">
                    Propuesto por {h.authorName}
                    {h.sourceName ? ` · Fuente: ${h.sourceName}` : " · sin fuente"}
                  </p>
                </div>
                <div className="flex shrink-0 flex-col gap-2">
                  <button
                    onClick={() => run(h.id, () => toggleHeroVerifiedAction(h.id, !h.verified))}
                    disabled={pending && busy === h.id}
                    className={
                      h.verified
                        ? "press flex items-center gap-1.5 rounded-lg bg-emerald-50 px-3 py-1.5 text-sm font-medium text-emerald-700 hover:bg-emerald-100 disabled:opacity-50"
                        : "press flex items-center gap-1.5 rounded-lg border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-600 hover:bg-zinc-50 disabled:opacity-50"
                    }
                  >
                    {h.verified ? <X className="h-4 w-4" /> : <Check className="h-4 w-4" />}
                    {h.verified ? "Quitar" : "Verificar"}
                  </button>
                  <button
                    onClick={() => run(h.id, () => deleteHeroAction(h.id))}
                    disabled={pending && busy === h.id}
                    className="press flex items-center gap-1.5 rounded-lg border border-rose-200 px-3 py-1.5 text-sm font-medium text-rose-600 hover:bg-rose-50 disabled:opacity-50"
                  >
                    <Trash2 className="h-4 w-4" />
                    Eliminar
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Denuncias: solo eliminar las comprobadamente falsas o inapropiadas.
          No se pueden editar ni las borra el autor (a propósito). */}
      <section className="mt-10">
        <h2 className="mb-1 flex items-center gap-2 font-bold text-zinc-900">
          <FileWarning className="h-4.5 w-4.5 text-zinc-500" />
          Denuncias
          <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-bold text-zinc-600">
            {complaints.length}
          </span>
        </h2>
        <p className="mb-3 text-sm text-zinc-500">
          Elimina solo las que sean <strong>comprobadamente falsas</strong> o inapropiadas. Quedan
          ligadas a la cuenta que las publicó; no se pueden editar ni las borra el autor.
        </p>
        {complaints.length === 0 ? (
          <p className="rounded-xl border border-dashed border-zinc-300 bg-white py-8 text-center text-sm text-zinc-500">
            Aún no hay denuncias.
          </p>
        ) : (
          <ul className="divide-y divide-zinc-100 overflow-hidden rounded-2xl border border-zinc-200 bg-white">
            {complaints.map((c) => (
              <li key={c.id} className="flex items-start justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-600">
                      {COMPLAINT_CATEGORY_EMOJI[c.category]} {COMPLAINT_CATEGORY_LABEL[c.category]}
                    </span>
                    <CountryBadge country={c.country} />
                    <span className="text-xs text-zinc-400">
                      Por {c.authorName} · {timeAgo(c.createdAt)}
                    </span>
                  </div>
                  <p className="mt-1 line-clamp-2 text-sm text-zinc-600">{c.body}</p>
                  {(c.locationText || c.estado) && (
                    <p className="mt-0.5 flex items-center gap-1.5 text-xs text-zinc-400">
                      <MapPin className="h-3.5 w-3.5" />
                      {[c.locationText, c.estado].filter(Boolean).join(", ")}
                    </p>
                  )}
                </div>
                <button
                  onClick={() => run(c.id, () => deleteComplaintAction(c.id))}
                  disabled={pending && busy === c.id}
                  className="press flex shrink-0 items-center gap-1.5 rounded-lg border border-rose-200 px-3 py-1.5 text-sm font-medium text-rose-600 hover:bg-rose-50 disabled:opacity-50"
                >
                  <Trash2 className="h-4 w-4" />
                  Eliminar
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

// ── Fila de moderación de un recurso (punto de ayuda u hospital) ─────────────
function ResourceRow({
  entityType,
  id,
  name,
  country,
  href,
  verified,
  photoUrl,
  location,
  contact,
  createdAt,
  managers,
  demoOpen,
  onToggleVerified,
}: {
  entityType: ManagedEntity;
  id: string;
  name: string;
  country?: CountryCode;
  href: string;
  verified: boolean;
  photoUrl: string | null;
  location: string;
  contact: string;
  createdAt: string;
  managers: ResourceManager[];
  demoOpen: boolean;
  onToggleVerified: (value: boolean) => Promise<unknown>;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function toggleVerified() {
    startTransition(async () => {
      await onToggleVerified(!verified);
      router.refresh();
    });
  }

  return (
    <li className="rounded-2xl border border-zinc-200 bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 gap-3">
          {photoUrl ? (
            <Image src={photoUrl} alt={name} width={56} height={56} className="h-14 w-14 shrink-0 rounded-lg object-cover" />
          ) : null}
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-1.5">
              <Link href={href} className="font-semibold text-zinc-900 hover:underline">
                {name}
              </Link>
              <CountryBadge country={country} />
            </div>
            <div className="mt-1 space-y-0.5 text-xs text-zinc-500">
              {location && (
                <p className="flex items-center gap-1.5">
                  <MapPin className="h-3.5 w-3.5 text-zinc-400" />
                  {location}
                </p>
              )}
              {contact && (
                <p className="flex items-center gap-1.5">
                  <Phone className="h-3.5 w-3.5 text-zinc-400" />
                  {contact}
                </p>
              )}
              <p className="text-zinc-400">{timeAgo(createdAt)}</p>
            </div>
          </div>
        </div>

        <button
          onClick={toggleVerified}
          disabled={pending}
          className={
            verified
              ? "press flex shrink-0 items-center gap-1.5 rounded-lg bg-emerald-50 px-3 py-1.5 text-sm font-medium text-emerald-700 hover:bg-emerald-100 disabled:opacity-50"
              : "press flex shrink-0 items-center gap-1.5 rounded-lg border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-600 hover:bg-zinc-50 disabled:opacity-50"
          }
        >
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <BadgeCheck className="h-4 w-4" />}
          {verified ? "Verificado" : "Dar visto bueno"}
        </button>
      </div>

      <ManagerControls entityType={entityType} entityId={id} managers={managers} disabled={demoOpen} />
    </li>
  );
}

// ── Gestores delegados de un recurso ─────────────────────────────────────────
function ManagerControls({
  entityType,
  entityId,
  managers,
  disabled,
}: {
  entityType: ManagedEntity;
  entityId: string;
  managers: ResourceManager[];
  disabled: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [username, setUsername] = useState("");
  const [error, setError] = useState<string | null>(null);

  function add() {
    const value = username.trim();
    if (!value) return;
    setError(null);
    const form = new FormData();
    form.set("entityType", entityType);
    form.set("entityId", entityId);
    form.set("username", value);
    startTransition(async () => {
      const res = await assignManagerAction(form);
      if (res.ok) {
        setUsername("");
        router.refresh();
      } else {
        setError(res.error ?? "No se pudo asignar.");
      }
    });
  }

  function remove(userId: string) {
    startTransition(async () => {
      await removeManagerAction(entityType, entityId, userId);
      router.refresh();
    });
  }

  return (
    <div className="mt-3 border-t border-zinc-100 pt-3">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-400">
        Gestores de este {MANAGED_ENTITY_LABEL[entityType].toLowerCase()}
      </p>

      {managers.length > 0 ? (
        <ul className="mb-2 flex flex-wrap gap-2">
          {managers.map((m) => (
            <li
              key={m.userId}
              className="flex items-center gap-1.5 rounded-full bg-sky-50 px-2.5 py-1 text-xs font-medium text-sky-700"
            >
              <UserCheck className="h-3.5 w-3.5" />
              {m.username}
              <button
                onClick={() => remove(m.userId)}
                disabled={pending}
                title="Quitar gestor"
                className="press ml-0.5 rounded-full p-0.5 text-sky-500 hover:bg-sky-100 hover:text-sky-800 disabled:opacity-50"
              >
                <X className="h-3 w-3" />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mb-2 text-xs text-zinc-400">Sin gestores asignados.</p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center overflow-hidden rounded-lg border border-zinc-300 focus-within:border-brand-400 focus-within:ring-2 focus-within:ring-brand-100">
          <span className="pl-2.5 text-sm text-zinc-400">@</span>
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                add();
              }
            }}
            disabled={disabled || pending}
            placeholder="nombre de usuario"
            className="w-44 px-1.5 py-1.5 text-sm outline-none disabled:bg-zinc-50"
          />
        </div>
        <button
          onClick={add}
          disabled={disabled || pending || !username.trim()}
          className="press flex items-center gap-1.5 rounded-lg bg-zinc-900 px-3 py-1.5 text-sm font-semibold text-white hover:bg-zinc-800 disabled:opacity-50"
        >
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
          Asignar gestor
        </button>
      </div>
      {disabled && (
        <p className="mt-1.5 text-xs text-zinc-400">
          Disponible al conectar la base de datos (Supabase) con cuentas reales.
        </p>
      )}
      {error && <p className="mt-1.5 text-xs font-medium text-rose-600">{error}</p>}
    </div>
  );
}

// ── Roles globales (admin por cuenta, moderador de hospitales/ayuda) ────────
const ROLE_OPTIONS: AppRole[] = ["admin", "hospital_moderator", "aid_point_moderator"];

function RoleGrants({ roles, demoOpen }: { roles: AppRoleGrant[]; demoOpen: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState<string | null>(null);
  const [username, setUsername] = useState("");
  const [role, setRole] = useState<AppRole>("admin");
  const [error, setError] = useState<string | null>(null);

  function add() {
    const value = username.trim();
    if (!value) return;
    setError(null);
    const form = new FormData();
    form.set("username", value);
    form.set("role", role);
    startTransition(async () => {
      const res = await assignRoleAction(form);
      if (res.ok) {
        setUsername("");
        router.refresh();
      } else {
        setError(res.error ?? "No se pudo asignar.");
      }
    });
  }

  function remove(userId: string, r: AppRole) {
    const key = `${userId}:${r}`;
    setBusy(key);
    startTransition(async () => {
      await removeRoleAction(userId, r);
      router.refresh();
      setBusy(null);
    });
  }

  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-4">
      {roles.length > 0 ? (
        <ul className="mb-3 flex flex-wrap gap-2">
          {roles.map((r) => (
            <li
              key={`${r.userId}:${r.role}`}
              className="flex items-center gap-1.5 rounded-full bg-sky-50 px-2.5 py-1 text-xs font-medium text-sky-700"
            >
              <UserCheck className="h-3.5 w-3.5" />
              {r.username}
              <span className="text-sky-400">·</span>
              {APP_ROLE_LABEL[r.role]}
              <button
                onClick={() => remove(r.userId, r.role)}
                disabled={pending && busy === `${r.userId}:${r.role}`}
                title="Quitar rol"
                className="press ml-0.5 rounded-full p-0.5 text-sky-500 hover:bg-sky-100 hover:text-sky-800 disabled:opacity-50"
              >
                <X className="h-3 w-3" />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mb-3 text-xs text-zinc-400">Sin colaboradores asignados todavía.</p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center overflow-hidden rounded-lg border border-zinc-300 focus-within:border-brand-400 focus-within:ring-2 focus-within:ring-brand-100">
          <span className="pl-2.5 text-sm text-zinc-400">@</span>
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                add();
              }
            }}
            disabled={demoOpen || pending}
            placeholder="nombre de usuario"
            className="w-44 px-1.5 py-1.5 text-sm outline-none disabled:bg-zinc-50"
          />
        </div>
        <select
          value={role}
          onChange={(e) => setRole(e.target.value as AppRole)}
          disabled={demoOpen || pending}
          className="rounded-lg border border-zinc-300 px-2 py-1.5 text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100 disabled:bg-zinc-50"
        >
          {ROLE_OPTIONS.map((r) => (
            <option key={r} value={r}>
              {APP_ROLE_LABEL[r]}
            </option>
          ))}
        </select>
        <button
          onClick={add}
          disabled={demoOpen || pending || !username.trim()}
          className="press flex items-center gap-1.5 rounded-lg bg-zinc-900 px-3 py-1.5 text-sm font-semibold text-white hover:bg-zinc-800 disabled:opacity-50"
        >
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
          Asignar rol
        </button>
      </div>
      {demoOpen && (
        <p className="mt-1.5 text-xs text-zinc-400">
          Disponible al conectar la base de datos (Supabase) con cuentas reales.
        </p>
      )}
      {error && <p className="mt-1.5 text-xs font-medium text-rose-600">{error}</p>}
    </div>
  );
}
