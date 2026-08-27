// Lectura de los parámetros de consulta (?estado=...&page=2) que comparten
// todos los listados y las páginas de gestión. Antes cada página repetía estas
// mismas tres definiciones; el comportamiento es exactamente el mismo.

/** `searchParams` tal como lo entrega el App Router de Next 15 (es una promesa). */
export type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/** Primer valor de un parámetro repetido (?estado=a&estado=b -> "a"). */
export const str = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

/** Parámetro numérico; `undefined` si falta o no es un número finito. */
export const num = (v: string | string[] | undefined) => {
  const s = str(v);
  const n = s ? Number(s) : NaN;
  return Number.isFinite(n) ? n : undefined;
};
