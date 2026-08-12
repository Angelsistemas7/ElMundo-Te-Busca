"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, Trash2, TriangleAlert, X } from "lucide-react";
import type { AidPoint, AidPointType, AidStockLevel } from "@/lib/types";
import { AID_POINT_TYPE_LABEL, AID_STOCK_LEVEL_LABEL } from "@/lib/types";
import { getCountry } from "@/lib/countries";
import {
  ownerDeleteAidPointAction,
  ownerSetAidAvailabilityAction,
  ownerUpdateAidPointAction,
  type ActionResult,
} from "@/app/actions";
import { Field, Input, Select, Textarea } from "./FormControls";
import { cn } from "@/lib/utils";

const TYPES = Object.keys(AID_POINT_TYPE_LABEL) as AidPointType[];

export function AidPointManagePanel({ point, token }: { point: AidPoint; token: string }) {
  const regions = getCountry(point.country).regions;
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<ActionResult | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [available, setAvailable] = useState(point.available);
  const [availPending, startAvailTransition] = useTransition();
  const [checkedTypes, setCheckedTypes] = useState<Set<AidPointType>>(new Set(point.types));

  function setAvail(next: boolean) {
    if (next === available || availPending) return;
    startAvailTransition(async () => {
      const res = await ownerSetAidAvailabilityAction(point.id, token, next);
      if (res.ok) {
        setAvailable(next);
        router.refresh();
      }
    });
  }

  async function save(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (saving) return;
    setSaving(true);
    setResult(null);
    const form = new FormData(e.currentTarget);
    form.set("aidPointId", point.id);
    form.set("token", token);
    const res = await ownerUpdateAidPointAction(form);
    setResult(res);
    if (res.ok) router.refresh();
    setSaving(false);
  }

  function remove() {
    setError(null);
    startTransition(async () => {
      const res = await ownerDeleteAidPointAction(point.id, token);
      if (res.ok) router.push("/ayuda");
      else setError(res.error ?? "No se pudo eliminar.");
    });
  }

  const fieldErrors = result && !result.ok ? result.fieldErrors : undefined;

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-zinc-200 bg-white p-5">
        <h2 className="font-bold text-zinc-900">Datos del punto</h2>
        <p className="mt-1 text-sm text-zinc-500">
          Edita la información del punto. La <strong>disponibilidad</strong> la marcas tú abajo; el
          voto de la comunidad es solo una señal orientativa.
        </p>

        <form onSubmit={save} className="mt-4 space-y-4">
          <Field label="Nombre del punto" htmlFor="name" required error={fieldErrors?.name}>
            <Input id="name" name="name" defaultValue={point.name} />
          </Field>

          <Field label="¿Qué recursos hay aquí?" required error={fieldErrors?.types} hint="Marca todos los que apliquen y di qué tan surtido está cada uno.">
            <div className="space-y-2">
              {TYPES.map((t) => (
                <div
                  key={t}
                  className="flex flex-wrap items-center gap-2 rounded-lg border border-zinc-300 px-3 py-2 has-[:checked]:border-brand-400 has-[:checked]:bg-brand-50"
                >
                  <label className="flex flex-1 cursor-pointer items-center gap-2 text-sm text-zinc-700">
                    <input
                      type="checkbox"
                      name="types"
                      value={t}
                      defaultChecked={point.types.includes(t)}
                      className="h-4 w-4 rounded"
                      onChange={(e) =>
                        setCheckedTypes((prev) => {
                          const next = new Set(prev);
                          if (e.target.checked) next.add(t);
                          else next.delete(t);
                          return next;
                        })
                      }
                    />
                    {AID_POINT_TYPE_LABEL[t]}
                  </label>
                  {checkedTypes.has(t) && (
                    <select
                      name={`status_${t}`}
                      defaultValue={point.categoryStatus?.[t] ?? ("cubierto" satisfies AidStockLevel)}
                      className="rounded-lg border border-zinc-300 px-2 py-1 text-xs text-zinc-700"
                    >
                      {(Object.keys(AID_STOCK_LEVEL_LABEL) as AidStockLevel[]).map((lvl) => (
                        <option key={lvl} value={lvl}>
                          {AID_STOCK_LEVEL_LABEL[lvl]}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              ))}
            </div>
          </Field>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Estado (región)" htmlFor="estado">
              <Select id="estado" name="estado" defaultValue={point.estado ?? ""}>
                <option value="">Seleccionar</option>
                {regions.map((e) => (
                  <option key={e} value={e}>
                    {e}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Ubicación exacta" htmlFor="locationText" required error={fieldErrors?.locationText}>
              <Input id="locationText" name="locationText" defaultValue={point.locationText} />
            </Field>
          </div>

          <Field label="Horario de atención" htmlFor="scheduleText">
            <Input id="scheduleText" name="scheduleText" defaultValue={point.scheduleText} />
          </Field>

          <Field label="¿Qué se ofrece / qué se necesita?" htmlFor="description">
            <Textarea id="description" name="description" defaultValue={point.description} />
          </Field>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Responsable / organización" htmlFor="contactName">
              <Input id="contactName" name="contactName" defaultValue={point.contactName ?? ""} />
            </Field>
            <Field
              label="Teléfono de contacto"
              htmlFor="contactPhone"
              required
              error={fieldErrors?.contactPhone}
              hint="Con el código de tu país si no es +58."
            >
              <Input id="contactPhone" name="contactPhone" defaultValue={point.contactPhone ?? ""} />
            </Field>
          </div>

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

      {/* Disponibilidad: la fija el dueño (o el admin) */}
      <section className="rounded-2xl border border-zinc-200 bg-white p-5">
        <h2 className="font-bold text-zinc-900">Disponibilidad</h2>
        <p className="mt-1 text-sm text-zinc-500">
          Marca si el punto tiene recursos ahora mismo. Es lo que ve la gente (Disponible / Agotado).
        </p>
        <div className="mt-3 flex items-center gap-2">
          <button
            type="button"
            onClick={() => setAvail(true)}
            disabled={availPending}
            className={cn(
              "press flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-sm font-semibold transition disabled:opacity-60",
              available
                ? "border-emerald-300 bg-emerald-50 text-emerald-700"
                : "border-zinc-200 text-zinc-600 hover:bg-zinc-50",
            )}
          >
            <Check className="h-4 w-4" /> Disponible
          </button>
          <button
            type="button"
            onClick={() => setAvail(false)}
            disabled={availPending}
            className={cn(
              "press flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-sm font-semibold transition disabled:opacity-60",
              !available
                ? "border-rose-300 bg-rose-50 text-rose-700"
                : "border-zinc-200 text-zinc-600 hover:bg-zinc-50",
            )}
          >
            <X className="h-4 w-4" /> Agotado
          </button>
          {availPending && <Loader2 className="h-4 w-4 animate-spin text-zinc-400" />}
        </div>
      </section>

      {/* Eliminar */}
      <section className="rounded-2xl border border-rose-200 bg-rose-50/50 p-5">
        <h2 className="flex items-center gap-2 font-bold text-rose-800">
          <TriangleAlert className="h-4.5 w-4.5" />
          Eliminar punto de ayuda
        </h2>
        <p className="mt-1 text-sm text-rose-700">
          Úsalo si fue un duplicado, un error o el punto ya cerró. Esta acción no se puede deshacer.
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
