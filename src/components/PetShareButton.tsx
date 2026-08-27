"use client";

import { Share2 } from "lucide-react";
import { useShareLink } from "@/lib/useShareLink";

// Botón "Compartir" de una ficha de mascota. Mismo mecanismo que
// PersonShareButton (Web Share API con respaldo de copiar al portapapeles).
export function PetShareButton({
  name,
  className = "",
}: {
  name: string;
  className?: string;
}) {
  const { copied, share } = useShareLink();

  function onShare() {
    return share({
      title: "El Mundo Te Busca",
      text: `Ayúdanos a encontrar a ${name}. El Mundo Te Busca.`,
      url: typeof window !== "undefined" ? window.location.href : "",
    });
  }

  return (
    <button
      onClick={onShare}
      className={`press flex items-center justify-center gap-2 rounded-xl border border-zinc-300 px-4 py-2.5 text-sm font-semibold text-zinc-700 transition hover:bg-zinc-50 ${className}`}
    >
      <Share2 className="h-4 w-4" />
      {copied ? "Enlace copiado" : "Compartir"}
    </button>
  );
}
