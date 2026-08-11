import Link from "next/link";
import { Map as MapIcon } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import {
  getAidPoints,
  getEstadoBreakdown,
  getHospitals,
  getMapPosts,
  getMarches,
  getPersonsWithLocation,
  getPosts,
  getVolunteers,
} from "@/lib/data";
import {
  AID_POINT_TYPE_LABEL,
  HOSPITAL_STATUS_LABEL,
  PERSON_STATUS_LABEL,
  VOLUNTEER_TYPE_EMOJI,
  VOLUNTEER_TYPE_LABEL,
  type AidPointType,
  type HospitalStatus,
} from "@/lib/types";
import { geocodeFor } from "@/lib/geo";
import { getRecentQuakes } from "@/lib/usgs";
import { getActiveCountry } from "@/lib/country-server";
import { getCountry } from "@/lib/countries";
import { directionsLink, formatDateTime, whatsappLink } from "@/lib/utils";
import { CrisisMap } from "@/components/map/CrisisMap";
import { RecentQuakes } from "@/components/RecentQuakes";
import { SwipeHintNestedOnce } from "@/components/SwipeHint";
import type {
  AidMarker,
  HelpMarker,
  HospitalMarker,
  MarchMarker,
  NeedMarker,
  PersonMarker,
  RescueMarker,
  Zone,
} from "@/components/map/MapView";

export const dynamic = "force-dynamic";

const TYPE_EMOJI: Record<AidPointType, string> = {
  comida: "🍲",
  agua: "💧",
  medicina: "💊",
  refugio: "🏠",
  alojamiento: "🛏️",
  ropa: "👕",
  otro: "📦",
};

const HOSPITAL_COLOR: Record<HospitalStatus, string> = {
  operativo: "#10b981",
  saturado: "#f59e0b",
  lleno: "#ef4444",
  cerrado: "#a1a1aa",
};

