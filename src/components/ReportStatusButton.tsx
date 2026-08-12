"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, LogIn, Loader2, ShieldCheck } from "lucide-react";
import { PERSON_STATUS_LABEL, type PersonStatus } from "@/lib/types";
import { getSessionUserAction, reportStatusAction, type ActionResult } from "@/app/actions";
import { Modal } from "./Modal";
import { Field, Input, Select, Textarea } from "./FormControls";
import { Turnstile, type TurnstileHandle } from "./Turnstile";

const REPORTABLE: PersonStatus[] = ["localizado", "hospitalizado", "fallecido", "por_localizar"];

// "localizado"/"fallecido" son los dos reportes que más daño hacen si son
// falsos (falsa esperanza o falso duelo a la familia) — exigen cuenta, igual
// que las denuncias. "hospitalizado"/"por_localizar" siguen siendo anónimos:
// son correcciones de menor riesgo y a veces las manda un testigo sin cuenta.
function needsAccount(status: string): boolean {
  return status === "localizado" || status === "fallecido";
}

export function ReportStatusButton({
  personId,
  personName,
}: {
  personId: string;
  personName: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<ActionResult | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [reportedStatus, setReportedStatus] = useState<PersonStatus>("localizado");
  const [loggedIn, setLoggedIn] = useState<boolean | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const turnstileRef = useRef<TurnstileHandle>(null);

  useEffect(() => {
    if (!open) return;
    getSessionUserAction()
      .then((u) => setLoggedIn(!!u))
      .catch(() => setLoggedIn(false));
  }, [open]);

  const blockedByLogin = needsAccount(reportedStatus) && loggedIn === false;

  function close() {
    setOpen(false);
    setTimeout(() => {
      setResult(null);
      setConfirmed(false);
      setReportedStatus("localizado");
      formRef.current?.reset();
    }, 200);
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (submitting || blockedByLogin) return;
    setSubmitting(true);
    setResult(null);
    try {
      const res = await reportStatusAction(new FormData(e.currentTarget));
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
        className="press w-full rounded-xl bg-zinc-900 px-4 py-3 text-sm font-semibold text-white transition hover:bg-zinc-800"
      >
        Tengo información sobre esta persona
      </button>

      <Modal
        open={open}
        onClose={close}
        title="Reportar información"
        subtitle={`Sobre ${personName}. Tu reporte se verifica antes de cambiar el estado público.`}
      >
        {result?.ok ? (
          <div className="flex flex-col items-center py-8 text-center">
            <CheckCircle2 className="h-14 w-14 text-emerald-500" />
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
            <input type="hidden" name="personId" value={personId} />

            <div className="flex items-start gap-2.5 rounded-xl border border-sky-200 bg-sky-50 px-3.5 py-3 text-sm text-sky-800">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
              <p>
                Tu reporte se muestra <strong>de inmediato</strong> en la ficha (el tiempo es oro),
                marcado como <strong>sin verificar</strong>. Un moderador lo confirma con tu contacto
                antes de cambiar el estado oficial, para proteger de información falsa.
              </p>
            </div>

            <Field label="¿Qué quieres reportar?" htmlFor="reportedStatus" required>
              <Select
                id="reportedStatus"
                name="reportedStatus"
                value={reportedStatus}
                onChange={(e) => setReportedStatus(e.target.value as PersonStatus)}
              >
                {REPORTABLE.map((s) => (
                  <option key={s} value={s}>
                    {s === "por_localizar" ? "Sigue desaparecida (corregir)" : PERSON_STATUS_LABEL[s]}
                  </option>
                ))}
              </Select>
            </Field>

            {blockedByLogin && (
              <div className="flex items-start gap-2.5 rounded-xl border border-amber-300 bg-amber-50 px-3.5 py-3 text-sm text-amber-900">
                <LogIn className="mt-0.5 h-4 w-4 shrink-0" />
                <p>
                  Para reportar que <strong>apareció</strong> o <strong>falleció</strong> necesitas{" "}
                  <strong>iniciar sesión</strong>: es el reporte que más daño hace si es falso (falsa
                  esperanza o falso duelo a la familia). Abre el menú de tu cuenta (arriba a la
                  derecha) para entrar, o elige otro tipo de reporte.
                </p>
              </div>
            )}

            {!blockedByLogin && (
              <>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <Field label="Tu nombre" htmlFor="reporterName" required error={fieldErrors?.reporterName}>
                    <Input id="reporterName" name="reporterName" placeholder="Nombre y apellido" />
                  </Field>
                  <Field
                    label="Tu teléfono"
                    htmlFor="reporterPhone"
                    required
                    error={fieldErrors?.reporterPhone}
                    hint="Con el código de tu país si no es +58."
                  >
                    <Input id="reporterPhone" name="reporterPhone" placeholder="+58 424 0000000" />
                  </Field>
                </div>

                <Field
                  label="¿Qué relación tienes con la persona?"
                  htmlFor="reporterRelationship"
                  required
                  hint="Familiar, médico, rescatista, vecino, testigo..."
                  error={fieldErrors?.reporterRelationship}
                >
                  <Input id="reporterRelationship" name="reporterRelationship" placeholder="Ej. Médico del hospital Vargas" />
                </Field>

                <Field
                  label="¿Dónde la viste / encontraste?"
                  htmlFor="locationFound"
                  required
                  error={fieldErrors?.locationFound}
                >
                  <Input id="locationFound" name="locationFound" placeholder="Lugar, sector, centro de salud..." />
                </Field>

                <Field label="Detalles adicionales" htmlFor="notes">
                  <Textarea id="notes" name="notes" placeholder="Cuenta lo que sabes para ayudar a verificar..." />
                </Field>

                <Turnstile ref={turnstileRef} />

                <label className="flex cursor-pointer items-start gap-2.5 text-sm text-zinc-600">
                  <input
                    type="checkbox"
                    checked={confirmed}
                    onChange={(e) => setConfirmed(e.target.checked)}
                    className="mt-0.5 h-4 w-4 rounded"
                  />
                  Confirmo que tengo información directa y verídica. Entiendo que reportar datos falsos
                  perjudica la búsqueda de personas reales.
                </label>
              </>
            )}

            {result && !result.ok && (
              <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700">
                {result.error}
              </p>
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
                disabled={submitting || !confirmed || blockedByLogin}
                className="flex items-center gap-2 rounded-xl bg-zinc-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-zinc-800 disabled:opacity-50"
              >
                {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
                Enviar reporte
              </button>
            </div>
          </form>
        )}
      </Modal>
    </>
  );
}
