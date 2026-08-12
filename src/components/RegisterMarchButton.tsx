"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Loader2, Plus } from "lucide-react";
import { getAidPointOptionsAction, registerMarchAction, type ActionResult } from "@/app/actions";
import { Modal } from "./Modal";
import { Field, Input, Select, Textarea } from "./FormControls";
import { Turnstile, type TurnstileHandle } from "./Turnstile";
import { ManageLinkBox } from "./ManageLinkBox";

export function RegisterMarchButton() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<ActionResult | null>(null);
  const [title, setTitle] = useState("");
  const [aidPointOptions, setAidPointOptions] = useState<{ id: string; label: string }[]>([]);
  const formRef = useRef<HTMLFormElement>(null);
  const turnstileRef = useRef<TurnstileHandle>(null);

  useEffect(() => {
    if (!open) return;
    getAidPointOptionsAction()
      .then(setAidPointOptions)
      .catch(() => setAidPointOptions([]));
  }, [open]);

  function close() {
    setOpen(false);
    setTimeout(() => {
      setResult(null);
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
      setTitle(String(form.get("title") ?? "").trim() || "Caravana");
      const res = await registerMarchAction(form);
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
        Convocar caravana
      </button>

      <Modal
        open={open}
        onClose={close}
        title="Convocar caravana benéfica"
        subtitle="Coordina una ida en grupo a la zona afectada: punto de salida, hora y destino."
      >
        {result?.ok ? (
          <div className="flex flex-col items-center py-8 text-center">
            <CheckCircle2 className="h-14 w-14 text-emerald-500" />
            <p className="mt-4 max-w-sm text-sm font-medium text-zinc-800">{result.message}</p>
            {result.id && result.ownerToken && (
              <ManageLinkBox
                id={result.id}
                token={result.ownerToken}
                entityType="march"
                title={title}
                basePath="/caravanas"
                note="Con este enlace —y solo con él— podrás editar esta caravana (p. ej. cambiar la hora de salida) o eliminarla."
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
            <Field label="Título" htmlFor="title" required error={fieldErrors?.title}>
              <Input id="title" name="title" placeholder="Caravana de ayuda Caracas → La Guaira" />
            </Field>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Punto de salida" htmlFor="originText" required error={fieldErrors?.originText}>
                <Input id="originText" name="originText" placeholder="Plaza Venezuela, Caracas" />
              </Field>
              <Field label="Destino" htmlFor="destinationText" required error={fieldErrors?.destinationText}>
                <Input id="destinationText" name="destinationText" placeholder="Macuto, La Guaira" />
              </Field>
            </div>

            <Field label="Fecha y hora de salida" htmlFor="departAt" required error={fieldErrors?.departAt}>
              <Input id="departAt" name="departAt" type="datetime-local" />
            </Field>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Organiza" htmlFor="organizerName" required error={fieldErrors?.organizerName}>
                <Input id="organizerName" name="organizerName" placeholder="Nombre o colectivo" />
              </Field>
              <Field
                label="Teléfono de contacto"
                htmlFor="organizerPhone"
                required
                error={fieldErrors?.organizerPhone}
                hint="Con el código de tu país si no es +58."
              >
                <Input id="organizerPhone" name="organizerPhone" placeholder="+58 414 0000000" />
              </Field>
            </div>

            <Field
              label="Enlace de grupo de WhatsApp (opcional)"
              htmlFor="whatsappUrl"
              hint="Para que la gente se coordine. Pega el enlace de invitación al grupo."
              error={fieldErrors?.whatsappUrl}
            >
              <Input id="whatsappUrl" name="whatsappUrl" placeholder="https://chat.whatsapp.com/..." />
            </Field>

            <Field label="Detalles" htmlFor="description" hint="Qué llevar, punto de encuentro, recomendaciones.">
              <Textarea id="description" name="description" placeholder="Llevar agua y alimentos no perecederos. Encuentro 6:30 a. m..." />
            </Field>

            {aidPointOptions.length > 0 && (
              <Field
                label="Vincular a un punto de ayuda (opcional)"
                htmlFor="aidPointId"
                hint="Si esta caravana lleva ayuda hacia un punto concreto, se verá reflejado en su ficha."
              >
                <Select id="aidPointId" name="aidPointId" defaultValue="">
                  <option value="">Ninguno</option>
                  {aidPointOptions.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.label}
                    </option>
                  ))}
                </Select>
              </Field>
            )}

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
                Publicar convocatoria
              </button>
            </div>
          </form>
        )}
      </Modal>
    </>
  );
}
