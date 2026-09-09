import "server-only";
import { getSupabaseServer } from "./supabaseServer";
import { getSupabaseAdmin } from "./supabase";
import { isSafePhotoUrl } from "./validation";
import { clientIp, createLockout } from "./ipLockout";
import { safeNextPath } from "./safeNext";
import type { SignupInput, LoginInput } from "./validation";

// Freno de fuerza bruta contra el login de cuentas de usuario: 8 intentos
// fallidos por IP bloquean esa IP 15 minutos (un poco más laxo que /admin
// porque aquí hay muchas más IPs legítimas compartidas — redes de refugios,
// puntos de wifi comunitarios tras el terremoto — equivocándose de contraseña
// entre varias personas del mismo lugar).
const loginLockout = createLockout(8, 15 * 60 * 1000);

// Cuentas con Supabase Auth. Diseño: usuario único + contraseña fuerte; correo
// OPCIONAL (solo para recuperar la clave). La contraseña la hashea Supabase
// (bcrypt) — nunca la vemos ni la guardamos, y no se puede saber si se repite.
//
// Como Supabase Auth es por correo, cuando el usuario no da uno usamos un correo
// sintético derivado del nombre de usuario (no se entrega a nadie). El correo
// real, si lo dan, queda guardado en `profiles.recovery_email` (tabla privada).

const SYNTH_DOMAIN = "users.venezuelatebusca.org";

export interface SessionUser {
  id: string;
  username: string;
}

function synthEmail(username: string): string {
  return `${username.toLowerCase()}@${SYNTH_DOMAIN}`;
}

/** Usuario de la sesión actual (o null). Lee la cookie de sesión.
 *
 *  Una cuenta recién creada con Google, que todavía no eligió nombre de
 *  usuario, cuenta como SIN sesión a estos efectos: si no, aparecería
 *  publicando y comentando como "Usuario" (el nombre es lo único que la
 *  identifica ante los demás). Para esa etapa intermedia está
 *  `getPendingOAuthUser()`, que sí la ve. */
export async function getCurrentUser(): Promise<SessionUser | null> {
  const sb = await getSupabaseServer();
  if (!sb) return null;
  const { data, error } = await sb.auth.getUser();
  if (error || !data.user) return null;
  const username = data.user.user_metadata?.username as string | undefined;
  if (!username) return null;
  return { id: data.user.id, username };
}

/** Sesión abierta a la que aún le falta elegir nombre de usuario (primer
 *  ingreso con Google). Solo la usa `/cuenta/usuario`. */
export async function getPendingOAuthUser(): Promise<{ id: string; email: string | null } | null> {
  const sb = await getSupabaseServer();
  if (!sb) return null;
  const { data } = await sb.auth.getUser();
  if (!data.user) return null;
  if (data.user.user_metadata?.username) return null; // ya completa
  return { id: data.user.id, email: data.user.email ?? null };
}

export async function isUsernameTaken(username: string): Promise<boolean> {
  const admin = getSupabaseAdmin();
  if (!admin) return false;
  const { data } = await admin
    .from("profiles")
    .select("user_id")
    .eq("username_lower", username.trim().toLowerCase())
    .maybeSingle();
  return Boolean(data);
}

/** Busca una cuenta por su nombre de usuario (solo servidor / service role).
 *  Lo usa el admin para asignar gestores. `profiles` es privada. */
export async function findUserByUsername(
  username: string,
): Promise<{ id: string; username: string } | null> {
  const admin = getSupabaseAdmin();
  if (!admin) return null;
  const { data } = await admin
    .from("profiles")
    .select("user_id, username")
    .eq("username_lower", username.trim().toLowerCase())
    .maybeSingle();
  if (!data) return null;
  return { id: data.user_id as string, username: data.username as string };
}

/** Datos PÚBLICOS de una cuenta por su username, para la ficha compartible de
 *  "voluntario digital" (`/perfil/publico/[username]`) — sin sesión, cualquiera
 *  con el enlace la ve. Solo username + foto, ambos ya públicos en el resto del
 *  sitio (comentarios, avatar); nada de correo ni datos privados. */
