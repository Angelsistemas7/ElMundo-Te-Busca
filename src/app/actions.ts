"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { COUNTRY_COOKIE, getActiveCountry } from "@/lib/country-server";
import { isCountryCode } from "@/lib/countries";
import {
  addHospitalPatient,
  canManageHospital,
  createAidPoint,
  createComment,
  getComments,
  createComplaint,
  createHospital,
  createMarch,
  createPerson,
  createPet,
  createPost,
  createStatusReport,
  createVolunteer,
  createHero,
  likeHero,
  likeNewsItem,
  supportComplaint,
  getCommentsForEntities,
  getMyPublications,
  type MyPublication,
  getPostsPage,
  type PostSort,
  getReportCountsForPersons,
  getSavedItems,
  getSavedKeys,
  saveItem,
  unsaveItem,
  likeComment,
  deleteAidPoint,
  deleteMarch,
  deletePerson,
  deletePet,
  deletePost,
  likeAidPoint,
  likeHospital,
  likeMarch,
  reactToPerson,
  setAidAvailability,
  setPetStatus,
  reactToPost,
  updateAidPointFields,
  updateHospitalStatus,
  updateMarchFields,
  updatePersonFields,
  updatePersonStatus,
  updatePetFields,
  updatePostFields,
  verifyOwner,
  verifyResourceOwner,
  voteAidAvailability,
  voteHospitalSupplies,
} from "@/lib/data";
import {
  changePassword,
  deleteAccount,
  getCurrentUser,
  getMyProfile,
  requestPasswordReset,
  signIn,
  signOut,
  signUp,
  updateAvatar,
  updateEmailNotifications,
  updatePassword,
  updateRecoveryEmail,
} from "@/lib/auth";
import { isAdmin } from "@/lib/admin";
import { verifyTurnstile } from "@/lib/turnstile";
import type {
  Comment,
  CommentEntity,
  HospitalStatus,
  PersonReaction,
  PersonStatus,
  PetStatus,
  Post,
  PostType,
  ReactionKind,
  SavedEntity,
  SavedItem,
} from "@/lib/types";
import {
  aidPointSchema,
  complaintSchema,
  hospitalPatientSchema,
  hospitalSchema,
  isSafePhotoUrl,
  loginSchema,
  marchSchema,
  personSchema,
  petSchema,
  postSchema,
  signupSchema,
  statusReportSchema,
  volunteerSchema,
  heroSchema,
} from "@/lib/validation";

export type ActionResult =
  | { ok: true; message: string; id?: string; ownerToken?: string }
  | { ok: false; error: string; fieldErrors?: Record<string, string> };

/** Cambia el país activo (portada, listados, formularios). Ver `country-server.ts`. */
export async function setActiveCountryAction(country: string): Promise<void> {
  if (!isCountryCode(country)) return;
  const store = await cookies();
  store.set(COUNTRY_COOKIE, country, {
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
  revalidatePath("/", "layout");
}

function zodToFieldErrors(error: { issues: { path: (string | number)[]; message: string }[] }) {
  const fieldErrors: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? "form");
    if (!fieldErrors[key]) fieldErrors[key] = issue.message;
  }
  return fieldErrors;
}

function getField(form: FormData, name: string): string {
  const v = form.get(name);
  return typeof v === "string" ? v : "";
}

/** Foto ya subida al bucket de Storage. Descarta cualquier URL que no venga
 *  de ahí (ver `isSafePhotoUrl`): evita SSRF si alguien llama la acción
 *  directamente con una URL propia en vez de pasar por `uploadPhoto`. */
function getPhotoUrl(form: FormData): string | null {
  const raw = getField(form, "photoUrl") || null;
  return raw && isSafePhotoUrl(raw) ? raw : null;
}

// ── Cuentas (login opcional) ────────────────────────────────────────────────
export type AuthActionResult =
  | { ok: true; username: string }
  | { ok: false; error: string; fieldErrors?: Record<string, string> };

export async function signUpAction(form: FormData): Promise<AuthActionResult> {
  const token = getField(form, "cf-turnstile-response") || null;
  if (!(await verifyTurnstile(token))) {
    return { ok: false, error: "No se pudo verificar que eres una persona. Intenta de nuevo." };
  }
  const parsed = signupSchema.safeParse({
    username: getField(form, "username"),
    password: getField(form, "password"),
    email: getField(form, "email"),
  });
  if (!parsed.success) {
    return { ok: false, error: "Revisa los campos marcados.", fieldErrors: zodToFieldErrors(parsed.error) };
  }
  const res = await signUp(parsed.data);
  if (!res.ok) return { ok: false, error: res.error };
  revalidatePath("/");
  return { ok: true, username: res.username };
}

export async function signInAction(form: FormData): Promise<AuthActionResult> {
  const token = getField(form, "cf-turnstile-response") || null;
  if (!(await verifyTurnstile(token))) {
    return { ok: false, error: "No se pudo verificar que eres una persona. Intenta de nuevo." };
  }
  const parsed = loginSchema.safeParse({
    username: getField(form, "username"),
    password: getField(form, "password"),
  });
  if (!parsed.success) {
    return { ok: false, error: "Revisa los campos marcados.", fieldErrors: zodToFieldErrors(parsed.error) };
  }
  const res = await signIn(parsed.data);
  if (!res.ok) return { ok: false, error: res.error };
  revalidatePath("/");
  return { ok: true, username: res.username };
}

export async function signOutAction(): Promise<{ ok: true }> {
  await signOut();
  revalidatePath("/");
  return { ok: true };
}

/** Pide un enlace de recuperación. Respuesta SIEMPRE genérica (no revela si el
 *  usuario existe ni si tiene correo). */
export async function requestPasswordResetAction(form: FormData): Promise<{ ok: true }> {
  const token = getField(form, "cf-turnstile-response") || null;
  const username = getField(form, "username").trim();
  // Anti-bot para no permitir bombardeo de correos de recuperación. Respuesta
  // siempre genérica (no revela si el usuario existe ni si pasó la verificación).
  if (username && (await verifyTurnstile(token))) await requestPasswordReset(username);
  return { ok: true };
}

