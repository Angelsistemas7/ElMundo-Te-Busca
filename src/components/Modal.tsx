"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { IconButton } from "./IconButton";
import { useDragDismiss } from "@/lib/useDragDismiss";

// Pila global de modales abiertos (p. ej. LocationPicker o el mapPoint de
// FilterModal abren su propio Modal encima de otro Modal ya abierto, ambos
// escuchando "Escape" en document). Sin esto, Escape cerraba los dos a la
// vez; con la pila, solo el que está más arriba (el último abierto) responde.
let modalStack: symbol[] = [];

export function Modal({
  open,
  onClose,
  title,
  subtitle,
  children,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  // Montamos en un portal a <body> para que el modal NO herede el "containing
  // block" de un ancestro con backdrop-blur/transform (p. ej. el header). Si no,
  // su `position: fixed` se mide contra el header y el modal sale descolocado y
  // cortado en móvil. El portal lo ancla a la pantalla completa.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // Sin esto, al cerrar el modal desaparecía de golpe (el "open=false" lo
  // desmontaba al instante, cortando la animación de salida). Con `visible`
  // seguimos renderizando un poco más mientras corre la animación inversa, y
  // solo desmontamos cuando termina.
  const [visible, setVisible] = useState(open);
  const [closing, setClosing] = useState(false);
  useEffect(() => {
    if (open) {
      setVisible(true);
      setClosing(false);
      return;
    }
    if (!visible) return;
    setClosing(true);
    const t = setTimeout(() => setVisible(false), 220);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const idRef = useRef<symbol | null>(null);
  if (!idRef.current) idRef.current = Symbol("modal");

  useEffect(() => {
    if (!open) return;
    const id = idRef.current!;
    modalStack.push(id);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && modalStack[modalStack.length - 1] === id) onClose();
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      modalStack = modalStack.filter((x) => x !== id);
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = modalStack.length ? "hidden" : "";
    };
  }, [open, onClose]);

  const { dragY, dragging, dragHandlers } = useDragDismiss(onClose);

  if (!visible || !mounted) return null;

  return createPortal(
    <div
      className={`fixed inset-0 z-50 flex items-end justify-center bg-zinc-900/50 p-2 backdrop-blur-sm sm:items-center sm:p-4 ${closing ? "animate-backdrop-out" : "animate-backdrop"}`}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      {/* Un poco de aire a los 4 lados incluso en móvil (antes tocaba los
          bordes y el fondo de la pantalla). */}
      <div
        className={`flex max-h-[85dvh] w-full max-w-lg flex-col rounded-t-3xl bg-white shadow-[var(--shadow-sheet)] sm:rounded-3xl sm:max-h-[88dvh] ${closing ? "animate-sheet-out" : "animate-sheet"}`}
        onClick={(e) => e.stopPropagation()}
        style={{
          transform: dragY ? `translateY(${dragY}px)` : undefined,
          transition: dragging ? "none" : undefined,
        }}
      >
        {/* Manija de arrastre: solo visible/activa en móvil, tipo hoja iOS. */}
        <div className="cursor-grab touch-none pb-1 sm:hidden" {...dragHandlers}>
          <div className="sheet-handle" />
        </div>

        <div className="flex items-start justify-between gap-4 border-b border-zinc-100 p-5">
          <div>
            <h2 className="text-lg font-bold text-zinc-900">{title}</h2>
            {subtitle && <p className="mt-0.5 text-sm text-zinc-500">{subtitle}</p>}
          </div>
          <IconButton onClick={onClose} aria-label="Cerrar" size="sm">
            <X className="h-5 w-5" />
          </IconButton>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-5">{children}</div>

        {footer && (
          <div className="pb-safe flex items-center justify-end gap-3 border-t border-zinc-100 p-4">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
