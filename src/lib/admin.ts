import { timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { getCurrentUser } from "./auth";
import { hasAppRole } from "./data";
import { clientIp, createLockout } from "./ipLockout";

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
const LOCKOUT_MS = 15 * 60 * 1000;
const lockout = createLockout(5, LOCKOUT_MS);
const isLocked = lockout.isLocked;
const registerFailure = lockout.registerFailure;
const registerSuccess = lockout.registerSuccess;

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

/**
 * Nivel de acceso de la sesión actual al panel de moderación: "admin" (todo,
 * vía ADMIN_TOKEN o rol "admin"), "moderator" (subset: reportes de hallazgos,
 * posts de comunidad, visto bueno a personas/puntos de ayuda/hospitales — sin
 * Colaboradores, gestores, héroes ni denuncias) o null (sin acceso).
 */
export async function getAdminLevel(): Promise<"admin" | "moderator" | null> {
  if (await isAdmin()) return "admin";
  const user = await getCurrentUser();
  if (!user) return null;
  if (await hasAppRole(user.id, "moderator")) return "moderator";
  return null;
}

/** ¿Puede esta sesión entrar a `/admin`, al menos con el subset de moderador? */
export async function isModerator(): Promise<boolean> {
  return (await getAdminLevel()) !== null;
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
