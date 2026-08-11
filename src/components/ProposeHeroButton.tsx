"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Loader2, Star } from "lucide-react";
import { HERO_CATEGORY_LABEL, type HeroCategory } from "@/lib/types";
import { getCountry } from "@/lib/countries";
import { registerHeroAction, type ActionResult } from "@/app/actions";
import { Modal } from "./Modal";
import { Field, Input, Select, Textarea } from "./FormControls";
import { Turnstile } from "./Turnstile";

const CATEGORIES = Object.keys(HERO_CATEGORY_LABEL) as HeroCategory[];

export function ProposeHeroButton({ country = "ve" }: { country?: string } = {}) {
  const regions = getCountry(country).regions;
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<ActionResult | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

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
      const res = await registerHeroAction(new FormData(e.currentTarget));
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
        className="press flex items-center gap-2 rounded-xl bg-amber-500 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-amber-600"
      >
        <Star className="h-4 w-4" />
        Proponer un héroe
      </button>

      <Modal
        open={open}
        onClose={close}
        title="Proponer un héroe"
        subtitle="Reconoce a quien ayudó en la emergencia. Lo revisará un moderador antes de marcarlo como verificado."
      >
        {result?.ok ? (
          <div className="flex flex-col items-center py-8 text-center">
            <CheckCircle2 className="h-14 w-14 text-amber-500" />
            <p className="mt-4 max-w-sm text-sm font-medium text-zinc-800">{result.message}</p>
            <button
              onClick={close}
              className="mt-6 rounded-xl bg-zinc-900 px-5 py-2 text-sm font-medium text-white hover:bg-zinc-800"
            >
              Cerrar
            </button>
          </div>
        ) : (
          <form ref={formRef} onSubmit={onSubmit} className="space-y-5">
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-800">
              Solo hechos reales. Si afirmas algo, ayúdanos con una <strong>fuente</strong> (enlace a
              una noticia o publicación oficial). Las propuestas falsas se eliminan.
            </div>

            <Field label="¿A quién reconoces?" htmlFor="category" required>
              <Select id="category" name="category" defaultValue="voluntario">
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {HERO_CATEGORY_LABEL[c]}
                  </option>
                ))}
              </Select>
            </Field>

            <Field label="Nombre o grupo" htmlFor="title" required error={fieldErrors?.title}>
              <Input id="title" name="title" placeholder="Bomberos de La Guaira, brigada del sector..." />
            </Field>

            <Field label="¿Qué hizo?" htmlFor="body" required error={fieldErrors?.body}>
              <Textarea id="body" name="body" placeholder="Cuenta brevemente la acción que merece reconocimiento." />
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
                <Input id="locationText" name="locationText" placeholder="Caraballeda, Catia La Mar..." />
              </Field>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Fuente (medio/organización)" htmlFor="sourceName">
                <Input id="sourceName" name="sourceName" placeholder="Bomberos de Venezuela, un medio..." />
              </Field>
              <Field label="Enlace de la fuente (opcional)" htmlFor="sourceUrl" error={fieldErrors?.sourceUrl}>
                <Input id="sourceUrl" name="sourceUrl" placeholder="https://..." />
              </Field>
            </div>

            <Turnstile />

            {result && !result.ok && (
              <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700">{result.error}</p>
            )}

            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={close}
                className="rounded-xl border border-zinc-300 px-4 py-2.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="flex items-center gap-2 rounded-xl bg-amber-500 px-5 py-2.5 text-sm font-semibold text-white hover:bg-amber-600 disabled:opacity-60"
              >
                {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
                Proponer
              </button>
            </div>
          </form>
        )}
      </Modal>
    </>
  );
}
