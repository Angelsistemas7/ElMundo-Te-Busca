"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Loader2, Plus, Search, UserPlus } from "lucide-react";
import {
  PATIENT_STATUS_LABEL,
  type HospitalPatient,
  type PatientStatus,
} from "@/lib/types";
import { addHospitalPatientAction, canManageHospitalAction, type ActionResult } from "@/app/actions";
import { cn, timeAgo } from "@/lib/utils";
import { Modal } from "./Modal";
import { Field, Input, Select, Textarea } from "./FormControls";
import { Turnstile, type TurnstileHandle } from "./Turnstile";

const PATIENT_STYLE: Record<PatientStatus, string> = {
  estable: "bg-emerald-50 text-emerald-700",
  critico: "bg-rose-50 text-rose-700",
  observacion: "bg-amber-50 text-amber-700",
  alta: "bg-zinc-100 text-zinc-600",
};

const STATUSES = Object.keys(PATIENT_STATUS_LABEL) as PatientStatus[];

export function HospitalPatients({
  hospitalId,
  patients,
}: {
  hospitalId: string;
  patients: HospitalPatient[];
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<ActionResult | null>(null);
  const [canManage, setCanManage] = useState<boolean | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const turnstileRef = useRef<TurnstileHandle>(null);

  // Solo personal autorizado (admin, autor, gestor o moderador de hospitales)
  // puede agregar pacientes — antes estaba abierto a cualquiera sin sesión.
  useEffect(() => {
    canManageHospitalAction(hospitalId)
      .then(setCanManage)
      .catch(() => setCanManage(false));
  }, [hospitalId]);

  const filtered = useMemo(() => {
    const q = query.toLowerCase().trim();
    if (!q) return patients;
    return patients.filter((p) =>
      [p.fullName, p.cedula, p.condition].filter(Boolean).join(" ").toLowerCase().includes(q),
    );
  }, [patients, query]);

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
    const form = new FormData(e.currentTarget);
    form.set("hospitalId", hospitalId);
    const res = await addHospitalPatientAction(form);
    setResult(res);
    if (res.ok) router.refresh();
    else turnstileRef.current?.reset();
    setSubmitting(false);
  }

  const fieldErrors = result && !result.ok ? result.fieldErrors : undefined;

  return (
    <section className="rounded-2xl border border-zinc-200 bg-white p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-bold text-zinc-900">
          Personas atendidas <span className="text-sm font-normal text-zinc-400">({patients.length})</span>
        </h2>
        {canManage && (
          <button
            onClick={() => setOpen(true)}
            className="press flex items-center gap-1.5 rounded-lg bg-zinc-900 px-3 py-2 text-sm font-semibold text-white transition hover:bg-zinc-800"
          >
            <UserPlus className="h-4 w-4" />
            Agregar persona
          </button>
        )}
      </div>

      <p className="mt-1 text-sm text-zinc-500">
        Si buscas a un familiar, escribe su nombre o cédula. Esta lista la mantiene el personal
        autorizado del hospital.
      </p>

      <div className="relative mt-4">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar por nombre o cédula"
          className="w-full rounded-lg border border-zinc-300 py-2 pl-9 pr-3 text-base outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100 sm:text-sm"
        />
      </div>

      <ul className="mt-4 space-y-2">
        {filtered.length === 0 ? (
          <li className="py-6 text-center text-sm text-zinc-400">
            {patients.length === 0 ? "Aún no hay personas en la lista." : "Sin coincidencias."}
          </li>
        ) : (
          filtered.map((p) => (
            <li key={p.id} className="rounded-xl border border-zinc-100 bg-zinc-50/60 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-medium text-zinc-900">{p.fullName}</span>
                <span className={cn("rounded-full px-2 py-0.5 text-xs font-semibold", PATIENT_STYLE[p.status])}>
                  {PATIENT_STATUS_LABEL[p.status]}
                </span>
              </div>
              <div className="mt-1 flex flex-wrap gap-x-3 text-sm text-zinc-600">
                {p.cedula && <span>{p.cedula}</span>}
                {p.condition && <span>{p.condition}</span>}
              </div>
              {p.note && <p className="mt-1 text-sm text-zinc-500">“{p.note}”</p>}
              <p className="mt-1 text-xs text-zinc-400">{timeAgo(p.createdAt)}</p>
            </li>
          ))
        )}
      </ul>

      <Modal
        open={open}
        onClose={close}
        title="Agregar persona atendida"
        subtitle="Ayuda a que su familia la encuentre. Comparte solo lo necesario."
      >
        {result?.ok ? (
          <div className="flex flex-col items-center py-8 text-center">
            <CheckCircle2 className="h-14 w-14 text-emerald-500" />
            <p className="mt-4 text-sm font-medium text-zinc-800">{result.message}</p>
            <div className="mt-6 flex gap-3">
              <button onClick={() => setResult(null)} className="press rounded-xl border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50">
                Agregar otra
              </button>
              <button onClick={close} className="press rounded-xl bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-zinc-800">
                Cerrar
              </button>
            </div>
          </div>
        ) : (
          <form ref={formRef} onSubmit={onSubmit} className="space-y-4">
            <Field label="Nombre de la persona" htmlFor="fullName" required error={fieldErrors?.fullName}>
              <Input id="fullName" name="fullName" placeholder="Nombre y apellido (o descripción si no se conoce)" />
            </Field>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Cédula (si se conoce)" htmlFor="cedula" error={fieldErrors?.cedula}>
                <Input id="cedula" name="cedula" placeholder="V-12345678" />
              </Field>
              <Field label="Estado del paciente" htmlFor="status" required>
                <Select id="status" name="status" defaultValue="estable">
                  {STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {PATIENT_STATUS_LABEL[s]}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
            <Field label="Condición / motivo" htmlFor="condition">
              <Input id="condition" name="condition" placeholder="Trauma, deshidratación, fractura..." />
            </Field>
            <Field label="Nota" htmlFor="note">
              <Textarea id="note" name="note" placeholder="Información útil para la familia o el personal." />
            </Field>

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
                className="press flex items-center gap-2 rounded-xl bg-zinc-900 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-zinc-800 disabled:opacity-60"
              >
                {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                Agregar
              </button>
            </div>
          </form>
        )}
      </Modal>
    </section>
  );
}
