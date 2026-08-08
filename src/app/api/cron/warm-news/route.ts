import { NextResponse } from "next/server";
import { getVerifiedNews, getWorldPress } from "@/lib/news";

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
    const provided = new URL(request.url).searchParams.get("secret");
    if (provided !== expected) {
      return NextResponse.json({ ok: false, error: "No autorizado" }, { status: 401 });
    }
  }

  const [verified] = await Promise.all([getVerifiedNews(10), getWorldPress(10)]);
  return NextResponse.json({ ok: true, verifiedCount: verified.length });
}
