"use client";

import { useCallback, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";

const THRESHOLD = 64;
const MAX_PULL = 96;

/**
 * Arrastrar hacia abajo desde el tope de la página para recargar el feed
 * (como Fotos/Mail de iOS). Solo actúa si el gesto empieza con la página en
 * scroll 0 — si no, es un scroll normal y no interfiere. `router.refresh()`
 * vuelve a pedir los Server Components de la página (misma data que un F5,
 * sin perder el estado del cliente que no dependa de props del servidor).
 */
export function PullToRefresh({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [pullY, setPullY] = useState(0);
  const startY = useRef<number | null>(null);
  const triggered = useRef(false);

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    if (window.scrollY > 0) {
      startY.current = null;
      return;
    }
    startY.current = e.touches[0].clientY;
    triggered.current = false;
  }, []);

  const onTouchMove = useCallback((e: React.TouchEvent) => {
    if (startY.current === null) return;
    const delta = e.touches[0].clientY - startY.current;
    if (delta <= 0) {
      setPullY(0);
      return;
    }
    const damped = Math.min(delta * 0.5, MAX_PULL);
    setPullY(damped);
    if (damped >= THRESHOLD && !triggered.current) {
      triggered.current = true;
      navigator.vibrate?.(10);
    }
  }, []);

  const onTouchEnd = useCallback(() => {
    if (startY.current === null) return;
    startY.current = null;
    if (triggered.current && !pending) {
      startTransition(() => router.refresh());
    }
    setPullY(0);
  }, [pending, router]);

  const spinnerHeight = pending ? 48 : pullY;

  return (
    <div onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd}>
      <div
        className="flex items-center justify-center overflow-hidden"
        style={{
          height: spinnerHeight,
          transition: pullY === 0 || pending ? "height 0.25s var(--ease-ios)" : undefined,
        }}
        aria-hidden={!pending}
      >
        <RefreshCw
          className={cn(
            "h-5 w-5 text-zinc-400",
            (pending || pullY >= THRESHOLD) && "text-brand-600",
            pending && "animate-spin",
          )}
          style={pending ? undefined : { transform: `rotate(${pullY * 3}deg)` }}
        />
      </div>
      {children}
    </div>
  );
}
