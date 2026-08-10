// Directorio de emergencia y guía rápida para la comunidad.
// Los teléfonos por organismo provienen de listados públicos y PUEDEN cambiar:
// ante una emergencia, usa la línea única nacional del país activo.
//
// Los datos por país viven en `countries.ts`; este módulo mantiene
// `NATIONAL_LINE`/`PHONE_GROUPS` apuntando a Venezuela por compatibilidad, y
// añade `getEmergency(country)` para el resto de países.

import { COUNTRIES, DEFAULT_COUNTRY, getCountry, type CountryCode } from "./countries";
export type { PhoneEntry, PhoneGroup } from "./countries";

/** @deprecated usa `getEmergency(country).nationalLine`. Se mantiene por compatibilidad (Venezuela). */
export const NATIONAL_LINE = COUNTRIES[DEFAULT_COUNTRY].emergency.nationalLine;

/** @deprecated usa `getEmergency(country).groups`. Se mantiene por compatibilidad (Venezuela). */
export const PHONE_GROUPS = COUNTRIES[DEFAULT_COUNTRY].emergency.groups;

export function getEmergency(country: CountryCode | string | null | undefined) {
  return getCountry(country ?? undefined).emergency;
}

/** Guía rápida para la comunidad: acciones esenciales en las primeras horas. */
export const COMMUNITY_GUIDE: string[] = [
  "Ponte a salvo: aléjate de estructuras dañadas, vidrios y postes. Pueden venir réplicas.",
  "Revisa si tú y los tuyos están heridos. Da primeros auxilios básicos.",
  "Si hueles gas, cierra la llave y no enciendas nada. Corta la electricidad si ves cables sueltos.",
  "No uses ascensores. Baja por las escaleras con cuidado.",
  "Avisa que estás a salvo con un solo mensaje (no llames: satura la red). Puedes hacerlo aquí mismo.",
  "Ten a mano agua, linterna, medicinas y tus documentos.",
  "Acuerda un punto de encuentro con tu familia por si se separan.",
  "No difundas rumores: verifica antes de compartir.",
  "Ayuda a vecinos vulnerables: adultos mayores, niños y personas con discapacidad.",
];
