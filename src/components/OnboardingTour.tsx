"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { getSessionUserAction } from "@/app/actions";

const SEEN_KEY = "vtb_tour_seen_v1";
const PAD = 8; // aire entre el elemento resaltado y el aro del spotlight

type Step = {
  /** Vacío = paso de bienvenida centrado, sin resaltar nada. */
  selector: string;
  title: string;
  text: string;
  /** Ayuda y hospitales/Mascotas viven detrás de "Más" — este paso necesita
   *  que ese desplegable/hoja esté abierto para poder resaltar el ítem real
   *  en vez del botón "Más" en sí. Se coordina con MobileNav/SiteHeader por
   *  el evento "vtb:tour-set-more". */
  opensMore?: boolean;
};

const INTRO: Step = {
  selector: "",
  title: "Bienvenido a El Mundo Te Busca",
  text: "Una guía rápida para que sepas dónde está todo: personas buscadas, ayuda, mapa y emergencias. Casi todas las listas tienen un botón \"Filtros\" arriba para buscar por región, tipo o cercanía — es el mismo patrón en todo el sitio.",
};

// Barra inferior de móvil (MobileNav.tsx).
const MOBILE_STEPS: Step[] = [
  {
    selector: '[data-tour="mnav-inicio"]',
    title: "Inicio",
    text: "El resumen de la crisis: cambia entre Venezuela y Colombia (las dos tragedias activas hoy) con el selector de país, revisa las noticias verificadas, y toca \"¿Cómo puedo ayudar?\" si quieres ser voluntario digital.",
  },
  {
    selector: '[data-tour="mnav-se-busca"]',
    title: "Se busca",
    text: "Busca a alguien que te falta, o cambia a la pestaña \"¿La reconoces?\" para publicar a quien viste pero no sabes quién es (desliza las tarjetas). Filtra por región, cercanía, o agrupa por hospital.",
  },
  {
    selector: '[data-tour="mnav-comunidad"]',
    title: "Comunidad",
    text: "Pide o da ayuda con 7 tipos de publicación (🆘 necesito, 🤲 ofrezco, 🚨 rescate, 🏥 médico...) y reacciona con 🙏 ❤️ ✅. Los próximos 3 pasos son sus secciones.",
  },
  {
    selector: '[data-tour="mnav-comunidad"]',
    title: "Voluntariado digital",
    text: "Súmate sin salir de casa: comenta, verifica publicaciones, comparte lo que importa. No necesitas estar en el terreno.",
  },
  {
    selector: '[data-tour="mnav-comunidad"]',
    title: "Caravanas benéficas",
    text: "Súmate a una caravana o convoca la tuya: ruta, hora de salida y grupo de WhatsApp para coordinarse. Se puede vincular a un punto de ayuda concreto.",
  },
  {
    selector: '[data-tour="mnav-comunidad"]',
    title: "Denuncias",
    text: "Reporta irregularidades reales: desvío o robo de ayuda, fraude, riesgo de niñez, abuso. Requiere cuenta, para evitar denuncias falsas.",
  },
  {
    selector: '[data-tour="mnav-mapa"]',
    title: "Mapa",
    text: "Zonas afectadas, puntos de ayuda, hospitales y rescates, todo ubicado. Toca el marcador rojo para ver quién falta por localizar en esa zona.",
  },
  {
    selector: '[data-tour="mnav-emergencias"]',
    title: "SOS",
    text: "Líneas de emergencia y qué hacer si estás viviendo la crisis ahora mismo.",
  },
  {
    selector: '[data-tour="mnav-mas-ayuda"]',
    title: "Ayuda y hospitales",
    text: "Puntos de ayuda con nivel por recurso (🔴 urgente/🟡 limitado/🟢 cubierto) y el voto \"Sí hay/Se acabó\" de la comunidad; hospitales con su capacidad y el voto \"¿Tiene insumos?\" — vive detrás de \"Más\".",
    opensMore: true,
  },
  {
    selector: '[data-tour="mnav-mas-mascotas"]',
    title: "Mascotas",
    text: "Perdida, encontrada, en refugio o en veterinario: publica la tuya o revisa si alguien encontró a la que buscas, con foto y ubicación — también detrás de \"Más\".",
    opensMore: true,
  },
  {
    selector: '[data-tour="tour-bell"]',
    title: "Tus avisos",
    text: "Lo que publicaste o guardaste en este dispositivo, con aviso cuando alguien comenta.",
  },
  {
    selector: '[data-tour="tour-account"]',
    title: "Crea una cuenta (opcional)",
    text: "Sin cuenta puedes publicar y comentar igual. Con una cuenta gratis, tu nombre queda verificado y puedes gestionar todo lo que publiques desde un solo lugar.",
  },
];

