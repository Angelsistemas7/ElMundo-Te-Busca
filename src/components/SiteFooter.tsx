import Link from "next/link";
import Image from "next/image";
import { ShareWhatsApp } from "./ShareWhatsApp";
import { FooterEmergencyLine } from "./FooterEmergencyLine";

export function SiteFooter() {
  return (
    <footer className="mt-10 border-t border-zinc-200 bg-white sm:mt-16">
      <div className="mx-auto grid max-w-6xl gap-5 px-4 py-6 sm:gap-8 sm:py-10 md:grid-cols-2">
        <div>
          <div className="flex items-center gap-3">
            <Image
              src="/logo-icon.svg"
              alt="El Mundo Te Busca"
              width={56}
              height={56}
              className="h-11 w-11 shrink-0 object-contain sm:h-14 sm:w-14"
            />
            <span className="text-base font-bold text-navy-700 sm:text-lg">El Mundo Te Busca</span>
          </div>
          <p className="mt-2 max-w-md text-sm leading-relaxed text-zinc-600 sm:mt-3">
            Iniciativa ciudadana, voluntaria y sin fines de lucro para ayudar a localizar personas
            desaparecidas y coordinar ayuda ante catástrofes en cualquier lugar del mundo. Hoy,
            respondemos a los terremotos de Venezuela (jun. 2026) y Colombia (ago. 2026).
          </p>
          <p className="mt-2 max-w-md text-xs leading-relaxed text-zinc-500 sm:mt-3">
            No vendemos ni compartimos tu información con terceros y solo la usamos para ayudar a
            localizar personas. Los datos que se publican son responsabilidad de quien los envía;
            verifícalos antes de difundirlos.
          </p>
          <p className="mt-2 text-sm text-zinc-600 sm:mt-3">
            Contacto:{" "}
            <a
              href="mailto:atencionsentralabs@gmail.com"
              className="font-medium text-brand-700 hover:underline"
            >
              atencionsentralabs@gmail.com
            </a>
          </p>
        </div>

        <div>
          <h3 className="text-sm font-semibold text-navy-700">Emergencias</h3>
          <FooterEmergencyLine />
          <Link
            href="/emergencias"
            className="press mt-2 inline-block text-sm font-medium text-brand-700 transition hover:underline"
          >
            Más teléfonos y guía de seguridad →
          </Link>

          <p className="mt-3 text-sm font-medium text-zinc-700 sm:mt-4">
            Sé un voluntario digital: solo necesitas un momento para impactar. Comparte esta
            página — puede salvar vidas.
          </p>
          <div className="mt-2">
            <ShareWhatsApp variant="subtle" />
          </div>
        </div>
      </div>

      <div className="border-t border-zinc-100">
        <div className="mx-auto max-w-6xl px-4 py-5 sm:py-8">
          <p className="text-center text-xs font-semibold uppercase tracking-wide text-zinc-400">
            Con el apoyo de
          </p>
          {/* Dos aliados lado a lado, separados por una línea divisoria. */}
          <div className="mx-auto mt-3 flex max-w-xl items-stretch justify-center divide-x divide-zinc-200 sm:mt-5">
            {/* Sentra Labs (patrocinador tecnológico) — enlaza a su sitio. */}
            <div className="flex flex-1 flex-col items-center gap-2 px-4 text-center sm:px-6">
              <a
                href="https://sentralabs.co/"
                target="_blank"
                rel="noopener noreferrer"
                className="transition hover:opacity-80"
              >
                <Image
                  src="/logo-light.webp"
                  alt="Sentra Labs"
                  width={256}
                  height={90}
                  className="h-9 w-auto object-contain"
                />
              </a>
              <p className="text-xs leading-relaxed text-zinc-500">
                Estudio de desarrollo de software en Cartagena. Convertimos ideas en productos
                digitales de alto impacto.
              </p>
            </div>
            {/* INN Clusion — sin enlace (no tiene sitio), con su descripción. */}
            <div className="flex flex-1 flex-col items-center gap-2 px-4 text-center sm:px-6">
              <Image
                src="/INNClusion.jpeg"
                alt="INN Clusion"
                width={1598}
                height={1106}
                className="h-9 w-auto object-contain"
              />
              <p className="text-xs leading-relaxed text-zinc-500">
                INN Clusion trabaja desde 2010, creada por Fundación Conceptos. Voluntarios digitales
                con más de 15 años apoyando causas sociales.
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="border-t border-zinc-100">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 text-xs text-zinc-400">
          <span>© 2026 El Mundo Te Busca · Iniciativa sin fines de lucro</span>
          <Link href="/admin" className="hover:text-zinc-700">
            Panel de moderación
          </Link>
        </div>
      </div>
    </footer>
  );
}