/** Fija la nueva contraseña (con la sesión de recuperación ya abierta). */
export async function updatePasswordAction(form: FormData): Promise<AuthActionResult> {
  const parsed = signupSchema.pick({ password: true }).safeParse({
    password: getField(form, "password"),
  });
  if (!parsed.success) {
    return { ok: false, error: "Revisa los campos marcados.", fieldErrors: zodToFieldErrors(parsed.error) };
  }
  const res = await updatePassword(parsed.data.password);
  if (!res.ok) return { ok: false, error: res.error };
  revalidatePath("/");
  return { ok: true, username: res.username };
}

/** Sesión actual para la UI (cabecera, banner). null si no hay login. */
export async function getSessionUserAction(): Promise<{ id: string; username: string } | null> {
  return getCurrentUser();
}

// ── Perfil y configuración de la cuenta ──────────────────────────────────────
/** Perfil completo (foto, correo de recuperación, avisos) para /perfil y /configuracion. */
export async function getMyProfileAction() {
  return getMyProfile();
}

export async function updateAvatarAction(url: string | null): Promise<{ ok: boolean }> {
  const user = await getCurrentUser();
  if (!user) return { ok: false };
  const ok = await updateAvatar(user.id, url && isSafePhotoUrl(url) ? url : null);
  if (ok) revalidatePath("/perfil");
  return { ok };
}

export async function updateRecoveryEmailAction(
  form: FormData,
): Promise<{ ok: boolean; error?: string }> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Inicia sesión." };
  const email = getField(form, "email").trim();
  if (email) {
    const parsed = signupSchema.pick({ email: true }).safeParse({ email });
    if (!parsed.success) return { ok: false, error: "Correo no válido." };
  }
  const ok = await updateRecoveryEmail(user.id, email || null);
  if (!ok) return { ok: false, error: "No se pudo actualizar. Intenta de nuevo." };
  revalidatePath("/configuracion");
  return { ok: true };
}

export async function updateEmailNotificationsAction(value: boolean): Promise<{ ok: boolean }> {
  const user = await getCurrentUser();
  if (!user) return { ok: false };
  const ok = await updateEmailNotifications(user.id, value);
  return { ok };
}

export async function changePasswordAction(
  form: FormData,
): Promise<{ ok: boolean; error?: string }> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Inicia sesión." };
  const currentPassword = getField(form, "currentPassword");
  const newPassword = getField(form, "newPassword");
  const parsed = signupSchema.pick({ password: true }).safeParse({ password: newPassword });
  if (!parsed.success) {
    return { ok: false, error: "La contraseña nueva debe tener al menos 10 caracteres." };
  }
  const res = await changePassword(currentPassword, newPassword);
  return res.ok ? { ok: true } : { ok: false, error: res.error };
}

/** Elimina la cuenta. Exige re-escribir la contraseña y el nombre de usuario
 *  (no es un solo clic). Las publicaciones quedan públicas, solo se desvinculan. */
export async function deleteAccountAction(
  form: FormData,
): Promise<{ ok: boolean; error?: string }> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Inicia sesión." };
  const password = getField(form, "password");
  const confirmUsername = getField(form, "confirmUsername");
  if (!password || !confirmUsername) {
    return { ok: false, error: "Completa la contraseña y tu nombre de usuario." };
  }
  return deleteAccount(password, confirmUsername);
}

/** Publicaciones ligadas a la cuenta con sesión (cross-device). [] sin login. */
export async function getMyPublicationsAction(): Promise<MyPublication[]> {
  const user = await getCurrentUser();
  if (!user) return [];
  return getMyPublications(user.id);
}

// ── Avisos para el autor: actividad (comentarios + reportes) por publicación ──
// Lectura sin efectos. El cliente envía las entidades que guardó en su
// dispositivo y recibe solo CONTEOS (no datos sensibles). Clave: `${tipo}:${id}`.
export async function getActivityForEntities(
  items: { type: CommentEntity; id: string }[],
): Promise<Record<string, { comments: number; reports: number }>> {
  const out: Record<string, { comments: number; reports: number }> = {};
  if (!Array.isArray(items) || items.length === 0) return out;
  const safe = items.slice(0, 100); // límite anti-abuso

  const idsByType = new Map<CommentEntity, string[]>();
  for (const it of safe) {
    if (!it || typeof it.id !== "string") continue;
    const arr = idsByType.get(it.type) ?? [];
    arr.push(it.id);
    idsByType.set(it.type, arr);
  }

  for (const [type, ids] of idsByType) {
    const comments = await getCommentsForEntities(type, ids);
    for (const id of ids) {
      out[`${type}:${id}`] = { comments: (comments[id] ?? []).length, reports: 0 };
    }
  }

  const personIds = idsByType.get("person") ?? [];
  if (personIds.length > 0) {
    const reportCounts = await getReportCountsForPersons(personIds);
    for (const id of personIds) {
      const key = `person:${id}`;
      out[key] = { comments: out[key]?.comments ?? 0, reports: reportCounts[id] ?? 0 };
    }
  }

  return out;
}

// ── Guardar / seguir publicaciones (solo con cuenta) ─────────────────────────
const SAVED_TYPES: readonly SavedEntity[] = [
  "person",
  "aid_point",
  "march",
  "post",
  "hospital",
  "complaint",
  "pet",
  "hero",
];

/** Claves `${tipo}:${id}` de lo que guardó la cuenta. [] sin sesión. */
export async function getSavedKeysAction(): Promise<string[]> {
  const user = await getCurrentUser();
  if (!user) return [];
  return getSavedKeys(user.id);
}

/** Lista completa de guardados (para la campanita). [] sin sesión. */
export async function getSavedItemsAction(): Promise<SavedItem[]> {
  const user = await getCurrentUser();
  if (!user) return [];
  return getSavedItems(user.id);
}

type SaveResult =
  | { ok: true; saved: boolean }
  | { ok: false; reason: "auth" | "invalid" };

/** Guarda/quita una publicación. Exige sesión (devuelve reason:'auth' si no). */
export async function setSavedAction(
  type: string,
  id: string,
  title: string,
  save: boolean,
): Promise<SaveResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, reason: "auth" };
  if (!SAVED_TYPES.includes(type as SavedEntity) || typeof id !== "string" || !id) {
    return { ok: false, reason: "invalid" };
  }
  const entity = type as SavedEntity;
  if (save) {
    await saveItem(user.id, entity, id, (title ?? "").trim());
  } else {
    await unsaveItem(user.id, entity, id);
  }
  return { ok: true, saved: save };
}