// Barra superior de escritorio (SiteHeader.tsx).
const DESKTOP_STEPS: Step[] = [
  {
    selector: '[data-tour="dnav-inicio"]',
    title: "Inicio",
    text: "El resumen de la crisis: cambia entre Venezuela y Colombia (las dos tragedias activas hoy) con el selector de país, revisa las noticias verificadas, y haz clic en \"¿Cómo puedo ayudar?\" si quieres ser voluntario digital.",
  },
  {
    selector: '[data-tour="dnav-se-busca"]',
    title: "Se busca",
    text: "Busca a alguien que te falta, o cambia a la pestaña \"¿La reconoces?\" para publicar a quien viste pero no sabes quién es (desliza las tarjetas). Filtra por región, cercanía, o agrupa por hospital.",
  },
  {
    selector: '[data-tour="dnav-comunidad"]',
    title: "Comunidad",
    text: "Pide o da ayuda con 7 tipos de publicación (🆘 necesito, 🤲 ofrezco, 🚨 rescate, 🏥 médico...) y reacciona con 🙏 ❤️ ✅. Los próximos 3 pasos son sus secciones.",
  },
  {
    selector: '[data-tour="dnav-comunidad"]',
    title: "Voluntariado digital",
    text: "Súmate sin salir de casa: comenta, verifica publicaciones, comparte lo que importa. No necesitas estar en el terreno.",
  },
  {
    selector: '[data-tour="dnav-comunidad"]',
    title: "Caravanas benéficas",
    text: "Súmate a una caravana o convoca la tuya: ruta, hora de salida y grupo de WhatsApp para coordinarse. Se puede vincular a un punto de ayuda concreto.",
  },
  {
    selector: '[data-tour="dnav-comunidad"]',
    title: "Denuncias",
    text: "Reporta irregularidades reales: desvío o robo de ayuda, fraude, riesgo de niñez, abuso. Requiere cuenta, para evitar denuncias falsas.",
  },
  {
    selector: '[data-tour="dnav-mapa"]',
    title: "Mapa",
    text: "Zonas afectadas, puntos de ayuda, hospitales y rescates, todo ubicado. Haz clic en el marcador rojo para ver quién falta por localizar en esa zona.",
  },
  {
    selector: '[data-tour="dnav-emergencias"]',
    title: "Emergencias",
    text: "Líneas de emergencia y qué hacer si estás viviendo la crisis ahora mismo.",
  },
  {
    selector: '[data-tour="dnav-mas-ayuda"]',
    title: "Ayuda y hospitales",
    text: "Puntos de ayuda con nivel por recurso (🔴 urgente/🟡 limitado/🟢 cubierto) y el voto \"Sí hay/Se acabó\" de la comunidad; hospitales con su capacidad y el voto \"¿Tiene insumos?\" — vive detrás de \"Más\".",
    opensMore: true,
  },
  {
    selector: '[data-tour="dnav-mas-mascotas"]',
    title: "Mascotas",
    text: "Perdida, encontrada, en refugio o en veterinario: publica la tuya o revisa si alguien encontró a la que buscas, con foto y ubicación — también detrás de \"Más\".",
    opensMore: true,
  },
  {
    selector: '[data-tour="tour-bell"]',
    title: "Tus avisos",
    text: "Lo que publicaste o guardaste en este dispositivo, con aviso cuando alguien comenta.",
  },
  {
    selector: '[data-tour="tour-account"]',
    title: "Crea una cuenta (opcional)",
    text: "Sin cuenta puedes publicar y comentar igual. Con una cuenta gratis, tu nombre queda verificado y puedes gestionar todo lo que publiques desde un solo lugar.",
  },
];

type Rect = { top: number; left: number; width: number; height: number };

function rectOf(el: Element): Rect {
  const r = el.getBoundingClientRect();
  return { top: r.top, left: r.left, width: r.width, height: r.height };
}

/**
 * Guía rápida de bienvenida: overlay que difumina la pantalla y resalta (con
 * un "hueco" tipo spotlight) un elemento de navegación a la vez, con una
 * tarjeta explicando qué hace. Solo aparece sola en la primera visita real
 * (marca en localStorage; se salta si ya hay sesión iniciada, no es un
 * visitante nuevo). El botón "?" que la reabre vive en el header
 * (SiteHeader.tsx, junto a "Entrar") y dispara el evento "vtb:tour-open".
 *
 * Usa DOS secuencias de pasos distintas según el ancho de pantalla al abrir
 * (móvil → ancla a la barra inferior `mnav-*`; escritorio → ancla al header
 * `dnav-*`), porque son literalmente dos navegaciones distintas en el DOM.
 * No se "reparte" a mitad de tour si cambia el ancho (raro, y complicaría
 * medir contra el elemento equivocado) — si el paso deja de encontrar su
 * elemento (por resize, o porque no hay avisos/sesión), se salta solo al
 * siguiente en vez de mostrar un spotlight vacío.
 */