export async function getPublicProfileByUsername(
  username: string,
): Promise<{ id: string; username: string; avatarUrl: string | null } | null> {
  const admin = getSupabaseAdmin();
  if (!admin) return null;
  const { data } = await admin
    .from("profiles")
    .select("user_id, username, avatar_url")
    .eq("username_lower", username.trim().toLowerCase())
    .maybeSingle();
  if (!data) return null;
  return {
    id: data.user_id as string,
    username: data.username as string,
    avatarUrl: (data.avatar_url as string | null) ?? null,
  };
}

export type AuthResult = { ok: true; username: string } | { ok: false; error: string };

export async function signUp(input: SignupInput): Promise<AuthResult> {
  const admin = getSupabaseAdmin();
  const sb = await getSupabaseServer();
  if (!admin || !sb) {
    return { ok: false, error: "Las cuentas se activan al conectar la base de datos (Supabase)." };
  }

  const username = input.username.trim();
  // En minúsculas SIEMPRE (igual que el nombre de usuario): Supabase Auth ya
  // normaliza el correo internamente, así que si aquí se guardara tal cual
  // lo escribió la persona (mayúsculas mezcladas), `profiles.recovery_email`
  // podría quedar desincronizado de lo que Supabase realmente tiene — y la
  // recuperación de contraseña, que busca por ese valor exacto, fallaría en
  // silencio para cualquiera que haya escrito su correo con mayúsculas.
  const email = (input.email ?? "").trim().toLowerCase();

  if (await isUsernameTaken(username)) {
    return { ok: false, error: "Ese nombre de usuario ya está en uso. Elige otro." };
  }

  const loginEmail = email || synthEmail(username);

  // Crea el usuario ya confirmado (sin paso de verificación por correo).
  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email: loginEmail,
    password: input.password,
    email_confirm: true,
    user_metadata: { username, has_recovery: Boolean(email) },
  });
  if (createErr || !created.user) {
    return {
      ok: false,
      error: "No se pudo crear la cuenta. Si pusiste un correo, puede que ya esté registrado.",
    };
  }

  // Perfil privado: unicidad de usuario + correo de recuperación (si lo dio).
  const { error: profErr } = await admin.from("profiles").insert({
    user_id: created.user.id,
    username,
    username_lower: username.toLowerCase(),
    login_email: loginEmail,
    recovery_email: email || null,
  });
  if (profErr) {
    // Evita dejar un usuario huérfano si el nombre se tomó en una carrera.
    await admin.auth.admin.deleteUser(created.user.id);
    return { ok: false, error: "Ese nombre de usuario ya está en uso. Elige otro." };
  }

  // Inicia sesión (escribe la cookie de sesión httpOnly).
  const { error: signErr } = await sb.auth.signInWithPassword({
    email: loginEmail,
    password: input.password,
  });
  if (signErr) {
    return { ok: false, error: "Cuenta creada, pero no se pudo iniciar sesión. Intenta entrar." };
  }

  return { ok: true, username };
}

export async function signIn(input: LoginInput): Promise<AuthResult> {
  const admin = getSupabaseAdmin();
  const sb = await getSupabaseServer();
  if (!admin || !sb) {
    return { ok: false, error: "Las cuentas se activan al conectar la base de datos (Supabase)." };
  }

  const ip = await clientIp();
  if (loginLockout.isLocked(ip)) {
    return { ok: false, error: "Demasiados intentos. Espera unos minutos y vuelve a intentar." };
  }

  const { data: prof } = await admin
    .from("profiles")
    .select("login_email, username")
    .eq("username_lower", input.username.trim().toLowerCase())
    .maybeSingle();
  // Mensaje genérico: no revelamos si el usuario existe. Pero el mensaje NO
  // es la única forma de filtrar eso — si el usuario no existe, devolver de
  // inmediato es MÁS RÁPIDO que si existe (ahí sí se llega a comparar la
  // contraseña, que Supabase hace a propósito lento con bcrypt). Esa
  // diferencia de tiempo, medida con suficientes intentos, ya revela cuáles
  // nombres de usuario existen sin necesitar que el mensaje lo diga. Por eso,
  // si no existe, igual se intenta un login (con una clave que nunca puede
  // ser válida) para gastar un tiempo parecido antes de responder.
  if (!prof) {
    await sb.auth.signInWithPassword({ email: synthEmail("__no_such_user__"), password: input.password });
    loginLockout.registerFailure(ip);
    return { ok: false, error: "Usuario o contraseña incorrectos." };
  }

  const { error } = await sb.auth.signInWithPassword({
    email: prof.login_email as string,
    password: input.password,
  });
  if (error) {
    loginLockout.registerFailure(ip);
    return { ok: false, error: "Usuario o contraseña incorrectos." };
  }

  loginLockout.registerSuccess(ip);
  return { ok: true, username: prof.username as string };
}

