"use client";

import { useEffect, useState } from "react";
import { Bookmark, FileText, HeartHandshake, MessageCircle, Sparkles, ThumbsUp } from "lucide-react";
import type { VolunteerStats } from "@/lib/data";
import { VolunteerProfileShareButton } from "./VolunteerProfileShareButton";

// Prefijo de las marcas que ya guarda RecognizeDeck en localStorage (una por
// persona vista en "¿La reconoces?", para no repetirlas al recargar). Se
// reutiliza aquí tal cual, solo para CONTAR cuántas hay — no se toca ni se
// borra nada. Vive por dispositivo, no por cuenta: se etiqueta como tal.
const RECOGNIZE_PREFIX = "vtb_recognize_";

function tierFor(total: number): { label: string; message: string } {
  if (total === 0) {
    return {
      label: "Recién llegado",
      message: "Publica, comenta o reacciona a algo para dar tu primer paso como voluntario digital.",
    };
  }
  if (total < 5) {
    return {
      label: "Primeros pasos",
      message: "Ya diste tu primer paso. Cada publicación y comentario ayuda a que más gente vea lo que importa.",
    };
  }
  if (total < 20) {
    return {
      label: "Voluntario digital activo",
      message: "Tu actividad ya está marcando diferencia. Sigue así.",
    };
  }
  if (total < 50) {
    return {
      label: "Voluntario digital comprometido",
      message: "Tu constancia es justo lo que esta comunidad necesita. Gracias.",
    };
  }
  return {
    label: "Voluntario digital ejemplar",
    message: "Tu aporte es enorme — eres parte esencial de esta red.",
  };
}

export function DigitalVolunteerCard({ username, stats }: { username: string; stats: VolunteerStats }) {
  const [recognized, setRecognized] = useState(0);

  useEffect(() => {
    let n = 0;
    for (let i = 0; i < localStorage.length; i++) {
      if (localStorage.key(i)?.startsWith(RECOGNIZE_PREFIX)) n++;
    }
    setRecognized(n);
  }, []);

  const total =
    stats.publications + stats.commentsMade + stats.reactionsReceived + stats.commentsReceived + stats.savedByOthers;
  const tier = tierFor(total);

  const items = [
    { icon: FileText, label: "Publicaciones", value: stats.publications },
    { icon: MessageCircle, label: "Comentarios que hiciste", value: stats.commentsMade },
    { icon: ThumbsUp, label: "Reacciones recibidas", value: stats.reactionsReceived },
    { icon: MessageCircle, label: "Comentarios recibidos", value: stats.commentsReceived },
    { icon: Bookmark, label: "Guardado por otros", value: stats.savedByOthers },
    { icon: Bookmark, label: "Guardaste tú", value: stats.savedByMe },
  ];

  return (
    <section className="mt-6 overflow-hidden rounded-3xl border border-success-200 bg-gradient-to-br from-success-50 to-white">
      <div className="flex items-center gap-2.5 border-b border-emerald-100 px-5 py-4">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-600 text-white">
          <HeartHandshake className="h-4.5 w-4.5" />
        </span>
        <div>
          <h2 className="font-bold text-zinc-900">Tu perfil de voluntario digital</h2>
          <p className="text-xs font-semibold text-emerald-700">{tier.label}</p>
        </div>
      </div>

      <div className="px-5 py-4">
        <p className="text-sm text-zinc-600">{tier.message}</p>

        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
          {items.map((it) => (
            <div key={it.label} className="rounded-xl border border-zinc-200 bg-white p-3 text-center">
              <it.icon className="mx-auto h-4 w-4 text-emerald-600" />
              <p className="mt-1 text-lg font-bold text-zinc-900">{it.value}</p>
              <p className="text-[11px] leading-tight text-zinc-500">{it.label}</p>
            </div>
          ))}
          <div className="col-span-2 rounded-xl border border-zinc-200 bg-white p-3 text-center sm:col-span-3">
            <Sparkles className="mx-auto h-4 w-4 text-emerald-600" />
            <p className="mt-1 text-lg font-bold text-zinc-900">{recognized}</p>
            <p className="text-[11px] leading-tight text-zinc-500">
              Personas revisadas en &quot;¿La reconoces?&quot; (este dispositivo)
            </p>
          </div>
        </div>

        <div className="mt-4">
          <VolunteerProfileShareButton username={username} />
        </div>
      </div>
    </section>
  );
}
