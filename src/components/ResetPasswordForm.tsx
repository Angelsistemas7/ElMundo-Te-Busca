"use client";

import { useState } from "react";
import Link from "next/link";
import { CheckCircle2, Loader2 } from "lucide-react";
import { updatePasswordAction, type AuthActionResult } from "@/app/actions";
import { Field, PasswordInput } from "./FormControls";

export function ResetPasswordForm() {
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<AuthActionResult | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setResult(null);
    try {
      setResult(await updatePasswordAction(new FormData(e.currentTarget)));
    } finally {
      setSubmitting(false);
    }
  }

  if (result?.ok) {
    return (
      <div className="flex flex-col items-center py-4 text-center">
        <CheckCircle2 className="h-12 w-12 text-emerald-500" />
        <p className="mt-3 font-medium text-zinc-800">Tu contraseña se cambió correctamente.</p>
        <p className="mt-1 text-sm text-zinc-500">Ya puedes usar tu cuenta con la nueva clave.</p>
        <Link
          href="/"
          className="mt-5 rounded-xl bg-brand-400 px-5 py-2.5 text-sm font-semibold text-zinc-900 hover:bg-brand-300"
        >
          Ir al inicio
        </Link>
      </div>
    );
  }

  const fieldErrors = result && !result.ok ? result.fieldErrors : undefined;

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <Field
        label="Nueva contraseña"
        htmlFor="password"
        required
        error={fieldErrors?.password}
        hint="Mínimo 10 caracteres. No uses la misma de tu correo o redes, pero elige una que recuerdes."
      >
        <PasswordInput id="password" name="password" autoComplete="new-password" placeholder="••••••••••" />
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
        Cambiar contraseña
      </button>
    </form>
  );
}
