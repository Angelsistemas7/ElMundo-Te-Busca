import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV === "development";

// Dominios reales verificados en el código (no supuestos) — ver
// docs/investigacion-mi-sesion-20260813/01-seguridad-avanzada.md §1.
// platform.twitter.com/syndication.twitter.com/twimg.com: el embed oficial
// de X que usa TweetEmbed.tsx (carga widgets.js + iframe + imagenes del
// tuit) — omitirlos rompería esa funcion en producción.
const cspDirectives = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline' https://challenges.cloudflare.com https://platform.twitter.com${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' blob: data: https://*.supabase.co https://*.supabase.in https://*.basemaps.cartocdn.com https://pbs.twimg.com https://abs.twimg.com",
  "font-src 'self'",
  "connect-src 'self' https://challenges.cloudflare.com https://*.supabase.co https://*.supabase.in https://cdn.syndication.twimg.com https://syndication.twitter.com",
  "frame-src https://challenges.cloudflare.com https://platform.twitter.com https://syndication.twitter.com",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "upgrade-insecure-requests",
].join("; ");

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Quita la cabecera "X-Powered-By: Next.js" (info gratis para un atacante).
  poweredByHeader: false,
  // Empaqueta un servidor Node autocontenido en `.next/standalone` (server.js +
  // solo las dependencias necesarias). Es lo que se sube al VPS y corre con PM2.
  // Vercel lo ignora, así que no afecta el despliegue actual.
  output: "standalone",
  images: {
    // Permite mostrar fotos servidas desde Supabase Storage cuando esté configurado.
    remotePatterns: [
      { protocol: "https", hostname: "*.supabase.co" },
      { protocol: "https", hostname: "*.supabase.in" },
    ],
  },
  // Cabeceras de seguridad en todas las rutas. Sin esto la app no tenía NINGUNA
  // (ni siquiera clickjacking en /admin).
  //
  // La CSP va en modo Report-Only por ahora (cabecera separada, no bloquea
  // nada): es una lista explícita de dominios sin nonce, ya cubre Turnstile,
  // Carto, Supabase y el embed de X — pero antes de que bloquee de verdad
  // conviene un ciclo de tráfico real revisando la consola del navegador por
  // falsos positivos (recomendación de la propia investigación, práctica
  // estándar de OWASP). Pasar a `Content-Security-Policy` (enforcing) una vez
  // confirmado sin violaciones inesperadas.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(self)" },
          { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
          { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
          { key: "Strict-Transport-Security", value: "max-age=15552000; includeSubDomains" },
          { key: "Content-Security-Policy-Report-Only", value: cspDirectives },
        ],
      },
    ];
  },
};

export default nextConfig;
