"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import {
  ChevronDown,
  HeartHandshake,
  Home,
  LifeBuoy,
  Map,
  PawPrint,
  Search,
  Users2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { NotificationBell } from "./NotificationBell";
import { AuthMenu } from "./AuthMenu";

// Mismas 5 secciones que la barra inferior de móvil (MobileNav.tsx): la
// navegación no debe cambiar de forma entre dispositivos. Antes las 9 vivían
// en una sola fila que había que deslizar para ver completa; el resto ahora
// va detrás de "Más" (menú desplegable aquí; hoja inferior en móvil).
const PRIMARY = [
  { href: "/", label: "Inicio", icon: Home, tour: "dnav-inicio" },
  { href: "/se-busca", label: "Se busca", icon: Search, tour: "dnav-se-busca" },
  { href: "/comunidad", label: "Comunidad", icon: Users2, tour: "dnav-comunidad" },
  { href: "/mapa", label: "Mapa", icon: Map, tour: "dnav-mapa" },
  { href: "/emergencias", label: "Emergencias", icon: LifeBuoy, tour: "dnav-emergencias" },
];

const MORE = [
  { href: "/ayuda", label: "Ayuda y hospitales", icon: HeartHandshake },
  { href: "/mascotas", label: "Mascotas", icon: PawPrint },
];

// Sub-secciones que viven bajo cada pestaña "paraguas" (se resaltan con ella).
const COMMUNITY_PATHS = ["/comunidad", "/voluntarios", "/caravanas", "/denuncias"];
const AYUDA_PATHS = ["/ayuda", "/hospitales"];

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

export function SiteHeader() {
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);
  const moreRef = useRef<HTMLDivElement>(null);
  const moreActive = MORE.some((t) => isActive(pathname, t.href));

  useEffect(() => {
    if (!moreOpen) return;
    const onClick = (e: MouseEvent) => {
      if (moreRef.current && !moreRef.current.contains(e.target as Node)) setMoreOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setMoreOpen(false);
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [moreOpen]);

  // Cierra el desplegable al navegar a otra sección.
  useEffect(() => {
    setMoreOpen(false);
  }, [pathname]);

  return (
    // `translateZ(0)` fuerza una capa de composición propia: mismo fix que ya
    // tiene MobileNav.tsx (barra fija de abajo) — sin esto, en Chrome/Safari
    // móvil este header "sticky" se queda un frame atrás cuando la barra de
    // direcciones del navegador se oculta al hacer scroll, dejando ver un
    // hueco blanco momentáneo entre el header y el borde real de la pantalla.
    <header
      className="sticky top-0 z-40 border-b border-zinc-200 bg-white/85 backdrop-blur will-change-transform"
      style={{ transform: "translateZ(0)" }}
    >
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
        <Link href="/" className="flex shrink-0 items-center gap-2">
          <Image
            src="/logo-icon.svg"
            alt="El Mundo Te Busca"
            width={40}
            height={40}
            priority
            className="h-10 w-10 shrink-0 object-contain"
          />
          {/* "El Mundo" encima de "Te Busca": compacto y no se estira en una línea larga.
              whitespace-nowrap evita que, si el header se aprieta, cada palabra caiga en su
              propia línea (pasaba porque el Link podía encogerse por debajo del ancho del texto). */}
          <span className="flex flex-col font-bold leading-[1.05] tracking-tight text-navy-700">
            <span className="whitespace-nowrap text-sm sm:text-base">El Mundo</span>
            <span className="whitespace-nowrap text-sm sm:text-base">Te Busca</span>
          </span>
        </Link>

        <div className="flex min-w-0 items-center gap-2">
          <nav className="hidden min-w-0 items-center gap-1 md:flex">
            {PRIMARY.map(({ href, label, icon: Icon, tour }) => {
              const active = isActive(pathname, href);
              return (
                <Link
                  key={href}
                  href={href}
                  data-tour={tour}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-1.5 text-sm font-medium transition",
                    active
                      ? "bg-navy-700 text-white"
                      : "text-zinc-600 hover:bg-navy-50 hover:text-navy-700",
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {label}
                </Link>
              );
            })}

            <div className="relative" ref={moreRef}>
              <button
                data-tour="dnav-mas"
                onClick={() => setMoreOpen((v) => !v)}
                aria-expanded={moreOpen}
                className={cn(
                  "press flex items-center gap-1 whitespace-nowrap rounded-full px-3 py-1.5 text-sm font-medium transition",
                  moreOpen || moreActive
                    ? "bg-navy-700 text-white"
                    : "text-zinc-600 hover:bg-navy-50 hover:text-navy-700",
                )}
              >
                Más
                <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", moreOpen && "rotate-180")} />
              </button>

              {moreOpen && (
                <div className="absolute right-0 top-11 z-50 w-56 overflow-hidden rounded-2xl border border-zinc-200 bg-white py-1.5 shadow-xl">
                  {MORE.map(({ href, label, icon: Icon }) => {
                    const active = isActive(pathname, href);
                    return (
                      <Link
                        key={href}
                        href={href}
                        aria-current={active ? "page" : undefined}
                        className={cn(
                          "flex items-center gap-2.5 px-4 py-2.5 text-sm font-medium transition",
                          active ? "bg-navy-50 text-navy-700" : "text-zinc-700 hover:bg-zinc-50",
                        )}
                      >
                        <Icon className="h-4 w-4 text-zinc-400" />
                        {label}
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          </nav>
          <NotificationBell />
          <AuthMenu />
        </div>
      </div>
    </header>
  );
}
