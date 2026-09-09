import { NextResponse } from "next/server";
import { getVerifiedNews, getWorldPress } from "@/lib/news";
import { COUNTRY_CODES } from "@/lib/countries";
import { constantTimeEqual } from "@/lib/constantTime";

// El secreto se manda por cabecera (`Authorization: Bearer …` o `X-Cron-Secret`).
// Una query string viaja en la línea de petición: queda escrita en los logs de
// acceso de nginx, en los de Cloudflare y en el propio log del cron, así que
// ese camino solo se mantiene por compatibilidad con el crontab ya instalado
// (ver docs/DESPLIEGUE-VPS.md) y conviene migrarlo a la cabecera.
function providedSecret(request: Request): string | null {
  const auth = request.headers.get("authorization");
  if (auth) {
    const bearer = /^Bearer\s+(.+)$/i.exec(auth.trim());
    if (bearer) return bearer[1];
  }
  return (
    request.headers.get("x-cron-secret") ??
    new URL(request.url).searchParams.get("secret")
  );
}

// Endpoint interno para "calentar" la caché de noticias (src/lib/news.ts) desde
// un cron del VPS, en vez de dejar que la llene la primera visita real del día
// (esa persona esperaría a que responda GDELT/GNews, que pueden tardar varios
// segundos). La caché vive en la memoria del propio proceso de Next — por eso
// esto tiene que ser una ruta DENTRO de la app (no un script aparte): un
// script standalone calentaría la memoria de OTRO proceso que nadie lee.
export async function GET(request: Request) {
  const expected = process.env.CRON_SECRET;

  // En producción es obligatorio: este endpoint dispara traducción por OpenAI
  // (de pago) además de consumir la cuota gratis de GNews (100/día), así que
  // dejarlo abierto sin clave permite que cualquiera lo llame a lo loco.
  if (!expected && process.env.NODE_ENV === "production") {
    return NextResponse.json({ ok: false, error: "CRON_SECRET no configurado" }, { status: 500 });
  }

  if (expected) {
    const provided = providedSecret(request);
    if (!provided || !constantTimeEqual(provided, expected)) {
      return NextResponse.json({ ok: false, error: "No autorizado" }, { status: 401 });
    }
  }

  // Calienta la caché de CADA país activo (antes solo Venezuela) — sin esto,
  // el primer visitante de Colombia después de que venza el TTL sigue
  // esperando a GDELT/GNews en vivo.
  const counts = await Promise.all(
    COUNTRY_CODES.map(async (country) => {
      const [verified] = await Promise.all([getVerifiedNews(10, country), getWorldPress(10, country)]);
      return [country, verified.length] as const;
    }),
  );
  return NextResponse.json({ ok: true, verifiedCounts: Object.fromEntries(counts) });
}
