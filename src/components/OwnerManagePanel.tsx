"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, Pencil, Trash2, TriangleAlert } from "lucide-react";
import type { Person, PersonStatus } from "@/lib/types";
import { PERSON_STATUS_LABEL } from "@/lib/types";
import { getCountry } from "@/lib/countries";
import { cn, statusStyle } from "@/lib/utils";
import {
  ownerDeleteAction,
  ownerSetStatusAction,
  ownerUpdateAction,
  type ActionResult,
} from "@/app/actions";
import { Field, Input, Select, Textarea } from "./FormControls";

const STATUSES: PersonStatus[] = ["por_localizar", "localizado", "hospitalizado", "fallecido"];

export function OwnerManagePanel({ person, token }: { person: Person; token: string }) {
  const cc = getCountry(person.country);
  const regions = cc.regions;
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [status, setStatus] = useState<PersonStatus>(person.status);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<ActionResult | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function changeStatus(next: PersonStatus) {
    if (next === status) return;
    const prev = status;
    setStatus(next);
    setError(null);
    startTransition(async () => {
      const res = await ownerSetStatusAction(person.id, token, next);
      if (!res.ok) {
        setStatus(prev);
        setError(res.error ?? "No se pudo actualizar.");
      } else {
        router.refresh();
      }
    });
  }

  async function saveEdits(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (saving) return;
    setSaving(true);
    setResult(null);
    const form = new FormData(e.currentTarget);
    form.set("personId", person.id);
    form.set("token", token);
    // Para que la validación no exija nombre si la persona es "sin identificar".
    form.set("isUnidentified", person.isUnidentified ? "on" : "");
    const res = await ownerUpdateAction(form);
    setResult(res);
    if (res.ok) {
      router.refresh();
      setEditing(false);
    }
    setSaving(false);
  }

  function remove() {
    startTransition(async () => {
      const res = await ownerDeleteAction(person.id, token);
      if (res.ok) router.push("/");
      else setError(res.error ?? "No se pudo eliminar.");
    });
  }

  const fieldErrors = result && !result.ok ? result.fieldErrors : undefined;

  return (
    <div className="space-y-6">
      {/* Estado */}
      <section className="rounded-2xl border border-zinc-200 bg-white p-5">
        <h2 className="font-bold text-zinc-900">Estado de la persona</h2>
        <p className="mt-1 text-sm text-zinc-500">
          Como autor de la publicación, puedes cambiar el estado oficial directamente.
        </p>
        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {STATUSES.map((s) => {
            const st = statusStyle(s);
            const active = status === s;
            return (
              <button
                key={s}
                onClick={() => changeStatus(s)}
                disabled={pending}
                className={cn(
                  "press flex items-center justify-center gap-1.5 rounded-xl border px-3 py-2.5 text-sm font-semibold transition disabled:opacity-60",
                  active ? `${st.bg} ${st.text} border-transparent ring-2 ring-offset-1 ring-current` : "border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50",
                )}
              >
                <span className={cn("h-2 w-2 rounded-full", st.dot)} />
                {PERSON_STATUS_LABEL[s]}
              </button>
            );
          })}
        </div>
        {pending && <p className="mt-2 text-xs text-zinc-400">Guardando…</p>}
      </section>

      {/* Editar datos */}
      <section className="rounded-2xl border border-zinc-200 bg-white p-5">
        <div className="flex items-center justify-between">
          <h2 className="font-bold text-zinc-900">Datos de la publicación</h2>
          {!editing && (
            <button
              onClick={() => setEditing(true)}
              className="press flex items-center gap-1.5 rounded-lg border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-600 hover:bg-zinc-50"
            >
              <Pencil className="h-3.5 w-3.5" />
              Editar / corregir
            </button>
          )}
        </div>

        {editing && (
          <form onSubmit={saveEdits} className="mt-4 space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Nombre" htmlFor="firstName" required error={fieldErrors?.firstName}>
                <Input id="firstName" name="firstName" defaultValue={person.firstName} />
              </Field>
              <Field label="Apellido" htmlFor="lastName">
                <Input id="lastName" name="lastName" defaultValue={person.lastName} />
              </Field>
              <Field label="Edad" htmlFor="age" error={fieldErrors?.age}>
                <Input id="age" name="age" type="number" min={0} max={120} defaultValue={person.age ?? ""} />
              </Field>
              <Field label="Género" htmlFor="gender">
                <Select id="gender" name="gender" defaultValue={person.gender ?? ""}>
                  <option value="">Seleccionar</option>
                  <option value="masculino">Masculino</option>
                  <option value="femenino">Femenino</option>
                  <option value="otro">Otro</option>
                </Select>
              </Field>
              <Field label="Estado (región)" htmlFor="estado">
                <Select id="estado" name="estado" defaultValue={person.estado ?? ""}>
                  <option value="">Seleccionar</option>
                  {regions.map((e) => (
                    <option key={e} value={e}>
                      {e}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Ubicación / sector" htmlFor="locationText">
                <Input id="locationText" name="locationText" defaultValue={person.locationText} />
              </Field>
              <Field label="¿Por qué se publicó?" htmlFor="cause">
                <Select id="cause" name="cause" defaultValue={person.cause}>
                  <option value="desastre">Relacionado con el terremoto</option>
                  <option value="otra">Otro motivo</option>
                </Select>
              </Field>
            </div>
            <Field label="Descripción" htmlFor="description">
              <Textarea id="description" name="description" defaultValue={person.description} />
            </Field>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Nombre de contacto" htmlFor="contactName">
                <Input id="contactName" name="contactName" defaultValue={person.contactName ?? ""} />
              </Field>
              <Field
                label="Teléfono"
                htmlFor="contactPhone"
                error={fieldErrors?.contactPhone}
                hint={`Con el código de tu país si no es ${cc.callingCode}.`}
              >
                <Input id="contactPhone" name="contactPhone" defaultValue={person.contactPhone ?? ""} />
              </Field>
              <Field label="Correo" htmlFor="contactEmail" error={fieldErrors?.contactEmail}>
                <Input id="contactEmail" name="contactEmail" type="email" defaultValue={person.contactEmail ?? ""} />
              </Field>
            </div>

            {result && !result.ok && (
              <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700">{result.error}</p>
            )}

            <div className="flex justify-end gap-3">
              <button type="button" onClick={() => setEditing(false)} className="press rounded-xl border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50">
                Cancelar
              </button>
              <button type="submit" disabled={saving} className="press flex items-center gap-2 rounded-xl bg-zinc-900 px-5 py-2 text-sm font-semibold text-white hover:bg-zinc-800 disabled:opacity-60">
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                Guardar cambios
              </button>
            </div>
          </form>
        )}
      </section>

      {/* Eliminar */}
      <section className="rounded-2xl border border-rose-200 bg-rose-50/50 p-5">
        <h2 className="flex items-center gap-2 font-bold text-rose-800">
          <TriangleAlert className="h-4.5 w-4.5" />
          Eliminar publicación
        </h2>
        <p className="mt-1 text-sm text-rose-700">
          Úsalo solo si fue un duplicado o un error. Esta acción no se puede deshacer.
        </p>
        {!confirmDelete ? (
          <button
            onClick={() => setConfirmDelete(true)}
            className="press mt-3 flex items-center gap-1.5 rounded-lg border border-rose-300 px-3 py-2 text-sm font-medium text-rose-700 hover:bg-rose-100"
          >
            <Trash2 className="h-4 w-4" />
            Eliminar
          </button>
        ) : (
          <div className="mt-3 flex items-center gap-3">
            <span className="text-sm font-medium text-rose-800">¿Seguro?</span>
            <button onClick={remove} disabled={pending} className="press rounded-lg bg-rose-600 px-3 py-2 text-sm font-semibold text-white hover:bg-rose-700 disabled:opacity-60">
              Sí, eliminar
            </button>
            <button onClick={() => setConfirmDelete(false)} className="press rounded-lg border border-zinc-300 px-3 py-2 text-sm font-medium text-zinc-600 hover:bg-white">
              Cancelar
            </button>
          </div>
        )}
      </section>

      {error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700">{error}</p>}
    </div>
  );
}
