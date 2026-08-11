import { timingSafeEqual } from "node:crypto";
import { cookies, headers } from "next/headers";
import { getCurrentUser } from "./auth";
import { hasAppRole } from "./data";

// Compara el token/contraseña maestra sin filtrar por temporización cuánto
// coincide el prefijo (`===` corta en el primer byte distinto). Si difieren en
// longitud, igual se compara contra sí mismo para no devolver antes de tiempo.
function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) {
    timingSafeEqual(bufA, bufA);
    return false;
  }
  return timingSafeEqual(bufA, bufB);
}

// Control de acceso del panel de moderación. Dos caminos, cualquiera basta:
//   • ADMIN_TOKEN (llave maestra compartida, siempre disponible como respaldo)
//   • cuenta con el rol global "admin" asignado desde el panel (ver AppRole)
// Si ADMIN_TOKEN no está configurado, el panel queda ABIERTO en modo
// demostración (con aviso), para poder probarlo sin configurar nada.

const ADMIN_TOKEN = process.env.ADMIN_TOKEN;
const COOKIE = "vtb_admin";

export const adminConfigured = Boolean(ADMIN_TOKEN);

// Freno de fuerza bruta contra el login de /admin: 5 intentos fallidos por IP
// bloquean esa IP 15 minutos. En memoria (un solo proceso en el VPS con PM2);
// se reinicia si el proceso reinicia, lo cual es aceptable para este alcance.
//
// IMPORTANTE: `registerSuccess` solo borra la entrada de quien SÍ acierta la
// contraseña — cualquiera que falle y nunca vuelva a intentar (un bot que
// prueba una vez y se va, algo que pasa constantemente en cualquier servidor
// público) se queda en este mapa PARA SIEMPRE mientras el proceso viva, sin
// límite. Con suficiente tráfico de internet, esto crece sin parar (fuga de
// memoria lógica). Por eso se poda cuando crece demasiado: quita entradas
// viejas que ya no aportan nada (su bloqueo, si lo hubo, ya venció hace rato).
const MAX_ATTEMPTS = 5;
const LOCKOUT_MS = 15 * 60 * 1000;
const MAX_TRACKED_IPS = 5000;
const attempts = new Map<string, { count: number; lockedUntil: number; lastAttemptAt: number }>();

function pruneAttempts(): void {
  if (attempts.size < MAX_TRACKED_IPS) return;
  const now = Date.now();
  for (const [ip, entry] of attempts) {
    if (now - entry.lastAttemptAt > LOCKOUT_MS) attempts.delete(ip);
  }
}

// Frontera de confianza: ¿de dónde sale la IP en la que confiamos para el
// freno de fuerza bruta? `X-Forwarded-For` lo pone nginx con
// `$proxy_add_x_forwarded_for`, que AÑADE la IP real al final de lo que el
// cliente ya mandó — no lo reemplaza. Cualquiera puede mandar su propio
// "X-Forwarded-For: 1.2.3.4" y quedaría primero en la lista; tomar
// `split(",")[0]` (como hacía antes) toma ese valor FALSEADO, no el real —
// bastaba con rotar ese encabezado para saltarse el bloqueo de 5 intentos.
// Con Cloudflare por delante, `CF-Connecting-IP` es la fuente correcta: la
// pone Cloudflare mismo y SOBRESCRIBE cualquier valor que el cliente haya
// mandado, así que no se puede falsear (mientras nadie le pegue directo a
// la IP del VPS saltándose Cloudflare — para eso está el `default_server`
// documentado en docs/DESPLIEGUE-VPS.md). Sin Cloudflare (desarrollo local),
// se usa el resto como respaldo.
async function clientIp(): Promise<string> {
  const h = await headers();
  const cf = h.get("cf-connecting-ip");
  if (cf) return cf.trim();
  const fwd = h.get("x-forwarded-for");
  return (fwd ? fwd.split(",")[0].trim() : null) || h.get("x-real-ip") || "unknown";
}

function isLocked(ip: string): boolean {
  const entry = attempts.get(ip);
  return Boolean(entry && entry.lockedUntil > Date.now());
}

function registerFailure(ip: string): void {
  pruneAttempts();
  const entry = attempts.get(ip) ?? { count: 0, lockedUntil: 0, lastAttemptAt: 0 };
  entry.count += 1;
  entry.lastAttemptAt = Date.now();
  if (entry.count >= MAX_ATTEMPTS) {
    entry.lockedUntil = Date.now() + LOCKOUT_MS;
    entry.count = 0;
  }
  attempts.set(ip, entry);
}

function registerSuccess(ip: string): void {
  attempts.delete(ip);
}

export async function isAdmin(): Promise<boolean> {
  // Sin ADMIN_TOKEN: abierto en desarrollo (demo), CERRADO en producción para no
  // dejar la moderación expuesta si se olvida configurar el secreto.
  if (!ADMIN_TOKEN) return process.env.NODE_ENV !== "production";
  const store = await cookies();
  const cookieValue = store.get(COOKIE)?.value;
  if (cookieValue && safeEqual(cookieValue, ADMIN_TOKEN)) return true;
  // Segundo camino: cuenta propia con el rol "admin" asignado (sin compartir
  // la contraseña maestra). El token sigue funcionando como respaldo.
  const user = await getCurrentUser();
  if (!user) return false;
  return hasAppRole(user.id, "admin");
}

export async function signInAdmin(password: string): Promise<boolean> {
  if (!ADMIN_TOKEN) return process.env.NODE_ENV !== "production";
  const ip = await clientIp();
  if (isLocked(ip)) return false;
  if (!safeEqual(password, ADMIN_TOKEN)) {
    registerFailure(ip);
    return false;
  }
  registerSuccess(ip);
  const store = await cookies();
  store.set(COOKIE, ADMIN_TOKEN, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 12, // 12 h
  });
  return true;
}

export async function signOutAdmin(): Promise<void> {
  const store = await cookies();
  store.delete(COOKIE);
}
