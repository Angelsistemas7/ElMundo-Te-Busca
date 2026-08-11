// ─────────────────────────────────────────────────────────────
// Configuración central multi-país. Cada país activo en la plataforma
// (bandera elegible en la portada) vive aquí: sus regiones, coordenadas,
// datos del evento/desastre, línea de emergencia y términos de búsqueda de
// noticias. Añadir un país nuevo = añadir una entrada aquí (no tocar 30
// archivos). VE y CO son los dos países activos a la fecha (terremoto de
// Venezuela jun. 2026 y terremoto de Colombia 10 ago. 2026).
// ─────────────────────────────────────────────────────────────

import type { LatLng } from "./geo";

export const COUNTRY_CODES = ["ve", "co"] as const;
export type CountryCode = (typeof COUNTRY_CODES)[number];

export const DEFAULT_COUNTRY: CountryCode = "ve";

export function isCountryCode(value: string | null | undefined): value is CountryCode {
  return !!value && (COUNTRY_CODES as readonly string[]).includes(value);
}

export interface PhoneEntry {
  name: string;
  phones: string[];
}

export interface PhoneGroup {
  title: string;
  note?: string;
  entries: PhoneEntry[];
}

export interface QuakeInfo {
  magnitude: string;
  depthKm: number;
  epicenterText: string;
  date: string;
  /** Misma fecha que `date`, en formato ISO (solo día): usada para calcular la
   *  ventana de prioridad de "Se busca" (ver `PRIORITY_WINDOW_DAYS` en data.ts). */
  dateISO: string;
  /** Cifras iniciales que cambian con los reportes; no es un conteo final. */
  deaths: number;
  injured: number;
  mostAffected: string;
  alsoAffected: string[];
  sourceName: string;
}

export interface CountryConfig {
  code: CountryCode;
  name: string;
  demonym: string;
  flag: string;
  /** Regiones administrativas de primer nivel (estados/departamentos). */
  regions: readonly string[];
  regionCoords: Record<string, LatLng>;
  epicenter: LatLng;
  quakeInfo: QuakeInfo;
  emergency: { nationalLine: { number: string; label: string }; groups: PhoneGroup[] };
  /** Bbox [minLat, minLon, maxLat, maxLon] para el feed de réplicas USGS. */
  usgsBbox: [number, number, number, number];
  /** Términos para filtrar/afinar noticias relevantes al país. */
  news: {
    /** Regex (fuente de patrón) para detectar si un artículo es de este país. */
    matchPattern: string;
    /** Query base para RSS/GDELT/GNews. */
    searchQuery: string;
    /** Parámetro de país para Google News RSS (gl=XX). */
    gl: string;
  };
}

const VE_REGIONS = [
  "Amazonas",
  "Anzoátegui",
  "Apure",
  "Aragua",
  "Barinas",
  "Bolívar",
  "Carabobo",
  "Cojedes",
  "Delta Amacuro",
  "Distrito Capital",
  "Falcón",
  "Guárico",
  "La Guaira",
  "Lara",
  "Mérida",
  "Miranda",
  "Monagas",
  "Nueva Esparta",
  "Portuguesa",
  "Sucre",
  "Táchira",
  "Trujillo",
  "Yaracuy",
  "Zulia",
] as const;

const CO_REGIONS = [
  "Amazonas",
  "Antioquia",
  "Arauca",
  "Atlántico",
  "Bogotá D.C.",
  "Bolívar",
  "Boyacá",
  "Caldas",
  "Caquetá",
  "Casanare",
  "Cauca",
  "Cesar",
  "Chocó",
  "Córdoba",
  "Cundinamarca",
  "Guainía",
  "Guaviare",
  "Huila",
  "La Guajira",
  "Magdalena",
  "Meta",
  "Nariño",
  "Norte de Santander",
  "Putumayo",
  "Quindío",
  "Risaralda",
  "San Andrés y Providencia",
  "Santander",
  "Sucre",
  "Tolima",
  "Valle del Cauca",
  "Vaupés",
  "Vichada",
] as const;

