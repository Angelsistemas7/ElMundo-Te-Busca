"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { IconButton } from "./IconButton";
import { useDragDismiss } from "@/lib/useDragDismiss";

// Visor de foto a pantalla completa, con arrastrar-hacia-abajo-para-cerrar
// (como Fotos de iOS). Antes esta pantalla completa estaba copiada literal en
// PhotoView.tsx y PersonPhoto.tsx — ahora ambos la reutilizan.
export function PhotoLightbox({
  src,
  alt,
  open,
  onClose,
}: {
  src: string;
  alt: string;
  open: boolean;
  onClose: () => void;
}) {
  const { dragY, dragging, dragHandlers } = useDragDismiss(onClose);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  if (!open || !mounted) return null;

  const backdropOpacity = Math.max(0.4, 0.85 - dragY / 400);

  return createPortal(
    <div
      className="animate-backdrop fixed inset-0 z-[60] flex items-center justify-center p-4"
      style={{ background: `rgba(0,0,0,${backdropOpacity})` }}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Foto ampliada"
    >
      <IconButton
        onClick={onClose}
        aria-label="Cerrar foto"
        variant="dark"
        className="absolute right-4 top-4"
      >
        <X className="h-6 w-6" />
      </IconButton>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={alt}
        onClick={(e) => e.stopPropagation()}
        {...dragHandlers}
        className="animate-zoom max-h-[90dvh] max-w-full touch-none cursor-zoom-out rounded-2xl object-contain shadow-2xl"
        style={{
          transform: `translateY(${dragY}px)`,
          transition: dragging ? "none" : "transform 0.25s var(--ease-ios)",
        }}
      />
    </div>,
    document.body,
  );
}
