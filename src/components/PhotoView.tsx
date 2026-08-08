"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { PhotoLightbox } from "./PhotoLightbox";

// Miniatura que, al tocarla, abre la foto a pantalla completa con un leve
// "zoom". Todo CSS (transform/opacity): GPU-friendly, sin tocar el servidor.
export function PhotoView({
  src,
  alt = "",
  className,
}: {
  src: string;
  alt?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={alt}
        loading="lazy"
        onClick={() => setOpen(true)}
        className={cn("cursor-zoom-in transition hover:brightness-95", className)}
      />
      <PhotoLightbox src={src} alt={alt} open={open} onClose={() => setOpen(false)} />
    </>
  );
}