export async function signOut(): Promise<void> {
  const sb = await getSupabaseServer();
  if (sb) await sb.auth.signOut();
}

// ── Entrar con Google ───────────────────────────────────────────────────────
// Google es un proveedor MÁS dentro del mismo Supabase Auth (no un sistema de
// cuentas aparte): el usuario que crea vive en `auth.users` igual que los de
// usuario+contraseña, así que todo lo que cuelga de ahí (las publicaciones con
// `user_id`, los gestores delegados, las RLS) sigue funcionando sin cambios.
//
// Diferencia real con el registro por contraseña: Google entrega correo y
// nombre real, pero NO un nombre de usuario, y aquí el nombre de usuario es la
// identidad pública (comentarios, /perfil/publico, asignación de gestores). Por
// eso el primer ingreso con Google deja la sesión abierta pero SIN fila en
// `profiles`, y `/cuenta/usuario` la completa. Mientras tanto la cuenta existe
// pero no puede publicar bajo un nombre — es un estado intermedio a propósito.

/** URL a la que hay que mandar el navegador para entrar con Google.
 *  `null` si Supabase no está configurado o si el proveedor no está activo. */
export async function getGoogleAuthUrl(next: string): Promise<string | null> {
  const sb = await getSupabaseServer();
  if (!sb) return null;
  const origin = siteOrigin();
  if (!origin) return null;

  // `next` viene del cliente: solo se acepta una ruta interna. Sin esto, un
  // enlace preparado por un tercero podría mandar a la víctima a un dominio
  // ajeno DESPUÉS de iniciar sesión (redirección abierta / phishing).
  const safeNext = safeNextPath(next);

  const { data, error } = await sb.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: `${origin}/auth/callback?next=${encodeURIComponent(safeNext)}`,
      // La redirección la hace el navegador con la URL que devolvemos, no el
      // SDK (esto corre en el servidor, no hay `window`).
      skipBrowserRedirect: true,
      // Muestra el selector de cuentas en vez de entrar con la última usada:
      // en teléfonos prestados o compartidos —lo normal en un refugio— entrar
      // sin querer con la cuenta de otra persona sería un problema serio.
      queryParams: { prompt: "select_account" },
    },
  });
  if (error || !data?.url) return null;
  return data.url;
}

/** Cierra el ciclo de OAuth: cambia el `code` de la URL por una sesión real
 *  (cookie httpOnly). Devuelve si el usuario ya tiene nombre de usuario. */
export async function completeOAuthLogin(
  code: string,
): Promise<{ ok: false } | { ok: true; needsUsername: boolean }> {
  const sb = await getSupabaseServer();
  if (!sb) return { ok: false };
  const { data, error } = await sb.auth.exchangeCodeForSession(code);
  if (error || !data.user) return { ok: false };
  // Mismo criterio que `getCurrentUser`/`getPendingOAuthUser`: el nombre vive
  // en los metadatos de la sesión, así no hace falta consultar `profiles` aquí.
  // Si el correo de Google coincide con una cuenta que ya existía, Supabase
  // enlaza ambas identidades al mismo usuario y este ya trae su nombre.
  return { ok: true, needsUsername: !data.user.user_metadata?.username };
}

/** ¿La cuenta ya tiene fila en `profiles`? Se comprueba contra la base (no
 *  contra los metadatos) justo antes de insertar, para no crear dos perfiles
 *  del mismo usuario si algo se reintenta. */
async function hasProfile(userId: string): Promise<boolean> {
  const admin = getSupabaseAdmin();
  if (!admin) return true; // sin service role no podemos saberlo: no bloqueamos
  const { data } = await admin
    .from("profiles")
    .select("user_id")
    .eq("user_id", userId)
    .maybeSingle();
  return Boolean(data);
}

