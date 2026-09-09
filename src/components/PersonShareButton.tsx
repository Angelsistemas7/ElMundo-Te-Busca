"use client";

import { Share2 } from "lucide-react";
import { reactToPersonAction } from "@/app/actions";
import { useShareLink } from "@/lib/useShareLink";

// Botón "Compartir" de una ficha de persona: va debajo de "Guardar". Antes
// vivía mezclado dentro de las reacciones (con "Fuerza"/"Cariño"), lo que
// confundía apoyo emocional con difundir el enlace. Sigue sumando al contador
// "difundir" de la persona (mismo dato de antes), solo que como su propio botón.
export function PersonShareButton({
  personId,
  name,
  unidentified,
  className = "",
}: {
  personId: string;
  name: string;
  unidentified: boolean;
  className?: string;
}) {
  const { copied, share } = useShareLink();

  function onShare() {
    const url = typeof window !== "undefined" ? window.location.href : "";
    const who = unidentified && !name ? "esta persona" : name;
    const text = unidentified
      ? `Necesitamos voluntarios digitales que puedan ayudar en esta tragedia. ¿La reconoces? Alguien vio a ${who} y no se sabe quién es. Una iniciativa sin fines de lucro de El Mundo Te Busca.`
      : `Necesitamos voluntarios digitales que puedan ayudar en esta tragedia. Ayúdanos a localizar a ${who}. Sus familiares esperan verlo pronto. Una iniciativa sin fines de lucro de El Mundo Te Busca.`;

    reactToPersonAction(personId, "difundir").catch(() => {});

    return share({ title: "El Mundo Te Busca", text, url });
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
