"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Bell, CheckCircle2, KeyRound, Loader2, Mail, Trash2 } from "lucide-react";
import {
  changePasswordAction,
  deleteAccountAction,
  updateEmailNotificationsAction,
  updateRecoveryEmailAction,
} from "@/app/actions";
import { Field, Input, PasswordInput } from "./FormControls";
import { Modal } from "./Modal";

export function AccountSettings({
  username,
  recoveryEmail,
  emailNotifications,
  hasPassword,
}: {
  username: string;
  recoveryEmail: string | null;
  emailNotifications: boolean;
  hasPassword: boolean;
}) {
  return (
    <div className="space-y-6">
      {hasPassword ? <PasswordSection /> : <GoogleAccountSection />}
      <EmailSection recoveryEmail={recoveryEmail} emailNotifications={emailNotifications} />
      <DangerSection username={username} hasPassword={hasPassword} />
    </div>
  );
}

// ── Cuenta de Google (sin contraseña propia) ──────────────────────────────
// Quien entró con Google no tiene contraseña en este sitio: la clave la guarda
// Google. Mostrar aquí el formulario de "cambiar contraseña" solo llevaría a un
// error incomprensible ("la contraseña actual no es correcta" cuando nunca hubo
// ninguna), así que en su lugar se explica dónde se administra de verdad.
function GoogleAccountSection() {
  return (
    <section className="rounded-2xl border border-zinc-200 bg-white p-5">
      <h2 className="flex items-center gap-2 font-bold text-zinc-900">
        <KeyRound className="h-4.5 w-4.5 text-zinc-500" />
        Contraseña
      </h2>
      <p className="mt-2 text-sm text-zinc-500">
        Entras con tu cuenta de Google, así que aquí no hay contraseña que cambiar. Tu clave y la
        verificación en dos pasos se administran desde tu cuenta de Google.
      </p>
    </section>
  );
}

// ── Contraseña ────────────────────────────────────────────────────────────
function PasswordSection() {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    setDone(false);
    const form = new FormData(e.currentTarget);
    const res = await changePasswordAction(form);
    if (res.ok) {
      setDone(true);
      e.currentTarget.reset();
    } else {
      setError(res.error ?? "No se pudo cambiar la contraseña.");
    }
    setSubmitting(false);
  }

  return (
    <section className="rounded-2xl border border-zinc-200 bg-white p-5">
      <h2 className="flex items-center gap-2 font-bold text-zinc-900">
        <KeyRound className="h-4.5 w-4.5 text-zinc-500" />
        Contraseña
      </h2>
      <form onSubmit={onSubmit} className="mt-3 space-y-3">
        <Field label="Contraseña actual" htmlFor="currentPassword" required>
          <PasswordInput id="currentPassword" name="currentPassword" autoComplete="current-password" />
        </Field>
        <Field label="Contraseña nueva" htmlFor="newPassword" required hint="Mínimo 10 caracteres.">
          <PasswordInput id="newPassword" name="newPassword" autoComplete="new-password" />
        </Field>
        {error && <p className="text-sm font-medium text-rose-600">{error}</p>}
        {done && (
          <p className="flex items-center gap-1.5 text-sm font-medium text-emerald-600">
            <CheckCircle2 className="h-4 w-4" />
            Contraseña actualizada.
          </p>
        )}
        <button
          type="submit"
          disabled={submitting}
          className="press flex items-center gap-2 rounded-xl bg-zinc-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-zinc-800 disabled:opacity-60"
        >
          {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
          Cambiar contraseña
        </button>
      </form>
    </section>
  );
}

