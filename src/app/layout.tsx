import type { Metadata, Viewport } from "next";
import { Figtree, Signika } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import "./globals.css";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { MobileNav } from "@/components/MobileNav";
import { AccountBanner } from "@/components/AccountBanner";
import { SafetyBanner } from "@/components/SafetyBanner";
import { OnboardingTour } from "@/components/OnboardingTour";

const figtree = Figtree({
  subsets: ["latin"],
  variable: "--font-figtree",
  display: "swap",
});
const signika = Signika({
  subsets: ["latin"],
  variable: "--font-signika",
  display: "swap",
});

// En producción, define NEXT_PUBLIC_SITE_URL (p. ej. https://elmundotebusca.com)
// para que la imagen Open Graph y los enlaces sociales sean absolutos. En Vercel
// se detecta solo; si no, Next usa una URL relativa.
const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;

// El título/descripción por defecto (SEO, compartir en redes) es neutral
// entre países a propósito: la metadata del layout raíz no puede leer la
// cookie de país sin forzar TODO el sitio a renderizado dinámico (ver el
// bug ya documentado sobre convertir el layout en dinámico). El país activo
// sí se refleja en el contenido de cada página (portada, mapa, emergencias).
export const metadata: Metadata = {
  metadataBase: siteUrl ? new URL(siteUrl) : undefined,
  title: {
    default: "El Mundo Te Busca — Personas desaparecidas y ayuda ante emergencias",
    template: "%s · El Mundo Te Busca",
  },
  applicationName: "El Mundo Te Busca",
  description:
    "Iniciativa ciudadana, voluntaria y sin fines de lucro para localizar personas desaparecidas y coordinar ayuda ante cualquier tragedia o emergencia, en cualquier parte del mundo. Hoy activa en Venezuela y Colombia.",
  robots: { index: true, follow: true },
  openGraph: {
    title: "El Mundo Te Busca — Respuesta ciudadana a tragedias en el mundo",
    description:
      "Plataforma ciudadana global para localizar personas desaparecidas y coordinar ayuda ante cualquier emergencia. Hoy activa en Venezuela y Colombia.",
    type: "website",
    locale: "es_419",
    siteName: "El Mundo Te Busca",
  },
  twitter: {
    card: "summary_large_image",
    title: "El Mundo Te Busca — Respuesta ciudadana a tragedias en el mundo",
    description:
      "Plataforma ciudadana global para localizar personas desaparecidas y coordinar ayuda ante cualquier emergencia. Hoy activa en Venezuela y Colombia.",
  },
};

export const viewport: Viewport = {
  themeColor: "#d3824a",
  // "cover" para que `env(safe-area-inset-bottom)` (usado en `.pb-safe-nav`)
  // devuelva el alto real del home indicator en vez de 0 — sin esto la barra
  // inferior fija queda sin su relleno de seguridad en iPhones recientes.
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className={`${figtree.variable} ${signika.variable}`}>
      <body className="flex min-h-screen flex-col">
        <a
          href="#contenido"
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-zinc-900 focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-white"
        >
          Saltar al contenido
        </a>
        <SiteHeader />
        <SafetyBanner />
        <AccountBanner />
        <main id="contenido" tabIndex={-1} className="flex-1 pb-20 outline-none md:pb-0">
          {children}
        </main>
        <SiteFooter />
        <MobileNav />
        <OnboardingTour />
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
