"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { chooseUsernameAction, type AuthActionResult } from "@/app/actions";
import { Field, Input } from "./FormControls";

// Paso final del ingreso con Google. La cuenta ya existe y la sesión está
// abierta; lo único que falta es el nombre público. Hasta terminar esto no hay
// fila en `profiles`, así que no se puede publicar ni comentar todavía.
export function ChooseUsernameForm({ next }: { next: string }) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<AuthActionResult | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setResult(null);
    try {
      const res = await chooseUsernameAction(new FormData(e.currentTarget));
      setResult(res);
      if (res.ok) {
        // `next` ya viene saneado del servidor (solo rutas internas).
        router.replace(next.startsWith("/") ? next : "/");
        router.refresh();
        return; // deja el botón en "guardando" mientras navega
      }
    } finally {
      setSubmitting(false);
    }
  }

  const fieldErrors = result && !result.ok ? result.fieldErrors : undefined;

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <Field
        label="Nombre de usuario"
        htmlFor="username"
        required
        error={fieldErrors?.username}
        hint="3–24 caracteres: letras, números, punto o guion bajo. Se verá en tus publicaciones."
      >
        <Input id="username" name="username" autoComplete="username" placeholder="ej. maria_g" autoFocus />
      </Field>

      {result && !result.ok && (
        <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700">
          {result.error}
        </p>
      )}

      <button
        type="submit"
        disabled={submitting}
        className="press flex w-full items-center justify-center gap-2 rounded-xl bg-brand-400 px-5 py-2.5 text-sm font-semibold text-zinc-900 transition hover:bg-brand-300 disabled:opacity-60"
      >
        {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
        Continuar
      </button>
    </form>
  );
}