// ── Registrar persona desaparecida ──────────────────────────────────────────
export async function registerPersonAction(form: FormData): Promise<ActionResult> {
  const token = getField(form, "cf-turnstile-response") || null;
  if (!(await verifyTurnstile(token))) {
    return { ok: false, error: "No se pudo verificar que eres una persona. Intenta de nuevo." };
  }

  const parsed = personSchema.safeParse({
    firstName: getField(form, "firstName"),
    lastName: getField(form, "lastName"),
    cedula: getField(form, "cedula"),
    age: getField(form, "age"),
    gender: getField(form, "gender") || undefined,
    estado: getField(form, "estado") || undefined,
    locationText: getField(form, "locationText"),
    lat: getField(form, "lat") || undefined,
    lng: getField(form, "lng") || undefined,
    description: getField(form, "description"),
    isUnidentified: getField(form, "isUnidentified") === "on",
    status: getField(form, "status") || undefined,
    contactName: getField(form, "contactName"),
    contactPhone: getField(form, "contactPhone"),
    contactEmail: getField(form, "contactEmail"),
  });

  if (!parsed.success) {
    return { ok: false, error: "Revisa los campos marcados.", fieldErrors: zodToFieldErrors(parsed.error) };
  }

  // La foto: en producción se sube a Supabase Storage desde el cliente y aquí
  // llega la URL. De momento aceptamos la URL ya subida (o null).
  const photoUrl = getPhotoUrl(form);

  // Un avistamiento "sin identificar" puede no tener nombre, pero algo debe
  // permitir reconocer a la persona: foto, un rasgo/descripción o el lugar.
  if (parsed.data.isUnidentified) {
    const hasClue =
      photoUrl ||
      (parsed.data.firstName ?? "").trim() ||
      (parsed.data.description ?? "").trim() ||
      (parsed.data.locationText ?? "").trim();
    if (!hasClue) {
      return {
        ok: false,
        error:
          "Para alguien sin identificar, sube al menos una foto, o indica un rasgo/descripción o el lugar donde la viste.",
      };
    }
  }

  try {
    const { person, ownerToken } = await createPerson(
      { ...parsed.data, country: await getActiveCountry() },
      photoUrl,
      (await getCurrentUser())?.id ?? null,
    );
    revalidatePath("/");
    revalidatePath("/se-busca");
    revalidatePath("/sin-identificar");
    return {
      ok: true,
      message: "Registro publicado. Gracias por ayudar a localizar a esta persona.",
      id: person.id,
      ownerToken,
    };
  } catch {
    return { ok: false, error: "No se pudo guardar el registro. Intenta de nuevo." };
  }
}

// ── Reportar cambio de estado ("tengo información" / "lo encontré") ──────────
export async function reportStatusAction(form: FormData): Promise<ActionResult> {
  const token = getField(form, "cf-turnstile-response") || null;
  if (!(await verifyTurnstile(token))) {
    return { ok: false, error: "No se pudo verificar que eres una persona. Intenta de nuevo." };
  }

  const parsed = statusReportSchema.safeParse({
    personId: getField(form, "personId"),
    reportedStatus: getField(form, "reportedStatus"),
    reporterName: getField(form, "reporterName"),
    reporterPhone: getField(form, "reporterPhone"),
    reporterRelationship: getField(form, "reporterRelationship"),
    locationFound: getField(form, "locationFound"),
    notes: getField(form, "notes"),
  });

  if (!parsed.success) {
    return { ok: false, error: "Revisa los campos marcados.", fieldErrors: zodToFieldErrors(parsed.error) };
  }

  try {
    const report = await createStatusReport(parsed.data);
    revalidatePath("/");
    revalidatePath("/se-busca");
    revalidatePath(`/persona/${parsed.data.personId}`);
    return {
      ok: true,
      id: report.id,
      message:
        "Gracias. Tu reporte ya es visible en la ficha de la persona. Un moderador lo verificará para confirmar el cambio de estado oficial; mientras tanto, la información ya ayuda a quien busca.",
    };
  } catch {
    return { ok: false, error: "No se pudo enviar el reporte. Intenta de nuevo." };
  }
}

// ── Registrar punto de ayuda ─────────────────────────────────────────────────
export async function registerAidPointAction(form: FormData): Promise<ActionResult> {
  const token = getField(form, "cf-turnstile-response") || null;
  if (!(await verifyTurnstile(token))) {
    return { ok: false, error: "No se pudo verificar que eres una persona. Intenta de nuevo." };
  }

  const parsed = aidPointSchema.safeParse({
    name: getField(form, "name"),
    types: form.getAll("types").filter((v): v is string => typeof v === "string"),
    estado: getField(form, "estado") || undefined,
    locationText: getField(form, "locationText"),
    lat: getField(form, "lat") || undefined,
    lng: getField(form, "lng") || undefined,
    scheduleText: getField(form, "scheduleText"),
    description: getField(form, "description"),
    contactName: getField(form, "contactName"),
    contactPhone: getField(form, "contactPhone"),
  });

  if (!parsed.success) {
    return { ok: false, error: "Revisa los campos marcados.", fieldErrors: zodToFieldErrors(parsed.error) };
  }

  const photoUrl = getPhotoUrl(form);

  try {
    const { point, ownerToken } = await createAidPoint(
      { ...parsed.data, country: await getActiveCountry() },
      photoUrl,
      (await getCurrentUser())?.id ?? null,
    );
    revalidatePath("/ayuda");
    revalidatePath("/mapa");
    return {
      ok: true,
      id: point.id,
      ownerToken,
      message: "Punto de ayuda publicado. Aparecerá como 'por verificar' hasta que se confirme.",
    };
  } catch {
    return { ok: false, error: "No se pudo guardar el punto. Intenta de nuevo." };
  }
}

