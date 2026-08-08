"use client";

import { cn } from "@/lib/utils";

// Botón de solo ícono con área táctil mínima de 44×44px (Apple HIG) sin
// importar el tamaño del ícono que lleve adentro — antes cada uso improvisaba
// su propio padding (p-1.5, p-2) y quedaba por debajo del mínimo.
export function IconButton({
  className,
  variant = "light",
  size = "md",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "light" | "dark";
  size?: "md" | "sm";
}) {
  return (
    <button
      {...props}
      className={cn(
        "press flex shrink-0 items-center justify-center rounded-full transition",
        size === "md" ? "h-11 w-11" : "h-9 w-9",
        variant === "light"
          ? "text-zinc-500 hover:bg-zinc-100 hover:text-zinc-700"
          : "bg-white/10 text-white hover:bg-white/20",
        className,
      )}
    />
  );
}
