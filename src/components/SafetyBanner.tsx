"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { HeartHandshake, PhoneCall, ShieldAlert, X } from "lucide-react";
import { getEmergency } from "@/lib/emergency";
import { DEFAULT_COUNTRY, isCountryCode, type CountryCode } from "@/lib/countries";
import { Modal } from "./Modal";

// Tres avisos de una sola línea sobre todo el contenido: protección de la
// niñez, emergencia real (lleva a SOS) y voluntariado digital (lleva a la
// misma guía que "¿Cómo puedo ayudar?" del inicio). Antes era un único
// banner con el texto de niñez+911 pegado y sin fecha de reaparición
// (persistía o se ocultaba solo por sesión). Ahora se muestran una vez al
// día por dispositivo: se cierran juntos con la X y vuelven a aparecer al
// día siguiente — es un mensaje importante para recordar, no debe quedar
// oculto para siempre, pero tampoco repetirse en cada carga.
const SEEN_KEY = "vtb_safety_notices_seen_date";

// Igual que en `FooterEmergencyLine`: este banner vive en el layout raíz
// (estático a propósito), así que el país se resuelve en el cliente leyendo
// la cookie `emb_country` en vez de forzar todo el sitio a dinámico.
function readCountryCookie(): CountryCode {
  if (typeof document === "undefined") return DEFAULT_COUNTRY;
  const match = document.cookie.match(/(?:^|; )emb_country=([^;]+)/);
  const value = match ? decodeURIComponent(match[1]) : null;
  return isCountryCode(value) ? value : DEFAULT_COUNTRY;
}

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

export function SafetyBanner() {
  const [visible, setVisible] = useState(false);
  const [country, setCountry] = useState<CountryCode>(DEFAULT_COUNTRY);
  const [childInfoOpen, setChildInfoOpen] = useState(false);

  useEffect(() => {
    setCountry(readCountryCookie());
    let seenDate: string | null = null;
    try {
      seenDate = localStorage.getItem(SEEN_KEY);
    } catch {
      /* almacenamiento no disponible (privado/bloqueado): se muestra igual */
    }
    if (seenDate !== todayStr()) setVisible(true);
  }, []);

  function dismiss() {
    try {
      localStorage.setItem(SEEN_KEY, todayStr());
    } catch {
      /* noop */
    }
    setVisible(false);
  }

  if (!visible) return null;
  const { nationalLine } = getEmergency(country);

  const rowClass =
    "flex flex-1 items-center gap-2.5 py-2 text-left text-xs leading-relaxed sm:text-sm";

  return (
    <>
      <div className="border-b border-amber-300 bg-amber-100/90 text-amber-900">
        <div className="mx-auto flex max-w-6xl items-start gap-2.5 px-4">
          <div className="min-w-0 flex-1 divide-y divide-amber-200/70">
            <button type="button" onClick={() => setChildInfoOpen(true)} className={rowClass}>
              <ShieldAlert className="h-4.5 w-4.5 shrink-0 text-amber-700" />
              <span>
                <strong>Protege a la niñez:</strong> no dejes a niños y niñas solos ni con personas
                que no conoces, ni siquiera en refugios o colas. Toca para más información.
              </span>
            </button>
            <Link href="/emergencias" className={rowClass}>
              <PhoneCall className="h-4.5 w-4.5 shrink-0 text-amber-700" />
              <span>
                <strong>¿Emergencia ahora mismo?</strong> Llama al{" "}
                <span className="font-bold">{nationalLine.number}</span> — toca para ver más líneas
                y qué hacer.
              </span>
            </Link>
            <Link href="/voluntarios/guia" className={rowClass}>
              <HeartHandshake className="h-4.5 w-4.5 shrink-0 text-amber-700" />
              <span>
                <strong>¿Quieres ayudar?</strong> Súmate como voluntario digital, no necesitas estar
                en el terreno.
              </span>
            </Link>
          </div>
          <button
            onClick={dismiss}
            aria-label="Ocultar avisos por hoy"
            className="press mt-2 -mr-1 shrink-0 rounded p-1 text-amber-700 hover:bg-amber-200 hover:text-amber-900"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      <Modal open={childInfoOpen} onClose={() => setChildInfoOpen(false)} title="Protege a la niñez">
        <p className="text-sm leading-relaxed text-zinc-600">
          No dejes a niños y niñas solos ni con personas que no conoces, ni siquiera en refugios,
          colas o durante traslados. Mantenlos siempre con un familiar o un adulto de confianza que
          puedas identificar.
        </p>
        <p className="mt-3 text-sm leading-relaxed text-zinc-600">
          Si ves a un menor solo, en riesgo, o algo que te parezca sospechoso, llama de inmediato al{" "}
          <a href={`tel:${nationalLine.number}`} className="font-bold text-amber-800 underline">
            {nationalLine.number}
          </a>{" "}
          — {nationalLine.label}.
        </p>
      </Modal>
    </>
  );
}
