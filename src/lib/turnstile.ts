import { reportServerError } from "./error-reporting";

// Verificación del token de Cloudflare Turnstile en el servidor.
// Si no hay TURNSTILE_SECRET_KEY configurado, se omite la verificación
// (modo desarrollo) pero se deja registrado en consola.

const VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

export async function verifyTurnstile(token: string | null, ip?: string): Promise<boolean> {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) {
    // Sin clave: se omite en desarrollo, pero en PRODUCCIÓN se rechaza
    // (fail-closed) para no quedar sin anti-bot por un despliegue mal configurado.
    return process.env.NODE_ENV !== "production";
  }
  if (!token) return false;

  try {
    const body = new URLSearchParams();
    body.append("secret", secret);
    body.append("response", token);
    if (ip) body.append("remoteip", ip);

    // Sin timeout, si Cloudflare se cuelga o tarda, TODA acción de publicar
    // del sitio (16+ tipos) se queda esperando indefinidamente — es el único
    // `fetch()` del servidor que no tenía uno (los demás, en `news.ts`/
    // `usgs.ts`/`ogImage.ts`, ya lo tenían).
    const res = await fetch(VERIFY_URL, { method: "POST", body, signal: AbortSignal.timeout(6000) });
    const data = (await res.json()) as { success: boolean };
    return data.success === true;
  } catch (error) {
    reportServerError("turnstile.verify", error);
    return false;
  }
}

export const turnstileSiteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? "";