export default async function MapaPage() {
  const country = await getActiveCountry();
  const active = getCountry(country);
  const [breakdown, aid, marches, hospitals, rescuePosts, needPosts, offerPosts, volunteers, mappablePersons, quakes] =
    await Promise.all([
      getEstadoBreakdown(country),
      getAidPoints(country),
      getMarches(),
      getHospitals(country),
      // Rescate queda en vivo (sin caché): una alerta de rescate es urgente y no
      // debe esperar hasta 60s en aparecer. Necesito/ofrezco sí toleran el retraso.
      getPosts({ country, type: "rescate" }),
      getMapPosts("necesito", country),
      getMapPosts("ofrezco", country),
      getVolunteers(),
      // Si la columna lat aún no existe (esquema sin migrar), no rompemos el mapa.
      getPersonsWithLocation(200, country).catch(() => []),
      getRecentQuakes(country),
    ]);

  const zones: Zone[] = Object.entries(breakdown)
    .filter(([estado]) => active.regionCoords[estado])
    .map(([estado, b]) => {
      const [lat, lng] = active.regionCoords[estado];
      return {
        key: estado,
        name: estado,
        lat,
        lng,
        count: b.total,
        toLocate: b.toLocate,
        located: b.located,
        deceased: b.deceased,
      };
    });

  const aidPoints: AidMarker[] = aid
    .filter((p) => p.available) // no enviar gente a puntos agotados
    .map((p) => {
      // Coordenada exacta marcada por quien publicó; si no, aproximación por texto.
      const coord: [number, number] | null =
        p.lat != null && p.lng != null ? [p.lat, p.lng] : geocodeFor(country, p.locationText, p.estado, p.id);
      if (!coord) return null;
      return {
        id: p.id,
        name: p.name,
        typeLabel: p.types.map((t) => AID_POINT_TYPE_LABEL[t]).join(", ") || "Ayuda",
        emoji: p.types[0] ? TYPE_EMOJI[p.types[0]] : "📦",
        lat: coord[0],
        lng: coord[1],
        verified: p.verified,
        href: `/ayuda/${p.id}`,
      } satisfies AidMarker;
    })
    .filter((x): x is AidMarker => x !== null);

  const marchMarkers: MarchMarker[] = marches
    .map((m) => {
      const coord = geocodeFor(country, m.originText, null, m.id);
      if (!coord) return null;
      return {
        id: m.id,
        title: m.title,
        lat: coord[0],
        lng: coord[1],
        when: formatDateTime(m.departAt),
        href: `/caravanas/${m.id}`,
      } satisfies MarchMarker;
    })
    .filter((x): x is MarchMarker => x !== null);

  const hospitalMarkers: HospitalMarker[] = hospitals
    .map((h) => {
      const coord: [number, number] | null =
        h.lat != null && h.lng != null ? [h.lat, h.lng] : geocodeFor(country, h.locationText, h.estado, h.id);
      if (!coord) return null;
      return {
        id: h.id,
        name: h.name,
        statusLabel: HOSPITAL_STATUS_LABEL[h.status],
        color: HOSPITAL_COLOR[h.status],
        lat: coord[0],
        lng: coord[1],
        href: `/hospitales/${h.id}`,
      } satisfies HospitalMarker;
    })
    .filter((x): x is HospitalMarker => x !== null);

  const rescues: RescueMarker[] = rescuePosts
    .map((p) => {
      const coord = geocodeFor(country, p.locationText, p.estado, p.id);
      if (!coord) return null;
      return {
        id: p.id,
        body: p.body,
        locationText: p.locationText,
        lat: coord[0],
        lng: coord[1],
        when: formatDateTime(p.createdAt),
        href: "/comunidad?type=rescate",
      } satisfies RescueMarker;
    })
    .filter((x): x is RescueMarker => x !== null);

  // Capa "Necesito ayuda": publicaciones tipo `necesito` con ubicación.
  const needs: NeedMarker[] = needPosts
    .map((p) => {
      const coord = geocodeFor(country, p.locationText, p.estado, p.id);
      if (!coord) return null;
      return {
        id: p.id,
        body: p.body,
        locationText: p.locationText,
        lat: coord[0],
        lng: coord[1],
        when: formatDateTime(p.createdAt),
        whatsappHref: whatsappLink(
          p.contactPhone,
          `Hola, vi tu publicación en El Mundo Te Busca sobre "${p.body.slice(0, 60)}". ¿Cómo puedo ayudar?`,
        ),
        directionsHref: directionsLink(coord[0], coord[1]),
        href: "/comunidad?type=necesito",
      } satisfies NeedMarker;
    })
    .filter((x): x is NeedMarker => x !== null);

  // Capa "Puedo ayudar": voluntarios + publicaciones tipo `ofrezco`, con ubicación.
  const helps: HelpMarker[] = [
    ...volunteers.map((v) => {
      // A diferencia de puntos de ayuda/hospitales (lugares físicos que la
      // gente PUBLICA para que los encuentren exacto), un voluntario es una
      // PERSONA privada — mostrar su GPS exacto en el mapa público filtraría
      // dónde vive/está exactamente, con su nombre y WhatsApp al lado.
      // Siempre aproximado (mismo sector/estado, con variación aleatoria),
      // nunca la coordenada exacta que haya dado al registrarse.
      const coord = geocodeFor(country, v.locationText, v.estado, v.id);
      if (!coord) return null;
      const detail = [v.skillsText, v.availabilityText].filter(Boolean).join(" · ");
      return {
        id: `vol-${v.id}`,
        title: v.name,
        subtitle: `${VOLUNTEER_TYPE_LABEL[v.type]}${detail ? ` · ${detail}` : ""}`,
        emoji: VOLUNTEER_TYPE_EMOJI[v.type],
        locationText: v.locationText,
        lat: coord[0],
        lng: coord[1],
        whatsappHref: whatsappLink(
          v.contactPhone,
          `Hola ${v.name}, te vi en El Mundo Te Busca (voluntarios). ¿Sigues disponible para ayudar?`,
        ),
        directionsHref: directionsLink(coord[0], coord[1]),
        href: "/voluntarios",
      } satisfies HelpMarker;
    }),
    ...offerPosts.map((p) => {
      const coord = geocodeFor(country, p.locationText, p.estado, p.id);
      if (!coord) return null;
      return {
        id: `post-${p.id}`,
        title: p.authorName,
        subtitle: p.body,
        emoji: "🤲",
        locationText: p.locationText,
        lat: coord[0],
        lng: coord[1],
        whatsappHref: whatsappLink(
          p.contactPhone,
          `Hola, vi tu ofrecimiento de ayuda en El Mundo Te Busca. ¿Sigue disponible?`,
        ),
        directionsHref: directionsLink(coord[0], coord[1]),
        href: "/comunidad?type=ofrezco",
      } satisfies HelpMarker;
    }),
  ].filter((x): x is HelpMarker => x !== null);

  // Capa "Personas vistas": personas con coordenada exacta marcada.
  const personMarkers: PersonMarker[] = mappablePersons
    .filter((p) => p.lat != null && p.lng != null)
    .map((p) => ({
      id: p.id,
      name: `${p.firstName} ${p.lastName}`.trim() || "Sin identificar",
      statusLabel: PERSON_STATUS_LABEL[p.status],
      unidentified: p.isUnidentified,
      lat: p.lat as number,
      lng: p.lng as number,
      href: `/persona/${p.id}`,
    }));

  const totalInZones = zones.reduce((s, z) => s + z.count, 0);

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <div className="mb-6">
        <PageHeader
          icon={MapIcon}
          title={
            <>
              Mapa de la <span className="text-brand-500">emergencia</span>
            </>
          }
          description={
            <>
              Quién <strong>necesita ayuda</strong> y quién <strong>puede ayudar</strong>, zonas
              afectadas, puntos de ayuda, hospitales y caravanas en un solo lugar. Activa o
              desactiva cada capa con el panel de arriba a la derecha del mapa.
            </>
          }
        />
      </div>

      {/* Fila horizontal (igual que las cifras de "Se busca"): cada una lleva a
          su sección. Vaivén leve al entrar en pantalla, un par de ciclos, y para. */}
      <SwipeHintNestedOnce
        outerClassName="no-scrollbar -mx-4 mb-4 overflow-x-auto px-4 sm:mx-0 sm:overflow-visible sm:px-0"
        innerClassName="flex w-max gap-2 sm:w-auto sm:[animation:none] sm:grid sm:grid-cols-3 sm:gap-3 lg:grid-cols-6"
      >
          <Link
            href="/comunidad?type=necesito"
            className="tap-card w-28 shrink-0 rounded-xl border border-rose-200 bg-rose-50 p-2.5 text-center sm:w-auto sm:p-3"
          >
            <div className="text-lg font-bold text-rose-700 sm:text-xl">{needs.length}</div>
            <div className="text-[11px] text-zinc-600 sm:text-xs">🆘 Necesito ayuda</div>
          </Link>
          <Link
            href="/comunidad?type=ofrezco"
            className="tap-card w-28 shrink-0 rounded-xl border border-emerald-200 bg-emerald-50 p-2.5 text-center sm:w-auto sm:p-3"
          >
            <div className="text-lg font-bold text-emerald-700 sm:text-xl">{helps.length}</div>
            <div className="text-[11px] text-zinc-600 sm:text-xs">🤲 Puedo ayudar</div>
          </Link>
          <Link
            href="/se-busca"
            className="tap-card w-28 shrink-0 rounded-xl border border-zinc-200 bg-zinc-50 p-2.5 text-center sm:w-auto sm:p-3"
          >
            <div className="text-lg font-bold text-zinc-700 sm:text-xl">{totalInZones.toLocaleString("es-VE")}</div>
            <div className="text-[11px] text-zinc-600 sm:text-xs">En zonas con registro</div>
          </Link>
          <Link
            href="/ayuda"
            className="tap-card w-28 shrink-0 rounded-xl border border-amber-200 bg-amber-50 p-2.5 text-center sm:w-auto sm:p-3"
          >
            <div className="text-lg font-bold text-amber-700 sm:text-xl">{aidPoints.length}</div>
            <div className="text-[11px] text-zinc-600 sm:text-xs">Puntos de ayuda</div>
          </Link>
          <Link
            href="/hospitales"
            className="tap-card w-28 shrink-0 rounded-xl border border-teal-200 bg-teal-50 p-2.5 text-center sm:w-auto sm:p-3"
          >
            <div className="text-lg font-bold text-teal-700 sm:text-xl">{hospitalMarkers.length}</div>
            <div className="text-[11px] text-zinc-600 sm:text-xs">Hospitales</div>
          </Link>
          <Link
            href="/caravanas"
            className="tap-card w-28 shrink-0 rounded-xl border border-sky-200 bg-sky-50 p-2.5 text-center sm:w-auto sm:p-3"
          >
            <div className="text-lg font-bold text-sky-700 sm:text-xl">{marchMarkers.length}</div>
            <div className="text-[11px] text-zinc-600 sm:text-xs">Caravanas</div>
          </Link>
      </SwipeHintNestedOnce>

      <div className="mb-4 rounded-2xl border border-zinc-200 bg-white p-4">
        <h2 className="text-sm font-bold text-zinc-900">Datos del sismo (fuentes públicas)</h2>
        <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm text-zinc-600 sm:grid-cols-4">
          <div>
            <span className="block text-xs text-zinc-400">Magnitud</span>M {active.quakeInfo.magnitude}
          </div>
          <div>
            <span className="block text-xs text-zinc-400">Profundidad</span>{active.quakeInfo.depthKm} km
          </div>
          <div>
            <span className="block text-xs text-zinc-400">Fallecidos</span>{active.quakeInfo.deaths}
          </div>
          <div>
            <span className="block text-xs text-zinc-400">Heridos</span>+{active.quakeInfo.injured.toLocaleString("es-VE")}
          </div>
        </div>
        <p className="mt-2 text-sm text-zinc-600">
          <span className="text-xs text-zinc-400">Epicentro: </span>
          {active.quakeInfo.epicenterText} · <span className="text-xs text-zinc-400">Más afectada: </span>
          {active.quakeInfo.mostAffected}.
        </p>
        <p className="mt-1 text-xs text-zinc-400">
          También afectados: {active.quakeInfo.alsoAffected.join(", ")}. Fuentes: {active.quakeInfo.sourceName}.
        </p>
      </div>

      <CrisisMap
        zones={zones}
        aidPoints={aidPoints}
        marches={marchMarkers}
        hospitals={hospitalMarkers}
        rescues={rescues}
        needs={needs}
        helps={helps}
        persons={personMarkers}
        epicenter={active.epicenter}
        center={active.epicenter}
        zoom={8}
      />

      <div className="mt-6">
        <RecentQuakes quakes={quakes} />
      </div>
    </div>
  );
}
