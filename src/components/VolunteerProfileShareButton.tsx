"use client";

import { Share2 } from "lucide-react";
import { useShareLink } from "@/lib/useShareLink";

// Comparte el enlace público del perfil de voluntario digital (mismo patrón
// que PersonShareButton): navigator.share si el navegador lo soporta, si no
// copia el texto + enlace al portapapeles. La vista previa bonita (logo +
// foto + estadísticas) la genera el opengraph-image de esa ruta pública.
export function VolunteerProfileShareButton({ username }: { username: string }) {
  const { copied, share } = useShareLink();

  function onShare() {
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    const url = `${origin}/perfil/publico/${encodeURIComponent(username)}`;
    const text =
      "Este es mi perfil de voluntario digital en El Mundo Te Busca. Quiero invitarte a que también seas uno — juntos podemos salvar más vidas.";

    return share({ title: "Mi perfil de voluntario digital", text, url });
  }

  return (
    <button
      onClick={onShare}
      className="press flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-700"
    >
      <Share2 className="h-4 w-4" />
      {copied ? "Enlace copiado" : "Compartir mi perfil"}
    </button>
  );
}
