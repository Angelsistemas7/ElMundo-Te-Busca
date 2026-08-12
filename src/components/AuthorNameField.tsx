"use client";

import { useEffect, useState } from "react";
import { getSessionUserAction } from "@/app/actions";
import { Field, Input } from "./FormControls";

/**
 * Nombre de quien publica (posts, reportes de estado, registro de
 * voluntario...). Con sesión, usa el usuario de la cuenta (fijo — el
 * servidor también lo impone al crear la publicación con userId). Sin
 * sesión, recuerda el nombre por dispositivo y lo deja fijo tras la primera
 * vez, para no pedirlo de nuevo en cada formulario y evitar que cualquiera
 * cambie de identidad a mitad de publicación en el mismo dispositivo.
 * Mismo patrón que ya usa `CommentSection` para comentarios.
 */
export function useAuthorName(storageKey: string) {
  const [name, setName] = useState("");
  const [sessionName, setSessionName] = useState<string | null>(null);
  const [locked, setLocked] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getSessionUserAction()
      .then((u) => {
        if (cancelled) return;
        if (u) {
          setSessionName(u.username);
          setName(u.username);
          return;
        }
        const saved = localStorage.getItem(storageKey);
        if (saved) {
          setName(saved);
          setLocked(true);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [storageKey]);

  /** Llamar tras publicar con éxito: recién ahí se fija el nombre para este dispositivo. */
  function commit() {
    if (!sessionName && name.trim().length >= 2) {
      localStorage.setItem(storageKey, name.trim());
      setLocked(true);
    }
  }

  function unlock() {
    localStorage.removeItem(storageKey);
    setLocked(false);
  }

  return { name, setName, sessionName, locked, commit, unlock };
}

export function AuthorNameField({
  fieldName,
  label = "Tu nombre",
  placeholder = "Nombre y apellido",
  error,
  state,
}: {
  fieldName: string;
  label?: string;
  placeholder?: string;
  error?: string;
  state: ReturnType<typeof useAuthorName>;
}) {
  const { name, setName, sessionName, locked, unlock } = state;

  if (sessionName) {
    return (
      <div className="space-y-1">
        <label className="block text-sm font-medium text-zinc-700">{label}</label>
        <p className="rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-700">
          Publicando como <span className="font-semibold text-zinc-900">{sessionName}</span>
        </p>
        <input type="hidden" name={fieldName} value={sessionName} />
      </div>
    );
  }

  if (locked) {
    return (
      <div className="space-y-1">
        <label className="block text-sm font-medium text-zinc-700">{label}</label>
        <div className="flex items-center gap-2">
          <input
            name={fieldName}
            value={name}
            readOnly
            aria-label={label}
            className="w-full rounded-xl border border-zinc-300 bg-zinc-50 px-3 py-2 text-base text-zinc-700 outline-none sm:text-sm"
          />
          <button
            type="button"
            onClick={unlock}
            className="shrink-0 text-xs font-medium text-brand-700 underline underline-offset-2 hover:text-brand-800"
          >
            ¿No eres tú?
          </button>
        </div>
        <p className="text-xs text-zinc-400">Guardado en este dispositivo para no pedírtelo cada vez.</p>
      </div>
    );
  }

  return (
    <Field label={label} htmlFor={fieldName} required error={error}>
      <Input
        id={fieldName}
        name={fieldName}
        placeholder={placeholder}
        value={name}
        onChange={(e) => setName(e.target.value)}
      />
    </Field>
  );
}