export const COUNTRIES: Record<CountryCode, CountryConfig> = {
  ve: {
    code: "ve",
    name: "Venezuela",
    demonym: "venezolano",
    flag: "🇻🇪",
    regions: VE_REGIONS,
    regionCoords: {
      Amazonas: [4.0, -65.5],
      Anzoátegui: [9.3, -64.4],
      Apure: [7.0, -68.5],
      Aragua: [10.2, -67.4],
      Barinas: [8.6, -70.2],
      Bolívar: [6.0, -63.0],
      Carabobo: [10.2, -68.0],
      Cojedes: [9.4, -68.4],
      "Delta Amacuro": [9.0, -61.3],
      "Distrito Capital": [10.5, -66.92],
      Falcón: [11.2, -69.8],
      Guárico: [9.0, -66.5],
      "La Guaira": [10.6, -66.93],
      Lara: [10.0, -69.8],
      Mérida: [8.6, -71.1],
      Miranda: [10.2, -66.4],
      Monagas: [9.5, -63.0],
      "Nueva Esparta": [11.0, -63.9],
      Portuguesa: [9.0, -69.7],
      Sucre: [10.45, -63.5],
      Táchira: [7.8, -72.2],
      Trujillo: [9.3, -70.4],
      Yaracuy: [10.3, -68.8],
      Zulia: [10.0, -72.0],
    },
    // Doble sismo M7,2 + M7,5 (~39 s), epicentro ~28 km al SE de Yumare (Yaracuy).
    epicenter: [10.45, -68.5],
    quakeInfo: {
      magnitude: "7,2 y 7,5",
      depthKm: 10,
      epicenterText: "≈28 km al SE de Yumare (Yaracuy)",
      date: "24–25 de junio de 2026",
      dateISO: "2026-06-24",
      deaths: 1719,
      injured: 5034,
      mostAffected: "La Guaira (Caraballeda, Catia La Mar)",
      alsoAffected: ["Falcón", "Miranda", "Carabobo (Valencia)", "Aragua (Maracay)", "Distrito Capital (Caracas)"],
      sourceName: "Infobae, Telemundo (29 jun. 2026)",
    },
    emergency: {
      nationalLine: { number: "911", label: "VEN 9‑1‑1 — Línea única nacional" },
      groups: [
        {
          title: "Ambulancias (Caracas)",
          note: "Servicios privados de la zona metropolitana. Confirma cobertura y costo.",
          entries: [
            { name: "Aeroambulancias", phones: ["(0212) 993.25.41", "(0212) 992.89.80", "(0212) 991.79.40"] },
            { name: "Rescarven", phones: ["(0212) 993.69.11", "(0212) 993.13.10", "(0212) 993.33.67"] },
            { name: "Servicio de Ambulancia Metropolitano", phones: ["(0212) 545.45.45", "(0212) 577.92.09"] },
          ],
        },
        {
          title: "Bomberos por municipio (Gran Caracas y La Guaira)",
          note: "Listado de referencia; pueden cambiar. Ante emergencia, marca 911.",
          entries: [
            { name: "Bomberos de La Guaira", phones: ["(0212) 332.76.20", "(0212) 331.04.45"] },
            { name: "Bomberos de Catia la Mar", phones: ["(0212) 351.99.66"] },
            { name: "Bomberos Metropolitanos", phones: ["(0212) 545.45.45"] },
            { name: "Bomberos de Chacao", phones: ["(0212) 265.32.61"] },
            { name: "Bomberos de Sucre", phones: ["(0212) 985.36.40"] },
            { name: "Bomberos del Este (Cafetal)", phones: ["(0212) 987.43.34", "(0212) 985.50.60"] },
            { name: "Bomberos de El Paraíso", phones: ["(0212) 481.09.61"] },
            { name: "Bomberos de El Valle", phones: ["(0212) 672.01.75", "(0212) 672.06.36"] },
            { name: "Bomberos de Antímano", phones: ["(0212) 472.20.54"] },
            { name: "Bomberos de La Urbina", phones: ["(0212) 241.66.41"] },
            { name: "Bomberos de La Trinidad", phones: ["(0212) 943.43.61"] },
            { name: "Bomberos de Miranda", phones: ["(0212) 235.69.67"] },
            { name: "Bomberos de Plaza Venezuela", phones: ["(0212) 793.00.39", "(0212) 793.64.57"] },
          ],
        },
      ],
    },
    usgsBbox: [0, -74, 13, -59],
    news: {
      matchPattern:
        "venezuela|la guaira|caraballeda|catia la mar|maiquet|yumare|yaracuy|vargas|caracas|maracay|valencia",
      searchQuery: "Venezuela (terremoto OR sismo OR temblor)",
      gl: "VE",
    },
  },
  co: {
    code: "co",
    name: "Colombia",
    demonym: "colombiano",
    flag: "🇨🇴",
    regions: CO_REGIONS,
    regionCoords: {
      Amazonas: [-1.44, -71.57],
      Antioquia: [6.7, -75.57],
      Arauca: [7.09, -70.76],
      Atlántico: [10.7, -74.9],
      "Bogotá D.C.": [4.71, -74.07],
      Bolívar: [9.0, -74.5],
      Boyacá: [5.63, -73.36],
      Caldas: [5.3, -75.3],
      Caquetá: [1.0, -75.5],
      Casanare: [5.5, -71.9],
      Cauca: [2.5, -76.8],
      Cesar: [9.5, -73.5],
      Chocó: [5.4, -76.9],
      Córdoba: [8.3, -75.8],
      Cundinamarca: [4.9, -74.3],
      Guainía: [2.5, -68.8],
      Guaviare: [2.0, -72.6],
      Huila: [2.5, -75.7],
      "La Guajira": [11.4, -72.4],
      Magdalena: [10.2, -74.2],
      Meta: [3.5, -73.2],
      Nariño: [1.3, -77.6],
      "Norte de Santander": [7.9, -72.9],
      Putumayo: [0.5, -76.5],
      Quindío: [4.5, -75.7],
      Risaralda: [5.1, -75.9],
      "San Andrés y Providencia": [12.55, -81.7],
      Santander: [7.1, -73.1],
      Sucre: [9.0, -75.2],
      Tolima: [4.1, -75.2],
      "Valle del Cauca": [3.8, -76.4],
      Vaupés: [0.8, -70.5],
      Vichada: [4.9, -69.3],
    },
    // Epicentro cerca de San José del Palmar, Chocó (SGC: 4°50'38"N 76°14'31"O).
    epicenter: [4.903, -76.189],
    quakeInfo: {
      magnitude: "7,4",
      depthKm: 96,
      epicenterText: "cerca de San José del Palmar (Chocó)",
      date: "10 de agosto de 2026, 7:34 a.m.",
      dateISO: "2026-08-10",
      deaths: 132,
      injured: 570,
      mostAffected: "Risaralda (Pereira) y Valle del Cauca (Cali)",
      alsoAffected: ["Chocó (Quibdó)", "Caldas (Manizales)"],
      sourceName: "El Tiempo (Asocapitales), CNN en Español (10 ago. 2026) — cifras corroboradas por 2+ fuentes, en desarrollo",
    },
    emergency: {
      // Colombia tiene una línea única nacional (a diferencia de VE, no hay
      // listado fragmentado por municipio que agregar todavía).
      nationalLine: { number: "123", label: "COL 1‑2‑3 — Línea única nacional de emergencias" },
      groups: [],
    },
    usgsBbox: [-4.5, -82, 13, -66],
    news: {
      matchPattern:
        "colombia|choc[oó]|pereira|risaralda|manizales|caldas|cali|valle del cauca|quibd[oó]|san jos[eé] del palmar",
      searchQuery: "Colombia (terremoto OR sismo OR temblor)",
      gl: "CO",
    },
  },
};

