import Link from "next/link";
import { ArrowRight, HandHeart, MessageSquareText, ShieldCheck, Stethoscope } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";

export const metadata = {
  title: "¿Cómo puedo ayudar? — El Mundo Te Busca",
  description: "Qué es un voluntario digital y cómo empezar a ayudar en la plataforma.",
};

// Página de entrada de "¿Cómo puedo ayudar?" (antes iba directo a Comunidad).
// Explica qué es un voluntario digital ANTES de mandar al formulario, porque
// no todos los que llegan aquí saben qué implica -- y separa las dos formas
// reales de ayudar que existen hoy: aparecer en el directorio público de
// voluntarios, o pedir permiso para mantener actualizado un hospital/punto de
// ayuda concreto (lo revisa un admin, ver /voluntarios/solicitar-gestor).
export default function VolunteerGuidePage() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <PageHeader
        icon={HandHeart}
        tone="emerald"
        title="¿Cómo puedo ayudar?"
        description="No hace falta ser rescatista para salvar vidas aquí. Un voluntario digital ayuda desde donde esté."
      />

      <div className="mt-8 space-y-4">
        <div className="flex gap-3 rounded-2xl border border-zinc-200 bg-white p-4">
          <MessageSquareText className="mt-0.5 h-5 w-5 shrink-0 text-brand-500" />
          <div>
            <h2 className="font-semibold text-zinc-900">¿Qué es un voluntario digital?</h2>
            <p className="mt-1 text-sm text-zinc-600">
              Alguien que ayuda a distancia, sin estar en la zona del desastre: comparte y verifica
              información, responde a quien pregunta por un punto de ayuda, avisa si algo cambió, o
              difunde publicaciones de personas desaparecidas para que lleguen a más gente. No
              necesitas experiencia previa ni estar físicamente en Venezuela o Colombia.
            </p>
          </div>
        </div>

        <div className="flex gap-3 rounded-2xl border border-zinc-200 bg-white p-4">
          <Stethoscope className="mt-0.5 h-5 w-5 shrink-0 text-brand-500" />
          <div>
            <h2 className="font-semibold text-zinc-900">¿Y si estoy en un hospital o punto de ayuda?</h2>
            <p className="mt-1 text-sm text-zinc-600">
              Si trabajas o colaboras en un hospital o un punto de ayuda concreto, puedes pedir
              permiso para mantener su información actualizada tú mismo (insumos, disponibilidad,
              estado). Un moderador revisa esa solicitud antes de darte el acceso — no es automático,
              para que nadie pueda hacerse pasar por un lugar que no es suyo.
            </p>
          </div>
        </div>

        <div className="flex gap-3 rounded-2xl border border-zinc-200 bg-white p-4">
          <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-brand-500" />
          <div>
            <h2 className="font-semibold text-zinc-900">¿Qué gano yo con esto?</h2>
            <p className="mt-1 text-sm text-zinc-600">
              Nada más que ayudar a que la información sea real y esté actualizada. Es una
              plataforma ciudadana sin fines de lucro — nadie cobra por participar.
            </p>
          </div>
        </div>
      </div>

      <div className="mt-8 space-y-3">
        <Link
          href="/voluntarios?registrar=1"
          className="press flex items-center justify-between rounded-2xl bg-brand-500 px-5 py-4 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-600"
        >
          Quiero ser voluntario digital
          <ArrowRight className="h-4 w-4" />
        </Link>
        <Link
          href="/voluntarios/solicitar-gestor"
          className="press flex items-center justify-between rounded-2xl border border-zinc-300 bg-white px-5 py-4 text-sm font-semibold text-zinc-700 transition hover:bg-zinc-50"
        >
          Quiero gestionar un hospital o punto de ayuda
          <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
    </div>
  );
}
