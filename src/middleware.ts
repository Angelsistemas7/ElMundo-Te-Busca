import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { constantTimeEqual } from "@/lib/constantTime";

// ── Modo mantenimiento (temporal, manual) ───────────────────────────────────
// Con MAINTENANCE_MODE=true, todo el sitio muestra /mantenimiento excepto
// /admin (para poder entrar) y quien YA tiene la cookie de admin (el mismo
// ADMIN_TOKEN que usa el panel de moderación, ver src/lib/admin.ts). No
// replica el segundo camino de isAdmin() (rol "admin" por cuenta vía
// Supabase) a propósito: haría falta una consulta a la base en cada
// navegación, y ADMIN_TOKEN ya es la llave maestra que siempre funciona.
function maintenanceRedirect(request: NextRequest): NextResponse | null {
  if (process.env.MAINTENANCE_MODE !== "true") return null;
  const { pathname } = request.nextUrl;
  if (pathname === "/mantenimiento" || pathname.startsWith("/admin")) return null;
  // Endpoints internos llamados por cron (sin sesión de navegador, tienen su
  // propia clave — ver CRON_SECRET): deben poder correr aunque el sitio
  // público esté en mantenimiento.
  if (pathname.startsWith("/api/cron")) return null;

  const adminToken = process.env.ADMIN_TOKEN;
  const cookie = request.cookies.get("vtb_admin")?.value;
  if (adminToken && cookie && constantTimeEqual(cookie, adminToken)) return null;

  // IMPORTANTE: redirect, no rewrite. Un rewrite hace que Next.js vuelva a
  // pedirse la ruta A SÍ MISMO puertas adentro usando el origen de
  // `request.nextUrl` — detrás de nginx (que termina el HTTPS y reenvía por
  // HTTP plano al puerto interno, ver ecosystem.config.cjs), ese origen trae
  // el esquema "https:" por el header `X-Forwarded-Proto`, y el proceso
  // interno solo habla HTTP: revienta con "SSL routines: wrong version
  // number" y tumba el sitio para todo el mundo (pasó en producción, ver
  // memoria del proyecto). Un redirect en cambio le dice al NAVEGADOR que
  // pida `/mantenimiento` de nuevo — una petición externa normal, sin
  // proxy interno — así que no tiene este problema.
  const url = request.nextUrl.clone();
  url.pathname = "/mantenimiento";
  // A pesar de que nginx reenvía `Host`/`X-Forwarded-Proto` correctamente,
  // `request.nextUrl` en este montaje autoalojado igual arma el origen con
  // la dirección interna (probado: dio "https://localhost:3200" en
  // producción — un redirect a esa URL rompe para cualquier visitante real,
  // su navegador intenta conectarse a SU PROPIA máquina). Se fuerza el
  // origen con NEXT_PUBLIC_SITE_URL (ya configurado para las imágenes de
  // previsualización) en vez de confiar en lo que Next detecta solo.
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;
  if (siteUrl) {
    try {
      const publicOrigin = new URL(siteUrl);
      url.protocol = publicOrigin.protocol;
      url.hostname = publicOrigin.hostname;
      // `.host` a veces no limpia el puerto que traía `url` (quedaba
      // ":3000" pegado al dominio real en pruebas locales) — se fija aparte,
      // vacío si `publicOrigin` no especifica uno (el puerto por defecto).
      url.port = publicOrigin.port;
    } catch {
      /* NEXT_PUBLIC_SITE_URL mal formado: se deja el origen detectado */
    }
  }
  return NextResponse.redirect(url);
}

// Refresca la sesión de Supabase en cada navegación (renueva el token y
// reescribe la cookie). Si Supabase no está configurado, no hace nada.
export async function middleware(request: NextRequest) {
  const maintenance = maintenanceRedirect(request);
  if (maintenance) return maintenance;

  let response = NextResponse.next({ request });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return response;

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
      },
    },
  });

  // Importante: no metas lógica entre crear el cliente y getUser().
  await supabase.auth.getUser();
  return response;
}

export const config = {
  // Excluye estáticos y archivos de imagen para no correr en cada recurso.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|icon.svg|opengraph-image|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