// ── Correo de recuperación + avisos ──────────────────────────────────────
function EmailSection({
  recoveryEmail,
  emailNotifications,
}: {
  recoveryEmail: string | null;
  emailNotifications: boolean;
}) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [hasEmail, setHasEmail] = useState(Boolean(recoveryEmail));
  const [notif, setNotif] = useState(emailNotifications);
  const [notifBusy, setNotifBusy] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    setDone(false);
    const form = new FormData(e.currentTarget);
    const res = await updateRecoveryEmailAction(form);
    if (res.ok) {
      setDone(true);
      setHasEmail(Boolean(String(form.get("email") ?? "").trim()));
      router.refresh();
    } else {
      setError(res.error ?? "No se pudo actualizar.");
    }
    setSubmitting(false);
  }

  async function toggleNotif() {
    if (!hasEmail) return;
    const next = !notif;
    setNotif(next);
    setNotifBusy(true);
    const res = await updateEmailNotificationsAction(next);
    if (!res.ok) setNotif(!next);
    setNotifBusy(false);
  }

  return (
    <section className="rounded-2xl border border-zinc-200 bg-white p-5">
      <h2 className="flex items-center gap-2 font-bold text-zinc-900">
        <Mail className="h-4.5 w-4.5 text-zinc-500" />
        Correo de recuperación
      </h2>
      <p className="mt-1 text-sm text-zinc-500">
        Solo se usa para recuperar tu clave y, si quieres, avisarte por correo. Nunca es tu nombre de
        usuario para entrar.
      </p>
      <form onSubmit={onSubmit} className="mt-3 space-y-3">
        <Field label="Correo" htmlFor="email">
          <Input id="email" name="email" type="email" defaultValue={recoveryEmail ?? ""} placeholder="tu@correo.com" />
        </Field>
        {error && <p className="text-sm font-medium text-rose-600">{error}</p>}
        {done && (
          <p className="flex items-center gap-1.5 text-sm font-medium text-emerald-600">
            <CheckCircle2 className="h-4 w-4" />
            Correo actualizado.
          </p>
        )}
        <button
          type="submit"
          disabled={submitting}
          className="press flex items-center gap-2 rounded-xl bg-zinc-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-zinc-800 disabled:opacity-60"
        >
          {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
          Guardar correo
        </button>
      </form>

      <div className="mt-4 flex items-center justify-between gap-3 border-t border-zinc-100 pt-4">
        <div className="flex items-start gap-2.5">
          <Bell className="mt-0.5 h-4 w-4 shrink-0 text-zinc-400" />
          <div>
            <p className="text-sm font-medium text-zinc-800">Avisarme por correo</p>
            <p className="text-xs text-zinc-500">
              {hasEmail
                ? "Además de la campanita, un correo cuando comenten tus publicaciones."
                : "Agrega un correo arriba para poder activar esto."}
            </p>
          </div>
        </div>
        <button
          onClick={toggleNotif}
          disabled={!hasEmail || notifBusy}
          role="switch"
          aria-checked={notif}
          aria-label="Avisarme por correo"
          className={
            notif
              ? "press relative h-6 w-11 shrink-0 rounded-full bg-emerald-500 transition disabled:opacity-40"
              : "press relative h-6 w-11 shrink-0 rounded-full bg-zinc-300 transition disabled:opacity-40"
          }
        >
          <span
            className={
              notif
                ? "absolute left-[22px] top-0.5 h-5 w-5 rounded-full bg-white shadow transition"
                : "absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition"
            }
          />
        </button>
      </div>
    </section>
  );
}

// ── Eliminar cuenta ───────────────────────────────────────────────────────
function DangerSection({ username, hasPassword }: { username: string; hasPassword: boolean }) {
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    const form = new FormData(e.currentTarget);
    const res = await deleteAccountAction(form);
    if (res.ok) {
      window.location.href = "/";
    } else {
      setError(res.error ?? "No se pudo eliminar la cuenta.");
      setSubmitting(false);
    }
  }

  return (
    <section className="rounded-2xl border border-rose-200 bg-rose-50/40 p-5">
      <h2 className="flex items-center gap-2 font-bold text-rose-800">
        <AlertTriangle className="h-4.5 w-4.5" />
        Eliminar cuenta
      </h2>
      <p className="mt-1 text-sm text-rose-700/80">
        Tus publicaciones NO se borran — quedan públicas, solo dejan de estar ligadas a una cuenta (como
        si las hubieras publicado sin iniciar sesión). Esto no se puede deshacer.
      </p>
      <button
        onClick={() => setOpen(true)}
        className="press mt-3 flex items-center gap-2 rounded-xl border border-rose-300 bg-white px-4 py-2 text-sm font-semibold text-rose-700 transition hover:bg-rose-50"
      >
        <Trash2 className="h-4 w-4" />
        Eliminar mi cuenta
      </button>

      <Modal
        open={open}
        onClose={() => {
          setOpen(false);
          setError(null);
        }}
        title="Eliminar cuenta"
        subtitle={
          hasPassword
            ? "Escribe tu contraseña y tu nombre de usuario para confirmar. No hay vuelta atrás."
            : "Escribe tu nombre de usuario para confirmar. No hay vuelta atrás."
        }
      >
        <form onSubmit={onSubmit} className="space-y-4">
          {/* Las cuentas de Google no tienen contraseña propia: la confirmación
              es teclear el nombre de usuario. */}
          {hasPassword && (
            <Field label="Contraseña" htmlFor="del-password" required>
              <PasswordInput id="del-password" name="password" autoComplete="current-password" />
            </Field>
          )}
          <Field
            label={`Escribe tu usuario ("${username}") para confirmar`}
            htmlFor="del-confirm"
            required
          >
            <Input id="del-confirm" name="confirmUsername" placeholder={username} />
          </Field>
          {error && <p className="text-sm font-medium text-rose-600">{error}</p>}
          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="press rounded-xl border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="press flex items-center gap-2 rounded-xl bg-rose-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-rose-700 disabled:opacity-60"
            >
              {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
              Eliminar definitivamente
            </button>
          </div>
        </form>
      </Modal>
    </section>
  );
}
