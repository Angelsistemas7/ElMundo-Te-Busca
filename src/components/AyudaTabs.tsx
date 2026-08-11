"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Building2, HeartHandshake } from "lucide-react";
import { cn } from "@/lib/utils";
import { SwipeHintRowOnce } from "./SwipeHint";

// Barra de pestañas del área de ayuda física. Puntos de ayuda y hospitales
// viven en páginas separadas (modelos de datos distintos: estado operativo de
// 4 valores + pacientes por nombre en hospitales, vs. categorías múltiples +
// disponibilidad en puntos de ayuda) pero se sienten como una sola sección —
// mismo patrón que CommunityTabs para Comunidad/Voluntarios/Caravanas/Denuncias.
const TABS = [
  { href: "/ayuda", label: "Puntos de ayuda", icon: HeartHandshake },
  { href: "/hospitales", label: "Hospitales", icon: Building2 },
];

export function AyudaTabs() {
  const pathname = usePathname();
  return (
    <SwipeHintRowOnce className="no-scrollbar mb-6 flex gap-1.5 overflow-x-auto pb-1">
      {TABS.map(({ href, label, icon: Icon }) => {
        const active = pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "press flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full border px-3 py-2 text-sm font-semibold transition",
              active
                ? "border-navy-700 bg-navy-700 text-white shadow-sm"
                : "border-zinc-200 bg-white text-zinc-600 hover:border-zinc-300 hover:bg-zinc-50",
            )}
          >
            <Icon className="h-4 w-4" />
            {label}
          </Link>
        );
      })}
    </SwipeHintRowOnce>
  );
}
