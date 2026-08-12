import type { PersonStatus } from "./types";

export function cn(...classes: (string | false | null | undefined)[]): string {
  return classes.filter(Boolean).join(" ");
}

// Tamaños de página válidos para listados paginados (Comunidad, Se busca/¿La
// reconoces?). Vive aquí (no en PageSizeSelect.tsx) porque ese componente es
// "use client": llamar una función suya desde un Server Component revienta la
// página entera en cada carga ("Attempted to call ... from the server").
export const PAGE_SIZE_OPTIONS = [10, 20, 50] as const;
export const DEFAULT_PAGE_SIZE = 10;

/** Clampa cualquier valor a una de las opciones válidas (10/20/50). `defaultSize`
 *  permite que una sección puntual (p. ej. Comunidad) tenga su propio valor por
 *  defecto sin cambiar el de las demás (10). */
export function clampPageSize(v: number | undefined, defaultSize: number = DEFAULT_PAGE_SIZE): number {
  return v && (PAGE_SIZE_OPTIONS as readonly number[]).includes(v) ? v : defaultSize;
}

/** Etiqueta de tiempo relativa en español ("hace 5 min"). */
export function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return "hace instantes";
  if (min < 60) return `hace ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `hace ${h} h`;
  const d = Math.floor(h / 24);
  if (d < 30) return `hace ${d} d`;
  return new Date(iso).toLocaleDateString("es-VE");
}

/**
 * Construye un enlace de WhatsApp (`wa.me`) a partir de un teléfono libre.
 * Normaliza a solo dígitos con código de país: un número local venezolano que
 * empieza por "0" (p. ej. "0412-1234567") se reescribe a "58…". Devuelve null
 * si no hay suficientes dígitos para un número válido.
 */
export function whatsappLink(phone: string | null | undefined, text?: string): string | null {
  if (!phone) return null;
  let digits = phone.replace(/\D/g, "");
  if (digits.startsWith("0")) digits = `58${digits.slice(1)}`;
  if (digits.length < 9) return null;
  const base = `https://wa.me/${digits}`;
  return text ? `${base}?text=${encodeURIComponent(text)}` : base;
}

/** Enlace a indicaciones de cómo llegar en Google Maps hacia una coordenada. */
export function directionsLink(lat: number, lng: number): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
}

export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("es-VE", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Estilo de color (Tailwind) por estado, para chips y badges. */
export function statusStyle(status: PersonStatus): { bg: string; text: string; dot: string } {
  switch (status) {
    case "localizado":
      return { bg: "bg-emerald-50", text: "text-emerald-700", dot: "bg-emerald-500" };
    case "hospitalizado":
      return { bg: "bg-sky-50", text: "text-sky-700", dot: "bg-sky-500" };
    case "fallecido":
      return { bg: "bg-zinc-100", text: "text-zinc-600", dot: "bg-zinc-400" };
    default:
      return { bg: "bg-rose-50", text: "text-rose-700", dot: "bg-rose-500" };
  }
}

export function initials(first: string, last: string): string {
  return `${first.charAt(0)}${last.charAt(0)}`.toUpperCase();
}
