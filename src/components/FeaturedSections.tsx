import Link from "next/link";
import { ArrowRight, Baby, Clock, GraduationCap, PersonStanding, Sparkles, User, Users } from "lucide-react";
import { getFeaturedPersons, type getPersons } from "@/lib/data";
import { PersonCard } from "./PersonCard";

// Secciones curadas del inicio: agrupan a las personas por grupo de edad para
// que ninguna quede enterrada bajo miles de registros. Cada sección muestra
// una vista previa y un enlace "Ver todos".

type SectionDef = {
  key: string;
  title: string;
  subtitle: string;
  icon: React.ComponentType<{ className?: string }>;
  href: string;
  query: Parameters<typeof getPersons>[0];
};

// Genera las 6 secciones para una vista dada: "Se busca" (personas con datos,
// excludeUnidentified) o "¿La reconoces?" (avistamientos, unidentifiedOnly).
// Los enlaces "Ver todos" llevan el `view` correspondiente para no perder el
// filtro al entrar al listado completo.
function buildSections(unidentified: boolean): SectionDef[] {
  const viewQS = unidentified ? "view=reconoces&" : "";
  const identityQuery = unidentified
    ? { unidentifiedOnly: true as const }
    : { excludeUnidentified: true as const };
  return [
    {
      key: "recientes",
      title: "Registrados recientemente",
      subtitle: "Los últimos casos publicados — ver todos los registros",
      icon: Clock,
      href: `/?${viewQS}sort=recent`,
      query: { ...identityQuery, sort: "recent", pageSize: 12 },
    },
    {
      key: "ninos",
      title: "Niñas y niños",
      subtitle: "De 0 a 11 años",
      icon: Baby,
      href: `/?${viewQS}maxAge=11`,
      query: { ...identityQuery, maxAge: 11, sort: "recent", pageSize: 12 },
    },
    {
      key: "adolescentes",
      title: "Adolescentes",
      subtitle: "De 12 a 17 años",
      icon: GraduationCap,
      href: `/?${viewQS}minAge=12&maxAge=17`,
      query: { ...identityQuery, minAge: 12, maxAge: 17, sort: "recent", pageSize: 12 },
    },
    {
      key: "jovenes",
      title: "Jóvenes",
      subtitle: "De 18 a 29 años",
      icon: User,
      href: `/?${viewQS}minAge=18&maxAge=29`,
      query: { ...identityQuery, minAge: 18, maxAge: 29, sort: "recent", pageSize: 12 },
    },
    {
      key: "adultos",
      title: "Adultos",
      subtitle: "De 30 a 59 años",
      icon: Users,
      href: `/?${viewQS}minAge=30&maxAge=59`,
      query: { ...identityQuery, minAge: 30, maxAge: 59, sort: "recent", pageSize: 12 },
    },
    {
      key: "mayores",
      title: "Adultos mayores",
      subtitle: "60 años o más",
      icon: PersonStanding,
      href: `/?${viewQS}minAge=60`,
      query: { ...identityQuery, minAge: 60, sort: "recent", pageSize: 12 },
    },
  ];
}

async function Section({ def, country }: { def: SectionDef; country: string }) {
  const items = await getFeaturedPersons({ ...def.query, country });
  if (items.length === 0) return null;
  const Icon = def.icon;

  return (
    <section>
      <div className="mb-3 flex items-end justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-zinc-900 text-white">
            <Icon className="h-4.5 w-4.5" />
          </span>
          <div>
            <h2 className="font-bold text-zinc-900">{def.title}</h2>
            <p className="text-xs text-zinc-500">{def.subtitle}</p>
          </div>
        </div>
        <Link
          href={def.href}
          className="flex shrink-0 items-center gap-1 text-sm font-medium text-brand-700 hover:underline"
        >
          Ver todos
          <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
      {/* Carrusel horizontal: ~2 tarjetas visibles en móvil; el resto se ve
          deslizando hacia la derecha. "Ver todos" lleva al listado completo. */}
      <div className="no-scrollbar -mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto scroll-smooth px-4 pb-1 sm:mx-0 sm:px-0">
        {items.map((person) => (
          <div
            key={person.id}
            className="w-[46%] shrink-0 snap-start sm:w-44"
          >
            <PersonCard person={person} />
          </div>
        ))}
      </div>
    </section>
  );
}

export async function FeaturedSections({
  unidentified = false,
  country = "ve",
}: {
  unidentified?: boolean;
  country?: string;
}) {
  const sections = buildSections(unidentified);
  return (
    <div className="space-y-8">
      <div className="flex items-center gap-2 text-sm font-medium text-zinc-400">
        <Sparkles className="h-4 w-4" />
        Secciones destacadas
      </div>
      {sections.map((def) => (
        <Section key={def.key} def={def} country={country} />
      ))}
    </div>
  );
}
