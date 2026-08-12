"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  HeartHandshake,
  Home,
  LifeBuoy,
  Map,
  Menu,
  PawPrint,
  Search,
  Users2,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { IconButton } from "./IconButton";

// Vibración muy sutil al cambiar de sección (si el dispositivo la soporta).
// Mejora progresiva: en iOS Safari `vibrate` no existe y no pasa nada.
function tapHaptic() {
  if (typeof navigator !== "undefined" && "vibrate" in navigator) {
    navigator.vibrate(8);
  }
}

// Barra inferior (solo móvil): 5 secciones clave de la emergencia con el pulgar
// + un botón "Más" que abre una hoja con el resto. Más legible que apretar 8.
const COMMUNITY_PATHS = ["/comunidad", "/voluntarios", "/caravanas", "/denuncias"];
const AYUDA_PATHS = ["/ayuda", "/hospitales"];

const PRIMARY = [
  { href: "/", label: "Inicio", icon: Home, tour: "mnav-inicio" },
  { href: "/se-busca", label: "Se busca", icon: Search, tour: "mnav-se-busca" },
  { href: "/comunidad", label: "Comunidad", icon: Users2, tour: "mnav-comunidad" },
  { href: "/mapa", label: "Mapa", icon: Map, tour: "mnav-mapa" },
  { href: "/emergencias", label: "SOS", icon: LifeBuoy, tour: "mnav-emergencias" },
];

const MORE = [
  { href: "/ayuda", label: "Ayuda y hospitales", icon: HeartHandshake },
  { href: "/mascotas", label: "Mascotas", icon: PawPrint },
];

function isActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  if (href === "/comunidad") {
    return COMMUNITY_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
  }
  if (href === "/ayuda") {
    return AYUDA_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
  }
  return pathname.startsWith(href);
}

const TAB_COUNT = PRIMARY.length + 1; // + "Más"

export function MobileNav() {
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);
  const moreActive = MORE.some((t) => isActive(pathname, t.href));
  const activeIndex = moreOpen || moreActive
    ? PRIMARY.length
    : Math.max(0, PRIMARY.findIndex((t) => isActive(pathname, t.href)));

  const navRef = useRef<HTMLElement>(null);

  // Chrome Android "salta" los elementos `fixed` de abajo cuando su barra de
  // direcciones se oculta/muestra al hacer scroll (Safari no tiene este bug
  // — confirmado probando ambos) y, en cualquier navegador, un `fixed`
  // normal queda oculto DEBAJO del teclado en vez de pegarse encima de él.
  // En vez de confiar en que el navegador recalcule solo la posición, se
  // sigue el viewport VISUAL real (`visualViewport`, se actualiza en los dos
  // casos) y se traduce la barra hacia arriba lo que haga falta.
  useEffect(() => {
    const vv = window.visualViewport;
    const el = navRef.current;
    if (!vv || !el) return;
    const update = () => {
      const offset = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
      el.style.transform = offset > 0 ? `translate3d(0, -${offset}px, 0)` : "translateZ(0)";
    };
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    update();
    return () => {
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
    };
  }, []);

  return (
    <>
      {moreOpen && (
        <div
          className="animate-backdrop fixed inset-0 z-50 bg-zinc-900/40 backdrop-blur-sm md:hidden"
          onClick={() => setMoreOpen(false)}
        >
          <div
            className="animate-sheet pb-safe absolute inset-x-0 bottom-0 rounded-t-3xl border-t border-zinc-200 bg-white p-3 pb-20"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sheet-handle" />
            <div className="mb-2 mt-2 flex items-center justify-between px-2">
              <span className="text-sm font-bold text-navy-700">Más secciones</span>
              <IconButton onClick={() => setMoreOpen(false)} aria-label="Cerrar" size="sm">
                <X className="h-5 w-5" />
              </IconButton>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {MORE.map(({ href, label, icon: Icon }) => {
                const active = isActive(pathname, href);
                return (
                  <Link
                    key={href}
                    href={href}
                    onClick={() => setMoreOpen(false)}
                    className={cn(
                      "tap-card flex items-center gap-2.5 rounded-2xl border px-3 py-3 text-sm font-medium",
                      active ? "border-navy-700 bg-navy-700 text-white" : "border-zinc-200 bg-white text-zinc-700",
                    )}
                  >
                    <Icon className="h-5 w-5 shrink-0" />
                    {label}
                  </Link>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* `translateZ(0)` fuerza una capa de composición propia (base, antes
          de que el efecto de arriba la ajuste según el viewport visual). */}
      <nav
        ref={navRef}
        className="pb-safe-nav fixed inset-x-0 bottom-0 z-40 border-t border-zinc-200 bg-white/95 backdrop-blur transition-transform duration-150 ease-out will-change-transform md:hidden"
        style={{ transform: "translateZ(0)" }}
      >
        <ul className="relative mx-auto flex max-w-md items-stretch justify-around">
          {/* Indicador que se desliza al cambiar de sección, en vez de solo
              cambiar el color del texto. */}
          <span
            aria-hidden
            className="pointer-events-none absolute left-0 top-1 h-8 rounded-2xl bg-brand-50 transition-transform duration-300"
            style={{
              width: `${100 / TAB_COUNT}%`,
              transform: `translateX(${activeIndex * 100}%)`,
              transitionTimingFunction: "var(--ease-ios)",
            }}
          />
          {PRIMARY.map(({ href, label, icon: Icon, tour }) => {
            const active = isActive(pathname, href);
            return (
              <li key={href} className="relative min-w-0 flex-1">
                <Link
                  href={href}
                  data-tour={tour}
                  aria-current={active ? "page" : undefined}
                  onClick={tapHaptic}
                  className={cn(
                    "press flex min-h-[3rem] flex-col items-center justify-center gap-0.5 py-2 text-[11px] font-medium leading-none transition",
                    active ? "text-brand-700" : "text-zinc-500",
                  )}
                >
                  <Icon className={cn("h-5 w-5 shrink-0", active && "stroke-[2.5]")} />
                  <span className="w-full truncate text-center">{label}</span>
                </Link>
              </li>
            );
          })}
          <li className="relative min-w-0 flex-1">
            <button
              data-tour="mnav-mas"
              onClick={() => {
                tapHaptic();
                setMoreOpen((v) => !v);
              }}
              aria-expanded={moreOpen}
              className={cn(
                "press flex min-h-[3rem] w-full flex-col items-center justify-center gap-0.5 py-2 text-[11px] font-medium leading-none transition",
                moreOpen || moreActive ? "text-brand-700" : "text-zinc-500",
              )}
            >
              <Menu className={cn("h-5 w-5 shrink-0", (moreOpen || moreActive) && "stroke-[2.5]")} />
              <span className="w-full truncate text-center">Más</span>
            </button>
          </li>
        </ul>
      </nav>
    </>
  );
}
