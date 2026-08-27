import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabaseServer";
import { safeNextPath } from "@/lib/safeNext";

// Destino del enlace de recuperación del correo. Canjea el `code` por una sesión
// (escribiendo la cookie) y manda a la página para fijar la nueva contraseña.
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  // Solo rutas internas (evita open-redirect).
  const next = safeNextPath(searchParams.get("next"), "/cuenta/restablecer");

  if (code) {
    const sb = await getSupabaseServer();
    if (sb) {
      const { error } = await sb.auth.exchangeCodeForSession(code);
      if (!error) return NextResponse.redirect(`${origin}${next}`);
    }
  }
  return NextResponse.redirect(`${origin}/cuenta/restablecer?error=1`);
}
