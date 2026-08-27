"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { PackageCheck, PackageX } from "lucide-react";
import { getSessionUserAction, voteHospitalSuppliesAction } from "@/app/actions";
import { cn } from "@/lib/utils";

// Señal comunitaria (NO vinculante) sobre si el hospital tiene insumos. Requiere
// sesión; el estado oficial lo actualiza el personal (o el admin).
export function HospitalSuppliesVote({
  id,
  votesSupplies,
  votesNoSupplies,
  showBadge = true,
}: {
  id: string;
  votesSupplies: number;
  votesNoSupplies: number;
  showBadge?: boolean;
}) {
  const router = useRouter();
  const [vs, setVs] = useState(votesSupplies);
  const [vn, setVn] = useState(votesNoSupplies);
  const [voted, setVoted] = useState<"yes" | "no" | null>(null);
  const [loggedIn, setLoggedIn] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const v = localStorage.getItem(`vtb_hospvote_${id}`);
    if (v === "yes" || v === "no") setVoted(v);
  }, [id]);

  useEffect(() => {
    getSessionUserAction()
      .then((u) => setLoggedIn(!!u))
      .catch(() => setLoggedIn(false));
  }, []);

  async function vote(kind: "yes" | "no") {
    if (voted || loggedIn !== true) return;
    setError(null);
    setVoted(kind);
    if (kind === "yes") setVs((n) => n + 1);
    else setVn((n) => n + 1);
    localStorage.setItem(`vtb_hospvote_${id}`, kind);
    const res = await voteHospitalSuppliesAction(id, kind);
    if (!res.ok) {
      setVoted(null);
      if (kind === "yes") setVs((n) => Math.max(0, n - 1));
      else setVn((n) => Math.max(0, n - 1));
      localStorage.removeItem(`vtb_hospvote_${id}`);
      setError(res.error ?? "No se pudo guardar. Intenta de nuevo.");
    }
    router.refresh();
  }

  const hasVotes = vs + vn > 0;
  const ok = vs >= vn;
  const canVote = loggedIn === true && !voted;

  return (
    <div className="space-y-2">
      {showBadge && hasVotes && (
        <span
          className={cn(
            "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold",
            ok ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700",
          )}
        >
          {ok ? <PackageCheck className="h-3.5 w-3.5" /> : <PackageX className="h-3.5 w-3.5" />}
          {ok ? "Con insumos (comunidad)" : "Faltan insumos (comunidad)"}
        </span>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-zinc-400">¿Tiene insumos?</span>
        <button
          onClick={() => vote("yes")}
          disabled={!canVote}
          className={cn(
            "press flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium transition disabled:cursor-default",
            voted === "yes"
              ? "border-emerald-300 bg-emerald-50 text-emerald-700"
              : "border-zinc-200 text-zinc-600 enabled:hover:bg-emerald-50 enabled:hover:text-emerald-700 disabled:opacity-70",
          )}
        >
          Sí <span className="tabular-nums">{vs}</span>
        </button>
        <button
          onClick={() => vote("no")}
          disabled={!canVote}
          className={cn(
            "press flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium transition disabled:cursor-default",
            voted === "no"
              ? "border-rose-300 bg-rose-50 text-rose-700"
              : "border-zinc-200 text-zinc-600 enabled:hover:bg-rose-50 enabled:hover:text-rose-700 disabled:opacity-70",
          )}
        >
          No <span className="tabular-nums">{vn}</span>
        </button>
        {loggedIn === false && <span className="text-xs text-zinc-400">· inicia sesión para opinar</span>}
        {error && <span className="text-xs font-medium text-rose-600">{error}</span>}
      </div>
    </div>
  );
}
