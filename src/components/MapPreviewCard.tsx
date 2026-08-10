import Link from "next/link";
import { Building2, HeartHandshake, MapPin } from "lucide-react";
import { getAidPoints, getEstadoBreakdown, getHospitals } from "@/lib/data";
import { geocodeFor } from "@/lib/geo";
import { getActiveCountry } from "@/lib/country-server";
import { getCountry } from "@/lib/countries";
import { MiniMap } from "./map/MiniMap";
import type { MiniPoint, MiniZone } from "./map/MiniMapView";

// Vista compacta del mapa para el home: un Leaflet real pero reducido (sin
// capas ni controles) en vez de reconstruir todo lo que arma /mapa — así se
// ve un mapa de verdad sin duplicar su pipeline completo de geocodificación.
export async function MapPreviewCard() {
  const country = await getActiveCountry();
  const active = getCountry(country);
  const [breakdown, aidPoints, hospitals] = await Promise.all([
    getEstadoBreakdown(country),
    getAidPoints(country),
    getHospitals(country),
  ]);

  const zones: MiniZone[] = Object.entries(breakdown)
    .filter(([estado]) => active.regionCoords[estado])
    .map(([estado, b]) => {
      const [lat, lng] = active.regionCoords[estado];
      return { key: estado, name: estado, lat, lng, count: b.total };
    });

  const aidMarkers: MiniPoint[] = aidPoints
    .filter((p) => p.available)
    .map((p) => {
      const coord = p.lat != null && p.lng != null ? [p.lat, p.lng] : geocodeFor(country, p.locationText, p.estado, p.id);
      return coord ? { id: p.id, lat: coord[0], lng: coord[1], label: p.name } : null;
    })
    .filter((x): x is MiniPoint => x !== null);

  const hospitalMarkers: MiniPoint[] = hospitals
    .map((h) => {
      const coord = h.lat != null && h.lng != null ? [h.lat, h.lng] : geocodeFor(country, h.locationText, h.estado, h.id);
      return coord ? { id: h.id, lat: coord[0], lng: coord[1], label: h.name } : null;
    })
    .filter((x): x is MiniPoint => x !== null);

  return (
    <section className="reveal-up flex flex-col overflow-hidden rounded-3xl border-2 border-navy-700 bg-white">
      <div className="p-5 pb-0 sm:p-6 sm:pb-0">
        <h2 className="flex items-center gap-2 text-lg font-bold text-navy-700">
          <MapPin className="h-5 w-5 text-brand-500" />
          Mapa de localidades
        </h2>
        <p className="mt-1 text-xs text-zinc-500">En tiempo real</p>
      </div>

      <div className="mt-4 h-48 w-full overflow-hidden sm:h-56">
        <MiniMap zones={zones} aidPoints={aidMarkers} hospitals={hospitalMarkers} center={active.epicenter} zoom={7} />
      </div>

      <div className="flex flex-col gap-4 p-5 pt-4 sm:p-6 sm:pt-4">
        <div className="flex items-center gap-4 text-sm text-zinc-600">
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-brand-500" />
            <HeartHandshake className="h-4 w-4 text-brand-500" />
            {aidPoints.length.toLocaleString("es-VE")} puntos de ayuda
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-600" />
            <Building2 className="h-4 w-4 text-emerald-600" />
            {hospitals.length.toLocaleString("es-VE")} hospitales
          </span>
        </div>

        <Link
          href="/mapa"
          className="press flex items-center justify-center rounded-full bg-navy-700 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-navy-600"
        >
          Ver mapa completo
        </Link>
      </div>
    </section>
  );
}
