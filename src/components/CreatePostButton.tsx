"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, ImagePlus, Loader2, PenLine } from "lucide-react";
import { POST_TYPE_EMOJI, POST_TYPE_LABEL, type PostType } from "@/lib/types";
import { getCountry } from "@/lib/countries";
import { createPostAction, getMyProfileAction, type ActionResult } from "@/app/actions";
import { uploadPhoto } from "@/lib/upload";
import { compressImage } from "@/lib/image";
import { Avatar } from "./Avatar";
import { Modal } from "./Modal";
import { Field, Input, Select, Textarea } from "./FormControls";
import { Turnstile, type TurnstileHandle } from "./Turnstile";
import { ManageLinkBox } from "./ManageLinkBox";

const TYPES = Object.keys(POST_TYPE_LABEL) as PostType[];

export function CreatePostButton({
  variant = "button",
  initialType,
  country = "ve",
}: {
  variant?: "button" | "bar";
  initialType?: PostType;
  country?: string;
}) {
  const regions = getCountry(country).regions;
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<ActionResult | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const fileRef = useRef<File | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const turnstileRef = useRef<TurnstileHandle>(null);

  // Solo hace falta para la barra compositora (muestra tu foto, como en
  // Facebook); el botón simple no la necesita.
  useEffect(() => {
    if (variant !== "bar") return;
    getMyProfileAction()
      .then((p) => setAvatarUrl(p?.avatarUrl ?? null))
      .catch(() => {});
  }, [variant]);

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
      const body = String(form.get("body") ?? "");
      const t = String(form.get("type") ?? "info") as PostType;
      setTitle(`${POST_TYPE_LABEL[t]}: ${body.slice(0, 40)}${body.length > 40 ? "…" : ""}`);
      if (fileRef.current) {
        try {
          const url = await uploadPhoto(await compressImage(fileRef.current));
          if (url) form.set("photoUrl", url);
        } catch {
          /* sin foto */
        }
      }
      const res = await createPostAction(form);
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
      {variant === "bar" ? (
        <button
          onClick={() => setOpen(true)}
          className="press flex w-full items-center gap-3 rounded-full border border-zinc-200 bg-white px-4 py-3 text-left shadow-sm transition hover:bg-zinc-50"
        >
          <Avatar src={avatarUrl} size="md" />
          <span className="flex-1 text-sm text-zinc-500">¿Sabes algo que pueda ayudar? Comparte información, pide o da ayuda...</span>
          <PenLine className="h-4 w-4 shrink-0 text-zinc-400" />
        </button>
      ) : (
        <button
          onClick={() => setOpen(true)}
          className="press flex items-center gap-2 rounded-xl bg-brand-400 px-5 py-3 text-base font-bold text-zinc-900 shadow-sm transition hover:bg-brand-300"
        >
          <PenLine className="h-5 w-5" />
          Publicar
        </button>
      )}

      <Modal
        open={open}
        onClose={close}
        title="Publicar en la comunidad"
        subtitle="Pide o ofrece ayuda, reporta una emergencia, convoca una caravana, comparte información."
      >
        {result?.ok ? (
          <div className="flex flex-col items-center py-8 text-center">
            <CheckCircle2 className="h-14 w-14 text-emerald-500" />
            <p className="mt-4 text-sm font-medium text-zinc-800">{result.message}</p>
            {result.id && result.ownerToken && (
              <ManageLinkBox
                id={result.id}
                token={result.ownerToken}
                entityType="post"
                title={title}
                basePath="/comunidad"
                note="Con este enlace —y solo con él— podrás editar esta publicación o eliminarla."
              />
            )}
            <button onClick={close} className="press mt-6 rounded-xl bg-zinc-900 px-5 py-2 text-sm font-medium text-white transition hover:bg-zinc-800">
              Cerrar
            </button>
          </div>
        ) : (
          <form ref={formRef} onSubmit={onSubmit} className="space-y-5">
            <Field label="Tipo de publicación" htmlFor="type" required>
              <Select id="type" name="type" defaultValue={initialType ?? "necesito"}>
                {TYPES.map((t) => (
                  <option key={t} value={t}>
                    {POST_TYPE_EMOJI[t]} {POST_TYPE_LABEL[t]}
                  </option>
                ))}
              </Select>
            </Field>

            <Field label="Mensaje" htmlFor="body" required error={fieldErrors?.body}>
              <Textarea
                id="body"
                name="body"
                rows={4}
                placeholder="Cuenta qué necesitas, qué ofreces o qué está pasando. Sé claro con la ubicación."
              />
            </Field>

            <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-zinc-300 bg-zinc-50 py-5 transition hover:border-brand-400 hover:bg-brand-50">
              {preview ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={preview} alt="Vista previa" className="h-28 w-full max-w-xs rounded-lg object-cover" />
              ) : (
                <>
                  <ImagePlus className="h-6 w-6 text-zinc-400" />
                  <span className="text-sm font-medium text-zinc-700">Añadir foto (opcional)</span>
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

            <Field
              label="Enlace a video o red social (opcional)"
              htmlFor="linkUrl"
              error={fieldErrors?.linkUrl}
              hint="Pega un enlace de X (Twitter) y se mostrará la publicación incrustada."
            >
              <Input id="linkUrl" name="linkUrl" placeholder="https://x.com/usuario/status/..." />
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
              <Field label="Ubicación / sector" htmlFor="locationText">
                <Input id="locationText" name="locationText" placeholder="El Junquito, km 11..." />
              </Field>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Tu nombre" htmlFor="authorName" required error={fieldErrors?.authorName}>
                <Input id="authorName" name="authorName" placeholder="Nombre o colectivo" />
              </Field>
              <Field
                label="Teléfono (opcional)"
                htmlFor="contactPhone"
                error={fieldErrors?.contactPhone}
                hint="Con el código de tu país si no es +58."
              >
                <Input id="contactPhone" name="contactPhone" placeholder="+58 412 0000000" />
              </Field>
            </div>

            <input type="hidden" name="photoUrl" />
            <Turnstile ref={turnstileRef} />

            {result && !result.ok && (
              <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700">{result.error}</p>
            )}

            <div className="flex justify-end gap-3">
              <button type="button" onClick={close} className="press rounded-xl border border-zinc-300 px-4 py-2.5 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50">
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
