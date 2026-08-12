import "server-only";
import { headers } from "next/headers";

// Frontera de confianza para la IP real detrás de Cloudflare: ver la
// explicación larga en admin.ts (clientIp). Resumen: `CF-Connecting-IP` la
// pone Cloudflare y sobrescribe cualquier valor que el cliente mande, así que
// no se puede falsear; `X-Forwarded-For` sí se puede falsear (el cliente
// controla el primer valor de la lista) y solo se usa como respaldo sin CF.
export async function clientIp(): Promise<string> {
  const h = await headers();
  const cf = h.get("cf-connecting-ip");
  if (cf) return cf.trim();
  const fwd = h.get("x-forwarded-for");
  return (fwd ? fwd.split(",")[0].trim() : null) || h.get("x-real-ip") || "unknown";
}

/** Freno de fuerza bruta genérico por IP: N intentos fallidos bloquean esa IP
 *  un tiempo fijo. En memoria (un solo proceso con PM2); se reinicia si el
 *  proceso reinicia, aceptable para este alcance. Se poda sola cuando crece
 *  demasiado para no quedarse con entradas viejas para siempre. */
export function createLockout(maxAttempts: number, lockoutMs: number, maxTrackedKeys = 5000) {
  const attempts = new Map<string, { count: number; lockedUntil: number; lastAttemptAt: number }>();

  function prune(): void {
    if (attempts.size < maxTrackedKeys) return;
    const now = Date.now();
    for (const [key, entry] of attempts) {
      if (now - entry.lastAttemptAt > lockoutMs) attempts.delete(key);
    }
  }

  return {
    isLocked(key: string): boolean {
      const entry = attempts.get(key);
      return Boolean(entry && entry.lockedUntil > Date.now());
    },
    registerFailure(key: string): void {
      prune();
      const entry = attempts.get(key) ?? { count: 0, lockedUntil: 0, lastAttemptAt: 0 };
      entry.count += 1;
      entry.lastAttemptAt = Date.now();
      if (entry.count >= maxAttempts) {
        entry.lockedUntil = Date.now() + lockoutMs;
        entry.count = 0;
      }
      attempts.set(key, entry);
    },
    registerSuccess(key: string): void {
      attempts.delete(key);
    },
  };
}