// ── Registrar marcha / caravana ──────────────────────────────────────────────
export async function registerMarchAction(form: FormData): Promise<ActionResult> {
  const token = getField(form, "cf-turnstile-response") || null;
  if (!(await verifyTurnstile(token))) {
    return { ok: false, error: "No se pudo verificar que eres una persona. Intenta de nuevo." };
  }

  const parsed = marchSchema.safeParse({
    title: getField(form, "title"),
    originText: getField(form, "originText"),
    destinationText: getField(form, "destinationText"),
    departAt: getField(form, "departAt"),
    organizerName: getField(form, "organizerName"),
    organizerPhone: getField(form, "organizerPhone"),
    whatsappUrl: getField(form, "whatsappUrl"),
    description: getField(form, "description"),
  });

  if (!parsed.success) {
    return { ok: false, error: "Revisa los campos marcados.", fieldErrors: zodToFieldErrors(parsed.error) };
  }

  try {
    const { march, ownerToken } = await createMarch(
      parsed.data,
      (await getCurrentUser())?.id ?? null,
    );
    revalidatePath("/caravanas");
    revalidatePath("/mapa");
    return {
      ok: true,
      id: march.id,
      ownerToken,
      message: "Convocatoria publicada. Comparte el punto de salida con tu comunidad.",
    };
  } catch {
    return { ok: false, error: "No se pudo publicar la convocatoria. Intenta de nuevo." };
  }
}

// ── Comentario en el foro ────────────────────────────────────────────────────
// Coincide EXACTO con el CHECK de `comments.entity_type` en schema.sql — el
// campo llega en un <input hidden> del formulario, así que hay que
// revalidarlo en el servidor como cualquier otro dato del cliente (antes
// solo tenía un `as` de TypeScript, que no valida nada en tiempo de
// ejecución: alguien podía mandar cualquier texto ahí).
const COMMENT_ENTITY_TYPES: readonly CommentEntity[] = [
  "person",
  "aid_point",
  "march",
  "post",
  "hospital",
  "complaint",
  "pet",
  "hero",
  "news_item",
];

export async function postCommentAction(form: FormData): Promise<ActionResult> {
  const entityTypeRaw = getField(form, "entityType");
  if (!COMMENT_ENTITY_TYPES.includes(entityTypeRaw as CommentEntity)) {
    return { ok: false, error: "Tipo de publicación no válido." };
  }
  const entityType = entityTypeRaw as CommentEntity;
  const entityId = getField(form, "entityId");
  // Con sesión, el nombre del comentario es el de la cuenta (identidad verificada),
  // no lo que venga del formulario.
  const sessionUser = await getCurrentUser();
  const authorName = sessionUser ? sessionUser.username : getField(form, "authorName").trim();
  const body = getField(form, "body").trim();
  const photoUrl = getPhotoUrl(form);
  const parentId = getField(form, "parentId") || null;

  // Anti-bot solo para anónimos; con sesión (identidad verificada) no hace falta.
  if (!sessionUser) {
    const token = getField(form, "cf-turnstile-response") || null;
    if (!(await verifyTurnstile(token))) {
      return { ok: false, error: "No se pudo verificar que eres una persona. Intenta de nuevo." };
    }
  }

  if (!entityId || authorName.length < 2 || (body.length < 2 && !photoUrl)) {
    return { ok: false, error: "Escribe tu nombre y un comentario (o adjunta una foto)." };
  }
  if (body.length > 1000) {
    return { ok: false, error: "El comentario es demasiado largo." };
  }

  try {
    const comment = await createComment(
      entityType,
      entityId,
      authorName,
      body,
      photoUrl,
      parentId,
      sessionUser?.id ?? null,
    );
    return { ok: true, message: "Comentario publicado.", id: comment.id };
  } catch {
    return { ok: false, error: "No se pudo publicar el comentario." };
  }
}

export async function likeCommentAction(id: string): Promise<{ ok: boolean }> {
  try {
    await likeComment(id);
    return { ok: true };
  } catch {
    return { ok: false };
  }
}

// ── "Me gusta" en publicaciones de recursos ──────────────────────────────────
export async function likeAidPointAction(id: string): Promise<{ ok: boolean }> {
  try {
    await likeAidPoint(id);
    revalidatePath("/ayuda");
    revalidatePath(`/ayuda/${id}`);
    return { ok: true };
  } catch {
    return { ok: false };
  }
}

export async function likeMarchAction(id: string): Promise<{ ok: boolean }> {
  try {
    await likeMarch(id);
    revalidatePath("/caravanas");
    revalidatePath(`/caravanas/${id}`);
    return { ok: true };
  } catch {
    return { ok: false };
  }
}

export async function likeHospitalAction(id: string): Promise<{ ok: boolean }> {
  try {
    await likeHospital(id);
    revalidatePath("/hospitales");
    revalidatePath(`/hospitales/${id}`);
    return { ok: true };
  } catch {
    return { ok: false };
  }
}

// ── Comunidad / Feed ─────────────────────────────────────────────────────────
/** Siguiente tanda del muro para el scroll infinito (mismo filtro/orden que
 *  cargó la página inicialmente). Devuelve cada post ya con sus comentarios
 *  (una sola consulta por lote) para que `PostCard` no tenga que pedirlos aparte. */
export async function getMorePostsAction(
  filter: { type?: PostType | "all"; search?: string; estado?: string | "all"; dateFrom?: string; dateTo?: string },
  page: number,
  pageSize: number,
  sort: PostSort,
): Promise<{ items: (Post & { comments: Comment[] })[]; hasMore: boolean }> {
  const pageResult = await getPostsPage({ ...filter, country: await getActiveCountry() }, page, pageSize, sort);
  const commentsByPost = await getCommentsForEntities("post", pageResult.items.map((p) => p.id));
  const items = pageResult.items.map((post) => ({ ...post, comments: commentsByPost[post.id] ?? [] }));
  const hasMore = page * pageSize < pageResult.total;
  return { items, hasMore };
}