/** Completa el registro de una cuenta de Google con el nombre de usuario que
 *  eligió. Solo funciona si la sesión existe y AÚN no tiene perfil: así nadie
 *  puede usar esto para cambiarse el nombre después (eso sería otra función,
 *  con sus propias reglas). */
export async function completeOAuthProfile(username: string): Promise<AuthResult> {
  const sb = await getSupabaseServer();
  const admin = getSupabaseAdmin();
  if (!sb || !admin) return { ok: false, error: "No disponible en modo demostración." };

  const { data: userData } = await sb.auth.getUser();
  const user = userData.user;
  if (!user) return { ok: false, error: "Tu sesión expiró. Vuelve a entrar con Google." };
  if (await hasProfile(user.id)) {
    return { ok: false, error: "Esta cuenta ya tiene nombre de usuario." };
  }

  const name = username.trim();
  if (await isUsernameTaken(name)) {
    return { ok: false, error: "Ese nombre de usuario ya está en uso. Elige otro." };
  }

  const email = (user.email ?? "").toLowerCase();
  const { error: profErr } = await admin.from("profiles").insert({
    user_id: user.id,
    username: name,
    username_lower: name.toLowerCase(),
    login_email: email,
    // Con Google el correo ya está verificado por Google: sirve de una vez como
    // correo de recuperación, sin pedirlo aparte.
    recovery_email: email || null,
  });
  if (profErr) {
    // Carrera: alguien tomó el nombre entre la comprobación y el insert.
    return { ok: false, error: "Ese nombre de usuario ya está en uso. Elige otro." };
  }

  // Igual que en `signUp`: el nombre vive también en los metadatos de la sesión
  // para que `getCurrentUser()` no tenga que consultar `profiles` cada vez.
  await admin.auth.admin.updateUserById(user.id, {
    user_metadata: { ...user.user_metadata, username: name, has_recovery: Boolean(email) },
  });

  return { ok: true, username: name };
}

/** ¿Esta cuenta tiene contraseña propia? Las creadas solo con Google no la
 *  tienen, así que "cambiar contraseña" y la confirmación por contraseña al
 *  eliminar la cuenta no aplican (ver `AccountSettings`). */
export async function currentUserHasPassword(): Promise<boolean> {
  const sb = await getSupabaseServer();
  if (!sb) return true;
  const { data } = await sb.auth.getUser();
  if (!data.user) return true;
  const providers = (data.user.app_metadata?.providers as string[] | undefined) ?? [];
  return providers.includes("email");
}

// ── Recuperar contraseña (solo si el usuario dio un correo) ──────────────────
// NUNCA se arma con cabeceras de la petición (Host/X-Forwarded-Host): esas las
// controla quien hace la petición, no el servidor. Si nginx no tiene un
// "default_server" que rechace hosts desconocidos (no es el caso aquí), esas
// cabeceras se pueden falsear apuntando directo a la IP del VPS — y si este
// enlace se armara con ellas, se podría mandar un correo de "recuperar
// contraseña" con el enlace apuntando a un dominio del atacante (phishing /
// robo del token de recuperación). Por eso: SOLO `NEXT_PUBLIC_SITE_URL`, o
// nada (mejor no mandar el correo que mandarlo con un enlace falseable).
function siteOrigin(): string | null {
  const fromEnv = process.env.NEXT_PUBLIC_SITE_URL;
  if (fromEnv) return fromEnv.replace(/\/+$/, "");
  // Único caso donde sí vale una URL fija de desarrollo: no hay despliegue real.
  if (process.env.NODE_ENV !== "production") return "http://localhost:3000";
  return null;
}

/** Envía un enlace de recuperación al correo del usuario, si dio uno al registrarse.
 *  Silencioso a propósito: no revela si el usuario existe ni si tiene correo. */
export async function requestPasswordReset(username: string): Promise<void> {
  const admin = getSupabaseAdmin();
  const sb = await getSupabaseServer();
  if (!admin || !sb) return;
  const origin = siteOrigin();
  if (!origin) return; // sin NEXT_PUBLIC_SITE_URL en producción: no arriesgar un enlace falseable
  const { data: prof } = await admin
    .from("profiles")
    .select("login_email, recovery_email")
    .eq("username_lower", username.trim().toLowerCase())
    .maybeSingle();
  if (!prof || !prof.recovery_email) return; // sin correo: no hay a dónde enviar
  await sb.auth.resetPasswordForEmail(prof.login_email as string, {
    redirectTo: `${origin}/cuenta/confirmar`,
  });
}

