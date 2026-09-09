import { NextResponse, type NextRequest } from "next/server";
import { completeOAuthLogin } from "@/lib/auth";
import { safeNextPath } from "@/lib/safeNext";

// Vuelta de Google tras aprobar el ingreso. Google manda aquí un `code` de un
// solo uso; se cambia por la sesión real (cookie httpOnly) y se sigue viaje.
//
// Nunca se cachea: cada visita trae un `code` distinto y de un solo uso.
export const dynamic = "force-dynamic";

/** Origen público del sitio. Igual que en `middleware.ts`: NO se arma con el
 *  origen que detecta Next (detrás de nginx sale la dirección interna — dio
 *  "https://localhost:3200" en producción y rompió para todo visitante real),
 *  ni con cabeceras de la petición (las controla quien la hace). */
function publicOrigin(request: NextRequest): string {
  const fromEnv = process.env.NEXT_PUBLIC_SITE_URL;
  if (fromEnv) {
    try {
      return new URL(fromEnv).origin;
    } catch {
      /* mal formado: se cae al origen detectado */
    }
  }
  return request.nextUrl.origin;
}

export async function GET(request: NextRequest) {
  const origin = publicOrigin(request);
  const params = request.nextUrl.searchParams;

  // Solo rutas internas (ver `getGoogleAuthUrl`): impide que un enlace armado
  // por un tercero termine mandando a otro dominio con la sesión ya iniciada.
  const next = safeNextPath(params.get("next"));

  // La persona canceló en la pantalla de Google, o Google devolvió un error.
  // No es un fallo del sitio: se vuelve a la página de origen sin ruido.
  if (params.get("error")) {
    return NextResponse.redirect(`${origin}${next}`);
  }

  const code = params.get("code");
  if (!code) return NextResponse.redirect(`${origin}${next}`);

  const res = await completeOAuthLogin(code);
  if (!res.ok) {
    return NextResponse.redirect(`${origin}/?auth=error`);
  }

  // Primer ingreso con Google: falta elegir el nombre de usuario con el que se
  // le verá en comentarios y publicaciones.
  if (res.needsUsername) {
    return NextResponse.redirect(`${origin}/cuenta/usuario?next=${encodeURIComponent(next)}`);
  }

  return NextResponse.redirect(`${origin}${next}`);
}
