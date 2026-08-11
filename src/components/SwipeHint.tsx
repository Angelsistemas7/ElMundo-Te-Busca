"use client";

import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

const ONE_SHOT_DURATION_MS = 5_200; // ~2 ciclos de `hint-swipe` (2.6s c/u)
const VIEWPORT_THRESHOLD = 0.5; // la fila debe verse al menos a la mitad

/**
 * El vaivén corre UNA sola vez — no al montar (eso disparaba la animación
 * aunque el widget todavía no estuviera a la vista, p.ej. más abajo en la
 * pantalla de un celular), sino la primera vez que la fila entra de verdad en
 * el viewport (IntersectionObserver), un par de ciclos, y no se reactiva
 * después. No depende de que el usuario la toque para detenerse. Contenedor
 * exterior que desliza + interior más ancho con el vaivén (cifras del inicio,
 * noticias, cifras del mapa).
 */
export const SwipeHintNestedOnce = forwardRef<HTMLDivElement, {
  outerClassName: string;
  innerClassName: string;
  children: React.ReactNode;
}>(function SwipeHintNestedOnce({ outerClassName, innerClassName, children }, forwardedRef) {
  const outerRef = useRef<HTMLDivElement>(null);
  useImperativeHandle(forwardedRef, () => outerRef.current as HTMLDivElement);

  const [active, setActive] = useState(false);
  const firedRef = useRef(false);

  useEffect(() => {
    const el = outerRef.current;
    if (!el || firedRef.current) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting || firedRef.current) return;
        firedRef.current = true;
        setActive(true);
        const t = setTimeout(() => setActive(false), ONE_SHOT_DURATION_MS);
        observer.disconnect();
        return () => clearTimeout(t);
      },
      { threshold: VIEWPORT_THRESHOLD }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const stop = useCallback(() => setActive(false), []);

  return (
    <div ref={outerRef} className={outerClassName} onPointerDown={stop} onTouchStart={stop} onScroll={stop}>
      <div className={cn(innerClassName, active && "hint-swipe")}>{children}</div>
    </div>
  );
});

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
 * Fila simple (sin contenedor interior separado) cuyo vaivén corre UNA sola
 * vez al entrar en el viewport — para filas de filtros/tabs (mapa, comunidad,
 * ayuda, mascotas). El vaivén continuo ahí competía visualmente con el resto
 * de la pantalla.
 */
export const SwipeHintRowOnce = forwardRef<HTMLDivElement, {
  className: string;
  children: React.ReactNode;
}>(function SwipeHintRowOnce({ className, children }, forwardedRef) {
  const ref = useRef<HTMLDivElement>(null);
  useImperativeHandle(forwardedRef, () => ref.current as HTMLDivElement);

  const [active, setActive] = useState(false);
  const firedRef = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || firedRef.current) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting || firedRef.current) return;
        firedRef.current = true;
        setActive(true);
        const t = setTimeout(() => setActive(false), ONE_SHOT_DURATION_MS);
        observer.disconnect();
        return () => clearTimeout(t);
      },
      { threshold: VIEWPORT_THRESHOLD }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const stop = useCallback(() => setActive(false), []);

  return (
    <div
      ref={ref}
      className={cn(className, active && "hint-swipe")}
      onPointerDown={stop}
      onTouchStart={stop}
      onScroll={stop}
    >
      {children}
    </div>
  );
});
