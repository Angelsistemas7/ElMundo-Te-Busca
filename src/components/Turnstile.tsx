"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { RotateCcw } from "lucide-react";

// Widget de Cloudflare Turnstile. Si no hay site key configurada, renderiza
// una nota discreta y el formulario sigue funcionando (modo desarrollo).

declare global {
  interface Window {
    turnstile?: {
      render: (el: HTMLElement, opts: Record<string, unknown>) => string;
      remove: (id: string) => void;
      reset: (id: string) => void;
    };
  }
}

const SCRIPT_SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js";

// El token que emite el widget es de un solo uso: si el envío del formulario
// falla por CUALQUIER motivo (Turnstile expirado, un campo inválido, el
// nombre de usuario ya existe...), reenviar el mismo formulario manda ese
// mismo token ya consumido — Cloudflare siempre lo rechaza en el segundo
// intento ("timeout-or-duplicate"), aunque el problema real ya se haya
// corregido. Antes de esto, quien reintentaba veía "No se pudo verificar que
// eres una persona" sin parar, sin ninguna pista de qué hacer. Este `ref`
// deja que el formulario que lo usa pida un token nuevo tras cualquier fallo.
export interface TurnstileHandle {
  reset: () => void;
}

export const Turnstile = forwardRef<TurnstileHandle>(function Turnstile(_props, forwardedRef) {
  const ref = useRef<HTMLDivElement>(null);
  const widgetId = useRef<string | null>(null);
  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
  // El token de Turnstile vale unos 5 minutos. Sin esto, alguien que se
  // demora escribiendo el formulario ve el ✓ verde de siempre (el widget no
  // avisa solo) pero el token ya venció por dentro — el error "no se pudo
  // verificar que eres humano" solo aparece al final, al publicar, sin
  // ninguna pista de qué pasó. Ahora se detecta la expiración y se avisa
  // aquí mismo, con un botón para volver a verificar sin perder el resto del
  // formulario ya escrito.
  const [expired, setExpired] = useState(false);

  function doReset() {
    if (widgetId.current && window.turnstile) {
      window.turnstile.reset(widgetId.current);
      setExpired(false);
    }
  }

  useImperativeHandle(forwardedRef, () => ({ reset: doReset }));

  useEffect(() => {
    if (!siteKey || !ref.current) return;
    const el = ref.current;

    function renderWidget() {
      if (!window.turnstile || !el) return;
      widgetId.current = window.turnstile.render(el, {
        sitekey: siteKey,
        "refresh-expired": "auto",
        callback: () => setExpired(false),
        "expired-callback": () => setExpired(true),
        "error-callback": () => setExpired(true),
      });
    }

    if (window.turnstile) {
      renderWidget();
    } else if (!document.querySelector(`script[src="${SCRIPT_SRC}"]`)) {
      const script = document.createElement("script");
      script.src = SCRIPT_SRC;
      script.async = true;
      script.defer = true;
      script.onload = renderWidget;
      document.head.appendChild(script);
    } else {
      const t = setInterval(() => {
        if (window.turnstile) {
          clearInterval(t);
          renderWidget();
        }
      }, 200);
      return () => clearInterval(t);
    }

    return () => {
      if (widgetId.current && window.turnstile) {
        try {
          window.turnstile.remove(widgetId.current);
        } catch {
          /* noop */
        }
      }
    };
  }, [siteKey]);

  if (!siteKey) {
    return (
      <p className="rounded-lg bg-zinc-50 px-3 py-2 text-xs text-zinc-400">
        Verificación anti-bot activa en producción (Cloudflare Turnstile).
      </p>
    );
  }

  return (
    <div>
      <div ref={ref} className="min-h-[65px]" />
      {expired && (
        <button
          type="button"
          onClick={doReset}
          className="press mt-1.5 flex items-center gap-1.5 text-xs font-semibold text-amber-700 hover:underline"
        >
          <RotateCcw className="h-3.5 w-3.5" />
          La verificación expiró por el tiempo — vuelve a marcarla
        </button>
      )}
    </div>
  );
});
