"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, ImagePlus, Loader2, PawPrint } from "lucide-react";
import {
  PET_SPECIES_LABEL,
  PET_STATUS_LABEL,
  type PetSpecies,
  type PetStatus,
} from "@/lib/types";
import { getCountry } from "@/lib/countries";
import { registerPetAction, type ActionResult } from "@/app/actions";
import { uploadPhoto } from "@/lib/upload";
import { compressImage } from "@/lib/image";
import { Modal } from "./Modal";
import { Field, Input, Select, Textarea } from "./FormControls";
import { Turnstile, type TurnstileHandle } from "./Turnstile";
import { ManageLinkBox } from "./ManageLinkBox";

const STATUSES = Object.keys(PET_STATUS_LABEL) as PetStatus[];
const SPECIES = Object.keys(PET_SPECIES_LABEL) as PetSpecies[];

export function RegisterPetButton({ country = "ve" }: { country?: string } = {}) {
  const regions = getCountry(country).regions;
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<ActionResult | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const fileRef = useRef<File | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const turnstileRef = useRef<TurnstileHandle>(null);

  function close() {
    setOpen(false);
    setTimeout(() => {
      setResult(null);
      setPreview(null);
      fileRef.current = null;
      formRef.current?.reset();
    }, 200);
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setResult(null);
    try {
      const form = new FormData(e.currentTarget);
      setTitle(String(form.get("name") ?? "").trim() || "Mascota");
      if (fileRef.current) {
        try {
          const compressed = await compressImage(fileRef.current);
          const url = await uploadPhoto(compressed);
          if (url) form.set("photoUrl", url);
        } catch {
          /* sigue sin foto */
        }
      }
      const res = await registerPetAction(form);
      setResult(res);
      if (res.ok) router.refresh();
      else turnstileRef.current?.reset();
    } finally {
      setSubmitting(false);
    }
  }

  const fieldErrors = result && !result.ok ? result.fieldErrors : undefined;

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        aria-label="Reportar mascota"
        className="press fixed left-1/2 z-30 flex h-14 w-14 -translate-x-1/2 items-center justify-center rounded-full bg-brand-400 text-zinc-900 shadow-lg transition hover:bg-brand-300 sm:hidden"
        style={{ bottom: "calc(4.5rem + env(safe-area-inset-bottom))" }}
      >
        <PawPrint className="h-6 w-6" />
      </button>
      <button
        onClick={() => setOpen(true)}
        className="press hidden items-center gap-2 rounded-xl bg-brand-400 px-4 py-2.5 text-sm font-semibold text-zinc-900 transition hover:bg-brand-300 sm:flex"
      >
        <PawPrint className="h-4 w-4" />
        Reportar mascota
      </button>

      <Modal
        open={open}
        onClose={close}
        title="Reportar mascota"
        subtitle="Perdida, encontrada, en refugio o en veterinario. Sube una foto para reconocerla."
      >
        {result?.ok ? (
          <div className="flex flex-col items-center py-8 text-center">
            <CheckCircle2 className="h-14 w-14 text-emerald-500" />
            <p className="mt-4 max-w-sm text-sm font-medium text-zinc-800">{result.message}</p>
            {result.id && result.ownerToken && (
              <ManageLinkBox
                id={result.id}
                token={result.ownerToken}
                entityType="pet"
                title={title}
                basePath="/mascotas"
                note="Con este enlace —y solo con él— podrás marcar a la mascota como encontrada, editar sus datos o eliminar el reporte."
              />
            )}
            <button
              onClick={close}
              className="press mt-6 rounded-xl bg-zinc-900 px-5 py-2 text-sm font-medium text-white transition hover:bg-zinc-800"
            >
              Cerrar
            </button>
          </div>
        ) : (
          <form ref={formRef} onSubmit={onSubmit} className="space-y-5">
            <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-zinc-300 bg-zinc-50 py-6 transition hover:border-brand-400 hover:bg-brand-50">
              {preview ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={preview} alt="Vista previa" className="h-28 w-full max-w-xs rounded-lg object-cover" />
              ) : (
                <>
                  <ImagePlus className="h-7 w-7 text-zinc-400" />
                  <span className="text-sm font-medium text-zinc-700">Foto de la mascota (recomendado)</span>
                </>
              )}
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  fileRef.current = file;
                  setPreview(URL.createObjectURL(file));
                }}
              />
            </label>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Estado del reporte" htmlFor="status" required>
                <Select id="status" name="status" defaultValue="perdida">
                  {STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {PET_STATUS_LABEL[s]}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Especie" htmlFor="species" required>
                <Select id="species" name="species" defaultValue="perro">
                  {SPECIES.map((s) => (
                    <option key={s} value={s}>
                      {PET_SPECIES_LABEL[s]}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>

            <Field label="Nombre (si lo sabes)" htmlFor="name">
              <Input id="name" name="name" placeholder="Luna, Kai..." />
            </Field>

            <Field label="Descripción (color, raza, señas)" htmlFor="description" required error={fieldErrors?.description}>
              <Textarea id="description" name="description" placeholder="Gata siamés de ojos azules, lleva collar rosado..." />
            </Field>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Estado (región)" htmlFor="estado">
                <Select id="estado" name="estado" defaultValue="">
                  <option value="">Seleccionar</option>
                  {regions.map((e) => (
                    <option key={e} value={e}>
                      {e}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Zona / referencia" htmlFor="locationText">
                <Input id="locationText" name="locationText" placeholder="Playa Grande, edificio..." />
              </Field>
            </div>

            <Field
              label="Teléfono de contacto"
              htmlFor="contactPhone"
              error={fieldErrors?.contactPhone}
              hint={`Con el código de tu país si no es ${getCountry(country).callingCode}.`}
            >
              <Input id="contactPhone" name="contactPhone" placeholder={getCountry(country).examplePhone} />
            </Field>

            <input type="hidden" name="photoUrl" />
            <Turnstile ref={turnstileRef} />

            {result && !result.ok && (
              <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700">{result.error}</p>
            )}

            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={close}
                className="press rounded-xl border border-zinc-300 px-4 py-2.5 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="press flex items-center gap-2 rounded-xl bg-brand-400 px-5 py-2.5 text-sm font-semibold text-zinc-900 transition hover:bg-brand-300 disabled:opacity-60"
              >
                {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
                Publicar
              </button>
            </div>
          </form>
        )}
      </Modal>
    </>
  );
}
