"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  ImagePlus,
  Loader2,
  MapPin,
  Plus,
  Search,
} from "lucide-react";
import { getCountry } from "@/lib/countries";
import {
  checkPersonDuplicatesAction,
  registerPersonAction,
  type ActionResult,
} from "@/app/actions";
import type { PersonDuplicateMatch } from "@/lib/data";
import { PERSON_STATUS_LABEL } from "@/lib/types";
import { uploadPhoto } from "@/lib/upload";
import { compressImage } from "@/lib/image";
import { Modal } from "./Modal";
import { Field, Input, Select, Textarea } from "./FormControls";
import { Turnstile } from "./Turnstile";
import { ManageLinkBox } from "./ManageLinkBox";
import { LocationPicker } from "./map/LocationPicker";

// Intención de la publicación: define dónde aparece y cómo se pide la info.
//  • "search"   → Busco a esta persona (tengo sus datos, no sé dónde está).
//  • "sighting" → Vi / encontré a esta persona (sé dónde está, no sé bien quién es).
type Intent = "search" | "sighting";

export function RegisterPersonButton({ country = "ve" }: { country?: string } = {}) {
  const regions = getCountry(country).regions;
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [intent, setIntent] = useState<Intent | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<ActionResult | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [title, setTitle] = useState("");
  const [duplicates, setDuplicates] = useState<PersonDuplicateMatch[] | null>(null);
  const [checkingDuplicates, setCheckingDuplicates] = useState(false);
  const skipDuplicateCheck = useRef(false);
  const fileRef = useRef<File | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  function reset() {
    setResult(null);
    setPreview(null);
    setDone(false);
    setIntent(null);
    setDuplicates(null);
    skipDuplicateCheck.current = false;
    fileRef.current = null;
    formRef.current?.reset();
  }

  function close() {
    setOpen(false);
    setTimeout(reset, 200);
  }

  function chooseAgain() {
    setIntent(null);
    setResult(null);
  }

  function continueAnyway() {
    skipDuplicateCheck.current = true;
    setDuplicates(null);
    formRef.current?.requestSubmit();
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (submitting || checkingDuplicates) return;
    const form = new FormData(e.currentTarget);

    // Antes de crear un registro "busco a esta persona" con nombre/cédula,
    // avisamos si ya existe algo que coincida exacto, para no duplicar.
    if (!isSighting && !skipDuplicateCheck.current) {
      const firstName = String(form.get("firstName") ?? "");
      const lastName = String(form.get("lastName") ?? "");
      const cedula = String(form.get("cedula") ?? "");
      if (firstName.trim() || cedula.trim()) {
        setCheckingDuplicates(true);
        try {
          const matches = await checkPersonDuplicatesAction(firstName, lastName, cedula);
          if (matches.length > 0) {
            setDuplicates(matches);
            return;
          }
        } finally {
          setCheckingDuplicates(false);
        }
      }
    }
    skipDuplicateCheck.current = false;

    setSubmitting(true);
    setResult(null);
    try {
      const nm = `${String(form.get("firstName") ?? "")} ${String(form.get("lastName") ?? "")}`.trim();
      setTitle(nm || "Persona sin identificar");
      if (fileRef.current) {
        try {
          const compressed = await compressImage(fileRef.current);
          const url = await uploadPhoto(compressed);
          if (url) form.set("photoUrl", url);
        } catch {
          // Si la subida falla, continuamos sin foto en vez de perder el registro.
        }
      }
      const res = await registerPersonAction(form);
      setResult(res);
      if (res.ok) {
        setDone(true);
        router.refresh();
      }
    } finally {
      setSubmitting(false);
    }
  }

  const fieldErrors = result && !result.ok ? result.fieldErrors : undefined;
  const isSighting = intent === "sighting";

  const modalTitle =
    intent === "search"
      ? "Busco a una persona"
      : intent === "sighting"
        ? "Vi / encontré a una persona"
        : "Publicar una persona";
  const modalSubtitle =
    intent === "search"
      ? "Tengo sus datos; quiero que me digan dónde está."
      : intent === "sighting"
        ? "Sé dónde está; quiero que su familia la ubique."
        : "¿Qué quieres hacer? Elige tu caso para publicarla donde la gente la busca.";

  return (
    <>
      {/* En móvil, la barra de búsqueda/filtros se puede ocultar (ver
          SearchAndFilters) y este botón se iba con ella — un flotante fijo
          arriba de la barra inferior siempre está a mano, sin depender de
          que esa barra esté expandida. En escritorio se queda el botón normal. */}
      <button
        onClick={() => setOpen(true)}
        aria-label="Publicar persona"
        className="press fixed left-1/2 z-30 flex h-14 w-14 -translate-x-1/2 items-center justify-center rounded-full bg-brand-400 text-zinc-900 shadow-lg transition hover:bg-brand-300 sm:hidden"
        style={{ bottom: "calc(4.5rem + env(safe-area-inset-bottom))" }}
      >
        <Plus className="h-6 w-6" />
      </button>
      <button
        onClick={() => setOpen(true)}
        className="press hidden items-center gap-1.5 rounded-xl bg-brand-400 px-4 py-2.5 text-sm font-bold text-zinc-900 shadow-sm transition hover:bg-brand-300 sm:flex sm:gap-2 sm:px-5 sm:py-3 sm:text-base"
      >
        <Plus className="h-4.5 w-4.5 sm:h-5 sm:w-5" />
        Publicar persona
      </button>

      <Modal open={open} onClose={close} title={modalTitle} subtitle={modalSubtitle}>
        {done && result?.ok ? (
          <div className="flex flex-col items-center py-6 text-center">
            <CheckCircle2 className="h-14 w-14 text-emerald-500" />
            <p className="mt-4 max-w-sm font-medium text-zinc-800">{result.message}</p>

            {result.id && result.ownerToken && (
              <ManageLinkBox
                id={result.id}
                token={result.ownerToken}
                entityType="person"
                title={title}
              />
            )}

            <div className="mt-6 flex gap-3">
              <button
                onClick={reset}
                className="rounded-xl border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
              >
                Publicar otra
              </button>
              <button
                onClick={close}
                className="rounded-xl bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800"
              >
                Cerrar
              </button>
            </div>
          </div>
        ) : duplicates && duplicates.length > 0 ? (
          // ── Aviso de posible duplicado antes de publicar ─────────────────
          <div className="space-y-4 py-1">
            <div className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
              <div>
                <p className="text-sm font-semibold text-amber-900">
                  Ya encontramos {duplicates.length === 1 ? "un registro" : "registros"} con el
                  mismo nombre o cédula
                </p>
                <p className="mt-1 text-sm text-amber-800">
                  Si es la misma persona, mejor aporta información en esa ficha en vez de crear una
                  nueva. Si es alguien distinto, puedes continuar publicando igual.
                </p>
              </div>
            </div>

            <ul className="space-y-2">
              {duplicates.map((m) => {
                const name = `${m.firstName} ${m.lastName}`.trim() || "Sin identificar";
                return (
                  <li
                    key={m.id}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-zinc-200 bg-white p-3"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-medium text-zinc-900">{name}</p>
                      <p className="text-xs text-zinc-500">
                        {[m.cedula, m.estado, m.locationText].filter(Boolean).join(" · ") ||
                          "Sin más datos"}
                        {" · "}
                        {PERSON_STATUS_LABEL[m.status]}
                      </p>
                    </div>
                    <Link
                      href={`/persona/${m.id}`}
                      target="_blank"
                      className="shrink-0 rounded-lg border border-zinc-300 px-3 py-1.5 text-xs font-semibold text-zinc-700 hover:bg-zinc-50"
                    >
                      Ver ficha
                    </Link>
                  </li>
                );
              })}
            </ul>

            <div className="flex flex-wrap justify-end gap-3 pt-1">
              <button
                type="button"
                onClick={() => setDuplicates(null)}
                className="rounded-xl border border-zinc-300 px-4 py-2.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
              >
                Volver a revisar los datos
              </button>
              <button
                type="button"
                onClick={continueAnyway}
                className="press rounded-xl bg-brand-400 px-5 py-2.5 text-sm font-semibold text-zinc-900 hover:bg-brand-300"
              >
                No es la misma persona, publicar de todas formas
              </button>
            </div>
          </div>
        ) : intent === null ? (
          // ── Paso 1: elegir la intención ──────────────────────────────────
          <div className="space-y-3 py-1">
            <p className="text-sm text-zinc-600">
              Para no perder el orden, primero dinos tu caso. Así la persona aparece donde la gente
              la va a buscar.
            </p>

            <button
              type="button"
              onClick={() => setIntent("search")}
              className="flex w-full items-start gap-3 rounded-2xl border border-zinc-200 bg-white p-4 text-left transition hover:border-brand-400 hover:bg-brand-50"
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-100 text-brand-700">
                <Search className="h-5 w-5" />
              </span>
              <span>
                <span className="block font-semibold text-zinc-900">Busco a una persona</span>
                <span className="mt-0.5 block text-sm text-zinc-500">
                  Tengo sus datos (nombre o foto) pero <strong>no sé dónde está</strong>. Quiero que
                  me digan si la vieron.
                </span>
              </span>
            </button>

            <button
              type="button"
              onClick={() => setIntent("sighting")}
              className="flex w-full items-start gap-3 rounded-2xl border border-zinc-200 bg-white p-4 text-left transition hover:border-brand-400 hover:bg-brand-50"
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-100 text-brand-700">
                <MapPin className="h-5 w-5" />
              </span>
              <span>
                <span className="block font-semibold text-zinc-900">Vi / encontré a una persona</span>
                <span className="mt-0.5 block text-sm text-zinc-500">
                  <strong>Sé dónde está</strong> (la vi en un hospital, refugio o la calle) y quiero
                  que su familia la ubique, aunque no sepa bien quién es.
                </span>
              </span>
            </button>
          </div>
        ) : (
          // ── Paso 2: formulario adaptado a la intención ───────────────────
          <form ref={formRef} onSubmit={onSubmit} className="space-y-5">
            <button
              type="button"
              onClick={chooseAgain}
              className="inline-flex items-center gap-1.5 text-sm font-medium text-zinc-500 hover:text-zinc-900"
            >
              <ArrowLeft className="h-4 w-4" />
              Cambiar (Busco / Vi)
            </button>

            {/* Foto */}
            <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-zinc-300 bg-zinc-50 py-6 transition hover:border-brand-400 hover:bg-brand-50">
              {preview ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={preview} alt="Vista previa" className="h-28 w-28 rounded-lg object-cover" />
              ) : (
                <>
                  <ImagePlus className="h-7 w-7 text-zinc-400" />
                  <span className="text-sm font-medium text-zinc-700">
                    {isSighting ? "Foto de la persona (muy recomendada)" : "Subir foto"}
                  </span>
                  <span className="text-xs text-zinc-400">
                    {isSighting ? "Si solo tienes una foto, súbela: ayuda a identificarla." : "JPG, PNG o WebP"}
                  </span>
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
            <p className="-mt-3 text-xs text-zinc-400">
              Sube una foto de la persona, no de su cédula u otro documento de identidad.
            </p>

            <Field
              label="¿Por qué se publica?"
              htmlFor="cause"
              hint="Ayuda a priorizar: los casos ligados al terremoto se destacan primero mientras dure la emergencia."
            >
              <Select id="cause" name="cause" defaultValue="desastre">
                <option value="desastre">Relacionado con el terremoto</option>
                <option value="otra">Otro motivo (no relacionado con el desastre)</option>
              </Select>
            </Field>

            <h3 className="text-sm font-semibold text-zinc-900">
              {isSighting ? "Lo que sepas de la persona" : "Datos de la persona"}
            </h3>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field
                label={isSighting ? "Nombre (si lo sabes)" : "Nombre"}
                htmlFor="firstName"
                required={!isSighting}
                error={fieldErrors?.firstName}
              >
                <Input id="firstName" name="firstName" placeholder={isSighting ? "Déjalo vacío si no lo sabes" : "Nombre(s)"} />
              </Field>
              <Field label="Apellido" htmlFor="lastName" error={fieldErrors?.lastName}>
                <Input id="lastName" name="lastName" placeholder="Apellido(s)" />
              </Field>
              <Field label="Cédula de identidad" htmlFor="cedula" error={fieldErrors?.cedula}>
                <Input id="cedula" name="cedula" placeholder="V-12345678" />
              </Field>
              <Field label="Edad aproximada" htmlFor="age" error={fieldErrors?.age}>
                <Input id="age" name="age" type="number" min={0} max={120} placeholder="35" />
              </Field>
              <Field label="Género" htmlFor="gender">
                <Select id="gender" name="gender" defaultValue="">
                  <option value="">Seleccionar</option>
                  <option value="masculino">Masculino</option>
                  <option value="femenino">Femenino</option>
                  <option value="otro">Otro</option>
                </Select>
              </Field>
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
            </div>

            <Field
              label={isSighting ? "¿Dónde está o dónde la viste?" : "Ubicación / sector"}
              htmlFor="locationText"
              required={isSighting}
              error={fieldErrors?.locationText}
              hint={isSighting ? "Hospital, refugio, calle o sector lo más exacto posible." : undefined}
            >
              <Input
                id="locationText"
                name="locationText"
                placeholder={isSighting ? "Hospital Vargas, sala de emergencias" : "Macuto, edificio Caribe, sector..."}
              />
            </Field>

            <Field
              label={isSighting ? "Señala en el mapa dónde la viste" : "Señala el lugar en el mapa (opcional)"}
              hint="Toca el mapa o usa tu GPS. Ayuda a ubicarla con precisión."
            >
              <LocationPicker />
            </Field>

            {isSighting && (
              <Field
                label="¿En qué situación está?"
                htmlFor="status"
                hint="Cómo la viste. Podrás cambiarlo luego desde tu enlace de gestión."
              >
                <Select id="status" name="status" defaultValue="localizado">
                  <option value="localizado">La vi con vida / a salvo</option>
                  <option value="hospitalizado">Está en un hospital</option>
                  <option value="fallecido">Sin vida</option>
                </Select>
              </Field>
            )}

            <Field
              label={isSighting ? "Rasgos, ropa y contexto" : "Descripción"}
              htmlFor="description"
              hint={
                isSighting
                  ? "Lo que ayude a reconocerla: estatura, ropa, señas, estado en que la viste."
                  : "Ropa que vestía, señas particulares, contexto."
              }
            >
              <Textarea
                id="description"
                name="description"
                placeholder={
                  isSighting
                    ? "Hombre, ~60 años, camisa azul, herida en la pierna. Consciente."
                    : "Ropa que vestía, señas particulares, contexto..."
                }
              />
            </Field>

            <h3 className="text-sm font-semibold text-zinc-900">
              {isSighting ? "Tu contacto (para coordinar)" : "Datos de contacto"}
            </h3>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Nombre de contacto" htmlFor="contactName">
                <Input id="contactName" name="contactName" placeholder="Nombre completo" />
              </Field>
              <Field
                label="Teléfono"
                htmlFor="contactPhone"
                error={fieldErrors?.contactPhone}
                hint="Con el código de tu país si no es +58."
              >
                <Input id="contactPhone" name="contactPhone" placeholder="+58 424 0000000" />
              </Field>
              <Field label="Correo (opcional)" htmlFor="contactEmail" error={fieldErrors?.contactEmail}>
                <Input id="contactEmail" name="contactEmail" type="email" placeholder="tu@correo.com" />
              </Field>
            </div>

            <input type="hidden" name="photoUrl" />
            <input type="hidden" name="isUnidentified" value={isSighting ? "on" : ""} />
            <Turnstile />

            <p className="text-xs text-zinc-500">
              {isSighting
                ? "Comparte solo lo que sepas; no hace falta el nombre. Sé responsable: esto puede reunir a una familia."
                : "Confirma que tienes información directa antes de publicar un registro."}
            </p>

            {result && !result.ok && (
              <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700">
                {result.error}
              </p>
            )}

            <div className="flex justify-end gap-3 pt-1">
              <button
                type="button"
                onClick={close}
                className="rounded-xl border border-zinc-300 px-4 py-2.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={submitting || checkingDuplicates}
                className="press flex items-center gap-2 rounded-xl bg-brand-400 px-5 py-2.5 text-sm font-semibold text-zinc-900 transition hover:bg-brand-300 disabled:opacity-60"
              >
                {(submitting || checkingDuplicates) && <Loader2 className="h-4 w-4 animate-spin" />}
                {checkingDuplicates
                  ? "Revisando duplicados..."
                  : isSighting
                    ? "Publicar avistamiento"
                    : "Publicar búsqueda"}
              </button>
            </div>
          </form>
        )}
      </Modal>
    </>
  );
}
