"use client";

import { useEffect, useState } from "react";
import { ShieldAlert, X } from "lucide-react";
import { getEmergency } from "@/lib/emergency";
import { DEFAULT_COUNTRY, isCountryCode, type CountryCode } from "@/lib/countries";

// Barra fija de seguridad para toda la página: protección de la niñez.
// Mensaje siempre visible (se puede ocultar). Es lo más importante de recordar
// en la emergencia, por eso va sobre todo el contenido.

// Igual que en `FooterEmergencyLine`: este banner vive en el layout raíz
// (estático a propósito), así que el número se resuelve en el cliente leyendo
// la cookie `emb_country` en vez de forzar todo el sitio a dinámico.
function readCountryCookie(): CountryCode {
  if (typeof document === "undefined") return DEFAULT_COUNTRY;
  const match = document.cookie.match(/(?:^|; )emb_country=([^;]+)/);
  const value = match ? decodeURIComponent(match[1]) : null;
  return isCountryCode(value) ? value : DEFAULT_COUNTRY;
}

export function SafetyBanner() {
  // Visible por defecto. Al cerrarla queda oculta solo mientras dura la vista;
  // reaparece al recargar o al volver a entrar (el cierre no se persiste). Es un
  // mensaje crítico de seguridad: no debe quedar oculto para siempre.
  const [hidden, setHidden] = useState(false);
  const [country, setCountry] = useState<CountryCode>(DEFAULT_COUNTRY);

  useEffect(() => {
    setCountry(readCountryCookie());
  }, []);

  if (hidden) return null;
  const { nationalLine } = getEmergency(country);

  return (
    <div className="border-b border-amber-300 bg-amber-100/90 text-amber-900">
      <div className="mx-auto flex max-w-6xl items-start gap-2.5 px-4 py-2">
        <ShieldAlert className="mt-0.5 h-4.5 w-4.5 shrink-0 text-amber-700" />
        <p className="flex-1 text-xs leading-relaxed sm:text-sm">
          <strong>Protege a la niñez:</strong> no dejes a niños y niñas solos ni con personas que no
          conoces, ni siquiera en refugios o colas. Mantenlos con un familiar o adulto de confianza.
          Si ves a un menor solo o algo sospechoso, llama al{" "}
          <a href={`tel:${nationalLine.number}`} className="font-bold underline">
            {nationalLine.number}
          </a>
          .
        </p>
        <button
          onClick={() => setHidden(true)}
          aria-label="Ocultar aviso"
          className="press -mr-1 rounded p-1 text-amber-700 hover:bg-amber-200 hover:text-amber-900"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
