"use client";

import { useState } from "react";
import { cn, initials } from "@/lib/utils";
import { PhotoLightbox } from "./PhotoLightbox";

// Muestra la foto de una persona y, si la imagen falla al cargar (404, enlace
// roto, etc.), cae con elegancia a un avatar con iniciales. Nunca se ve una
// imagen rota como en el sitio original. Con `zoomable` (en la ficha), tocar la
// foto la abre a pantalla completa.
export function PersonPhoto({
  src,
  firstName,
  lastName,
  isUnidentified,
  className = "",
  fallbackTextClass = "text-4xl",
  zoomable = false,
}: {
  src: string | null;
  firstName: string;
  lastName: string;
  isUnidentified: boolean;
  className?: string;
  fallbackTextClass?: string;
  zoomable?: boolean;
}) {
  const [failed, setFailed] = useState(false);
  const [open, setOpen] = useState(false);
  const showImage = src && !failed;

  const alt = `${firstName} ${lastName}`.trim() || "Persona";

  if (showImage) {
    return (
      <>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt={alt}
          loading="lazy"
          onError={() => setFailed(true)}
          onClick={zoomable ? () => setOpen(true) : undefined}
          className={cn("h-full w-full object-cover", zoomable && "cursor-zoom-in", className)}
        />
        {zoomable && (
          <PhotoLightbox src={src} alt={alt} open={open} onClose={() => setOpen(false)} />
        )}
      </>
    );
  }

  return (
    <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-zinc-100 to-zinc-200">
      <span className={`font-bold text-zinc-300 ${fallbackTextClass}`}>
        {isUnidentified ? "?" : initials(firstName, lastName)}
      </span>
    </div>
  );
}
