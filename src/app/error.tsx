"use client";

import { useEffect } from "react";
import Link from "next/link";
import { AlertTriangle, Home, RotateCcw } from "lucide-react";

// Frontera de error de la app. Captura fallos al renderizar/cargar datos
// (p. ej. un error transitorio de Supabase) y muestra una salida serena en vez
// de la pantalla genérica de Next. No expone el mensaje técnico al usuario.
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[ui.route-error]", { digest: error.digest ?? "sin-digest" });
  }, [error]);

  return (
    <div className="mx-auto flex max-w-md flex-col items-center px-4 py-20 text-center">
      <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-100 text-amber-700">
        <AlertTriangle className="h-7 w-7" />
      </span>
      <h1 className="mt-5 text-xl font-bold text-zinc-900">Algo salió mal</h1>
      <p className="mt-2 text-sm leading-relaxed text-zinc-600">
        Tuvimos un problema al cargar esta sección. Tu información está a salvo. Vuelve a intentarlo
        en un momento; si sigue fallando, recarga la página.
      </p>
      <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
        <button
          onClick={reset}
          className="press flex items-center gap-2 rounded-xl bg-brand-400 px-4 py-2.5 text-sm font-semibold text-zinc-900 transition hover:bg-brand-300"
        >
          <RotateCcw className="h-4 w-4" />
          Reintentar
        </button>
        <Link
          href="/"
          className="press flex items-center gap-2 rounded-xl border border-zinc-300 px-4 py-2.5 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50"
        >
          <Home className="h-4 w-4" />
          Ir al inicio
        </Link>
      </div>
    </div>
  );
}