export function OnboardingTour() {
  const [ready, setReady] = useState(false);
  const [open, setOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(true);
  const [stepIndex, setStepIndex] = useState(0);
  const [rect, setRect] = useState<Rect | null>(null);

  useEffect(() => {
    setReady(true);
    let seen = false;
    try {
      seen = localStorage.getItem(SEEN_KEY) === "1";
    } catch {
      /* almacenamiento no disponible (privado/bloqueado) */
    }
    setIsMobile(window.matchMedia("(max-width: 767px)").matches);
    if (seen) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    // En la primerísima visita puede estar abierto el selector de país
    // (CountryIntroModal, mismo criterio de "primera vez" pero solo en el
    // inicio) — esperar a que se cierre antes de arrancar, si no se
    // amontonan dos overlays. Se detecta por cualquier diálogo abierto en
    // vez de acoplarse a esa cookie server-side (leerla aquí forzaría todo
    // el layout a renderizado dinámico).
    const tryOpen = () => {
      if (cancelled) return;
      if (document.querySelector('[role="dialog"]')) {
        timer = setTimeout(tryOpen, 400);
        return;
      }
      setOpen(true);
    };
    (async () => {
      // Alguien con sesión ya iniciada no es un visitante nuevo de verdad
      // (ya conoce el sitio o se registró desde otro dispositivo/sesión
      // anterior) — no se le interrumpe con la guía sola; puede abrirla
      // manual con el botón "?" del header si quiere. Se marca como "vista"
      // para no repetir esta consulta en cada visita siguiente.
      try {
        const user = await getSessionUserAction();
        if (user) {
          try {
            localStorage.setItem(SEEN_KEY, "1");
          } catch {
            /* almacenamiento no disponible */
          }
          return;
        }
      } catch {
        /* sin sesión o sin Supabase: sigue como visitante nuevo normal */
      }
      if (cancelled) return;
      timer = setTimeout(tryOpen, 700);
    })();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, []);

  const steps = useMemo(() => [INTRO, ...(isMobile ? MOBILE_STEPS : DESKTOP_STEPS)], [isMobile]);
  const step = steps[Math.min(stepIndex, steps.length - 1)];

  const finish = useCallback(() => {
    setOpen(false);
    window.dispatchEvent(new CustomEvent("vtb:tour-set-more", { detail: { open: false } }));
    try {
      localStorage.setItem(SEEN_KEY, "1");
    } catch {
      /* almacenamiento no disponible */
    }
  }, []);

  const measure = useCallback(() => {
    if (!step.selector) {
      setRect(null);
      return;
    }
    const el = document.querySelector(step.selector);
    const r = el ? rectOf(el) : null;
    if (!r || r.width === 0 || r.height === 0) {
      // El objetivo no existe ahora mismo (p. ej. la campanita sin nada que
      // mostrar, o la cuenta con sesión ya iniciada): saltar al siguiente
      // paso en vez de dejar un spotlight vacío. Si es el último paso y
      // tampoco existe, se cierra la guía en vez de quedar congelada.
      setStepIndex((i) => {
        if (i < steps.length - 1) return i + 1;
        finish();
        return i;
      });
      return;
    }
    setRect(r);
    if (el) el.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [step, steps.length, finish]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const wantsMore = !!step.opensMore;
    window.dispatchEvent(new CustomEvent("vtb:tour-set-more", { detail: { open: wantsMore } }));

    // Si este paso necesita el desplegable/hoja "Más" abierto, el elemento a
    // resaltar no existe en el DOM justo después de despachar el evento
    // (React tiene que montar el sheet/dropdown primero) — se espera un
    // instante antes de medir, si no `measure()` lo daría por inexistente y
    // saltaría el paso solo.
    let timer: ReturnType<typeof setTimeout> | undefined;
    if (wantsMore) {
      timer = setTimeout(() => {
        if (!cancelled) measure();
      }, 150);
    } else {
      measure();
    }

    const onResize = () => measure();
    window.addEventListener("resize", onResize);
    window.addEventListener("scroll", onResize, true);
    return () => {
      cancelled = true;
      clearTimeout(timer);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("scroll", onResize, true);
    };
  }, [open, step, measure]);

  function next() {
    if (stepIndex >= steps.length - 1) {
      finish();
      return;
    }
    setStepIndex((i) => i + 1);
  }
  function prev() {
    setStepIndex((i) => Math.max(0, i - 1));
  }
  const restart = useCallback(() => {
    setStepIndex(0);
    setIsMobile(window.matchMedia("(max-width: 767px)").matches);
    setOpen(true);
  }, []);

  // El botón "?" que la reabre vive en el header (junto a "Entrar"), no aquí
  // — se coordinan por evento, mismo patrón que ya usa AuthMenu con
  // "vtb:auth-open" para abrirse desde otros componentes sin compartir estado.
  useEffect(() => {
    window.addEventListener("vtb:tour-open", restart);
    return () => window.removeEventListener("vtb:tour-open", restart);
  }, [restart]);

  if (!ready) return null;

  const vw = typeof window !== "undefined" ? window.innerWidth : 375;
  const vh = typeof window !== "undefined" ? window.innerHeight : 800;
  const cardWidth = Math.min(320, vw - 32);

  let cardStyle: React.CSSProperties;
  if (!rect) {
    cardStyle = { top: "50%", left: "50%", transform: "translate(-50%, -50%)" };
  } else {
    const spaceBelow = vh - (rect.top + rect.height);
    const placeBelow = spaceBelow > 170 || spaceBelow > rect.top;
    let left = rect.left + rect.width / 2;
    left = Math.min(Math.max(left, cardWidth / 2 + 16), vw - cardWidth / 2 - 16);
    cardStyle = placeBelow
      ? { top: rect.top + rect.height + PAD + 12, left, transform: "translateX(-50%)" }
      : { bottom: vh - rect.top + PAD + 12, left, transform: "translateX(-50%)" };
  }

  return createPortal(
    <>
      {open && (
        <div className="fixed inset-0 z-[100]" role="dialog" aria-modal="true" aria-label="Guía rápida">
          {/* Bloqueador de interacción: la guía es solo informativa, no deja
              tocar la página de abajo mientras está abierta (evita salir del
              tour por accidente al tocar el elemento resaltado). */}
          <button
            type="button"
            aria-label="Cerrar guía"
            onClick={finish}
            className="absolute inset-0 h-full w-full cursor-default bg-transparent"
          />

          {rect ? (
            <div
              aria-hidden
              className="pointer-events-none absolute rounded-2xl ring-4 ring-brand-400 transition-all duration-300 ease-out"
              style={{
                top: rect.top - PAD,
                left: rect.left - PAD,
                width: rect.width + PAD * 2,
                height: rect.height + PAD * 2,
                boxShadow: "0 0 0 9999px rgba(15, 23, 42, 0.72)",
              }}
            />
          ) : (
            <div aria-hidden className="pointer-events-none absolute inset-0 bg-zinc-900/72" />
          )}

          <div
            className="absolute z-[101] rounded-2xl border border-zinc-200 bg-white p-4 shadow-2xl transition-all duration-300 ease-out"
            style={{ width: cardWidth, ...cardStyle }}
          >
            <div className="mb-1 flex items-center justify-between gap-2">
              <span className="text-[11px] font-bold uppercase tracking-wide text-brand-600">
                {stepIndex + 1}/{steps.length}
              </span>
              <button
                type="button"
                onClick={finish}
                aria-label="Cerrar guía"
                className="press -m-1 rounded-full p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <h3 className="text-base font-bold text-zinc-900">{step.title}</h3>
            <p className="mt-1 text-sm leading-snug text-zinc-600">{step.text}</p>
            <div className="mt-4 flex items-center justify-between gap-2">
              {stepIndex > 0 ? (
                <button
                  type="button"
                  onClick={prev}
                  className="press rounded-lg px-3 py-1.5 text-sm font-semibold text-zinc-500 hover:bg-zinc-100"
                >
                  Atrás
                </button>
              ) : (
                <button
                  type="button"
                  onClick={finish}
                  className="press rounded-lg px-3 py-1.5 text-sm font-semibold text-zinc-500 hover:bg-zinc-100"
                >
                  Saltar
                </button>
              )}
              <button
                type="button"
                onClick={next}
                className="press rounded-xl bg-brand-400 px-4 py-1.5 text-sm font-bold text-zinc-900 hover:bg-brand-300"
              >
                {stepIndex >= steps.length - 1 ? "Entendido" : "Siguiente"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>,
    document.body,
  );
}
