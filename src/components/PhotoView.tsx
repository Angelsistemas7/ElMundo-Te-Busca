"use client";

import { useState } from "react";
import Image from "next/image";
import { cn } from "@/lib/utils";
import { PhotoLightbox } from "./PhotoLightbox";

// Miniatura que, al tocarla, abre la foto a pantalla completa con un leve
// "zoom". Todo CSS (transform/opacity): GPU-friendly, sin tocar el servidor.
// `className` define el tamaño/forma del contenedor (debe darle una altura
// definida, p. ej. "h-16 w-16" o "h-64 w-full") — la foto lo llena con `fill`.
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
      <div
        className={cn(
          "relative cursor-zoom-in overflow-hidden transition hover:brightness-95",
          className,
        )}
        onClick={() => setOpen(true)}
      >
        <Image src={src} alt={alt} fill sizes="(min-width: 640px) 40rem, 100vw" className="object-cover" />
      </div>
      <PhotoLightbox src={src} alt={alt} open={open} onClose={() => setOpen(false)} />
    </>
  );
}
