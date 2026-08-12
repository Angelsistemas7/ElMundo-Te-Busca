"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Bell, Bookmark, ExternalLink, FileWarning, MessageCircle } from "lucide-react";
import { TYPE_LABEL, useNotifications } from "@/lib/useNotifications";

// Campanita de actividad: junta lo que publicaste en este dispositivo o cuenta
// con lo que guardaste, y avisa cuando hay comentarios o reportes nuevos. Sin
// servidores de notificaciones: compara el conteo actual con el visto. Vista
// completa (sin límite de alto) en /notificaciones.
export function NotificationBell() {
  const { entries, newsOf, totalNew, markRead, linkFor, loggedIn } = useNotifications();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // Sin sesión Y sin publicaciones/guardados en este dispositivo: no hay nada
  // que esta persona pueda ver aquí todavía (ni "Ver todas" tendría sentido).
  // Con sesión iniciada se muestra igual, aunque esté vacía, para que la
  // campanita sea un punto fijo de la cuenta (junto a "Entrar"/perfil).
  if (entries.length === 0 && !loggedIn) return null;

  const preview = entries.slice(0, 8);

  return (
    <div className="relative" ref={ref}>
      <button
        data-tour="tour-bell"
        onClick={() => setOpen((v) => !v)}
        aria-label={`Mis publicaciones y guardados${totalNew > 0 ? ` (${totalNew} avisos nuevos)` : ""}`}
        className="relative flex h-10 w-10 items-center justify-center rounded-full text-zinc-600 transition hover:bg-zinc-100"
      >
        <Bell className="h-5 w-5" />
        {totalNew > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-rose-600 px-1 text-[11px] font-bold text-white">
            {totalNew > 9 ? "9+" : totalNew}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-12 z-50 w-80 max-w-[calc(100vw-2rem)] overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-xl">
          <div className="flex items-center justify-between border-b border-zinc-100 px-4 py-3">
            <h2 className="text-sm font-bold text-zinc-900">Publicaciones y guardados</h2>
            {totalNew > 0 && (
              <button
                onClick={markRead}
                className="text-xs font-medium text-brand-700 hover:underline"
              >
                Marcar como leído
              </button>
            )}
          </div>

          {entries.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-zinc-400">
              Aún no tienes publicaciones ni guardados. Aparecerán aquí en cuanto publiques o guardes algo.
            </p>
          ) : (
          <ul className="max-h-[70vh] divide-y divide-zinc-100 overflow-y-auto">
            {preview.map((e) => {
              const n = newsOf(e);
              return (
                <li key={e.key}>
                  <Link
                    href={linkFor(e)}
                    onClick={() => setOpen(false)}
                    className="flex items-start gap-3 px-4 py-3 transition hover:bg-zinc-50"
                  >
                    <span
                      aria-hidden
                      className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${
                        n.total > 0 ? "bg-rose-500" : "bg-transparent"
                      }`}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="line-clamp-1 text-sm font-medium text-zinc-900">
                        {e.title}
                      </span>
                      <span className="mt-0.5 flex items-center gap-1.5 text-xs text-zinc-400">
                        {TYPE_LABEL[e.type]}
                        {e.saved && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-brand-50 px-1.5 py-0.5 font-medium text-brand-700">
                            <Bookmark className="h-3 w-3" />
                            Guardado
                          </span>
                        )}
                      </span>
                      {n.total > 0 ? (
                        <span className="mt-1 flex flex-wrap gap-2 text-xs">
                          {n.comments > 0 && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2 py-0.5 font-medium text-rose-700">
                              <MessageCircle className="h-3 w-3" />
                              {n.comments} {n.comments === 1 ? "respuesta" : "respuestas"}
                            </span>
                          )}
                          {n.reports > 0 && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 font-medium text-amber-700">
                              <FileWarning className="h-3 w-3" />
                              {n.reports} {n.reports === 1 ? "reporte" : "reportes"}
                            </span>
                          )}
                        </span>
                      ) : (
                        <span className="mt-1 block text-xs text-zinc-400">Sin novedades</span>
                      )}
                    </span>
                    <ExternalLink className="mt-0.5 h-4 w-4 shrink-0 text-zinc-300" />
                  </Link>
                </li>
              );
            })}
          </ul>
          )}

          {entries.length > 0 && (
            <Link
              href="/notificaciones"
              onClick={() => setOpen(false)}
              className="press block border-t border-zinc-100 px-4 py-2.5 text-center text-sm font-semibold text-brand-700 hover:bg-zinc-50"
            >
              Ver todas ({entries.length})
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
