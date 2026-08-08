"use client";

import { useRef, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { Loader2, Trash2, UserCircle2 } from "lucide-react";
import { updateAvatarAction } from "@/app/actions";
import { uploadPhoto } from "@/lib/upload";
import { compressImage } from "@/lib/image";

// Foto de perfil: opcional (pediste que se pudiera subir, pero no obligatoria).
// Sin foto, se ve el ícono genérico de siempre — nada cambia para quien no
// quiera subir una.
export function AvatarUpload({ initialUrl }: { initialUrl: string | null }) {
  const router = useRouter();
  const [url, setUrl] = useState(initialUrl);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function onChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const compressed = await compressImage(file);
      const uploaded = await uploadPhoto(compressed);
      if (!uploaded) throw new Error("No se pudo subir la foto.");
      const res = await updateAvatarAction(uploaded);
      if (!res.ok) throw new Error("No se pudo guardar la foto.");
      setUrl(uploaded);
      router.refresh();
    } catch {
      setError("No se pudo subir la foto. Intenta de nuevo.");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function remove() {
    setBusy(true);
    setError(null);
    try {
      const res = await updateAvatarAction(null);
      if (res.ok) {
        setUrl(null);
        router.refresh();
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex shrink-0 flex-col items-center gap-1.5">
      <button
        onClick={() => inputRef.current?.click()}
        disabled={busy}
        className="press relative flex h-16 w-16 items-center justify-center overflow-hidden rounded-full bg-zinc-100 ring-2 ring-white transition hover:opacity-90 disabled:opacity-60"
        aria-label="Cambiar foto de perfil"
      >
        {busy ? (
          <Loader2 className="h-6 w-6 animate-spin text-zinc-400" />
        ) : url ? (
          <Image src={url} alt="" fill sizes="64px" className="object-cover" />
        ) : (
          <UserCircle2 className="h-10 w-10 text-zinc-400" />
        )}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={onChange}
      />
      <div className="flex items-center gap-2">
        <button
          onClick={() => inputRef.current?.click()}
          disabled={busy}
          className="press text-xs font-medium text-brand-700 hover:underline disabled:opacity-60"
        >
          {url ? "Cambiar" : "Subir foto"}
        </button>
        {url && (
          <button
            onClick={remove}
            disabled={busy}
            className="press flex items-center gap-1 text-xs font-medium text-rose-600 hover:underline disabled:opacity-60"
          >
            <Trash2 className="h-3 w-3" />
            Quitar
          </button>
        )}
      </div>
      {error && <p className="text-[11px] font-medium text-rose-600">{error}</p>}
    </div>
  );
}
