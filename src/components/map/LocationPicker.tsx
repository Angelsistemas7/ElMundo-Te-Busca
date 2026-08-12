"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { Crosshair, Loader2, MapPin, X } from "lucide-react";
import { Modal } from "../Modal";

const PickerMap = dynamic(() => import("./LocationPickerMap"), {
  ssr: false,
  loading: () => (
    <div className="flex h-64 w-full items-center justify-center rounded-xl bg-zinc-100 text-sm text-zinc-400">
      Cargando mapa…
    </div>
  ),
});

// Selector de ubicación: un botón con ícono de mapa abre una ventana donde
// tocas el mapa para soltar el pin, lo arrastras, o usas tu GPS — en vez de
// tener el mapa siempre desplegado ocupando espacio del formulario. Escribe
// lat/lng en inputs ocultos para que el formulario los envíe, así el punto
// queda exactamente donde es, sin aproximaciones que caigan al mar.
export function LocationPicker({
  defaultCenter = [10.601, -66.931], // La Guaira
}: {
  defaultCenter?: [number, number];
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<[number, number] | null>(null);
  const [draft, setDraft] = useState<[number, number] | null>(null);
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function openModal() {
    setDraft(pos);
    setError(null);
    setOpen(true);
  }

  function confirm() {
    setPos(draft);
    setOpen(false);
  }

  function useMyLocation() {
    setError(null);
    if (!("geolocation" in navigator)) {
      setError("Tu dispositivo no permite ubicación.");
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setDraft([p.coords.latitude, p.coords.longitude]);
        setLocating(false);
      },
      () => {
        setError("No se pudo obtener tu ubicación. Márcala tocando el mapa.");
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={openModal}
        className="press inline-flex items-center gap-1.5 rounded-lg border border-zinc-300 px-3 py-1.5 text-xs font-semibold text-zinc-700 transition hover:bg-zinc-50"
      >
        <MapPin className="h-3.5 w-3.5" />
        {pos ? "Editar lugar exacto en el mapa" : "Marcar lugar exacto en el mapa"}
      </button>
      {pos ? (
        <>
          <span className="text-xs text-emerald-700">Marcado ✓</span>
          <button
            type="button"
            onClick={() => setPos(null)}
            className="press inline-flex items-center gap-1 text-xs font-medium text-rose-600 transition hover:underline"
          >
            <X className="h-3 w-3" />
            Quitar
          </button>
        </>
      ) : (
        <span className="text-xs text-zinc-400">Opcional, ayuda a ubicar con precisión.</span>
      )}

      <input type="hidden" name="lat" value={pos?.[0] ?? ""} readOnly />
      <input type="hidden" name="lng" value={pos?.[1] ?? ""} readOnly />

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Marca el lugar exacto"
        subtitle="Toca el mapa para soltar el pin, arrástralo, o usa tu GPS."
        footer={
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="press rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-600 hover:bg-zinc-50"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={confirm}
              className="press rounded-lg bg-brand-500 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-600"
            >
              Usar este lugar
            </button>
          </div>
        }
      >
        <div className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="inline-flex items-center gap-1 text-xs text-zinc-500">
              {draft ? `Marcado: ${draft[0].toFixed(5)}, ${draft[1].toFixed(5)}` : "Sin marcar todavía"}
            </span>
            <button
              type="button"
              onClick={useMyLocation}
              disabled={locating}
              className="press inline-flex items-center gap-1.5 rounded-lg border border-zinc-300 px-3 py-1.5 text-xs font-semibold text-zinc-700 transition hover:bg-zinc-50 disabled:opacity-60"
            >
              {locating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Crosshair className="h-3.5 w-3.5" />}
              Usar mi ubicación
            </button>
          </div>

          <PickerMap value={draft} center={pos ?? defaultCenter} onChange={(lat, lng) => setDraft([lat, lng])} />

          {error && <p className="text-xs text-rose-600">{error}</p>}
        </div>
      </Modal>
    </div>
  );
}
