"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, Trash2, TriangleAlert } from "lucide-react";
import type { Post, PostType } from "@/lib/types";
import { POST_TYPE_EMOJI, POST_TYPE_LABEL } from "@/lib/types";
import { getCountry } from "@/lib/countries";
import {
  ownerDeletePostAction,
  ownerUpdatePostAction,
  type ActionResult,
} from "@/app/actions";
import { Field, Input, Select, Textarea } from "./FormControls";

const TYPES = Object.keys(POST_TYPE_LABEL) as PostType[];

export function PostManagePanel({ post, token }: { post: Post; token: string }) {
  const cc = getCountry(post.country);
  const regions = cc.regions;
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<ActionResult | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  async function save(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (saving) return;
    setSaving(true);
    setResult(null);
    const form = new FormData(e.currentTarget);
    form.set("postId", post.id);
    form.set("token", token);
    const res = await ownerUpdatePostAction(form);
    setResult(res);
    if (res.ok) router.refresh();
    setSaving(false);
  }

  function remove() {
    setError(null);
    startTransition(async () => {
      const res = await ownerDeletePostAction(post.id, token);
      if (res.ok) router.push("/comunidad");
      else setError(res.error ?? "No se pudo eliminar.");
    });
  }

  const fieldErrors = result && !result.ok ? result.fieldErrors : undefined;

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-zinc-200 bg-white p-5">
        <h2 className="font-bold text-zinc-900">Datos de la publicación</h2>
        <p className="mt-1 text-sm text-zinc-500">
          Corrige tu publicación de la comunidad. Las reacciones y los comentarios se mantienen.
        </p>

        <form onSubmit={save} className="mt-4 space-y-4">
          <Field label="Tipo de publicación" htmlFor="type" required>
            <Select id="type" name="type" defaultValue={post.type}>
              {TYPES.map((t) => (
                <option key={t} value={t}>
                  {POST_TYPE_EMOJI[t]} {POST_TYPE_LABEL[t]}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Mensaje" htmlFor="body" required error={fieldErrors?.body}>
            <Textarea id="body" name="body" rows={4} defaultValue={post.body} />
          </Field>

          <Field label="Enlace a video o red social (opcional)" htmlFor="linkUrl" error={fieldErrors?.linkUrl}>
            <Input id="linkUrl" name="linkUrl" defaultValue={post.linkUrl ?? ""} placeholder="https://..." />
          </Field>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Estado (región)" htmlFor="estado">
              <Select id="estado" name="estado" defaultValue={post.estado ?? ""}>
                <option value="">Seleccionar</option>
                {regions.map((e) => (
                  <option key={e} value={e}>
                    {e}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Ubicación / sector" htmlFor="locationText">
              <Input id="locationText" name="locationText" defaultValue={post.locationText} />
            </Field>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Tu nombre" htmlFor="authorName" required error={fieldErrors?.authorName}>
              <Input id="authorName" name="authorName" defaultValue={post.authorName} />
            </Field>
            <Field
              label="Teléfono (opcional)"
              htmlFor="contactPhone"
              error={fieldErrors?.contactPhone}
              hint={`Con el código de tu país si no es ${cc.callingCode}.`}
            >
              <Input id="contactPhone" name="contactPhone" defaultValue={post.contactPhone ?? ""} />
            </Field>
          </div>

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
              className="press flex items-center gap-2 rounded-xl bg-zinc-900 px-5 py-2 text-sm font-semibold text-white hover:bg-zinc-800 disabled:opacity-60"
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
          Eliminar publicación
        </h2>
        <p className="mt-1 text-sm text-rose-700">
          Úsalo si ya se resolvió, fue un duplicado o un error. Esta acción no se puede deshacer.
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
