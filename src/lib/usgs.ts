import "server-only";
import { getCountry, type CountryCode } from "./countries";

// Sismos recientes alrededor del país activo desde la API pública y GRATUITA
// del USGS (Servicio Geológico de EE. UU.). No requiere clave. Los sismos no
// se pueden predecir; esto solo muestra la actividad real reciente.

export interface Quake {
  id: string;
  mag: number;
  place: string;
  time: number; // epoch ms
  url: string;
}

export async function getRecentQuakes(
  country: CountryCode | string | null | undefined = "ve",
  limit = 12,
  minMagnitude = 3.5,
): Promise<Quake[]> {
  try {
    const [minLat, minLon, maxLat, maxLon] = getCountry(country ?? undefined).usgsBbox;
    const start = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const params = new URLSearchParams({
      format: "geojson",
      starttime: start,
      minmagnitude: String(minMagnitude),
      minlatitude: String(minLat),
      maxlatitude: String(maxLat),
      minlongitude: String(minLon),
      maxlongitude: String(maxLon),
      orderby: "time",
      limit: String(limit),
    });
    const res = await fetch(`https://earthquake.usgs.gov/fdsnws/event/1/query?${params}`, {
      // Revalida cada 30 min: datos frescos sin golpear la API en cada visita.
      next: { revalidate: 1800 },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return [];
    const json = (await res.json()) as {
      features?: { id: string; properties: { mag: number; place: string; time: number; url: string } }[];
    };
    return (json.features ?? [])
      .filter((f) => typeof f.properties?.mag === "number")
      .map((f) => ({
        id: f.id,
        mag: f.properties.mag,
        place: f.properties.place ?? getCountry(country ?? undefined).name,
        time: f.properties.time,
        url: f.properties.url,
      }));
  } catch {
    return []; // si la API falla, la UI muestra un aviso suave
  }
}
