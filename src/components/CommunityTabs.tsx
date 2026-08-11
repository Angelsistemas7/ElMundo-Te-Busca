"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { HandHeart, MapPinned, Megaphone, Users2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { SwipeHintRowOnce } from "./SwipeHint";

// Barra de pestañas del área de Comunidad. El muro, los voluntarios, las
// caravanas y las denuncias viven en páginas separadas pero se sienten como
// una sola sección: esta barra deja saltar entre ellas. Va arriba de cada una.
const TABS = [
  { href: "/comunidad", label: "Muro", icon: Users2 },
  { href: "/voluntarios", label: "Voluntarios", icon: HandHeart },
  { href: "/caravanas", label: "Caravanas", icon: MapPinned },
  { href: "/denuncias", label: "Denuncias", icon: Megaphone },
];

export function CommunityTabs() {
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
