import "server-only";
import { cookies } from "next/headers";
import { DEFAULT_COUNTRY, isCountryCode, type CountryCode } from "./countries";

export const COUNTRY_COOKIE = "emb_country";

/**
 * País activo para esta petición. Se usa SOLO dentro de páginas/Server Actions
 * que ya son dinámicas (`export const dynamic = "force-dynamic"` o similar) —
 * leer `cookies()` fuerza renderizado dinámico, así que nunca se llama desde
 * el layout raíz ni de componentes que deban poder ser estáticos (ver el bug
 * ya documentado en docs/PROXIMO-CHAT.md sobre convertir todo el sitio a
 * dinámico por leer sesión en el layout).
 */
export async function getActiveCountry(): Promise<CountryCode> {
  const store = await cookies();
  const raw = store.get(COUNTRY_COOKIE)?.value;
  return isCountryCode(raw) ? raw : DEFAULT_COUNTRY;
}
