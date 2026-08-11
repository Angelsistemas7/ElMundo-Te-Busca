"use client";

import dynamic from "next/dynamic";
import { Loader2 } from "lucide-react";
import { SwipeHintRowOnce } from "../SwipeHint";
import type {
  AidMarker,
  HelpMarker,
  HospitalMarker,
  MarchMarker,
  NeedMarker,
  PersonMarker,
  RescueMarker,
  Zone,
} from "./MapView";

// Leaflet usa `window`, por eso el mapa se carga solo en el cliente.
const MapView = dynamic(() => import("./MapView"), {
  ssr: false,
  loading: () => (
    <div className="flex h-[68vh] min-h-[460px] w-full items-center justify-center rounded-2xl bg-zinc-100">
      <Loader2 className="h-6 w-6 animate-spin text-zinc-400" />
    </div>
  ),
});

export function CrisisMap({
  zones,
  aidPoints,
  marches,
  hospitals,
  rescues,
  needs,
  helps,
  persons,
  epicenter,
  center,
  zoom,
}: {
  zones: Zone[];
  aidPoints: AidMarker[];
  marches: MarchMarker[];
  hospitals: HospitalMarker[];
  rescues: RescueMarker[];
  needs: NeedMarker[];
  helps: HelpMarker[];
  persons: PersonMarker[];
  epicenter?: [number, number] | null;
  center: [number, number];
  zoom?: number;
}) {
  return (
    <div className="space-y-3">
      <div className="relative z-0 overflow-hidden rounded-2xl border border-zinc-200 shadow-sm">
        <MapView
          zones={zones}
          aidPoints={aidPoints}
          marches={marches}
          hospitals={hospitals}
          rescues={rescues}
          needs={needs}
          helps={helps}
          persons={persons}
          epicenter={epicenter}
          center={center}
          zoom={zoom}
        />
      </div>

      <p className="text-xs text-zinc-500">
        Toca el panel de capas (arriba a la derecha del mapa) para mostrar u ocultar cada tipo:
        🆘 Necesito ayuda, 🤲 Puedo ayudar, rescates, puntos, hospitales y más.
      </p>

      {/* Fila horizontal deslizable (igual que "Se busca"): en móvil, apilar estos
          9 íconos en varias líneas se veía muy saturado. Empujoncito breve para
          insinuar que se puede deslizar. */}
      <SwipeHintRowOnce className="no-scrollbar flex items-center gap-x-4 overflow-x-auto pb-1 text-sm text-zinc-600">
        <span className="flex shrink-0 items-center gap-1.5">
          <span className="flex h-4 w-4 items-center justify-center text-[12px] text-amber-900">⊕</span>
          Epicentro
        </span>
        <span className="flex shrink-0 items-center gap-1.5">
          <span className="inline-block h-4 w-4 rounded-full border-2 border-white bg-rose-600 shadow" />
          🆘 Necesito ayuda
        </span>
        <span className="flex shrink-0 items-center gap-1.5">
          <span className="inline-block h-4 w-4 rounded-full border-2 border-white bg-emerald-600 shadow" />
          🤲 Puedo ayudar
        </span>
        <span className="flex shrink-0 items-center gap-1.5">
          <span className="inline-block h-4 w-4 rounded-full border-2 border-white bg-violet-500 shadow" />
          👤 Persona vista
        </span>
        <span className="flex shrink-0 items-center gap-1.5">
          <span className="flex h-4 w-4 items-center justify-center rounded-full border-2 border-white bg-red-600 text-[9px] shadow">
            🚨
          </span>
          Rescate urgente
        </span>
        <span className="flex shrink-0 items-center gap-1.5">
          <span className="flex h-4 w-4 items-center justify-center rounded-full border-2 border-white bg-rose-600 text-[8px] font-bold text-white shadow">
            N
          </span>
          Zona afectada
        </span>
        <span className="flex shrink-0 items-center gap-1.5">
          <span className="inline-block h-4 w-4 rounded-full border-2 border-white bg-brand-500 shadow" />
          Punto de ayuda
        </span>
        <span className="flex shrink-0 items-center gap-1.5">
          <span className="inline-block h-4 w-4 rounded-full border-2 border-white bg-sky-500 shadow" />
          Salida de caravana
        </span>
        <span className="flex shrink-0 items-center gap-1.5">
          <span className="inline-block h-4 w-4 rounded-full border-2 border-white bg-emerald-500 shadow" />
          Hospital
        </span>
      </SwipeHintRowOnce>
    </div>
  );
}
