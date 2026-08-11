"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, Trash2, TriangleAlert } from "lucide-react";
import type { Pet, PetSpecies, PetStatus } from "@/lib/types";
import { PET_SPECIES_LABEL, PET_STATUS_LABEL } from "@/lib/types";
import { getCountry } from "@/lib/countries";
import {
  ownerDeletePetAction,
  ownerSetPetStatusAction,
  ownerUpdatePetAction,
  type ActionResult,
} from "@/app/actions";
import { Field, Input, Select, Textarea } from "./FormControls";
import { cn } from "@/lib/utils";

const STATUSES = Object.keys(PET_STATUS_LABEL) as PetStatus[];
const SPECIES = Object.keys(PET_SPECIES_LABEL) as PetSpecies[];

export function PetManagePanel({ pet, token }: { pet: Pet; token: string }) {
  const regions = getCountry(pet.country ?? "ve").regions;
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<ActionResult | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState(pet.status);
  const [statusPending, startStatusTransition] = useTransition();

  function setPetStatus(next: PetStatus) {
    if (next === status || statusPending) return;
    startStatusTransition(async () => {
      const res = await ownerSetPetStatusAction(pet.id, token, next);
      if (res.ok) {
        setStatus(next);
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
    form.set("petId", pet.id);
    form.set("token", token);
    form.set("status", status);
    const res = await ownerUpdatePetAction(form);
    setResult(res);
    if (res.ok) router.refresh();
    setSaving(false);
  }

  function remove() {
    setError(null);
    startTransition(async () => {
      const res = await ownerDeletePetAction(pet.id, token);
      if (res.ok) router.push("/mascotas");
      else setError(res.error ?? "No se pudo eliminar.");
    });
  }

  const fieldErrors = result && !result.ok ? result.fieldErrors : undefined;

  return (
    <div className="space-y-6">
      {/* Estado: lo fija el dueño (o el admin) */}
      <section className="rounded-2xl border border-zinc-200 bg-white p-5">
        <h2 className="font-bold text-zinc-900">Estado del reporte</h2>
        <p className="mt-1 text-sm text-zinc-500">
          Marca "Encontrada" en cuanto reúnas a la mascota con su familia, para que deje de aparecer
          como perdida.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {STATUSES.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setPetStatus(s)}
              disabled={statusPending}
              className={cn(
                "press rounded-full border px-3.5 py-1.5 text-sm font-semibold transition disabled:opacity-60",
                status === s
                  ? "border-brand-400 bg-brand-50 text-brand-700"
                  : "border-zinc-200 text-zinc-600 hover:bg-zinc-50",
              )}
            >
              {PET_STATUS_LABEL[s]}
            </button>
          ))}
          {statusPending && <Loader2 className="h-4 w-4 animate-spin text-zinc-400" />}
        </div>
      </section>

      <section className="rounded-2xl border border-zinc-200 bg-white p-5">
        <h2 className="font-bold text-zinc-900">Datos de la mascota</h2>
        <p className="mt-1 text-sm text-zinc-500">Corrige o completa la información del reporte.</p>

        <form onSubmit={save} className="mt-4 space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Especie" htmlFor="species" required>
              <Select id="species" name="species" defaultValue={pet.species}>
                {SPECIES.map((s) => (
                  <option key={s} value={s}>
                    {PET_SPECIES_LABEL[s]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Nombre (si lo sabes)" htmlFor="name">
              <Input id="name" name="name" defaultValue={pet.name} placeholder="Luna, Kai..." />
            </Field>
          </div>

          <Field label="Descripción (color, raza, señas)" htmlFor="description" required error={fieldErrors?.description}>
            <Textarea id="description" name="description" defaultValue={pet.description} />
          </Field>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Estado (región)" htmlFor="estado">
              <Select id="estado" name="estado" defaultValue={pet.estado ?? ""}>
                <option value="">Seleccionar</option>
                {regions.map((e) => (
                  <option key={e} value={e}>
                    {e}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Zona / referencia" htmlFor="locationText">
              <Input id="locationText" name="locationText" defaultValue={pet.locationText} />
            </Field>
          </div>

          <Field
            label="Teléfono de contacto"
            htmlFor="contactPhone"
            error={fieldErrors?.contactPhone}
            hint="Con el código de tu país si no es +58."
          >
            <Input id="contactPhone" name="contactPhone" defaultValue={pet.contactPhone ?? ""} />
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
          Eliminar reporte
        </h2>
        <p className="mt-1 text-sm text-rose-700">
          Úsalo si fue un duplicado o un error. Esta acción no se puede deshacer.
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
