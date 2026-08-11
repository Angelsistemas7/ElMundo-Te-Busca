"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, HandHeart, ImagePlus, Loader2 } from "lucide-react";
import { VOLUNTEER_TYPE_LABEL, type VolunteerType } from "@/lib/types";
import { getCountry } from "@/lib/countries";
import { registerVolunteerAction, type ActionResult } from "@/app/actions";
import { uploadPhoto } from "@/lib/upload";
import { compressImage } from "@/lib/image";
import { Modal } from "./Modal";
import { LocationPicker } from "./map/LocationPicker";
import { Field, Input, Select, Textarea } from "./FormControls";
import { Turnstile } from "./Turnstile";

const TYPES = Object.keys(VOLUNTEER_TYPE_LABEL) as VolunteerType[];

export function RegisterVolunteerButton({ country = "ve" }: { country?: string }) {
  const regions = getCountry(country).regions;
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<ActionResult | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const fileRef = useRef<File | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

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
      if (fileRef.current) {
        try {
          const compressed = await compressImage(fileRef.current);
          const url = await uploadPhoto(compressed);
          if (url) form.set("photoUrl", url);
        } catch {
          /* sigue sin foto */
        }
      }
      const res = await registerVolunteerAction(form);
      setResult(res);
      if (res.ok) router.refresh();
    } finally {
      setSubmitting(false);
    }
  }

  const fieldErrors = result && !result.ok ? result.fieldErrors : undefined;

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="press flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-700"
      >
        <HandHeart className="h-4 w-4" />
        Ofrecerme como voluntario
      </button>

      <Modal
        open={open}
        onClose={close}
        title="Ofrecerme como voluntario"
        subtitle="Indica qué puedes aportar, tu disponibilidad y tu ciudad."
      >
        {result?.ok ? (
          <div className="flex flex-col items-center py-8 text-center">
            <CheckCircle2 className="h-14 w-14 text-emerald-500" />
            <p className="mt-4 max-w-sm text-sm font-medium text-zinc-800">{result.message}</p>
            <button
              onClick={close}
              className="press mt-6 rounded-xl bg-zinc-900 px-5 py-2 text-sm font-medium text-white transition hover:bg-zinc-800"
            >
              Cerrar
            </button>
          </div>
        ) : (
          <form ref={formRef} onSubmit={onSubmit} className="space-y-5">
            <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-zinc-300 bg-zinc-50 py-6 transition hover:border-emerald-400 hover:bg-emerald-50">
              {preview ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={preview} alt="Vista previa" className="h-28 w-28 rounded-full object-cover" />
              ) : (
                <>
                  <ImagePlus className="h-7 w-7 text-zinc-400" />
                  <span className="text-sm font-medium text-zinc-700">Tu foto (opcional)</span>
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

            <Field label="¿Cómo puedes ayudar?" htmlFor="type" required>
              <Select id="type" name="type" defaultValue="medico">
                {TYPES.map((t) => (
                  <option key={t} value={t}>
                    {VOLUNTEER_TYPE_LABEL[t]}
                  </option>
                ))}
              </Select>
            </Field>

            <Field label="Tu nombre" htmlFor="name" required error={fieldErrors?.name}>
              <Input id="name" name="name" placeholder="Nombre y apellido" />
            </Field>

            <Field label="¿Qué puedes aportar?" htmlFor="skillsText" hint="Idiomas, oficio, experiencia...">
              <Textarea id="skillsText" name="skillsText" placeholder="Inglés y portugués; primeros auxilios; camioneta para insumos..." />
            </Field>

            <Field label="Disponibilidad" htmlFor="availabilityText">
              <Input id="availabilityText" name="availabilityText" placeholder="24/7, tardes y noches, fines de semana..." />
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
              <Field label="Ciudad / zona" htmlFor="locationText">
                <Input id="locationText" name="locationText" placeholder="Caracas, La Guaira, fuera del país..." />
              </Field>
            </div>

            <Field
              label="¿Estás en la zona? Marca tu ubicación (opcional)"
              hint="Si estás en el terreno, toca el mapa o usa tu GPS para que el equipo te ubique."
            >
              <LocationPicker />
            </Field>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field
                label="Teléfono (opcional)"
                htmlFor="contactPhone"
                error={fieldErrors?.contactPhone}
                hint="Con el código de tu país si no es +58."
              >
                <Input id="contactPhone" name="contactPhone" placeholder="+58 424 0000000" />
              </Field>
              <Field label="Correo (opcional)" htmlFor="contactEmail" error={fieldErrors?.contactEmail}>
                <Input id="contactEmail" name="contactEmail" type="email" placeholder="tucorreo@ejemplo.com" />
              </Field>
            </div>

            <input type="hidden" name="photoUrl" />
            <Turnstile />

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
                className="press flex items-center gap-2 rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-60"
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
