"use client";

import { useEffect, useState } from "react";
import { Check, Copy, Share2 } from "lucide-react";

const MESSAGE =
  "🆘 *El Mundo Te Busca* — necesitamos voluntarios digitales para esta plataforma ciudadana y sin fines de lucro, en respuesta a los terremotos de Venezuela y Colombia de 2026:\n\n" +
  "🔍 Se busca — reporta y localiza desaparecidos\n" +
  "👁️ ¿La reconoces? — ponle nombre a quien no se identifica\n" +
  "💬 Comunidad — pide u ofrece ayuda\n" +
  "🤝 Voluntarios — súmate desde el terreno\n" +
  "🚐 Caravanas — rutas de ayuda\n" +
  "📢 Denuncias — irregularidades con la ayuda\n" +
  "🏥 Hospitales — capacidad e insumos, validado por la comunidad\n" +
  "📦 Puntos de ayuda — agua, comida y medicinas\n" +
  "🐾 Mascotas — perdidas y encontradas\n" +
  "☎️ Emergencias — teléfonos y guía de seguridad\n" +
  "🗺️ Mapa — zonas, ayuda, hospitales y rescates\n\n" +
  "Entre más personas la vean, más vidas se pueden salvar. Compártela:";

export function ShareWhatsApp({ variant = "primary" }: { variant?: "primary" | "subtle" }) {
  const [copied, setCopied] = useState(false);
  // El servidor no conoce el dominio real del navegador: arranca igual en
  // ambos lados (NEXT_PUBLIC_SITE_URL o vacío) y solo cambia a
  // `window.location.origin` DESPUÉS de montar, para no chocar con lo que ya
  // renderizó el servidor (evita el warning de "hydration mismatch").
  const [url, setUrl] = useState(() => process.env.NEXT_PUBLIC_SITE_URL ?? "");
  useEffect(() => setUrl(window.location.origin), []);
  const waHref = `https://wa.me/?text=${encodeURIComponent(`${MESSAGE} ${url}`)}`;

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* ignore */
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <a
        href={waHref}
        target="_blank"
        rel="noopener noreferrer"
        className={
          variant === "primary"
            ? "press inline-flex items-center gap-2 rounded-xl bg-[#25D366] px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#1ebe5b]"
            : "press inline-flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-700 transition hover:bg-emerald-100"
        }
      >
        <Share2 className="h-4 w-4" />
        Compartir por WhatsApp
      </a>
      <button
        onClick={copy}
        className="press inline-flex items-center gap-1.5 rounded-lg border border-zinc-300 px-3 py-2 text-sm font-medium text-zinc-600 hover:bg-zinc-50"
      >
        {copied ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
        {copied ? "Copiado" : "Copiar enlace"}
      </button>
    </div>
  );
}
