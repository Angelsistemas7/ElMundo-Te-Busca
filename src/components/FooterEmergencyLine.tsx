"use client";

import { useEffect, useState } from "react";
import { getEmergency } from "@/lib/emergency";
import { DEFAULT_COUNTRY, isCountryCode, type CountryCode } from "@/lib/countries";

// El pie de página vive en el layout raíz, que NO puede leer la cookie de país
// en el servidor sin forzar TODO el sitio a renderizado dinámico (ver el
// comentario en `country-server.ts`). Por eso este único bloque (el número de
// emergencia) se resuelve en el cliente leyendo la misma cookie `emb_country`
// que ya usa `CountrySwitcher` — así el resto del layout sigue siendo estático
// y solo este número se ajusta al país activo tras montar.
function readCountryCookie(): CountryCode {
  if (typeof document === "undefined") return DEFAULT_COUNTRY;
  const match = document.cookie.match(/(?:^|; )emb_country=([^;]+)/);
  const value = match ? decodeURIComponent(match[1]) : null;
  return isCountryCode(value) ? value : DEFAULT_COUNTRY;
}

export function FooterEmergencyLine() {
  const [country, setCountry] = useState<CountryCode>(DEFAULT_COUNTRY);

  useEffect(() => {
    setCountry(readCountryCookie());
  }, []);

  const { nationalLine } = getEmergency(country);

  return (
    <a
      href={`tel:${nationalLine.number}`}
      className="press mt-3 flex items-center gap-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 transition hover:bg-rose-100"
    >
      <span className="text-3xl font-extrabold leading-none text-rose-600">{nationalLine.number}</span>
      <span className="text-xs leading-relaxed text-zinc-600">
        <span className="font-semibold text-zinc-800">{nationalLine.label}.</span> Policía, bomberos,
        Protección Civil y ambulancias. Funciona desde cualquier teléfono, las 24 horas.
      </span>
    </a>
  );
}