export async function createPostAction(form: FormData): Promise<ActionResult> {
  const token = getField(form, "cf-turnstile-response") || null;
  if (!(await verifyTurnstile(token))) {
    return { ok: false, error: "No se pudo verificar que eres una persona. Intenta de nuevo." };
  }

  const parsed = postSchema.safeParse({
    type: getField(form, "type"),
    body: getField(form, "body"),
    estado: getField(form, "estado") || undefined,
    locationText: getField(form, "locationText"),
    linkUrl: getField(form, "linkUrl"),
    authorName: getField(form, "authorName"),
    contactPhone: getField(form, "contactPhone"),
  });

  if (!parsed.success) {
    return { ok: false, error: "Revisa los campos marcados.", fieldErrors: zodToFieldErrors(parsed.error) };
  }

  const photoUrl = getPhotoUrl(form);

  try {
    const { post, ownerToken } = await createPost(
      { ...parsed.data, country: await getActiveCountry() },
      photoUrl,
      (await getCurrentUser())?.id ?? null,
    );
    revalidatePath("/comunidad");
    return {
      ok: true,
      id: post.id,
      ownerToken,
      message: "Publicado. Gracias por mantener informada a la comunidad.",
    };
  } catch {
    return { ok: false, error: "No se pudo publicar. Intenta de nuevo." };
  }
}

// ── Mascotas ──────────────────────────────────────────────────────────────────
export async function registerPetAction(form: FormData): Promise<ActionResult> {
  const token = getField(form, "cf-turnstile-response") || null;
  if (!(await verifyTurnstile(token))) {
    return { ok: false, error: "No se pudo verificar que eres una persona. Intenta de nuevo." };
  }

  const parsed = petSchema.safeParse({
    status: getField(form, "status"),
    species: getField(form, "species"),
    name: getField(form, "name"),
    description: getField(form, "description"),
    estado: getField(form, "estado") || undefined,
    locationText: getField(form, "locationText"),
    contactPhone: getField(form, "contactPhone"),
  });
  if (!parsed.success) {
    return { ok: false, error: "Revisa los campos marcados.", fieldErrors: zodToFieldErrors(parsed.error) };
  }

  const photoUrl = getPhotoUrl(form);

  try {
    const { pet, ownerToken } = await createPet(
      parsed.data,
      photoUrl,
      (await getCurrentUser())?.id ?? null,
    );
    revalidatePath("/mascotas");
    return {
      ok: true,
      id: pet.id,
      ownerToken,
      message: "Publicado. Gracias por ayudar a reunir a las mascotas con su familia.",
    };
  } catch {
    return { ok: false, error: "No se pudo publicar. Intenta de nuevo." };
  }
}

// ── Gestión por el autor de una mascota (enlace privado) ────────────────────
export async function ownerUpdatePetAction(form: FormData): Promise<ActionResult> {
  const id = getField(form, "petId");
  const token = getField(form, "token");
  if (!(await verifyResourceOwner("pet", id, token))) {
    return { ok: false, error: "Enlace de gestión no válido." };
  }

  const parsed = petSchema.safeParse({
    status: getField(form, "status"),
    species: getField(form, "species"),
    name: getField(form, "name"),
    description: getField(form, "description"),
    estado: getField(form, "estado") || undefined,
    locationText: getField(form, "locationText"),
    contactPhone: getField(form, "contactPhone"),
  });
  if (!parsed.success) {
    return { ok: false, error: "Revisa los campos marcados.", fieldErrors: zodToFieldErrors(parsed.error) };
  }

  try {
    await updatePetFields(id, parsed.data);
    revalidatePath(`/mascotas/${id}`);
    revalidatePath("/mascotas");
    return { ok: true, message: "Mascota actualizada." };
  } catch {
    return { ok: false, error: "No se pudo actualizar. Intenta de nuevo." };
  }
}

/** El AUTOR de la mascota (o el admin) marca perdida/encontrada/refugio/veterinario. */
export async function ownerSetPetStatusAction(
  id: string,
  token: string,
  status: PetStatus,
): Promise<{ ok: boolean; error?: string }> {
  if (!(await verifyResourceOwner("pet", id, token))) {
    return { ok: false, error: "Enlace de gestión no válido." };
  }
  try {
    await setPetStatus(id, status);
    revalidatePath("/mascotas");
    revalidatePath(`/mascotas/${id}`);
    return { ok: true };
  } catch {
    return { ok: false, error: "No se pudo actualizar el estado." };
  }
}

export async function ownerDeletePetAction(
  id: string,
  token: string,
): Promise<{ ok: boolean; error?: string }> {
  if (!(await verifyResourceOwner("pet", id, token)))
    return { ok: false, error: "Enlace de gestión no válido." };
  try {
    await deletePet(id);
    revalidatePath("/mascotas");
    return { ok: true };
  } catch {
    return { ok: false, error: "No se pudo eliminar." };
  }
}

// ── Voluntarios ───────────────────────────────────────────────────────────────
export async function registerVolunteerAction(form: FormData): Promise<ActionResult> {
  const token = getField(form, "cf-turnstile-response") || null;
  if (!(await verifyTurnstile(token))) {
    return { ok: false, error: "No se pudo verificar que eres una persona. Intenta de nuevo." };
  }

  const parsed = volunteerSchema.safeParse({
    type: getField(form, "type"),
    name: getField(form, "name"),
    availabilityText: getField(form, "availabilityText"),
    skillsText: getField(form, "skillsText"),
    estado: getField(form, "estado") || undefined,
    locationText: getField(form, "locationText"),
    lat: getField(form, "lat") || undefined,
    lng: getField(form, "lng") || undefined,
    contactPhone: getField(form, "contactPhone"),
    contactEmail: getField(form, "contactEmail"),
  });
  if (!parsed.success) {
    return { ok: false, error: "Revisa los campos marcados.", fieldErrors: zodToFieldErrors(parsed.error) };
  }

  const photoUrl = getPhotoUrl(form);

  try {
    const volunteer = await createVolunteer(parsed.data, photoUrl, (await getCurrentUser())?.id ?? null);
    revalidatePath("/voluntarios");
    revalidatePath("/");
    return { ok: true, id: volunteer.id, message: "¡Gracias por ofrecerte! Tu disponibilidad ya es visible." };
  } catch {
    return { ok: false, error: "No se pudo publicar. Intenta de nuevo." };
  }
}

