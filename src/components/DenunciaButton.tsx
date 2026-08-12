"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, CheckCircle2, ImagePlus, Loader2, LogIn, Megaphone, ShieldAlert } from "lucide-react";
import { COMPLAINT_CATEGORY_LABEL, type ComplaintCategory } from "@/lib/types";
import { getCountry } from "@/lib/countries";
import { getEmergency } from "@/lib/emergency";
import { createComplaintAction, getSessionUserAction, type ActionResult } from "@/app/actions";
import { uploadPhoto } from "@/lib/upload";
import { compressImage } from "@/lib/image";
import { Modal } from "./Modal";
import { Field, Input, Select, Textarea } from "./FormControls";

const CATEGORIES = Object.keys(COMPLAINT_CATEGORY_LABEL) as ComplaintCategory[];

export function DenunciaButton({ country = "ve" }: { country?: string }) {
  const regions = getCountry(country).regions;
  const { nationalLine } = getEmergency(country);
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loggedIn, setLoggedIn] = useState<boolean | null>(null);
  const [step, setStep] = useState<"notice" | "form" | "confirm">("notice");
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<ActionResult | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const fileRef = useRef<File | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (!open) return;
    getSessionUserAction()
      .then((u) => setLoggedIn(!!u))
      .catch(() => setLoggedIn(false));
  }, [open]);

  function close() {
    setOpen(false);
    setTimeout(() => {
      setStep("notice");
      setResult(null);
      setPreview(null);
      fileRef.current = null;
      formRef.current?.reset();
    }, 200);
  }

  // Validación mínima en cliente antes de pedir confirmación.
  function goConfirm() {
    const form = formRef.current;
    if (!form) return;
    const body = String(new FormData(form).get("body") ?? "").trim();
    if (body.length < 10) {
      setResult({ ok: false, error: "Describe la irregularidad (mín. 10 caracteres)." });
      return;
    }
    setResult(null);
    setStep("confirm");
  }

  async function publish() {
    const form = formRef.current;
    if (!form || submitting) return;
    setSubmitting(true);
    setResult(null);
    try {
      const data = new FormData(form);
      if (fileRef.current) {
        try {
          const compressed = await compressImage(fileRef.current);
          const url = await uploadPhoto(compressed);
          if (url) data.set("photoUrl", url);
        } catch {
          /* sigue sin foto */
        }
      }
      const res = await createComplaintAction(data);
      setResult(res);
      if (res.ok) {
        router.refresh();
      } else {
        setStep("form"); // vuelve al formulario a corregir
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
        className="press flex items-center gap-2 rounded-xl bg-rose-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-rose-700"
      >
        <Megaphone className="h-4 w-4" />
        Denunciar una irregularidad
      </button>

      <Modal
        open={open}
        onClose={close}
        title="Denunciar una irregularidad"
        subtitle="Desvío o robo de ayuda, riesgo a la niñez, fraude, abuso de autoridad."
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
        ) : step === "notice" ? (
          <div className="space-y-4 py-2">
            <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
              <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" />
              <div>
                <p className="font-bold">Antes de publicar, por favor:</p>
                <ul className="mt-1 list-disc space-y-0.5 pl-4">
                  <li>Denuncia solo irregularidades <strong>reales y verificables</strong>.</li>
                  <li>Aporta datos concretos: qué pasó, dónde y cuándo. Agrega foto y ubicación si puedes.</li>
                  <li>
                    <strong>No señales a una persona con nombre o foto si no tienes pruebas</strong>: una
                    acusación falsa puede dañar a un inocente y traerte problemas legales.
                  </li>
                  <li>Publicar requiere <strong>iniciar sesión</strong> (no es anónimo ante el sistema).</li>
                  <li>
                    Si hay un menor en riesgo o un delito en curso, <strong>llama también al {nationalLine.number}</strong>.
                  </li>
                </ul>
              </div>
            </div>
            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={close}
                className="press rounded-xl border border-zinc-300 px-4 py-2.5 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => setStep("form")}
                className="press flex items-center gap-2 rounded-xl bg-rose-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-rose-700"
              >
                OK, entendido
              </button>
            </div>
          </div>
        ) : loggedIn === false ? (
          <div className="flex flex-col items-center py-8 text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-zinc-100 text-zinc-600">
              <LogIn className="h-6 w-6" />
            </span>
            <p className="mt-4 max-w-sm text-sm font-medium text-zinc-800">
              Para denunciar necesitas <strong>iniciar sesión</strong>.
            </p>
            <p className="mt-1 max-w-sm text-sm text-zinc-500">
              Las denuncias no son anónimas ante el sistema: así evitamos abusos y acusaciones falsas.
              Abre el menú de tu cuenta (arriba a la derecha) para entrar o crear una cuenta.
            </p>
            <button
              onClick={close}
              className="press mt-6 rounded-xl border border-zinc-300 px-5 py-2 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50"
            >
              Entendido
            </button>
          </div>
        ) : step === "confirm" ? (
          <div className="space-y-4 py-2">
            <div className="flex items-start gap-3 rounded-xl border border-amber-300 bg-amber-50 p-4">
              <ShieldAlert className="mt-0.5 h-6 w-6 shrink-0 text-amber-700" />
              <div className="text-sm text-amber-900">
                <p className="font-bold">Antes de publicar, confirma:</p>
                <ul className="mt-1 list-disc space-y-1 pl-4">
                  <li>La información es <strong>veraz</strong> y la puedes sustentar.</li>
                  <li>
                    Acusar a alguien en falso puede tener <strong>consecuencias legales</strong> para ti
                    y dañar a una persona inocente.
                  </li>
                  <li>
                    Si hay un menor en riesgo o un delito en curso, <strong>llama también al {nationalLine.number}</strong>.
                  </li>
                </ul>
              </div>
            </div>
            {result && !result.ok && (
              <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700">{result.error}</p>
            )}
            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setStep("form")}
                className="press rounded-xl border border-zinc-300 px-4 py-2.5 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50"
              >
                Volver
              </button>
              <button
                type="button"
                onClick={publish}
                disabled={submitting}
                className="press flex items-center gap-2 rounded-xl bg-rose-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-rose-700 disabled:opacity-60"
              >
                {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
                Sí, publico bajo mi responsabilidad
              </button>
            </div>
          </div>
        ) : (
          <form ref={formRef} onSubmit={(e) => e.preventDefault()} className="space-y-5">
            <div className="flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-800">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <p>
                Usa este espacio solo para <strong>irregularidades reales</strong> y verificables.
                Aporta qué pasó, dónde y cuándo. <strong>No señales a una persona con nombre o foto si
                no tienes pruebas.</strong> Publicar exige tu sesión iniciada.
              </p>
            </div>

            <Field label="Tipo de irregularidad" htmlFor="category" required>
              <Select id="category" name="category" defaultValue="desvio_ayuda">
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {COMPLAINT_CATEGORY_LABEL[c]}
                  </option>
                ))}
              </Select>
            </Field>

            <Field label="¿Qué ocurrió?" htmlFor="body" required error={fieldErrors?.body}>
              <Textarea
                id="body"
                name="body"
                rows={5}
                placeholder="Describe la irregularidad con datos concretos: qué pasó, dónde y cuándo."
              />
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
              <Field label="Ubicación (sector, referencia)" htmlFor="locationText">
                <Input id="locationText" name="locationText" placeholder="Sector, edificio, referencia" />
              </Field>
            </div>

            <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-zinc-300 bg-zinc-50 py-5 transition hover:border-rose-300 hover:bg-rose-50">
              {preview ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={preview} alt="Vista previa" className="h-24 w-full max-w-xs rounded-lg object-cover" />
              ) : (
                <>
                  <ImagePlus className="h-6 w-6 text-zinc-400" />
                  <span className="text-sm font-medium text-zinc-700">Foto de evidencia (opcional)</span>
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

            <input type="hidden" name="photoUrl" />

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
                type="button"
                onClick={goConfirm}
                className="press flex items-center gap-2 rounded-xl bg-rose-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-rose-700"
              >
                Continuar
              </button>
            </div>
          </form>
        )}
      </Modal>
    </>
  );
}
