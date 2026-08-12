"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Bell, Globe2 } from "lucide-react";
import { setActiveCountryAction } from "@/app/actions";
import {
  AMERICAS_COUNTRIES,
  COUNTRIES,
  DEFAULT_COUNTRY,
  isCountryCode,
  type CountryCode,
} from "@/lib/countries";
import { cn } from "@/lib/utils";
import { Modal } from "./Modal";
import { FlagIcon } from "./FlagIcon";

/**
 * Pantalla de bienvenida: aparece SOLO en la primera visita (sin cookie de
 * país), para que quede clarísimo que la plataforma cubre dos tragedias
 * distintas — el banner de `CountrySwitcher` en el header pasaba
 * desapercibido. Elegir un país (o cerrar sin elegir, que equivale a quedarse
 * con Venezuela, el mismo valor por defecto que ya tenía el sitio) deja la
 * cookie puesta, así que no vuelve a aparecer en visitas siguientes.
 *
 * La lista mostrada es TODA América (`AMERICAS_COUNTRIES`), no solo los
 * países activos: así cualquier visitante de la región ve que la plataforma
 * existe. Elegir un país sin emergencia activa no toca la cookie — muestra
 * un aviso ("aún no activo") con la opción de entrar igual a Venezuela o
 * Colombia.
 */
export function CountryIntroModal({ initialOpen }: { initialOpen: boolean }) {
  const [open, setOpen] = useState(initialOpen);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  // Código del país "aún no activo" que el usuario tocó (para mostrar el
  // aviso); null = mostrando la grilla de selección.
  const [inactiveTapped, setInactiveTapped] = useState<{ code: string; name: string } | null>(null);

  function choose(code: CountryCode) {
    if (isPending) return;
    startTransition(async () => {
      await setActiveCountryAction(code);
      setOpen(false);
      router.refresh();
    });
  }

  function tap(code: string, name: string) {
    if (isCountryCode(code)) {
      choose(code);
      return;
    }
    setInactiveTapped({ code, name });
  }

  return (
    <Modal
      open={open}
      onClose={() => choose(DEFAULT_COUNTRY)}
      title={inactiveTapped ? inactiveTapped.name : "¿Qué tragedia quieres ver?"}
      subtitle={
        inactiveTapped
          ? undefined
          : "Elige tu país: verás sus personas buscadas, mapa, ayuda y noticias. Puedes cambiarlo cuando quieras desde la portada."
      }
    >
      {inactiveTapped ? (
        <div className="flex flex-col items-center gap-4 py-2 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-zinc-100 text-zinc-400">
            <Bell className="h-6 w-6" />
          </div>
          <div>
            <p className="font-bold text-zinc-900">Todavía no hay una emergencia activa aquí</p>
            <p className="mt-1 text-sm text-zinc-500">
              Por ahora la plataforma solo cubre Venezuela y Colombia. En cuanto {inactiveTapped.name} tenga una
              activación, aparecerá aquí con su propio mapa, personas buscadas y ayuda.
            </p>
          </div>
          <div className="mt-2 flex w-full flex-col gap-2 sm:flex-row">
            <button
              type="button"
              onClick={() => choose("ve")}
              disabled={isPending}
              className="tap-card flex flex-1 items-center justify-center gap-2 rounded-xl border-2 border-zinc-200 bg-white py-3 text-sm font-bold text-navy-700 transition hover:border-navy-700 disabled:opacity-50"
            >
              <FlagIcon code="ve" className="h-5 w-7 rounded shadow-sm" />
              Ver Venezuela
            </button>
            <button
              type="button"
              onClick={() => choose("co")}
              disabled={isPending}
              className="tap-card flex flex-1 items-center justify-center gap-2 rounded-xl border-2 border-zinc-200 bg-white py-3 text-sm font-bold text-navy-700 transition hover:border-navy-700 disabled:opacity-50"
            >
              <FlagIcon code="co" className="h-5 w-7 rounded shadow-sm" />
              Ver Colombia
            </button>
          </div>
          <button
            type="button"
            onClick={() => setInactiveTapped(null)}
            className="press text-sm font-semibold text-zinc-500 hover:text-zinc-700"
          >
            ← Volver a la lista de países
          </button>
        </div>
      ) : (
        <>
          <div className="mb-4 flex items-start gap-2.5 rounded-2xl bg-brand-50 px-3.5 py-3 shadow-sm">
            <Globe2 className="mt-0.5 h-4 w-4 shrink-0 text-brand-600" />
            <p className="text-xs leading-snug text-brand-800">
              Por ahora <strong>Venezuela</strong> y <strong>Colombia</strong> (resaltados abajo) son los dos
              únicos países activos. La plataforma nació para ayudar a localizar personas desaparecidas y, a
              futuro, se piensa sumar más países ante cualquier desastre natural o tragedia que lo amerite —
              no solo terremotos.
            </p>
          </div>
          <div className="grid grid-cols-3 gap-2.5 sm:grid-cols-4">
            {AMERICAS_COUNTRIES.map(({ code, name }) => {
              const active = isCountryCode(code);
              return (
                <button
                  key={code}
                  type="button"
                  disabled={isPending}
                  onClick={() => tap(code, name)}
                  className={cn(
                    "tap-card flex flex-col items-center gap-1.5 rounded-2xl border-2 p-3 text-center transition disabled:opacity-50",
                    active
                      ? "border-brand-400 bg-brand-50/70 shadow-sm hover:border-brand-500"
                      : "border-zinc-200 bg-white hover:border-navy-700 hover:bg-navy-50",
                  )}
                >
                  {active ? (
                    <FlagIcon code={code} className="h-8 w-11 rounded-md shadow-sm" />
                  ) : (
                    <span className="flex h-8 w-11 items-center justify-center rounded-md bg-zinc-100 text-[10px] font-bold uppercase text-zinc-400">
                      {code}
                    </span>
                  )}
                  <span className="text-xs font-bold leading-tight text-navy-700">{name}</span>
                  {active && (
                    <span className="rounded-full bg-brand-400 px-1.5 py-0.5 text-[9px] font-bold uppercase leading-none text-zinc-900">
                      Activo · M{COUNTRIES[code].quakeInfo.magnitude}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
          <p className="mt-4 text-center text-xs text-zinc-400">
            Ambas crisis siguen activas en la plataforma — elegir una no oculta la otra.
          </p>
        </>
      )}
    </Modal>
  );
}