// ── Héroes ───────────────────────────────────────────────────────────────────
// Cualquiera puede PROPONER un héroe (Turnstile). Aparece como "sin verificar"
// hasta que un moderador le da el visto bueno; el admin puede eliminar lo falso.
// Quien tenga sesión queda como autor; si no, "Comunidad".
export async function registerHeroAction(form: FormData): Promise<ActionResult> {
  const token = getField(form, "cf-turnstile-response") || null;
  if (!(await verifyTurnstile(token))) {
    return { ok: false, error: "No se pudo verificar que eres una persona. Intenta de nuevo." };
  }

  const parsed = heroSchema.safeParse({
    category: getField(form, "category"),
    title: getField(form, "title"),
    body: getField(form, "body"),
    estado: getField(form, "estado") || undefined,
    locationText: getField(form, "locationText"),
    sourceName: getField(form, "sourceName"),
    sourceUrl: getField(form, "sourceUrl"),
  });
  if (!parsed.success) {
    return { ok: false, error: "Revisa los campos marcados.", fieldErrors: zodToFieldErrors(parsed.error) };
  }

  const photoUrl = getPhotoUrl(form);
  const authorName = (await getCurrentUser())?.username ?? "Comunidad";

  try {
    const hero = await createHero(parsed.data, photoUrl, authorName);
    revalidatePath("/ayuda");
    return {
      ok: true,
      id: hero.id,
      message:
        "¡Gracias! Tu propuesta ya aparece como «sin verificar». Un moderador la revisará para darle el visto bueno.",
    };
  } catch {
    return { ok: false, error: "No se pudo publicar. Intenta de nuevo." };
  }
}

export async function likeHeroAction(id: string): Promise<{ ok: boolean }> {
  try {
    await likeHero(id);
    revalidatePath("/ayuda");
    return { ok: true };
  } catch {
    return { ok: false };
  }
}

export async function likeNewsItemAction(id: string): Promise<{ ok: boolean }> {
  try {
    await likeNewsItem(id);
    // No sabemos aquí si es kind=ayuda o kind=noticia (solo el id); se
    // revalidan ambos destinos posibles, es barato.
    revalidatePath("/ayuda");
    revalidatePath("/comunidad");
    return { ok: true };
  } catch {
    return { ok: false };
  }
}

// ── Denuncias de irregularidades ─────────────────────────────────────────────
// Publicar EXIGE sesión (responsabilidad: no anónimo frente al sistema). El
// nombre mostrado es el de la cuenta. La UI muestra el aviso legal y pide
// confirmación antes de enviar.
export async function createComplaintAction(form: FormData): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) {
    return { ok: false, error: "Inicia sesión para denunciar. Las denuncias no son anónimas ante el sistema." };
  }

  const parsed = complaintSchema.safeParse({
    category: getField(form, "category"),
    body: getField(form, "body"),
    estado: getField(form, "estado") || undefined,
    locationText: getField(form, "locationText"),
  });
  if (!parsed.success) {
    return { ok: false, error: "Revisa los campos marcados.", fieldErrors: zodToFieldErrors(parsed.error) };
  }

  const photoUrl = getPhotoUrl(form);

  try {
    const complaint = await createComplaint(parsed.data, photoUrl, user.id, user.username);
    revalidatePath("/denuncias");
    return {
      ok: true,
      id: complaint.id,
      message: "Denuncia publicada. Gracias por reportar de forma responsable.",
    };
  } catch {
    return { ok: false, error: "No se pudo publicar la denuncia. Intenta de nuevo." };
  }
}

export async function supportComplaintAction(id: string): Promise<{ ok: boolean; error?: string }> {
  if (!(await getCurrentUser())) {
    return { ok: false, error: "Inicia sesión para apoyar una denuncia." };
  }
  try {
    await supportComplaint(id);
    revalidatePath("/denuncias");
    return { ok: true };
  } catch {
    return { ok: false, error: "No se pudo registrar tu apoyo." };
  }
}

// ── Gestión por el autor de publicaciones de la comunidad (enlace privado) ───
export async function ownerUpdatePostAction(form: FormData): Promise<ActionResult> {
  const id = getField(form, "postId");
  const token = getField(form, "token");
  if (!(await verifyResourceOwner("post", id, token))) {
    return { ok: false, error: "Enlace de gestión no válido." };
  }

  const parsed = postSchema.safeParse({
    type: getField(form, "type"),
    body: getField(form, "body"),
    estado: getField(form, "estado") || undefined,
    locationText: getField(form, "locationText"),
    linkUrl: getField(form, "linkUrl"),
    authorName: getField(form, "authorName"),
    contactPhone: getField(form, "contactPhone"),
  });
  if (!parsed.success) {
    return { ok: false, error: "Revisa los campos marcados.", fieldErrors: zodToFieldErrors(parsed.error) };
  }

  try {
    await updatePostFields(id, parsed.data);
    revalidatePath("/comunidad");
    return { ok: true, message: "Publicación actualizada." };
  } catch {
    return { ok: false, error: "No se pudo actualizar. Intenta de nuevo." };
  }
}

export async function ownerDeletePostAction(
  id: string,
  token: string,
): Promise<{ ok: boolean; error?: string }> {
  if (!(await verifyResourceOwner("post", id, token)))
    return { ok: false, error: "Enlace de gestión no válido." };
  try {
    await deletePost(id);
    revalidatePath("/comunidad");
    return { ok: true };
  } catch {
    return { ok: false, error: "No se pudo eliminar." };
  }
}

export async function reactToPostAction(id: string, kind: ReactionKind): Promise<{ ok: boolean }> {
  try {
    await reactToPost(id, kind);
    revalidatePath("/comunidad");
    return { ok: true };
  } catch {
    return { ok: false };
  }
}

/** Comentarios de una persona, para el modal de info dentro de la baraja tipo
 *  Tinder (no se cargan todos de una en el servidor: se piden al abrir). */
export async function getPersonCommentsAction(personId: string) {
  return getComments("person", personId);
}

export async function reactToPersonAction(
  id: string,
  kind: PersonReaction,
): Promise<{ ok: boolean }> {
  try {
    await reactToPerson(id, kind);
    revalidatePath(`/persona/${id}`);
    return { ok: true };
  } catch {
    return { ok: false };
  }
}

