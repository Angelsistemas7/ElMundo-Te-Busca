"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Loader2 } from "lucide-react";
import type { ManagedEntity } from "@/lib/types";
import { createManagerRequestAction, type ActionResult } from "@/app/actions";
import { Field, Select, Textarea } from "./FormControls";

type Option = { id: string; name: string; location: string };

export function ManagerRequestForm({
  aidPoints,
  hospitals,
  loggedIn,
}: {
  aidPoints: Option[];
  hospitals: Option[];
  loggedIn: boolean;
}) {
  const router = useRouter();
  const [entityType, setEntityType] = useState<ManagedEntity>("hospital");
  const [entityId, setEntityId] = useState("");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<ActionResult | null>(null);

  const options = useMemo(() => (entityType === "hospital" ? hospitals : aidPoints), [entityType, aidPoints, hospitals]);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (submitting || !loggedIn) return;
    setSubmitting(true);
    setResult(null);
    const form = new FormData();
    form.set("entityType", entityType);
    form.set("entityId", entityId);
    form.set("message", message);
    const res = await createManagerRequestAction(form);
    setSubmitting(false);
    setResult(res);
    if (res.ok) {
      setEntityId("");
      setMessage("");
      router.refresh();
    }
  }

  if (!loggedIn) {
    return (
      <div className="rounded-2xl border border-dashed border-zinc-300 bg-white p-6 text-center text-sm text-zinc-600">
        Necesitas una cuenta para solicitar el rol de gestor — así el admin sabe a quién le está
        dando acceso. Inicia sesión desde el ícono de cuenta arriba y vuelve a esta página.
      </div>
    );
  }

  if (result?.ok) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 p-6 text-center">
        <CheckCircle2 className="h-8 w-8 text-emerald-600" />
        <p className="font-semibold text-emerald-800">Solicitud enviada</p>
        <p className="text-sm text-emerald-700">{result.message}</p>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4 rounded-2xl border border-zinc-200 bg-white p-5">
      <Field label="¿Qué quieres gestionar?" required>
        <div className="flex gap-2">
          {(["hospital", "aid_point"] as ManagedEntity[]).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => {
                setEntityType(t);
                setEntityId("");
              }}
              className={`press flex-1 rounded-xl border px-3 py-2 text-sm font-semibold transition ${
                entityType === t
                  ? "border-brand-400 bg-brand-50 text-brand-700"
                  : "border-zinc-300 text-zinc-600 hover:bg-zinc-50"
              }`}
            >
              {t === "hospital" ? "Un hospital" : "Un punto de ayuda"}
            </button>
          ))}
        </div>
      </Field>

      <Field label={entityType === "hospital" ? "Hospital" : "Punto de ayuda"} htmlFor="entityId" required>
        <Select id="entityId" required value={entityId} onChange={(e) => setEntityId(e.target.value)}>
          <option value="">Selecciona…</option>
          {options.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name}
              {o.location ? ` — ${o.location}` : ""}
            </option>
          ))}
        </Select>
        {options.length === 0 && (
          <p className="mt-1 text-xs text-zinc-400">
            No hay {entityType === "hospital" ? "hospitales" : "puntos de ayuda"} registrados en tu país todavía.
          </p>
        )}
      </Field>

      <Field
        label="¿Qué información puedes aportar?"
        htmlFor="message"
        required
        hint="Ej: trabajo en la recepción y puedo confirmar insumos y capacidad a diario."
      >
        <Textarea
          id="message"
          required
          minLength={10}
          maxLength={800}
          rows={4}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
        />
      </Field>

      {result && !result.ok && <p className="text-sm font-medium text-danger-600">{result.error}</p>}

      <button
        type="submit"
        disabled={submitting || !entityId}
        className="press flex w-full items-center justify-center gap-2 rounded-xl bg-brand-500 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-600 disabled:opacity-50"
      >
        {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
        Enviar solicitud
      </button>
    </form>
  );
}
