"use client";

import { useRef, useState } from "react";

// Gesto de "arrastrar hacia abajo para cerrar" (hojas y visor de fotos, como
// en iOS). Solo sigue el dedo verticalmente y decide al soltar: si pasó el
// umbral o llevaba suficiente velocidad, cierra; si no, vuelve a su sitio.
// Puro pointer events + CSS transform — sin librerías de gestos.
const DISMISS_DISTANCE = 120;
const DISMISS_VELOCITY = 0.5; // px/ms

export function useDragDismiss(onDismiss: () => void) {
  const [dragY, setDragY] = useState(0);
  const [dragging, setDragging] = useState(false);
  const startY = useRef(0);
  const startT = useRef(0);

  const onPointerDown = (e: React.PointerEvent) => {
    startY.current = e.clientY;
    startT.current = performance.now();
    setDragging(true);
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragging) return;
    const delta = e.clientY - startY.current;
    if (delta > 0) setDragY(delta);
  };

  const onPointerUp = (e: React.PointerEvent) => {
    if (!dragging) return;
    setDragging(false);
    const elapsed = performance.now() - startT.current;
    const velocity = dragY / Math.max(elapsed, 1);
    if (dragY > DISMISS_DISTANCE || velocity > DISMISS_VELOCITY) {
      onDismiss();
    }
    setDragY(0);
  };

  return {
    dragY,
    dragging,
    dragHandlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp,
      onPointerCancel: onPointerUp,
    },
  };
}