// ── Gestión por el autor (enlace privado con token) ──────────────────────────
export async function ownerSetStatusAction(
  id: string,
  token: string,
  status: PersonStatus,
): Promise<{ ok: boolean; error?: string }> {
  if (!(await verifyOwner(id, token))) return { ok: false, error: "Enlace de gestión no válido." };
  try {
    await updatePersonStatus(id, status);
    revalidatePath(`/persona/${id}`);
    revalidatePath("/");
    revalidatePath("/se-busca");
    return { ok: true };
  } catch {
    return { ok: false, error: "No se pudo actualizar." };
  }
}

export async function ownerUpdateAction(form: FormData): Promise<ActionResult> {
  const id = getField(form, "personId");
  const token = getField(form, "token");
  if (!(await verifyOwner(id, token))) {
    return { ok: false, error: "Enlace de gestión no válido." };
  }

  const parsed = personSchema.safeParse({
    firstName: getField(form, "firstName"),
    lastName: getField(form, "lastName"),
    age: getField(form, "age"),
    gender: getField(form, "gender") || undefined,
    estado: getField(form, "estado") || undefined,
    locationText: getField(form, "locationText"),
    lat: getField(form, "lat") || undefined,
    lng: getField(form, "lng") || undefined,
    description: getField(form, "description"),
    // Reflejamos si la persona es "sin identificar" para no exigir nombre al editarla.
    isUnidentified: getField(form, "isUnidentified") === "on",
    contactName: getField(form, "contactName"),
    contactPhone: getField(form, "contactPhone"),
    contactEmail: getField(form, "contactEmail"),
  });
  if (!parsed.success) {
    return { ok: false, error: "Revisa los campos marcados.", fieldErrors: zodToFieldErrors(parsed.error) };
  }

  try {
    await updatePersonFields(id, parsed.data);
    revalidatePath(`/persona/${id}`);
    return { ok: true, message: "Datos actualizados." };
  } catch {
    return { ok: false, error: "No se pudo actualizar. Intenta de nuevo." };
  }
}

export async function ownerDeleteAction(
  id: string,
  token: string,
): Promise<{ ok: boolean; error?: string }> {
  if (!(await verifyOwner(id, token))) return { ok: false, error: "Enlace de gestión no válido." };
  try {
    await deletePerson(id);
    revalidatePath("/");
    revalidatePath("/se-busca");
    revalidatePath("/sin-identificar");
    return { ok: true };
  } catch {
    return { ok: false, error: "No se pudo eliminar." };
  }
}

// ── Gestión por el autor de puntos de ayuda y caravanas (enlace privado) ─────
export async function ownerUpdateAidPointAction(form: FormData): Promise<ActionResult> {
  const id = getField(form, "aidPointId");
  const token = getField(form, "token");
  if (!(await verifyResourceOwner("aid_point", id, token))) {
    return { ok: false, error: "Enlace de gestión no válido." };
  }

  const parsed = aidPointSchema.safeParse({
    name: getField(form, "name"),
    types: form.getAll("types").filter((v): v is string => typeof v === "string"),
    estado: getField(form, "estado") || undefined,
    locationText: getField(form, "locationText"),
    lat: getField(form, "lat") || undefined,
    lng: getField(form, "lng") || undefined,
    scheduleText: getField(form, "scheduleText"),
    description: getField(form, "description"),
    contactName: getField(form, "contactName"),
    contactPhone: getField(form, "contactPhone"),
  });
  if (!parsed.success) {
    return { ok: false, error: "Revisa los campos marcados.", fieldErrors: zodToFieldErrors(parsed.error) };
  }

  try {
    await updateAidPointFields(id, parsed.data);
    revalidatePath(`/ayuda/${id}`);
    revalidatePath("/ayuda");
    revalidatePath("/mapa");
    return { ok: true, message: "Punto actualizado." };
  } catch {
    return { ok: false, error: "No se pudo actualizar. Intenta de nuevo." };
  }
}

export async function ownerDeleteAidPointAction(
  id: string,
  token: string,
): Promise<{ ok: boolean; error?: string }> {
  if (!(await verifyResourceOwner("aid_point", id, token)))
    return { ok: false, error: "Enlace de gestión no válido." };
  try {
    await deleteAidPoint(id);
    revalidatePath("/ayuda");
    revalidatePath("/mapa");
    return { ok: true };
  } catch {
    return { ok: false, error: "No se pudo eliminar." };
  }
}

export async function ownerUpdateMarchAction(form: FormData): Promise<ActionResult> {
  const id = getField(form, "marchId");
  const token = getField(form, "token");
  if (!(await verifyResourceOwner("march", id, token))) {
    return { ok: false, error: "Enlace de gestión no válido." };
  }

  const parsed = marchSchema.safeParse({
    title: getField(form, "title"),
    originText: getField(form, "originText"),
    destinationText: getField(form, "destinationText"),
    departAt: getField(form, "departAt"),
    organizerName: getField(form, "organizerName"),
    organizerPhone: getField(form, "organizerPhone"),
    whatsappUrl: getField(form, "whatsappUrl"),
    description: getField(form, "description"),
  });
  if (!parsed.success) {
    return { ok: false, error: "Revisa los campos marcados.", fieldErrors: zodToFieldErrors(parsed.error) };
  }

  try {
    await updateMarchFields(id, parsed.data);
    revalidatePath(`/caravanas/${id}`);
    revalidatePath("/caravanas");
    revalidatePath("/mapa");
    return { ok: true, message: "Caravana actualizada." };
  } catch {
    return { ok: false, error: "No se pudo actualizar. Intenta de nuevo." };
  }
}

export async function ownerDeleteMarchAction(
  id: string,
  token: string,
): Promise<{ ok: boolean; error?: string }> {
  if (!(await verifyResourceOwner("march", id, token)))
    return { ok: false, error: "Enlace de gestión no válido." };
  try {
    await deleteMarch(id);
    revalidatePath("/caravanas");
    revalidatePath("/mapa");
    return { ok: true };
  } catch {
    return { ok: false, error: "No se pudo eliminar." };
  }
}

