"use client";

import { useEffect, useRef, useState } from "react";

// Cuenta de 0 al valor final con una animación suave. Respeta la preferencia
// de "reducir movimiento" del sistema (accesibilidad).
export function AnimatedNumber({ value, durationMs = 1100 }: { value: number; durationMs?: number }) {
  const [display, setDisplay] = useState(0);
  const ref = useRef<HTMLSpanElement>(null);
  const started = useRef(false);

  useEffect(() => {
    const reduce =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      setDisplay(value);
      return;
    }

    const el = ref.current;
    if (!el) return;

    // Rearma la animación si `value` cambia (p. ej. router.refresh() al
    // cambiar de país reutiliza esta misma instancia con un valor nuevo):
    // sin este reset, `started` seguiría en `true` desde la primera vez y el
    // número se quedaría congelado en el valor anterior para siempre.
    started.current = false;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && !started.current) {
          started.current = true;
          const start = performance.now();
          const tick = (now: number) => {
            const t = Math.min(1, (now - start) / durationMs);
            // easeOutExpo para que frene con elegancia al final.
            const eased = t === 1 ? 1 : 1 - Math.pow(2, -10 * t);
            setDisplay(Math.round(eased * value));
            if (t < 1) requestAnimationFrame(tick);
          };
          requestAnimationFrame(tick);
        }
      },
      { threshold: 0.3 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [value, durationMs]);

  return (
    <span ref={ref} className="tabular-nums">
      {display.toLocaleString("es-VE")}
    </span>
  );
}
