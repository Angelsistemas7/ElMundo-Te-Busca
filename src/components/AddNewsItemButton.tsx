"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ImagePlus, Loader2, Plus } from "lucide-react";
import type { NewsKind } from "@/lib/types";
import { NEWS_KIND_LABEL } from "@/lib/types";
import { COUNTRIES, COUNTRY_CODES } from "@/lib/countries";
import { createNewsItemAction } from "@/app/admin/actions";
import { uploadPhoto } from "@/lib/upload";
import { compressImage } from "@/lib/image";
import { Modal } from "./Modal";
import { Field, Input, Select, Textarea } from "./FormControls";

// Solo para el equipo (admin): agrega una noticia curada con su fuente. Aparece
// en la pestaña que corresponda con "me gusta" y comentarios.
export function AddNewsItemButton({ kind }: { kind: NewsKind }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string> | undefined>();
  const [preview, setPreview] = useState<string | null>(null);
  const fileRef = useRef<File | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  function close() {
    setOpen(false);
    setTimeout(() => {
      setError(null);
      setFieldErrors(undefined);
      setPreview(null);
      fileRef.current = null;
      formRef.current?.reset();
    }, 200);
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    setFieldErrors(undefined);
    try {
      const form = new FormData(e.currentTarget);
      form.set("kind", kind);
      if (fileRef.current) {
        try {
          const url = await uploadPhoto(await compressImage(fileRef.current));
          if (url) form.set("photoUrl", url);
        } catch {
          setError("No se pudo subir la foto. Intenta de nuevo.");
          return;
        }
      }
      const res = await createNewsItemAction(form);
      if (res.ok) {
        router.refresh();
        close();
      } else {
        setError(res.error ?? "No se pudo guardar.");
        setFieldErrors(res.fieldErrors);
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 rounded-xl bg-zinc-900 px-3.5 py-2 text-sm font-semibold text-white hover:bg-zinc-800"
      >
        <Plus className="h-4 w-4" />
        Agregar {NEWS_KIND_LABEL[kind].toLowerCase()}
      </button>

      <Modal open={open} onClose={close} title={`Agregar ${NEWS_KIND_LABEL[kind].toLowerCase()}`} subtitle="Solo el equipo. Cita siempre la fuente real; no inventes datos.">
        <form ref={formRef} onSubmit={onSubmit} className="space-y-5">
          <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-zinc-300 bg-zinc-50 py-5 hover:border-zinc-400">
            {preview ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={preview} alt="Vista previa" className="h-24 w-full max-w-xs rounded-lg object-cover" />
            ) : (
              <>
                <ImagePlus className="h-6 w-6 text-zinc-400" />
                <span className="text-sm font-medium text-zinc-700">Imagen (opcional)</span>
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

          <Field label="País" htmlFor="country" required>
            <Select id="country" name="country" defaultValue="ve">
              {COUNTRY_CODES.map((c) => (
                <option key={c} value={c}>
                  {COUNTRIES[c].name}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Titular" htmlFor="title" required error={fieldErrors?.title}>
            <Input id="title" name="title" placeholder="Ej. Suiza envía equipo de rescate a Venezuela" />
          </Field>

          <Field label="Resumen" htmlFor="body" required error={fieldErrors?.body}>
            <Textarea id="body" name="body" placeholder="Qué ocurrió, en una o dos frases." />
          </Field>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Fuente (medio/organización)" htmlFor="sourceName">
              <Input id="sourceName" name="sourceName" placeholder="Reuters, OCHA..." />
            </Field>
            <Field label="Enlace de la fuente" htmlFor="sourceUrl" error={fieldErrors?.sourceUrl}>
              <Input id="sourceUrl" name="sourceUrl" placeholder="https://..." />
            </Field>
          </div>

          {error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700">{error}</p>}

          <div className="flex justify-end gap-3">
            <button type="button" onClick={close} className="rounded-xl border border-zinc-300 px-4 py-2.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50">
              Cancelar
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="press flex items-center gap-2 rounded-xl bg-zinc-900 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-zinc-800 disabled:opacity-60"
            >
              {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
              Guardar
            </button>
          </div>
        </form>
      </Modal>
    </>
  );
}