export async function voteAidAvailabilityAction(
  id: string,
  vote: "available" | "depleted",
): Promise<{ ok: boolean; error?: string }> {
  // Votar es una señal NO vinculante y requiere sesión (anti-spam). La
  // disponibilidad oficial la fija el dueño del punto o el admin.
  const user = await getCurrentUser();
  if (!user) {
    return { ok: false, error: "Inicia sesión para opinar sobre la disponibilidad." };
  }
  try {
    await voteAidAvailability(id, vote, user.id);
    revalidatePath("/ayuda");
    revalidatePath("/mapa");
    return { ok: true };
  } catch {
    return { ok: false, error: "No se pudo registrar tu voto." };
  }
}

/** El AUTOR del punto (o el admin) marca disponible/agotado. */
export async function ownerSetAidAvailabilityAction(
  id: string,
  token: string,
  available: boolean,
): Promise<{ ok: boolean; error?: string }> {
  if (!(await verifyResourceOwner("aid_point", id, token))) {
    return { ok: false, error: "Enlace de gestión no válido." };
  }
  try {
    await setAidAvailability(id, available);
    revalidatePath("/ayuda");
    revalidatePath(`/ayuda/${id}`);
    revalidatePath("/mapa");
    return { ok: true };
  } catch {
    return { ok: false, error: "No se pudo actualizar la disponibilidad." };
  }
}

export async function voteHospitalSuppliesAction(
  id: string,
  vote: "yes" | "no",
): Promise<{ ok: boolean; error?: string }> {
  const user = await getCurrentUser();
  if (!user) {
    return { ok: false, error: "Inicia sesión para opinar sobre los insumos." };
  }
  try {
    await voteHospitalSupplies(id, vote, user.id);
    revalidatePath("/hospitales");
    revalidatePath(`/hospitales/${id}`);
    return { ok: true };
  } catch {
    return { ok: false, error: "No se pudo registrar tu voto." };
  }
}

// ── Hospitales ───────────────────────────────────────────────────────────────
export async function registerHospitalAction(form: FormData): Promise<ActionResult> {
  const token = getField(form, "cf-turnstile-response") || null;
  if (!(await verifyTurnstile(token))) {
    return { ok: false, error: "No se pudo verificar que eres una persona. Intenta de nuevo." };
  }

  const parsed = hospitalSchema.safeParse({
    name: getField(form, "name"),
    estado: getField(form, "estado") || undefined,
    locationText: getField(form, "locationText"),
    lat: getField(form, "lat") || undefined,
    lng: getField(form, "lng") || undefined,
    status: getField(form, "status"),
    specialties: getField(form, "specialties"),
    needsText: getField(form, "needsText"),
    contactName: getField(form, "contactName"),
    contactPhone: getField(form, "contactPhone"),
  });

  if (!parsed.success) {
    return { ok: false, error: "Revisa los campos marcados.", fieldErrors: zodToFieldErrors(parsed.error) };
  }

  try {
    const hospital = await createHospital(
      { ...parsed.data, country: await getActiveCountry() },
      (await getCurrentUser())?.id ?? null,
    );
    revalidatePath("/hospitales");
    revalidatePath("/mapa");
    return { ok: true, id: hospital.id, message: "Hospital publicado. Aparecerá como 'por verificar' hasta que se confirme." };
  } catch {
    return { ok: false, error: "No se pudo publicar el hospital. Intenta de nuevo." };
  }
}

/** ¿Puede el usuario actual gestionar el estado oficial de este hospital?
 *  (admin, autor por cuenta o gestor delegado). Lo usa la UI para decidir si
 *  muestra el control de edición. */
export async function canManageHospitalAction(id: string): Promise<boolean> {
  if (await isAdmin()) return true;
  return canManageHospital(id);
}

export async function updateHospitalStatusAction(
  id: string,
  status: HospitalStatus,
  needsText: string,
): Promise<{ ok: boolean; error?: string }> {
  // El estado oficial (capacidad/insumos) lo fija el ADMIN, el autor por cuenta
  // o un GESTOR delegado. El resto de la comunidad opina con el voto de insumos
  // (no vinculante) o por comentarios. No basta con tener sesión.
  if (!(await isAdmin()) && !(await canManageHospital(id))) {
    return {
      ok: false,
      error:
        "Solo el equipo o un gestor designado puede actualizar el estado oficial. Puedes opinar con el voto de insumos o por comentarios.",
    };
  }
  try {
    await updateHospitalStatus(id, status, needsText);
    revalidatePath("/hospitales");
    revalidatePath(`/hospitales/${id}`);
    revalidatePath("/mapa");
    return { ok: true };
  } catch {
    return { ok: false };
  }
}

export async function addHospitalPatientAction(form: FormData): Promise<ActionResult> {
  const hospitalId = getField(form, "hospitalId");
  // Agregar un "paciente" (nombre + cédula real) exige permiso: admin, autor
  // por cuenta, gestor delegado de ESE hospital, o moderador de hospitales.
  // Antes estaba abierto a cualquier visitante sin sesión (ver INFORME-SEGURIDAD.md).
  if (!(await isAdmin()) && !(await canManageHospital(hospitalId))) {
    return {
      ok: false,
      error: "Solo el personal autorizado de este hospital puede agregar pacientes a la lista.",
    };
  }

  const token = getField(form, "cf-turnstile-response") || null;
  if (!(await verifyTurnstile(token))) {
    return { ok: false, error: "No se pudo verificar que eres una persona. Intenta de nuevo." };
  }

  const parsed = hospitalPatientSchema.safeParse({
    hospitalId: getField(form, "hospitalId"),
    fullName: getField(form, "fullName"),
    cedula: getField(form, "cedula"),
    condition: getField(form, "condition"),
    status: getField(form, "status"),
    note: getField(form, "note"),
  });

  if (!parsed.success) {
    return { ok: false, error: "Revisa los campos marcados.", fieldErrors: zodToFieldErrors(parsed.error) };
  }

  try {
    await addHospitalPatient(parsed.data);
    revalidatePath(`/hospitales/${parsed.data.hospitalId}`);
    revalidatePath("/hospitales");
    return { ok: true, message: "Paciente agregado a la lista del hospital." };
  } catch {
    return { ok: false, error: "No se pudo agregar. Intenta de nuevo." };
  }
}
