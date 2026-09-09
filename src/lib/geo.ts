// Coordenadas aproximadas para ubicar registros en el mapa. No pretende ser
// catastral: sirve para visualizar concentraciones y puntos de ayuda. Cuando
// haya datos con lat/lng reales, se usarán esos en su lugar.
//
// Los datos por país (regiones, epicentro, info del sismo) viven en
// `countries.ts`; este módulo mantiene los nombres históricos (`ESTADO_COORDS`,
// `EPICENTER`, `QUAKE_INFO`) apuntando a Venezuela por compatibilidad con el
// código existente, y añade `geocodeFor`/`getCountryGeo` para el resto de países.

import { COUNTRIES, DEFAULT_COUNTRY, getCountry, type CountryCode } from "./countries";

export type LatLng = [number, number];

/** Distancia entre dos coordenadas en kilómetros (fórmula de Haversine). */
export function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

// Sectores conocidos (sobre todo de La Guaira, la zona más afectada de VE).
// El texto libre de ubicación no está atado a un país: si el texto menciona un
// sector conocido, se usa sin importar el país activo (p. ej. puntos de
// acopio en el exterior).
export const SECTOR_COORDS: Record<string, LatLng> = {
  macuto: [10.601, -66.888],
  "catia la mar": [10.595, -67.025],
  catialamar: [10.595, -67.025],
  maiquetía: [10.598, -66.975],
  maiquetia: [10.598, -66.975],
  "la guaira": [10.596, -66.933],
  caraballeda: [10.606, -66.85],
  naiguatá: [10.608, -66.745],
  naiguata: [10.608, -66.745],
  "camurí grande": [10.608, -66.705],
  "camuri grande": [10.608, -66.705],
  "playa grande": [10.603, -67.0],
  caribe: [10.605, -66.98],
  "los corales": [10.605, -66.85],
  tanaguarena: [10.608, -66.815],
  anare: [10.609, -66.78],
  "el cojo": [10.606, -66.88],
  "punta de mulatos": [10.607, -66.87],
  higuerote: [10.48, -66.1],
  caracas: [10.5, -66.92],
  "el junquito": [10.435, -67.05],
  junquito: [10.435, -67.05],
  catia: [10.52, -66.93],
  petare: [10.47, -66.8],
  guarenas: [10.47, -66.61],
  guatire: [10.47, -66.54],
  // OJO: NO poner "vargas" aquí. Es nombre de muchas calles (p. ej. la dirección
  // del Hospital Central de Maracay) y mandaba esos puntos a la costa de La Guaira.
  maracay: [10.25, -67.6],
  valencia: [10.17, -68.0],
  "la floresta": [10.25, -67.59],
  // Sismo de Colombia (10 ago. 2026): zona del epicentro y ciudades más afectadas.
  "san josé del palmar": [4.98, -76.24],
  "san jose del palmar": [4.98, -76.24],
  pereira: [4.81, -75.69],
  manizales: [5.07, -75.52],
  quibdó: [5.69, -76.66],
  quibdo: [5.69, -76.66],
  // Puntos de acopio en el exterior (diáspora que reúne y envía ayuda).
  cartagena: [10.4, -75.49],
  medellín: [6.25, -75.57],
  medellin: [6.25, -75.57],
  bogotá: [4.65, -74.1],
  bogota: [4.65, -74.1],
  cúcuta: [7.89, -72.5],
  cucuta: [7.89, -72.5],
  barranquilla: [10.96, -74.8],
  cali: [3.45, -76.53],
  panamá: [8.98, -79.52],
  panama: [8.98, -79.52],
  madrid: [40.42, -3.7],
  miami: [25.77, -80.19],
  santiago: [-33.45, -70.66],
  lima: [-12.05, -77.04],
  quito: [-0.18, -78.47],
  guayaquil: [-2.19, -79.88],
  "buenos aires": [-34.6, -58.38],
  "boa vista": [2.82, -60.67],
  "ciudad de méxico": [19.43, -99.13],
  méxico: [19.43, -99.13],
  mexico: [19.43, -99.13],
};

/** @deprecated usa `getCountry(code).regionCoords`. Se mantiene por compatibilidad (apunta a Venezuela). */
export const ESTADO_COORDS: Record<string, LatLng> = COUNTRIES[DEFAULT_COUNTRY].regionCoords;

/** @deprecated usa `getCountry(code).epicenter`. Se mantiene por compatibilidad (apunta a Venezuela). */
export const EPICENTER: LatLng = COUNTRIES[DEFAULT_COUNTRY].epicenter;

/** @deprecated usa `getCountry(code).quakeInfo`. Se mantiene por compatibilidad (apunta a Venezuela). */
export const QUAKE_INFO = COUNTRIES[DEFAULT_COUNTRY].quakeInfo;

/**
 * Pequeño desplazamiento determinista para que los puntos no se solapen.
 * Muy reducido (~0.5 km). En la franja costera de La Guaira el mar está al
 * NORTE, así que la latitud se desplaza SOLO hacia el sur (tierra adentro):
 * un desplazamiento al norte tiraba los marcadores al agua (p. ej. Macuto).
 */
function jitter(coord: LatLng, seed: string): LatLng {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
  // El hash es un entero de 32 bits CON signo: con `%` sobre un valor negativo
  // el resto también es negativo, lo que invertía el sentido de los dos
  // desplazamientos (la latitud subía al norte, hacia el mar, y la longitud se
  // iba hasta el triple del rango previsto). Se toma el valor absoluto.
  const mag = Math.abs(h);
  // Longitud: ±0.005° (~0.5 km) a ambos lados.
  const dx = ((mag % 100) / 100 - 0.5) * 0.01;
  // Latitud: solo hacia el sur (nunca sube hacia el mar).
  const dy = -(((mag >> 8) % 100) / 100) * 0.006;
  return [coord[0] + dy, coord[1] + dx];
}

/** Resuelve coordenadas a partir de texto de ubicación y/o estado/región de un país. */
export function geocodeFor(
  country: CountryCode | string | null | undefined,
  locationText: string | null | undefined,
  estado: string | null | undefined,
  seed = "",
): LatLng | null {
  const text = (locationText ?? "").toLowerCase();
  for (const [name, coord] of Object.entries(SECTOR_COORDS)) {
    if (text.includes(name)) return jitter(coord, seed || name);
  }
  const coords = getCountry(country ?? undefined).regionCoords;
  if (estado && coords[estado]) return jitter(coords[estado], seed || estado);
  return null;
}

/** @deprecated usa `geocodeFor(country, locationText, estado, seed)`. Asume Venezuela. */
export function geocode(
  locationText: string | null | undefined,
  estado: string | null | undefined,
  seed = "",
): LatLng | null {
  return geocodeFor(DEFAULT_COUNTRY, locationText, estado, seed);
}
