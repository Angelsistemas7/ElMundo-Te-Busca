import Link from "next/link";
import { cn } from "@/lib/utils";

// Contenedor "widget" compartido: esquinas grandes, sombra en capas y
// feedback táctil. Las tarjetas de la grilla (persona, hospital, punto de
// ayuda, mascota, denuncia, caravana, post, noticia, héroe) lo componen en
// vez de repetir el mismo `tap-card rounded-2xl border bg-white` cada una.
export function Card({
  href,
  onClick,
  className,
  children,
  as,
}: {
  href?: string;
  onClick?: () => void;
  className?: string;
  children: React.ReactNode;
  as?: "div";
}) {
  const base = cn(
    "tap-card flex flex-col overflow-hidden rounded-3xl border border-zinc-200 bg-white",
    className,
  );

  if (href) {
    return (
      <Link href={href} className={cn(base, "group")}>
        {children}
      </Link>
    );
  }

  if (onClick || as === "div") {
    return (
      <div className={base} onClick={onClick}>
        {children}
      </div>
    );
  }

  return <div className={base}>{children}</div>;
}
