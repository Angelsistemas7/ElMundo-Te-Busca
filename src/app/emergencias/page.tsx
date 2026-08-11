import { ChevronDown, ExternalLink, Info, LayoutGrid, LifeBuoy, Phone, ShieldCheck } from "lucide-react";
import { COMMUNITY_GUIDE, getEmergency } from "@/lib/emergency";
import { RECURSOS } from "@/lib/recursos";
import { ShareWhatsApp } from "@/components/ShareWhatsApp";
import { PageHeader } from "@/components/PageHeader";
import { getActiveCountry } from "@/lib/country-server";

// Los teléfonos de emergencia dependen del país activo (911 en Venezuela,
// 123 en Colombia), así que esta página SÍ necesita leer la cookie de país
// en cada visita — a diferencia del resto del texto fijo, que antes permitía
// que Next generara la página una sola vez. El costo (una lectura de cookie,
// sin consultas a la base de datos) es mínimo comparado con mostrar el
// teléfono equivocado en una página de emergencias.
export const dynamic = "force-dynamic";

export const metadata = {
  title: "Emergencia y seguridad",
  description: "Teléfonos de emergencia, guía rápida para la comunidad y cómo difundir la página.",
};

export default async function EmergenciasPage() {
  const country = await getActiveCountry();
  const { nationalLine: NATIONAL_LINE, groups: PHONE_GROUPS } = getEmergency(country);
  return (
    <div className="mx-auto max-w-3xl px-4 py-6">
      <div className="mb-6">
        <PageHeader
          icon={LifeBuoy}
          tone="rose"
          title={
            <>
              Emergencia y <span className="text-brand-500">seguridad</span>
            </>
          }
          description="Teléfonos útiles, qué hacer en las primeras horas y cómo ayudar a difundir."
        />
      </div>

      {/* Línea única nacional */}
      <a
        href={`tel:${NATIONAL_LINE.number}`}
        className="press flex items-center gap-4 rounded-2xl border border-rose-200 bg-rose-50 px-5 py-4 transition hover:bg-rose-100"
      >
        <span className="text-4xl font-extrabold leading-none text-rose-600 sm:text-5xl">
          {NATIONAL_LINE.number}
        </span>
        <span className="text-sm leading-relaxed text-zinc-700">
          <span className="font-semibold text-zinc-900">{NATIONAL_LINE.label}.</span> Policía,
          bomberos, Protección Civil y ambulancias. Desde cualquier teléfono, 24 horas.
        </span>
      </a>

      {/* Compartir */}
      <div className="mt-5 rounded-2xl border border-emerald-200 bg-emerald-50/60 p-4">
        <p className="text-sm font-medium text-emerald-900">
          Entre más personas vean esta página, más personas pueden estar a salvo. Compártela:
        </p>
        <div className="mt-3">
          <ShareWhatsApp />
        </div>
      </div>

      {/* Directorio de plataformas externas: antes vivía en /recursos, ahora es
          una tarjeta expandible aquí mismo — un destino menos que mantener. */}
      <details className="group mt-5 rounded-2xl border border-zinc-200 bg-white open:pb-4">
        <summary className="tap-card flex cursor-pointer list-none items-center gap-3 px-5 py-4 marker:content-none">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-zinc-900 text-white">
            <LayoutGrid className="h-5 w-5" />
          </span>
          <span className="flex-1">
            <span className="block font-semibold text-zinc-900">Otras plataformas y recursos</span>
            <span className="block text-sm text-zinc-500">
              Iniciativas de terceros: búsqueda de personas, donaciones, apoyo psicosocial y más.
            </span>
          </span>
          <ChevronDown className="h-5 w-5 shrink-0 text-zinc-400 transition-transform group-open:rotate-180" />
        </summary>

        <div className="border-t border-zinc-100 px-5 pt-4">
          <div className="mb-5 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
            <Info className="mt-0.5 h-4 w-4 shrink-0" />
            <p>
              Estos enlaces llevan a sitios de terceros. <strong>Verifica siempre</strong> la
              información antes de donar o actuar; no respondemos por plataformas ajenas.
            </p>
          </div>

          <div className="space-y-6">
            {RECURSOS.map((grupo) => (
              <section key={grupo.categoria}>
                <h3 className="mb-2 flex items-center gap-2 text-sm font-bold text-zinc-900">
                  <span>{grupo.emoji}</span>
                  {grupo.categoria}
                </h3>
                <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                  {grupo.items.map((r) => {
                    const inner = (
                      <>
                        <div className="flex items-start justify-between gap-2">
                          <span className="text-sm font-semibold text-zinc-900">{r.name}</span>
                          {r.url && (
                            <ExternalLink className="mt-0.5 h-3.5 w-3.5 shrink-0 text-zinc-300 group-hover:text-brand-600" />
                          )}
                        </div>
                        <p className="mt-1 text-xs text-zinc-600">{r.description}</p>
                        {r.note && <p className="mt-1 text-xs text-zinc-400">{r.note}</p>}
                      </>
                    );
                    return r.url ? (
                      <a
                        key={r.name}
                        href={r.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="tap-card group rounded-xl border border-zinc-200 bg-zinc-50/60 p-3"
                      >
                        {inner}
                      </a>
                    ) : (
                      <div key={r.name} className="rounded-xl border border-zinc-200 bg-zinc-50/60 p-3">
                        {inner}
                      </div>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>

          <p className="mt-5 text-center text-xs text-zinc-400">
            ¿Conoces una iniciativa verificable que falte aquí?{" "}
            <a
              href="mailto:atencionsentralabs@gmail.com?subject=Sugerencia%20de%20recurso"
              className="press font-medium text-brand-700 transition hover:underline"
            >
              Escríbenos
            </a>{" "}
            y la evaluamos.
          </p>
        </div>
      </details>

      {/* Directorios de teléfonos */}
      {PHONE_GROUPS.map((group) => (
        <section key={group.title} className="mt-6">
          <h2 className="flex items-center gap-2 font-bold text-zinc-900">
            <Phone className="h-4.5 w-4.5 text-zinc-500" />
            {group.title}
          </h2>
          {group.note && <p className="mt-0.5 text-xs text-zinc-500">{group.note}</p>}
          <ul className="mt-3 divide-y divide-zinc-100 overflow-hidden rounded-2xl border border-zinc-200 bg-white">
            {group.entries.map((e) => (
              <li key={e.name} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
                <span className="text-sm font-medium text-zinc-800">{e.name}</span>
                <span className="flex flex-wrap gap-2">
                  {e.phones.map((p) => (
                    <a
                      key={p}
                      href={`tel:${p.replace(/[^+\d]/g, "")}`}
                      className="press rounded-lg bg-zinc-100 px-2.5 py-1 text-xs font-semibold text-brand-700 transition hover:bg-zinc-200"
                    >
                      {p}
                    </a>
                  ))}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ))}

      <p className="mt-3 text-xs text-zinc-400">
        Los teléfonos por organismo son de referencia y pueden cambiar. Ante una emergencia médica o
        de rescate, llama siempre a los organismos oficiales ({NATIONAL_LINE.number}).
      </p>

      {/* Guía rápida para la comunidad */}
      <section className="mt-8">
        <h2 className="flex items-center gap-2 font-bold text-zinc-900">
          <ShieldCheck className="h-5 w-5 text-emerald-600" />
          Guía rápida para la comunidad
        </h2>
        <p className="mt-1 text-sm text-zinc-500">
          Acciones esenciales en las primeras horas. Compártelas con tus vecinos y grupos de chat.
        </p>
        <ol className="mt-3 space-y-2">
          {COMMUNITY_GUIDE.map((step, i) => (
            <li
              key={i}
              className="flex items-start gap-3 rounded-xl border border-zinc-200 bg-white px-4 py-3"
            >
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-zinc-900 text-xs font-bold text-white">
                {i + 1}
              </span>
              <span className="text-sm text-zinc-700">{step}</span>
            </li>
          ))}
        </ol>
        <div className="mt-4">
          <ShareWhatsApp />
        </div>
      </section>
    </div>
  );
}
