"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, X } from "lucide-react";
import { getSessionUserAction, voteAidAvailabilityAction } from "@/app/actions";
import { cn } from "@/lib/utils";

// Señal comunitaria (NO vinculante) sobre la disponibilidad de un punto de ayuda.
// Requiere sesión y ya NO cambia el estado oficial: la disponibilidad la marca el
// autor del punto o el admin. Aquí solo se acumulan opiniones para orientar.
export function AidConsensusVote({
  id,
  votesAvailable,
  votesDepleted,
}: {
  id: string;
  votesAvailable: number;
  votesDepleted: number;
}) {
  const router = useRouter();
  const [va, setVa] = useState(votesAvailable);
  const [vd, setVd] = useState(votesDepleted);
  const [voted, setVoted] = useState<"available" | "depleted" | null>(null);
  const [loggedIn, setLoggedIn] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const v = localStorage.getItem(`vtb_aidvote_${id}`);
    if (v === "available" || v === "depleted") setVoted(v);
  }, [id]);

  useEffect(() => {
    getSessionUserAction()
      .then((u) => setLoggedIn(!!u))
      .catch(() => setLoggedIn(false));
  }, []);

  async function vote(kind: "available" | "depleted") {
    if (voted || loggedIn !== true) return;
    setError(null);
    setVoted(kind);
    if (kind === "available") setVa((n) => n + 1);
    else setVd((n) => n + 1);
    localStorage.setItem(`vtb_aidvote_${id}`, kind);
    const res = await voteAidAvailabilityAction(id, kind);
    if (!res.ok) {
      // Revierte el optimismo si el servidor lo rechazó (p. ej. sin sesión).
      setVoted(null);
      if (kind === "available") setVa((n) => Math.max(0, n - 1));
      else setVd((n) => Math.max(0, n - 1));
      localStorage.removeItem(`vtb_aidvote_${id}`);
      setError(res.error ?? "No se pudo guardar. Intenta de nuevo.");
    }
    router.refresh();
  }

  const canVote = loggedIn === true && !voted;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-xs text-zinc-400">¿Sigue disponible?</span>
      <button
        onClick={() => vote("available")}
        disabled={!canVote}
        className={cn(
          "press flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium transition disabled:cursor-default",
          voted === "available"
            ? "border-emerald-300 bg-emerald-50 text-emerald-700"
            : "border-zinc-200 text-zinc-600 enabled:hover:bg-emerald-50 enabled:hover:text-emerald-700 disabled:opacity-70",
        )}
      >
        <Check className="h-3.5 w-3.5" /> Sí hay <span className="tabular-nums">{va}</span>
      </button>
      <button
        onClick={() => vote("depleted")}
        disabled={!canVote}
        className={cn(
          "press flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium transition disabled:cursor-default",
          voted === "depleted"
            ? "border-rose-300 bg-rose-50 text-rose-700"
            : "border-zinc-200 text-zinc-600 enabled:hover:bg-rose-50 enabled:hover:text-rose-700 disabled:opacity-70",
        )}
      >
        <X className="h-3.5 w-3.5" /> Se acabó <span className="tabular-nums">{vd}</span>
      </button>
      {loggedIn === false && <span className="text-xs text-zinc-400">· inicia sesión para opinar</span>}
      {error && <span className="text-xs font-medium text-rose-600">{error}</span>}
    </div>
  );
}
