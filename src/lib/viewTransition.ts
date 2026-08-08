import type { useRouter } from "next/navigation";

type Router = ReturnType<typeof useRouter>;

type DocumentWithViewTransition = Document & {
  startViewTransition?: (callback: () => void | Promise<void>) => { finished: Promise<void> };
};

// Navega con la View Transitions API nativa del navegador cuando está
// disponible (morphing real entre la miniatura de la tarjeta y la foto de la
// ficha, "hero" tipo iOS). Cae a una navegación normal si el navegador no la
// soporta o si la persona pidió menos movimiento.
//
// `router.push` de Next no avisa cuándo terminó de pintar la nueva página, así
// que el callback espera dos frames tras iniciar la navegación antes de dejar
// que la API capture el estado "después" — funciona bien porque estas rutas
// van prefetcheadas (Link las precarga al entrar en el viewport).
export function navigateWithViewTransition(router: Router, href: string) {
  const doc = document as DocumentWithViewTransition;
  const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  if (!doc.startViewTransition || prefersReducedMotion) {
    router.push(href);
    return;
  }

  doc.startViewTransition(() => {
    router.push(href);
    return new Promise<void>((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
    });
  });
}
