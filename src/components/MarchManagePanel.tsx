"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, Trash2, TriangleAlert } from "lucide-react";
import type { March } from "@/lib/types";
import {
  getAidPointOptionsAction,
  ownerDeleteMarchAction,
  ownerUpdateMarchAction,
  type ActionResult,
} from "@/app/actions";
import { getCountry } from "@/lib/countries";
import { Field, Input, Select, Textarea } from "./FormControls";

/** ISO → valor para <input type="datetime-local"> en hora local. */
function toLocalInput(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function MarchManagePanel({ march, token }: { march: March; token: string }) {
  const router = useRouter();
  const cc = getCountry(march.country);
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<ActionResult | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [aidPointOptions, setAidPointOptions] = useState<{ id: string; label: string }[]>([]);

  useEffect(() => {
    getAidPointOptionsAction()
      .then(setAidPointOptions)
      .catch(() => setAidPointOptions([]));
  }, []);

  async function save(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (saving) return;
    setSaving(true);
    setResult(null);
    const form = new FormData(e.currentTarget);
    form.set("marchId", march.id);
    form.set("token", token);
    const res = await ownerUpdateMarchAction(form);
    setResult(res);
    if (res.ok) router.refresh();
    setSaving(false);
  }

  function remove() {
    setError(null);
    startTransition(async () => {
      const res = await ownerDeleteMarchAction(march.id, token);
      if (res.ok) router.push("/caravanas");
      else setError(res.error ?? "No se pudo eliminar.");
    });
  }

  const fieldErrors = result && !result.ok ? result.fieldErrors : undefined;

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-zinc-200 bg-white p-5">
        <h2 className="font-bold text-zinc-900">Datos de la caravana</h2>
        <p className="mt-1 text-sm text-zinc-500">
          Corrige la información de la convocatoria, por ejemplo la hora de salida.
        </p>

        <form onSubmit={save} className="mt-4 space-y-4">
          <Field label="Título" htmlFor="title" required error={fieldErrors?.title}>
            <Input id="title" name="title" defaultValue={march.title} />
          </Field>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Punto de salida" htmlFor="originText" required error={fieldErrors?.originText}>
              <Input id="originText" name="originText" defaultValue={march.originText} />
            </Field>
            <Field label="Destino" htmlFor="destinationText" required error={fieldErrors?.destinationText}>
              <Input id="destinationText" name="destinationText" defaultValue={march.destinationText} />
            </Field>
          </div>

          <Field label="Fecha y hora de salida" htmlFor="departAt" required error={fieldErrors?.departAt}>
            <Input id="departAt" name="departAt" type="datetime-local" defaultValue={toLocalInput(march.departAt)} />
          </Field>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Organiza" htmlFor="organizerName" required error={fieldErrors?.organizerName}>
              <Input id="organizerName" name="organizerName" defaultValue={march.organizerName} />
            </Field>
            <Field
              label="Teléfono de contacto"
              htmlFor="organizerPhone"
              required
              error={fieldErrors?.organizerPhone}
              hint={`Con el código de tu país si no es ${cc.callingCode}.`}
            >
              <Input id="organizerPhone" name="organizerPhone" defaultValue={march.organizerPhone} />
            </Field>
          </div>

          <Field
            label="Enlace de grupo de WhatsApp (opcional)"
            htmlFor="whatsappUrl"
            error={fieldErrors?.whatsappUrl}
          >
            <Input id="whatsappUrl" name="whatsappUrl" defaultValue={march.whatsappUrl ?? ""} placeholder="https://chat.whatsapp.com/..." />
          </Field>

          <Field label="Detalles" htmlFor="description">
            <Textarea id="description" name="description" defaultValue={march.description} />
          </Field>

          <Field
            label="Vincular a un punto de ayuda (opcional)"
            htmlFor="aidPointId"
            hint="Si esta caravana responde a un punto concreto, se verá reflejado en su ficha."
          >
            <Select id="aidPointId" name="aidPointId" defaultValue={march.aidPointId ?? ""}>
              <option value="">Ninguno</option>
              {aidPointOptions.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.label}
                </option>
              ))}
            </Select>
          </Field>

          {result && !result.ok && (
            <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700">{result.error}</p>
          )}
          {result?.ok && (
            <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-700">{result.message}</p>
          )}

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={saving}
              className="press flex items-center gap-2 rounded-xl bg-zinc-900 px-5 py-2 text-sm font-semibold text-white transition hover:bg-zinc-800 disabled:opacity-60"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              Guardar cambios
            </button>
          </div>
        </form>
      </section>

      {/* Eliminar */}
      <section className="rounded-2xl border border-rose-200 bg-rose-50/50 p-5">
        <h2 className="flex items-center gap-2 font-bold text-rose-800">
          <TriangleAlert className="h-4.5 w-4.5" />
          Eliminar caravana
        </h2>
        <p className="mt-1 text-sm text-rose-700">
          Úsalo si se canceló o fue un duplicado. Esta acción no se puede deshacer.
        </p>
        {!confirmDelete ? (
          <button
            onClick={() => setConfirmDelete(true)}
            className="press mt-3 flex items-center gap-1.5 rounded-lg border border-rose-300 px-3 py-2 text-sm font-medium text-rose-700 transition hover:bg-rose-100"
          >
            <Trash2 className="h-4 w-4" />
            Eliminar
          </button>
        ) : (
          <div className="mt-3 flex items-center gap-3">
            <span className="text-sm font-medium text-rose-800">¿Seguro?</span>
            <button onClick={remove} disabled={pending} className="press rounded-lg bg-rose-600 px-3 py-2 text-sm font-semibold text-white transition hover:bg-rose-700 disabled:opacity-60">
              Sí, eliminar
            </button>
            <button onClick={() => setConfirmDelete(false)} className="press rounded-lg border border-zinc-300 px-3 py-2 text-sm font-medium text-zinc-600 transition hover:bg-white">
              Cancelar
            </button>
          </div>
        )}
      </section>

      {error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700">{error}</p>}
    </div>
  );
}
