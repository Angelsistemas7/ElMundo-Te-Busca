import Link from "next/link";
import { ChevronDown, HelpCircle } from "lucide-react";
import { getEmergency } from "@/lib/emergency";
import type { CountryCode } from "@/lib/countries";

function buildFaqs(country: CountryCode) {
  const { nationalLine } = getEmergency(country);
  return [
  {
    q: "¿Cómo puedo reportar a una persona desaparecida?",
    a: (
      <>
        Desde el botón "Registrar persona" en el inicio, elige "Busco a una persona" si tienes sus
        datos pero no sabes dónde está, o "Vi / encontré a una persona" si la viste pero no la
        identificas del todo. El registro queda visible al instante; recibes un enlace privado para
        editarlo o marcarlo como localizado más adelante.
      </>
    ),
  },
  {
    q: "¿Cómo sé si la información es confiable?",
    a: (
      <>
        Cualquiera puede publicar y todo se ve de inmediato, sin esperar aprobación — así no se
        pierde tiempo en una emergencia. Lo que sí está verificado (estado de una persona, insumos
        de un hospital) lo marca el autor del registro o un moderador del equipo, y queda etiquetado
        como tal. Verifica siempre antes de actuar sobre información sin marcar.
      </>
    ),
  },
  {
    q: "¿Cómo ser voluntario?",
    a: (
      <>
        En la sección{" "}
        <Link href="/voluntarios" className="font-medium text-brand-700 hover:underline">
          Voluntarios
        </Link>{" "}
        puedes registrarte como voluntario digital (ayudar a difundir y verificar desde casa) o de
        campo (apoyo presencial en puntos de ayuda y caravanas).
      </>
    ),
  },
  {
    q: "¿Qué hacer en caso de réplica o emergencia?",
    a: (
      <>
        Consulta la guía rápida y los teléfonos de emergencia en{" "}
        <Link href="/emergencias" className="font-medium text-brand-700 hover:underline">
          Emergencias
        </Link>
        , incluida la {nationalLine.label.toLowerCase()} ({nationalLine.number}). Si ves una situación
        crítica, repórtala de inmediato con el botón "Reportar AHORA".
      </>
    ),
  },
  ];
}

export function FaqAccordion({ country }: { country: CountryCode }) {
  const faqs = buildFaqs(country);
  return (
    <section className="reveal-up rounded-3xl border-2 border-navy-700 bg-white p-5 sm:p-6">
      <h2 className="flex items-center gap-2 text-lg font-bold text-navy-700">
        <HelpCircle className="h-5 w-5 text-brand-500" />
        Preguntas frecuentes
      </h2>
      <p className="mt-1 text-xs text-zinc-500">Resuelve tus dudas aquí</p>

      <div className="mt-4 flex flex-col gap-2">
        {faqs.map(({ q, a }) => (
          <details
            key={q}
            className="group rounded-2xl border border-brand-100 bg-brand-50/50 px-4 py-3 open:bg-brand-50"
          >
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm font-semibold text-navy-700 marker:content-none">
              {q}
              <ChevronDown className="h-4 w-4 shrink-0 text-brand-600 transition-transform group-open:rotate-180" />
            </summary>
            <p className="mt-2 text-sm leading-relaxed text-zinc-600">{a}</p>
          </details>
        ))}
      </div>

      <Link
        href="/comunidad"
        className="press mt-4 flex items-center justify-center rounded-full bg-brand-500 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-600"
      >
        Escríbenos tu pregunta
      </Link>
    </section>
  );
}
