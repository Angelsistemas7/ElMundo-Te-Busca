import "server-only";
import { COUNTRIES, COUNTRY_CODES, DEFAULT_COUNTRY, getCountry, isCountryCode, type CountryCode } from "./countries";

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
    // Venezuela y Colombia son países vecinos: sus `usgsBbox` (arriba) se
    // superponen bastante cerca de la frontera, así que un sismo ahí podía
    // aparecer en ambos países aunque solo sea relevante para uno. Se refina
    // con el mismo patrón de lugares que ya usa `news.ts` para prensa: si el
    // texto de ubicación de USGS nombra claramente AL OTRO país (y no al
    // activo), se descarta. Si es ambiguo (no nombra a ninguno), se deja —
    // mejor de más que perder un sismo real cerca de la zona.
    const activeCode = isCountryCode(country) ? country : DEFAULT_COUNTRY;
    const otherCodes = COUNTRY_CODES.filter((c) => c !== activeCode);
    const ownPattern = new RegExp(COUNTRIES[activeCode].news.matchPattern, "i");
    const otherPatterns = otherCodes.map((c) => new RegExp(COUNTRIES[c].news.matchPattern, "i"));

    return (json.features ?? [])
      .filter((f) => typeof f.properties?.mag === "number")
      .filter((f) => {
        const place = f.properties?.place ?? "";
        if (ownPattern.test(place)) return true;
        return !otherPatterns.some((p) => p.test(place));
      })
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
