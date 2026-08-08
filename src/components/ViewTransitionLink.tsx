"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { navigateWithViewTransition } from "@/lib/viewTransition";

// Link normal para todo (SEO, clic derecho, abrir en pestaña nueva, sin JS),
// que además dispara la View Transition nativa al hacer clic normal — usado
// por Card cuando se pide `viewTransition`.
export function ViewTransitionLink({
  href,
  className,
  children,
}: {
  href: string;
  className?: string;
  children: React.ReactNode;
}) {
  const router = useRouter();

  return (
    <Link
      href={href}
      className={className}
      onClick={(e) => {
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
        e.preventDefault();
        navigateWithViewTransition(router, href);
      }}
    >
      {children}
    </Link>
  );
}