export function getCountry(code: string | null | undefined): CountryConfig {
  return COUNTRIES[isCountryCode(code) ? code : DEFAULT_COUNTRY];
}

export const ALL_REGIONS: string[] = Array.from(
  new Set(COUNTRY_CODES.flatMap((c) => COUNTRIES[c].regions as readonly string[])),
);

/**
 * Lista amplia de países de América para la pantalla de bienvenida (selector
 * de país). A diferencia de `COUNTRY_CODES` (los países con una emergencia
 * activa y datos completos: mapa, cifras, teléfonos, noticias), esta lista es
 * solo para que cualquier visitante de la región vea que la plataforma existe
 * y sepa que su país todavía no está activo. Elegir uno de estos NO cambia
 * `emb_country` ni carga datos reales — ver `CountryIntroModal`.
 */
export interface AmericasCountry {
  code: string;
  name: string;
}

export const AMERICAS_COUNTRIES: AmericasCountry[] = [
  { code: "ve", name: "Venezuela" },
  { code: "co", name: "Colombia" },
  { code: "ar", name: "Argentina" },
  { code: "bo", name: "Bolivia" },
  { code: "br", name: "Brasil" },
  { code: "ca", name: "Canadá" },
  { code: "cl", name: "Chile" },
  { code: "cr", name: "Costa Rica" },
  { code: "cu", name: "Cuba" },
  { code: "do", name: "República Dominicana" },
  { code: "ec", name: "Ecuador" },
  { code: "sv", name: "El Salvador" },
  { code: "us", name: "Estados Unidos" },
  { code: "gt", name: "Guatemala" },
  { code: "gy", name: "Guyana" },
  { code: "ht", name: "Haití" },
  { code: "hn", name: "Honduras" },
  { code: "jm", name: "Jamaica" },
  { code: "mx", name: "México" },
  { code: "ni", name: "Nicaragua" },
  { code: "pa", name: "Panamá" },
  { code: "py", name: "Paraguay" },
  { code: "pe", name: "Perú" },
  { code: "pr", name: "Puerto Rico" },
  { code: "sr", name: "Surinam" },
  { code: "tt", name: "Trinidad y Tobago" },
  { code: "uy", name: "Uruguay" },
];
