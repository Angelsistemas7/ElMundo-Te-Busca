"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, ImagePlus, Loader2, Plus } from "lucide-react";
import { HOSPITAL_STATUS_LABEL, type HospitalStatus } from "@/lib/types";
import { getCountry } from "@/lib/countries";
import { registerHospitalAction, type ActionResult } from "@/app/actions";
import { uploadPhoto } from "@/lib/upload";
import { compressImage } from "@/lib/image";
import { Modal } from "./Modal";
import { Field, Input, Select, Textarea } from "./FormControls";
import { Turnstile, type TurnstileHandle } from "./Turnstile";
import { LocationPicker } from "./map/LocationPicker";

const STATUSES = Object.keys(HOSPITAL_STATUS_LABEL) as HospitalStatus[];

export function RegisterHospitalButton({ country = "ve" }: { country?: string } = {}) {
  const regions = getCountry(country).regions;
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<ActionResult | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
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
      if (fileRef.current) {
        try {
          const compressed = await compressImage(fileRef.current);
          const url = await uploadPhoto(compressed);
          if (url) form.set("photoUrl", url);
        } catch {
          setResult({
            ok: false,
            code: "internal",
            error: "No se pudo subir la foto. Intenta de nuevo.",
          });
          return;
        }
      }
      const res = await registerHospitalAction(form);
      setResult(res);
      if (res.ok) {
        router.refresh();
        close();
      } else {
        turnstileRef.current?.reset();
      }
    } finally {
      setSubmitting(false);
    }
  }

  const fieldErrors = result && !result.ok ? result.fieldErrors : undefined;

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        aria-label="Registrar hospital"
        className="press fixed left-1/2 z-30 flex h-14 w-14 -translate-x-1/2 items-center justify-center rounded-full bg-brand-400 text-zinc-900 shadow-lg transition hover:bg-brand-300 sm:hidden"
        style={{ bottom: "calc(4.5rem + env(safe-area-inset-bottom))" }}
      >
        <Plus className="h-6 w-6" />
      </button>
      <button
        onClick={() => setOpen(true)}
        className="press hidden items-center gap-2 rounded-xl bg-brand-400 px-4 py-2.5 text-sm font-semibold text-zinc-900 transition hover:bg-brand-300 sm:flex"
      >
        <Plus className="h-4 w-4" />
        Registrar hospital
      </button>

      <Modal
        open={open}
        onClose={close}
        title="Registrar centro de salud"
        subtitle="Reporta capacidad, especialidades e insumos para coordinar traslados."
      >
        {result?.ok ? (
          <div className="flex flex-col items-center py-8 text-center">
            <CheckCircle2 className="h-14 w-14 text-emerald-500" />
            <p className="mt-4 text-sm font-medium text-zinc-800">{result.message}</p>
            <button onClick={close} className="mt-6 rounded-xl bg-zinc-900 px-5 py-2 text-sm font-medium text-white hover:bg-zinc-800">
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
                  <span className="text-sm font-medium text-zinc-700">Foto del hospital (opcional)</span>
                  <span className="text-xs text-zinc-400">Ayuda a verificar que es real</span>
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

            <Field label="Nombre del hospital / centro" htmlFor="name" required error={fieldErrors?.name}>
              <Input id="name" name="name" placeholder={`Hospital de ${getCountry(country).exampleCity}`} />
            </Field>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Estado de capacidad" htmlFor="status" required>
                <Select id="status" name="status" defaultValue="operativo">
                  {STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {HOSPITAL_STATUS_LABEL[s]}
                    </option>
                  ))}
                </Select>
              </Field>
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
            </div>

            <Field label="Ubicación / sector" htmlFor="locationText">
              <Input id="locationText" name="locationText" placeholder={getCountry(country).exampleCity} />
            </Field>

            <Field label="Señala el hospital en el mapa" hint="Toca el mapa o usa tu GPS para ubicarlo exacto.">
              <LocationPicker defaultCenter={getCountry(country).epicenter} />
            </Field>

            <Field
              label="Especialidades disponibles"
              htmlFor="specialties"
              hint="Sepáralas con comas. Ej: Trauma, Medicina interna, Cirugía"
            >
              <Input id="specialties" name="specialties" placeholder="Trauma, Cirugía, Pediatría" />
            </Field>

            <Field label="¿Qué necesitan / qué pueden atender?" htmlFor="needsText">
              <Textarea id="needsText" name="needsText" placeholder="Insumos requeridos, si pueden recibir remisiones, donantes de sangre..." />
            </Field>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Contacto / coordinación" htmlFor="contactName">
                <Input id="contactName" name="contactName" placeholder="Coordinación médica" />
              </Field>
              <Field
                label="Teléfono"
                htmlFor="contactPhone"
                error={fieldErrors?.contactPhone}
                hint={`Con el código de tu país si no es ${getCountry(country).callingCode}.`}
              >
                <Input id="contactPhone" name="contactPhone" placeholder={getCountry(country).examplePhone} />
              </Field>
            </div>

            <input type="hidden" name="photoUrl" />
            <Turnstile ref={turnstileRef} />

            {result && !result.ok && (
              <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700">{result.error}</p>
            )}

            <div className="flex justify-end gap-3">
              <button type="button" onClick={close} className="rounded-xl border border-zinc-300 px-4 py-2.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50">
                Cancelar
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="flex items-center gap-2 rounded-xl bg-brand-400 px-5 py-2.5 text-sm font-semibold text-zinc-900 hover:bg-brand-300 disabled:opacity-60"
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
