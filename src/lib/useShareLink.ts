"use client";

import { useState } from "react";

/**
 * Compartir un enlace: usa el panel nativo del sistema (Web Share API) si el
 * navegador lo soporta y, si no, copia "texto + enlace" al portapapeles y
 * devuelve `copied` en true durante 1,8 s para cambiar la etiqueta del botón.
 * Lo comparten los botones de compartir de persona, mascota y perfil público.
 */
export function useShareLink() {
  const [copied, setCopied] = useState(false);

  async function share({ title, text, url }: { title: string; text: string; url: string }) {
    try {
      if (navigator.share) {
        await navigator.share({ title, text, url });
        return;
      }
    } catch {
      return; // el usuario canceló el panel de compartir
    }
    try {
      await navigator.clipboard.writeText(`${text} ${url}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* portapapeles no disponible */
    }
  }

  return { copied, share };
}
