"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

const RESUME_DELAY_MS = 10_000;

/**
 * Pausa el vaivén leve (.hint-swipe) en cuanto el usuario toca o desliza la
 * fila, y lo retoma solo, solo, tras 10s sin más interacción. Antes el vaivén
 * era continuo sin parar, incluso mientras la persona lo estaba deslizando a
 * mano — se sentía como si "peleara" con el dedo.
 */
function useSwipeHintPause() {
  const [paused, setPaused] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const onInteract = useCallback(() => {
    setPaused(true);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setPaused(false), RESUME_DELAY_MS);
  }, []);

  return { paused, onInteract };
}

/** Caso más común: el mismo elemento se desliza a mano Y tiene el vaivén. */
export function SwipeHintRow({
  className,
  children,
}: {
  className: string;
  children: React.ReactNode;
}) {
  const { paused, onInteract } = useSwipeHintPause();
  return (
    <div
      className={cn(className, !paused && "hint-swipe")}
      onPointerDown={onInteract}
      onTouchStart={onInteract}
      onScroll={onInteract}
    >
      {children}
    </div>
  );
}

const ONE_SHOT_DURATION_MS = 5_200; // ~2 ciclos de `hint-swipe` (2.6s c/u)

/**
 * Igual que `SwipeHintNested`, pero el vaivén corre UNA sola vez al montar
 * (un par de ciclos) y no se reactiva después, ni siquiera tras 10s de
 * inactividad — a diferencia de `SwipeHintNested`, que lo retoma sin parar.
 * Pensado para widgets que se ven todo el tiempo (cifras del inicio): el
 * vaivén continuo ahí se sentía como ruido visual permanente.
 */
export function SwipeHintNestedOnce({
  outerClassName,
  innerClassName,
  children,
}: {
  outerClassName: string;
  innerClassName: string;
  children: React.ReactNode;
}) {
  const [active, setActive] = useState(true);

  useEffect(() => {
    const t = setTimeout(() => setActive(false), ONE_SHOT_DURATION_MS);
    return () => clearTimeout(t);
  }, []);

  const stop = useCallback(() => setActive(false), []);

  return (
    <div className={outerClassName} onPointerDown={stop} onTouchStart={stop} onScroll={stop}>
      <div className={cn(innerClassName, active && "hint-swipe")}>{children}</div>
    </div>
  );
}

/**
 * Fila que se desliza a mano SIN el vaivén automático — en secciones con
 * mucha información en pantalla (Comunidad, Voluntarios, Denuncias) el
 * movimiento constante se sentía como demasiado. En vez del vaivén, una
 * pista chiquita ("―desliza›") que casi no ocupa espacio.
 */
export function SwipeStaticRow({
  className,
  wrapperClassName,
  children,
}: {
  className: string;
  wrapperClassName?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("min-w-0", wrapperClassName)}>
      <div className={className}>{children}</div>
      <div className="mt-1 flex items-center gap-1 text-[10px] font-medium text-zinc-400 sm:hidden">
        <span className="h-px w-3 bg-zinc-300" aria-hidden />
        desliza
        <ChevronRight className="h-2.5 w-2.5" />
      </div>
    </div>
  );
}

/**
 * Caso con un contenedor exterior que desliza (más angosto) y uno interior
 * más ancho que lleva el vaivén (cifras del inicio y del mapa; en escritorio
 * el interior pasa a ser una rejilla sin animación).
 */
export function SwipeHintNested({
  outerClassName,
  innerClassName,
  children,
}: {
  outerClassName: string;
  innerClassName: string;
  children: React.ReactNode;
}) {
  const { paused, onInteract } = useSwipeHintPause();
  return (
    <div
      className={outerClassName}
      onPointerDown={onInteract}
      onTouchStart={onInteract}
      onScroll={onInteract}
    >
      <div className={cn(innerClassName, !paused && "hint-swipe")}>{children}</div>
    </div>
  );
}