/** Cambia la contraseña del usuario con sesión (tras abrir el enlace del correo). */
export async function updatePassword(newPassword: string): Promise<AuthResult> {
  const sb = await getSupabaseServer();
  if (!sb) return { ok: false, error: "No disponible en modo demostración." };
  const { data } = await sb.auth.getUser();
  if (!data.user) return { ok: false, error: "Enlace inválido o expirado. Pide uno nuevo." };
  const { error } = await sb.auth.updateUser({ password: newPassword });
  if (error) return { ok: false, error: "No se pudo cambiar la contraseña. Intenta de nuevo." };
  const username = (data.user.user_metadata?.username as string | undefined) ?? "Usuario";
  return { ok: true, username };
}

// ── Perfil (foto, correo de recuperación, avisos por correo) ────────────────
export interface MyProfile {
  id: string;
  username: string;
  avatarUrl: string | null;
  recoveryEmail: string | null;
  emailNotifications: boolean;
  /** false en cuentas creadas solo con Google (no hay contraseña que cambiar). */
  hasPassword: boolean;
}

/** Perfil completo de la sesión actual (para /perfil y /configuracion). Hace
 *  una consulta aparte a `profiles`; NO se mete en `getCurrentUser()` (esa la
 *  llaman muchas Server Actions solo para saber quién eres, sin necesitar esto). */
export async function getMyProfile(): Promise<MyProfile | null> {
  const user = await getCurrentUser();
  if (!user) return null;
  const admin = getSupabaseAdmin();
  const hasPassword = await currentUserHasPassword();
  if (!admin) {
    return { ...user, avatarUrl: null, recoveryEmail: null, emailNotifications: false, hasPassword };
  }
  const { data } = await admin
    .from("profiles")
    .select("avatar_url, recovery_email, email_notifications")
    .eq("user_id", user.id)
    .maybeSingle();
  return {
    ...user,
    avatarUrl: (data?.avatar_url as string | null) ?? null,
    recoveryEmail: (data?.recovery_email as string | null) ?? null,
    emailNotifications: Boolean(data?.email_notifications),
    hasPassword,
  };
}

/** Cambia la foto de perfil (o la quita, con `url: null`). Borra la foto
 *  ANTERIOR del bucket si había una — si no, cada vez que alguien cambia su
 *  foto queda un archivo huérfano accesible para siempre en su URL vieja. */
export async function updateAvatar(userId: string, url: string | null): Promise<boolean> {
  const admin = getSupabaseAdmin();
  if (!admin) return false;
  const { data: prof } = await admin
    .from("profiles")
    .select("avatar_url")
    .eq("user_id", userId)
    .maybeSingle();
  const { error } = await admin.from("profiles").update({ avatar_url: url }).eq("user_id", userId);
  if (error) return false;
  const oldUrl = prof?.avatar_url as string | null;
  if (oldUrl && oldUrl !== url && isSafePhotoUrl(oldUrl)) {
    try {
      const path = new URL(oldUrl).pathname.replace("/storage/v1/object/public/photos/", "");
      if (path) await admin.storage.from("photos").remove([path]);
    } catch {
      /* mejor esfuerzo: no rompe el cambio de foto */
    }
  }
  return true;
}

/** Cambia (o agrega) el correo de recuperación. Si antes no tenía correo (solo
 *  el sintético interno), este pasa a ser también el correo de acceso — hay
 *  que mantener sincronizado el correo real en Supabase Auth (`updateUserById`)
 *  y en `profiles.login_email`, o el próximo `signInWithPassword` fallaría. El
 *  usuario sigue entrando con su NOMBRE DE USUARIO siempre, esto es interno. */
