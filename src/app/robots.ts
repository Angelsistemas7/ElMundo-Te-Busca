import type { MetadataRoute } from "next";

// No bloquea scraping de verdad (un script no obedece esto, solo lo hacen los
// buscadores serios). Sirve para: 1) que Google/Bing no gasten su rastreo en
// rutas de gestión con token en la URL (aunque no sean públicas, si alguien
// comparte el enlace por error no queremos que quede indexado) ni en /admin;
// 2) declarar intención pública de no permitir cosecha masiva, que es lo que
// respaldan las medidas reales (Cloudflare, límites por IP, Turnstile).
export default function robots(): MetadataRoute.Robots {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/admin", "/*/gestion", "/*gestion*token=*", "/cuenta", "/configuracion", "/api/"],
    },
    sitemap: siteUrl ? `${siteUrl.replace(/\/+$/, "")}/sitemap.xml` : undefined,
  };
}
