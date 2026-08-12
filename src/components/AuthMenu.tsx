"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { LogIn, Loader2, MailCheck } from "lucide-react";
import {
  getSessionUserAction,
  requestPasswordResetAction,
  signInAction,
  signUpAction,
  type AuthActionResult,
} from "@/app/actions";
import { Modal } from "./Modal";
import { Field, Input, PasswordInput } from "./FormControls";
import { Turnstile, type TurnstileHandle } from "./Turnstile";
import { ProfileMenu } from "./ProfileMenu";

type SessionUser = { id: string; username: string } | null;
type Mode = "login" | "register" | "reset";

export function AuthMenu() {
  const router = useRouter();
  const [user, setUser] = useState<SessionUser>(null);
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<Mode>("login");
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<AuthActionResult | null>(null);
  const [resetDone, setResetDone] = useState(false);
  const turnstileRef = useRef<TurnstileHandle>(null);

  async function refresh() {
    try {
      setUser(await getSessionUserAction());
    } catch {
      /* sin sesión o sin Supabase */
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  // Permite abrir el modal desde otros sitios (p. ej. el banner de invitación).
  useEffect(() => {
    const onOpen = (e: Event) => {
      const detail = (e as CustomEvent).detail as { mode?: Mode } | undefined;
      setMode(detail?.mode === "register" ? "register" : "login");
      setResult(null);
      setResetDone(false);
      setOpen(true);
    };
    window.addEventListener("vtb:auth-open", onOpen);
    return () => window.removeEventListener("vtb:auth-open", onOpen);
  }, []);

  function switchMode(next: Mode) {
    setMode(next);
    setResult(null);
    setResetDone(false);
  }

  function openLogin() {
    setMode("login");
    setResult(null);
    setResetDone(false);
    setOpen(true);
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setResult(null);
    try {
      const form = new FormData(e.currentTarget);
      if (mode === "reset") {
        await requestPasswordResetAction(form);
        setResetDone(true);
        return;
      }
      const res = mode === "register" ? await signUpAction(form) : await signInAction(form);
      setResult(res);
      if (res.ok) {
        setOpen(false);
        await refresh();
        router.refresh();
      } else {
        // El token ya se consumió en este intento; sin esto, reintentar
        // reenvía el mismo token y Cloudflare lo rechaza siempre.
        turnstileRef.current?.reset();
      }
    } finally {
      setSubmitting(false);
    }
  }

  const fieldErrors = result && !result.ok ? result.fieldErrors : undefined;

  const title =
    mode === "register"
      ? "Crear cuenta"
      : mode === "reset"
        ? "Recuperar contraseña"
        : "Iniciar sesión";
  const subtitle =
    mode === "register"
      ? "Para no perder tus publicaciones aunque cambies de teléfono o navegador."
      : mode === "reset"
        ? "Te enviaremos un enlace al correo que registraste (si dejaste uno)."
        : "Entra para gestionar tus publicaciones desde cualquier dispositivo.";

  return (
    <>
      {user ? (
        <ProfileMenu user={user} />
      ) : (
        <button
          onClick={openLogin}
          className="press flex h-10 items-center gap-1.5 rounded-full border border-zinc-300 px-3.5 text-sm font-semibold text-zinc-700 transition hover:bg-zinc-50"
        >
          <LogIn className="h-4 w-4" />
          Entrar
        </button>
      )}

      <Modal open={open} onClose={() => setOpen(false)} title={title} subtitle={subtitle}>
        {mode === "reset" && resetDone ? (
          <div className="flex flex-col items-center py-4 text-center">
            <MailCheck className="h-12 w-12 text-emerald-500" />
            <p className="mt-3 font-medium text-zinc-800">Revisa tu correo</p>
            <p className="mt-1 text-sm text-zinc-500">
              Si ese usuario tiene un correo de recuperación, le enviamos un enlace para crear una
              nueva contraseña. Puede tardar unos minutos.
            </p>
            <button
              onClick={() => switchMode("login")}
              className="mt-5 text-sm font-medium text-brand-700 hover:underline"
            >
              Volver a iniciar sesión
            </button>
          </div>
        ) : (
          <form key={mode} onSubmit={onSubmit} className="space-y-4">
            <Field label="Nombre de usuario" htmlFor="username" required error={fieldErrors?.username}>
              <Input id="username" name="username" autoComplete="username" placeholder="ej. maria_g" />
            </Field>

            {mode !== "reset" && (
              <Field
                label="Contraseña"
                htmlFor="password"
                required
                error={fieldErrors?.password}
                hint={
                  mode === "register"
                    ? "Mínimo 10 caracteres. No uses la misma de tu correo o redes, pero elige una que recuerdes."
                    : undefined
                }
              >
                <PasswordInput
                  id="password"
                  name="password"
                  autoComplete={mode === "register" ? "new-password" : "current-password"}
                  placeholder="••••••••••"
                />
              </Field>
            )}

            {mode === "login" && (
              <button
                type="button"
                onClick={() => switchMode("reset")}
                className="-mt-1 text-xs font-medium text-zinc-500 hover:text-brand-700"
              >
                ¿Olvidaste tu clave?
              </button>
            )}

            {mode === "register" && (
              <Field
                label="Correo (opcional)"
                htmlFor="email"
                error={fieldErrors?.email}
                hint="Solo se usa para recuperar tu clave si la olvidas. Si lo dejas vacío, no podrás recuperarla."
              >
                <Input id="email" name="email" type="email" autoComplete="email" placeholder="tu@correo.com" />
              </Field>
            )}

            <Turnstile ref={turnstileRef} />

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
              {mode === "register" ? "Crear cuenta" : mode === "reset" ? "Enviar enlace" : "Entrar"}
            </button>

            <p className="text-center text-sm text-zinc-500">
              {mode === "register" ? (
                <>
                  ¿Ya tienes cuenta?{" "}
                  <button type="button" onClick={() => switchMode("login")} className="font-medium text-brand-700 hover:underline">
                    Inicia sesión
                  </button>
                </>
              ) : mode === "reset" ? (
                <button type="button" onClick={() => switchMode("login")} className="font-medium text-brand-700 hover:underline">
                  Volver a iniciar sesión
                </button>
              ) : (
                <>
                  ¿No tienes cuenta?{" "}
                  <button type="button" onClick={() => switchMode("register")} className="font-medium text-brand-700 hover:underline">
                    Créala (es opcional)
                  </button>
                </>
              )}
            </p>
          </form>
        )}
      </Modal>
    </>
  );
}