export async function updateRecoveryEmail(userId: string, email: string | null): Promise<boolean> {
  const admin = getSupabaseAdmin();
  if (!admin) return false;
  const normalizedEmail = email ? email.trim().toLowerCase() : null;
  const { data: prof } = await admin
    .from("profiles")
    .select("username")
    .eq("user_id", userId)
    .maybeSingle();
  if (!prof) return false;
  const newLoginEmail = normalizedEmail || synthEmail(prof.username as string);
  const { error: authErr } = await admin.auth.admin.updateUserById(userId, { email: newLoginEmail });
  if (authErr) return false;
  const { error } = await admin
    .from("profiles")
    .update({ recovery_email: normalizedEmail, login_email: newLoginEmail })
    .eq("user_id", userId);
  return !error;
}

/** Prende/apaga los avisos por correo (requiere tener un correo registrado). */
export async function updateEmailNotifications(userId: string, value: boolean): Promise<boolean> {
  const admin = getSupabaseAdmin();
  if (!admin) return false;
  const { error } = await admin
    .from("profiles")
    .update({ email_notifications: value })
    .eq("user_id", userId);
  return !error;
}

/** Cambia la contraseña DESDE la sesión activa (a diferencia de `updatePassword`,
 *  que es para el enlace de recuperación por correo): re-verifica la contraseña
 *  actual antes de aceptar la nueva, para que nadie con la sesión abierta en un
 *  dispositivo compartido pueda cambiarla sin saber la clave real. */
export async function changePassword(
  currentPassword: string,
  newPassword: string,
): Promise<AuthResult> {
  const sb = await getSupabaseServer();
  const admin = getSupabaseAdmin();
  if (!sb || !admin) return { ok: false, error: "No disponible en modo demostración." };
  const { data: userData } = await sb.auth.getUser();
  if (!userData.user) return { ok: false, error: "Sesión no válida." };

  const { data: prof } = await admin
    .from("profiles")
    .select("login_email, username")
    .eq("user_id", userData.user.id)
    .maybeSingle();
  if (!prof) return { ok: false, error: "No se pudo verificar tu cuenta." };

  // Re-verifica la clave actual con un cliente aparte (no toca la sesión real).
  const { error: verifyErr } = await admin.auth.signInWithPassword({
    email: prof.login_email as string,
    password: currentPassword,
  });
  if (verifyErr) return { ok: false, error: "La contraseña actual no es correcta." };

  const { error } = await sb.auth.updateUser({ password: newPassword });
  if (error) return { ok: false, error: "No se pudo cambiar la contraseña. Intenta de nuevo." };
  return { ok: true, username: prof.username as string };
}

/** Elimina la cuenta (con verificación de contraseña + nombre de usuario
 *  tecleado, para que no sea un solo clic accidental). Las publicaciones NO se
 *  borran: `user_id` queda en null (ya está así en el esquema, `on delete set
 *  null`) — se desvinculan de la cuenta, pero el registro sigue público. */
export async function deleteAccount(
  password: string,
  confirmUsername: string,
): Promise<{ ok: boolean; error?: string }> {
  const sb = await getSupabaseServer();
  const admin = getSupabaseAdmin();
  if (!sb || !admin) return { ok: false, error: "No disponible en modo demostración." };
  const { data: userData } = await sb.auth.getUser();
  if (!userData.user) return { ok: false, error: "Sesión no válida." };

  const { data: prof } = await admin
    .from("profiles")
    .select("login_email, username")
    .eq("user_id", userData.user.id)
    .maybeSingle();
  if (!prof) return { ok: false, error: "No se pudo verificar tu cuenta." };

  if (confirmUsername.trim().toLowerCase() !== (prof.username as string).toLowerCase()) {
    return { ok: false, error: "El nombre de usuario no coincide." };
  }
  // Las cuentas creadas con Google no tienen contraseña que verificar: la
  // fricción ahí es teclear el nombre de usuario (arriba). Verificar de todos
  // modos fallaría siempre y las dejaría sin forma de borrarse.
  if (await currentUserHasPassword()) {
    const { error: verifyErr } = await admin.auth.signInWithPassword({
      email: prof.login_email as string,
      password,
    });
    if (verifyErr) return { ok: false, error: "La contraseña no es correcta." };
  }

  const { error } = await admin.auth.admin.deleteUser(userData.user.id);
  if (error) return { ok: false, error: "No se pudo eliminar la cuenta. Intenta de nuevo." };
  await sb.auth.signOut();
  return { ok: true };
}
