"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, ImagePlus, Loader2, Plus } from "lucide-react";
import { AID_POINT_TYPE_LABEL, type AidPointType } from "@/lib/types";
import { getCountry } from "@/lib/countries";
import { registerAidPointAction, type ActionResult } from "@/app/actions";
import { uploadPhoto } from "@/lib/upload";
import { compressImage } from "@/lib/image";
import { Modal } from "./Modal";
import { Field, Input, Select, Textarea } from "./FormControls";
import { Turnstile, type TurnstileHandle } from "./Turnstile";
import { ManageLinkBox } from "./ManageLinkBox";
import { LocationPicker } from "./map/LocationPicker";

export function RegisterAidPointButton({ country = "ve" }: { country?: string } = {}) {
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
      setTitle(String(form.get("name") ?? "").trim() || "Punto de ayuda");
      if (fileRef.current) {
        try {
          const compressed = await compressImage(fileRef.current);
          const url = await uploadPhoto(compressed);
          if (url) form.set("photoUrl", url);
        } catch {
          /* continúa sin foto */
        }
      }
      const res = await registerAidPointAction(form);
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
        className="press flex items-center gap-2 rounded-xl bg-brand-400 px-4 py-2.5 text-sm font-semibold text-zinc-900 transition hover:bg-brand-300"
      >
        <Plus className="h-4 w-4" />
        Registrar punto
      </button>

      <Modal
        open={open}
        onClose={close}
        title="Registrar punto de ayuda"
        subtitle="Comida, agua, refugio, medicinas o alojamiento (tu casa abre sus puertas). Se publicará como 'por verificar'."
      >
        {result?.ok ? (
          <div className="flex flex-col items-center py-8 text-center">
            <CheckCircle2 className="h-14 w-14 text-emerald-500" />
            <p className="mt-4 max-w-sm text-sm font-medium text-zinc-800">{result.message}</p>
            {result.id && result.ownerToken && (
              <ManageLinkBox
                id={result.id}
                token={result.ownerToken}
                entityType="aid_point"
                title={title}
                basePath="/ayuda"
                note="Con este enlace —y solo con él— podrás editar este punto (recursos, horario, ubicación) o eliminarlo."
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
                  <span className="text-sm font-medium text-zinc-700">Foto del punto (recomendado)</span>
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

            <Field label="Nombre del punto" htmlFor="name" required error={fieldErrors?.name}>
              <Input id="name" name="name" placeholder="Donatón de comida — Plaza Macuto" />
            </Field>

            <Field label="¿Qué recursos hay aquí?" required error={fieldErrors?.types} hint="Marca todos los que apliquen.">
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {(Object.keys(AID_POINT_TYPE_LABEL) as AidPointType[]).map((t) => (
                  <label
                    key={t}
                    className="flex cursor-pointer items-center gap-2 rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-700 transition hover:bg-zinc-50 has-[:checked]:border-brand-400 has-[:checked]:bg-brand-50"
                  >
                    <input type="checkbox" name="types" value={t} defaultChecked={t === "comida"} className="h-4 w-4 rounded" />
                    {AID_POINT_TYPE_LABEL[t]}
                  </label>
                ))}
              </div>
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

            <Field label="Ubicación exacta" htmlFor="locationText" required error={fieldErrors?.locationText}>
              <Input id="locationText" name="locationText" placeholder="Plaza de Macuto, frente a la iglesia" />
            </Field>

            <Field label="Señala el lugar en el mapa" hint="Toca el mapa o usa tu GPS para que quede en el punto exacto y no aproximado.">
              <LocationPicker defaultCenter={getCountry(country).epicenter} />
            </Field>

            <Field label="Horario de atención" htmlFor="scheduleText">
              <Input id="scheduleText" name="scheduleText" placeholder="Lun a Dom, 8:00 a. m. – 6:00 p. m." />
            </Field>

            <Field label="¿Qué se ofrece / qué se necesita?" htmlFor="description">
              <Textarea id="description" name="description" placeholder="Comida caliente, mercados secos; se reciben donaciones de..." />
            </Field>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Responsable / organización" htmlFor="contactName">
                <Input id="contactName" name="contactName" placeholder="Comité vecinal, ONG..." />
              </Field>
              <Field
                label="Teléfono de contacto"
                htmlFor="contactPhone"
                required
                error={fieldErrors?.contactPhone}
                hint="Con el código de tu país si no es +58."
              >
                <Input id="contactPhone" name="contactPhone" placeholder="+58 424 0000000" />
              </Field>
            </div>

            <input type="hidden" name="photoUrl" />
            <Turnstile ref={turnstileRef} />

            {result && !result.ok && (
              <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700">
                {result.error}
              </p>
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
                Publicar punto
              </button>
            </div>
          </form>
        )}
      </Modal>
    </>
  );
}
