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

// Integración con el botón "atrás" del navegador: cada modal que se abre
// empuja una entrada de historial "fantasma" (misma URL) y se registra aquí.
// Si el usuario presiona "atrás", en vez de salir de la página se cierra el
// modal de encima — así nunca se pierde sin querer lo que estaba escribiendo
// en un formulario dentro de un modal. `suppressPops` evita que el
// `history.back()` que dispara el cierre NORMAL (X, Escape, fondo, guardar)
// -que sirve para "limpiar" esa entrada fantasma- también dispare este mismo
// listener y cierre otro modal por error.
const modalCloses = new Map<symbol, () => void>();
const closingViaBack = new Set<symbol>();
let suppressPops = 0;

if (typeof window !== "undefined") {
  window.addEventListener("popstate", () => {
    if (suppressPops > 0) {
      suppressPops--;
      return;
    }
    const topId = modalStack[modalStack.length - 1];
    if (!topId) return;
    const close = modalCloses.get(topId);
    if (!close) return;
    closingViaBack.add(topId);
    close();
  });
}

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

  // `onClose` llega muchas veces como función inline (recreada en cada
  // render del padre) — si el efecto de abajo dependiera de su identidad, se
  // re-ejecutaría en CADA render con el modal abierto (no solo al abrir/
  // cerrar), disparando `history.back()` de más y pudiendo desordenar el
  // historial. Con el ref, el efecto depende solo de `open` y siempre llama
  // a la versión más reciente de `onClose`.
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!open) return;
    const id = idRef.current!;
    modalStack.push(id);
    modalCloses.set(id, () => onCloseRef.current());
    // Entrada de historial "fantasma" (misma URL) para que "atrás" cierre
    // este modal en vez de salir de la página. Se recuerda el href exacto:
    // si mientras el modal estaba abierto ocurrió una navegación real (p. ej.
    // un <Link> dentro del modal que ya cerró y navegó, como en
    // RecognizeDeck.tsx), el href ya no coincide y NO se debe deshacer esa
    // navegación al limpiar la entrada fantasma.
    const openedHref = window.location.href;
    window.history.pushState(window.history.state, "", openedHref);

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && modalStack[modalStack.length - 1] === id) onCloseRef.current();
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      const wasTop = modalStack[modalStack.length - 1] === id;
      modalStack = modalStack.filter((x) => x !== id);
      modalCloses.delete(id);
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = modalStack.length ? "hidden" : "";

      const viaBack = closingViaBack.delete(id);
      if (!viaBack && wasTop && window.location.href === openedHref) {
        // Se cerró por una vía normal (X, Escape, fondo, guardar): consumir
        // la entrada fantasma para que el historial quede limpio. Se
        // suprime el próximo "popstate" para que este mismo back() no
        // dispare el cierre de OTRO modal que ahora esté "encima" en el
        // listener global.
        suppressPops++;
        window.history.back();
      }
    };
  }, [open]);

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
