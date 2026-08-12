import "server-only";

/** Limitador de tasa de ventana fija: permite `max` llamadas cada `windowMs`
 *  por clave (normalmente IP + acción). Pensado para acciones anónimas de un
 *  clic (me gusta, reacciones) que NO llevan Turnstile ni sesión — sin esto,
 *  un script puede machacarlas sin límite: cada llamada es una lectura +
 *  escritura en la base de datos. En memoria (un solo proceso con PM2);
 *  reinicia si el proceso reinicia, y se poda sola para no crecer sin fin. */
export function createRateLimiter(max: number, windowMs: number, maxTrackedKeys = 5000) {
  const hits = new Map<string, { count: number; windowStart: number }>();

  function prune(now: number): void {
    if (hits.size < maxTrackedKeys) return;
    for (const [key, entry] of hits) {
      if (now - entry.windowStart > windowMs) hits.delete(key);
    }
  }

  return {
    /** true si la llamada se permite (y cuenta contra la ventana); false si ya se pasó del límite. */
    allow(key: string): boolean {
      const now = Date.now();
      prune(now);
      const entry = hits.get(key);
      if (!entry || now - entry.windowStart > windowMs) {
        hits.set(key, { count: 1, windowStart: now });
        return true;
      }
      if (entry.count >= max) return false;
      entry.count += 1;
      return true;
    },
  };
}

// Límite compartido para "me gusta" / reacciones anónimas: nadie real hace
// clic 40 veces en 30s en estos botones, pero un script sí. Una sola
// instancia compartida entre todas esas acciones (no una por tipo) porque lo
// que importa es frenar el volumen total de escrituras desde una IP, no
// permitir 40 de cada tipo (eso sería 40 × 8 endpoints = 320 escrituras/30s).
export const interactionLimiter = createRateLimiter(40, 30_000);
