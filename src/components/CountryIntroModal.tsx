"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { setActiveCountryAction } from "@/app/actions";
import { COUNTRIES, COUNTRY_CODES, DEFAULT_COUNTRY, type CountryCode } from "@/lib/countries";
import { Modal } from "./Modal";

/**
 * Pantalla de bienvenida: aparece SOLO en la primera visita (sin cookie de
 * país), para que quede clarísimo que la plataforma cubre dos tragedias
 * distintas — el banner de `CountrySwitcher` en el header pasaba
 * desapercibido. Elegir un país (o cerrar sin elegir, que equivale a quedarse
 * con Venezuela, el mismo valor por defecto que ya tenía el sitio) deja la
 * cookie puesta, así que no vuelve a aparecer en visitas siguientes.
 */
export function CountryIntroModal({ initialOpen }: { initialOpen: boolean }) {
  const [open, setOpen] = useState(initialOpen);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function choose(code: CountryCode) {
    if (isPending) return;
    startTransition(async () => {
      await setActiveCountryAction(code);
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <Modal
      open={open}
      onClose={() => choose(DEFAULT_COUNTRY)}
      title="¿Qué tragedia quieres ver?"
      subtitle="Elige el país: verás sus personas buscadas, mapa, ayuda y noticias. Puedes cambiarlo cuando quieras desde la portada."
    >
      <div className="grid gap-3 sm:grid-cols-2">
        {COUNTRY_CODES.map((code) => {
          const c = COUNTRIES[code];
          return (
            <button
              key={code}
              type="button"
              disabled={isPending}
              onClick={() => choose(code)}
              className="tap-card flex flex-col items-center gap-2 rounded-2xl border-2 border-zinc-200 bg-white p-6 text-center transition hover:border-navy-700 hover:bg-navy-50 disabled:opacity-50"
            >
              <span className="text-5xl leading-none">{c.flag}</span>
              <span className="text-base font-bold text-navy-700">{c.name}</span>
              <span className="text-xs leading-relaxed text-zinc-500">
                Terremoto M{c.quakeInfo.magnitude}
                <br />
                {c.quakeInfo.date}
              </span>
            </button>
          );
        })}
      </div>
      <p className="mt-4 text-center text-xs text-zinc-400">
        Ambas crisis siguen activas en la plataforma — elegir una no oculta la otra.
      </p>
    </Modal>
  );
}
