import { unstable_cache } from "next/cache";
import { randomUUID } from "node:crypto";
import { getSupabase, getSupabaseAdmin, isSupabaseConfigured } from "./supabase";
import { getCurrentUser } from "./auth";
import { COUNTRIES, COUNTRY_CODES, DEFAULT_COUNTRY, isCountryCode, type CountryCode } from "./countries";
import { haversineKm } from "./geo";
import {
  seedAidPoints,
  seedComments,
  seedComplaints,
  seedHeroes,
  seedNewsItems,
  seedHospitalPatients,
  seedHospitals,
  seedMarches,
  seedPersons,
  seedPets,
  seedPosts,
  seedStatusReports,
  seedVolunteers,
} from "./seed";
import type {
  AidPoint,
  AidPointType,
  AppRole,
  AppRoleGrant,
  Comment,
  Complaint,
  ComplaintCategory,
  Estado,
  Hero,
  NewsItem,
  Hospital,
  HospitalPatient,
  HospitalStatus,
  ManagedEntity,
  March,
  Person,
  PersonCause,
  PersonReaction,
  ManagerRequest,
  PersonStatus,
  Pet,
  PetStatus,
  Post,
  PostType,
  ReactionKind,
  ResourceManager,
  ResourceOwnerEntity,
  SavedEntity,
  SavedItem,
  Stats,
  StatusReport,
  Volunteer,
  VolunteerType,
} from "./types";
import type {
  AidPointInput,
  ComplaintInput,
  HeroInput,
  NewsItemInput,
  HospitalInput,
  HospitalPatientInput,
  MarchInput,
  PersonInput,
  PetInput,
  PostInput,
  StatusReportInput,
  VolunteerInput,
} from "./validation";
import { isSafePhotoUrl } from "./validation";

// ─────────────────────────────────────────────────────────────────────────
// Capa de acceso a datos. Una sola interfaz; dos implementaciones:
//   • Supabase (producción)  • Memoria con datos de ejemplo (desarrollo)
// La UI nunca habla con la base de datos directamente: siempre pasa por aquí.
// ─────────────────────────────────────────────────────────────────────────

export type PersonSort = "recent" | "name" | "estado" | "distance";

// Cuántos días después del sismo del país activo "Se busca" prioriza los
// casos ligados al desastre por encima de cualquier otro (dentro del orden
// "Más recientes", el único que aplica esta prioridad). Pasada la ventana, se
// vuelve a ordenar por fecha de publicación sin importar la causa — así no se
// entierran para siempre las desapariciones cotidianas ajenas al terremoto.
const PRIORITY_WINDOW_DAYS = 45;

function isWithinPriorityWindow(country: string): boolean {
  const cfg = COUNTRIES[isCountryCode(country) ? country : DEFAULT_COUNTRY];
  const quakeDate = new Date(`${cfg.quakeInfo.dateISO}T00:00:00Z`).getTime();
  const days = (Date.now() - quakeDate) / (1000 * 60 * 60 * 24);
  return days >= 0 && days <= PRIORITY_WINDOW_DAYS;
}

export interface PersonQuery {
  /** País/instancia de desastre activo. Ausente = 've' (Venezuela, compatibilidad). */
  country?: string;
  search?: string;
  status?: PersonStatus | "all";
  estado?: string | "all";
  gender?: string | "all";
  cause?: PersonCause | "all";
  minAge?: number;
  maxAge?: number;
  dateFrom?: string;
  dateTo?: string;
  unidentifiedOnly?: boolean;
  excludeUnidentified?: boolean;
  /** Solo casos aún no resueltos (excluye Localizado y Confirmado sin vida).
   *  Usado en "¿La reconoces?": no tiene sentido pedirle a la gente que
   *  reconozca a alguien que ya apareció. */
  unresolvedOnly?: boolean;
  hospitalizedOnly?: boolean;
  sort?: PersonSort;
  /** Punto de referencia para buscar cerca de un lugar del mapa (con sort:"distance" u opcionalmente `radiusKm`). */
  nearLat?: number;
  nearLng?: number;
  /** Con nearLat/nearLng: excluye a quien esté más lejos de este radio en km. */
  radiusKm?: number;
  page?: number;
  pageSize?: number;
}

export interface PersonResult {
  items: Person[];
  total: number;
  page: number;
  pageSize: number;
}

// ── Almacén en memoria (copias mutables del seed para simular escritura) ────
const mem = {
  persons: [...seedPersons],
  reports: [...seedStatusReports],
  aidPoints: [...seedAidPoints],
  marches: [...seedMarches],
  comments: [...seedComments],
  posts: [...seedPosts],
  complaints: [...seedComplaints],
  pets: [...seedPets],
  volunteers: [...seedVolunteers],
  heroes: [...seedHeroes],
  newsItems: [...seedNewsItems],
  hospitals: [...seedHospitals],
  patients: [...seedHospitalPatients],
  // Token privado de gestión por persona (solo lo conoce quien publicó).
  ownerTokens: {} as Record<string, string>,
  // Tokens de gestión de recursos (puntos de ayuda, caravanas): el autor
  // gestiona su publicación con un enlace privado, igual que las personas.
  resourceOwners: [] as { entityType: ResourceOwnerEntity; entityId: string; token: string }[],
  // Gestores delegados que asigna el admin (hospital / punto de ayuda).
  resourceManagers: [] as ResourceManager[],
  managerRequests: [] as ManagerRequest[],
  // Roles globales por cuenta (admin completo, moderador de hospitales/ayuda).
  appRoles: [] as AppRoleGrant[],
  // Un voto de consenso por cuenta y recurso (clave `${tipo}:${id}:${userId}`):
  // evita que la misma cuenta infle el contador llamando la acción sin límite.
  consensusVotes: {} as Record<string, "available" | "depleted" | "yes" | "no">,
};

// Genera el token privado de gestión (enlace de autor). Siempre criptográficamente
// aleatorio: usa `node:crypto` directo, no el global `crypto` (que podría faltar
// en algún entorno) con un respaldo débil basado en `Math.random`.
function newToken(): string {
  return randomUUID();
}

function uid(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

// Borra el archivo del bucket "photos" cuando se elimina (o se reemplaza) el
// registro que lo usaba — si no, la foto se queda accesible para siempre en
// su URL pública aunque el registro ya no exista en el sitio. "Mejor esfuerzo"
// a propósito: si falla (o la URL no es del bucket propio), NO debe tumbar la
// operación principal (borrar la persona/publicación sí importa; que sobre un
// archivo huérfano en Storage es un problema menor, de costo, no de seguridad).
async function deleteStoragePhoto(url: string | null | undefined): Promise<void> {
  if (!url || !isSafePhotoUrl(url)) return;
  const sb = getSupabaseAdmin();
  if (!sb) return;
  try {
    const path = new URL(url).pathname.replace("/storage/v1/object/public/photos/", "");
    if (path) await sb.storage.from("photos").remove([path]);
  } catch {
    /* mejor esfuerzo: no rompe el borrado del registro */
  }
}

// ── Mapeo fila Supabase -> tipo de dominio ──────────────────────────────────
/* eslint-disable @typescript-eslint/no-explicit-any */
function rowToPerson(r: any): Person {
  return {
    id: r.id,
    country: r.country ?? "ve",
    firstName: r.first_name,
    lastName: r.last_name ?? "",
    cedula: r.cedula,
    age: r.age,
    gender: r.gender,
    estado: r.estado,
    locationText: r.location_text ?? "",
    lat: r.lat ?? null,
    lng: r.lng ?? null,
    description: r.description ?? "",
    photoUrl: r.photo_url,
    status: r.status,
    hospitalName: r.hospital_name,
    isUnidentified: r.is_unidentified,
    cause: r.cause ?? "desastre",
    contactName: r.contact_name,
    contactPhone: r.contact_phone,
    contactEmail: r.contact_email,
    verified: r.verified ?? false,
    photoHash: r.photo_hash ?? null,
    possibleDuplicate: r.possible_duplicate ?? false,
    duplicateMatchId: r.duplicate_match_id ?? null,
    reactions: { fuerza: 0, corazon: 0, difundir: 0, ...(r.reactions ?? {}) },
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

function rowToReport(r: any): StatusReport {
  return {
    id: r.id,
    personId: r.person_id,
    reportedStatus: r.reported_status,
    reporterName: r.reporter_name,
    reporterPhone: r.reporter_phone,
    reporterRelationship: r.reporter_relationship,
    locationFound: r.location_found,
    notes: r.notes ?? "",
    verified: r.verified,
    createdAt: r.created_at,
  };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

// ── Filtro/orden en memoria ─────────────────────────────────────────────────
function queryMemoryPersons(q: PersonQuery): PersonResult {
  const page = q.page ?? 1;
  const pageSize = q.pageSize ?? 24;
  const country = q.country ?? "ve";
  let items = mem.persons.filter((p) => (p.country ?? "ve") === country);

  if (q.unidentifiedOnly) items = items.filter((p) => p.isUnidentified);
  if (q.excludeUnidentified) items = items.filter((p) => !p.isUnidentified);
  if (q.unresolvedOnly)
    items = items.filter((p) => p.status !== "localizado" && p.status !== "fallecido");
  if (q.status && q.status !== "all") items = items.filter((p) => p.status === q.status);
  if (q.hospitalizedOnly) items = items.filter((p) => p.status === "hospitalizado");
  if (q.estado && q.estado !== "all") items = items.filter((p) => p.estado === q.estado);
  if (q.gender && q.gender !== "all") items = items.filter((p) => p.gender === q.gender);
  if (q.cause && q.cause !== "all") items = items.filter((p) => p.cause === q.cause);
  if (typeof q.minAge === "number") items = items.filter((p) => p.age != null && p.age >= q.minAge!);
  if (typeof q.maxAge === "number") items = items.filter((p) => p.age != null && p.age <= q.maxAge!);
  if (q.dateFrom) items = items.filter((p) => p.createdAt >= q.dateFrom!);
  if (q.dateTo) items = items.filter((p) => p.createdAt <= `${q.dateTo}T23:59:59.999Z`);

  if (q.search) {
    const s = q.search.toLowerCase().trim();
    items = items.filter((p) =>
      [p.firstName, p.lastName, p.cedula, p.estado, p.locationText]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(s),
    );
  }

  // "Cerca de un punto": solo quien tenga coordenada marcada puede evaluarse;
  // con radiusKm además se descarta a quien quede más lejos de ese radio.
  const hasNearPoint = typeof q.nearLat === "number" && typeof q.nearLng === "number";
  if (hasNearPoint) {
    items = items.filter((p) => p.lat != null && p.lng != null);
    if (typeof q.radiusKm === "number") {
      items = items.filter((p) => haversineKm(q.nearLat!, q.nearLng!, p.lat!, p.lng!) <= q.radiusKm!);
    }
  }

  switch (q.sort) {
    case "name":
      items.sort((a, b) => `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`));
      break;
    case "estado":
      items.sort((a, b) => (a.estado ?? "").localeCompare(b.estado ?? ""));
      break;
    case "distance":
      if (hasNearPoint) {
        items.sort(
          (a, b) =>
            haversineKm(q.nearLat!, q.nearLng!, a.lat!, a.lng!) -
            haversineKm(q.nearLat!, q.nearLng!, b.lat!, b.lng!),
        );
      }
      break;
    default:
      if (isWithinPriorityWindow(country)) {
        items.sort(
          (a, b) =>
            (a.cause === "desastre" ? 0 : 1) - (b.cause === "desastre" ? 0 : 1) ||
            b.createdAt.localeCompare(a.createdAt),
        );
      } else {
        items.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      }
  }

  const total = items.length;
  const start = (page - 1) * pageSize;
  return { items: items.slice(start, start + pageSize), total, page, pageSize };
}

// ── API pública ─────────────────────────────────────────────────────────────
export async function getPersons(q: PersonQuery = {}): Promise<PersonResult> {
  const sb = getSupabase();
  if (!sb) return queryMemoryPersons(q);

  const page = q.page ?? 1;
  const pageSize = q.pageSize ?? 24;
  let query = sb.from("persons").select("*", { count: "exact" }).eq("country", q.country ?? "ve");

  if (q.unidentifiedOnly) query = query.eq("is_unidentified", true);
  if (q.excludeUnidentified) query = query.eq("is_unidentified", false);
  if (q.unresolvedOnly) query = query.not("status", "in", "(localizado,fallecido)");
  if (q.status && q.status !== "all") query = query.eq("status", q.status);
  if (q.hospitalizedOnly) query = query.eq("status", "hospitalizado");
  if (q.estado && q.estado !== "all") query = query.eq("estado", q.estado);
  if (q.gender && q.gender !== "all") query = query.eq("gender", q.gender);
  if (q.cause && q.cause !== "all") query = query.eq("cause", q.cause);
  if (typeof q.minAge === "number") query = query.gte("age", q.minAge);
  if (typeof q.maxAge === "number") query = query.lte("age", q.maxAge);
  if (q.dateFrom) query = query.gte("created_at", q.dateFrom);
  if (q.dateTo) query = query.lte("created_at", `${q.dateTo}T23:59:59.999Z`);
  if (q.search) query = query.textSearch("search_doc", q.search, { type: "websearch", config: "spanish" });

  // "Cerca de un punto" (con radio opcional): no hay PostGIS, así que la
  // distancia se calcula en JS. Se piden hasta 500 candidatos (con lat/lng)
  // ordenados por fecha, se calcula la distancia de cada uno, se descarta a
  // quien quede fuera del radio (si se pidió) y se ordena/pagina en memoria.
  // Con muchas más de 500 coincidencias, las más lejanas dentro de ese cupo
  // podrían ganarle a alguna más cercana publicada antes — trade-off
  // aceptable para esta funcionalidad, sin motor geoespacial de por medio.
  if (typeof q.nearLat === "number" && typeof q.nearLng === "number") {
    query = query.not("lat", "is", null).not("lng", "is", null).order("created_at", { ascending: false }).limit(500);
    const { data, error } = await query;
    if (error) throw error;
    let withDist = (data ?? [])
      .map(rowToPerson)
      .map((p) => ({ p, d: haversineKm(q.nearLat!, q.nearLng!, p.lat!, p.lng!) }));
    if (typeof q.radiusKm === "number") withDist = withDist.filter((x) => x.d <= q.radiusKm!);
    withDist.sort((a, b) => a.d - b.d);
    const start = (page - 1) * pageSize;
    return {
      items: withDist.slice(start, start + pageSize).map((x) => x.p),
      total: withDist.length,
      page,
      pageSize,
    };
  }

  if (q.sort === "name") query = query.order("first_name", { ascending: true });
  else if (q.sort === "estado") query = query.order("estado", { ascending: true });
  else if (!q.sort || q.sort === "recent") {
    // "desastre" < "otra" alfabéticamente: ascendente los deja primero. Solo
    // se aplica dentro de la ventana de prioridad (ver PRIORITY_WINDOW_DAYS).
    if (isWithinPriorityWindow(q.country ?? "ve")) query = query.order("cause", { ascending: true });
    query = query.order("created_at", { ascending: false });
  }

  query = query.range((page - 1) * pageSize, page * pageSize - 1);

  const { data, count, error } = await query;
  if (error) throw error;
  return {
    items: (data ?? []).map(rowToPerson),
    total: count ?? 0,
    page,
    pageSize,
  };
}

export async function getPersonById(id: string): Promise<Person | null> {
  const sb = getSupabase();
  if (!sb) return mem.persons.find((p) => p.id === id) ?? null;
  const { data, error } = await sb.from("persons").select("*").eq("id", id).single();
  if (error) return null;
  return data ? rowToPerson(data) : null;
}

/** Trae varias personas en una sola consulta (evita N+1 al enriquecer listas, ej. reportes en /admin). */
export async function getPersonsByIds(ids: string[]): Promise<Map<string, Person>> {
  const uniqueIds = Array.from(new Set(ids));
  const map = new Map<string, Person>();
  if (uniqueIds.length === 0) return map;
  const sb = getSupabase();
  if (!sb) {
    for (const p of mem.persons) if (uniqueIds.includes(p.id)) map.set(p.id, p);
    return map;
  }
  const { data, error } = await sb.from("persons").select("*").in("id", uniqueIds);
  if (error) return map;
  for (const row of data ?? []) {
    const person = rowToPerson(row);
    map.set(person.id, person);
  }
  return map;
}

// ── Agrupación de resultados al filtrar por estado de localización ───────────
export type GroupBy = "hospital" | "estado";

export interface PersonGroup {
  key: string;
  label: string;
  items: Person[];
}

/**
 * Trae TODAS las personas que cumplen la consulta (sin paginar) y las agrupa:
 *  • "hospital" → por hospital donde están internadas (Hospitalizado).
 *  • "estado"   → por estado/región (Localizado, Confirmado sin vida).
 * Los grupos se ordenan por tamaño (de más a menos) y luego por nombre.
 */
export async function getPersonGroups(q: PersonQuery, groupBy: GroupBy): Promise<PersonGroup[]> {
  // Subconjunto acotado (un estado concreto): traer todo para agrupar bien.
  const { items } = await getPersons({ ...q, page: 1, pageSize: 1000 });

  const fallback = groupBy === "hospital" ? "Hospital sin especificar" : "Sin región";
  const groups = new Map<string, Person[]>();
  for (const p of items) {
    const raw = groupBy === "hospital" ? p.hospitalName : p.estado;
    const key = (raw ?? "").trim() || fallback;
    const arr = groups.get(key);
    if (arr) arr.push(p);
    else groups.set(key, [p]);
  }

  return [...groups.entries()]
    .map(([key, groupItems]) => ({ key, label: key, items: groupItems }))
    .sort((a, b) => b.items.length - a.items.length || a.label.localeCompare(b.label));
}

export async function getStats(country = "ve"): Promise<Stats> {
  const sb = getSupabase();
  if (!sb) {
    const persons = mem.persons.filter((p) => (p.country ?? "ve") === country);
    const registered = persons.length;
    const located = persons.filter(
      (p) => p.status === "localizado" || p.status === "hospitalizado",
    ).length;
    return {
      registered,
      located,
      toLocate: registered - located,
      lastUpdated: new Date().toISOString(),
    };
  }
  const [{ count: registered }, { count: located }] = await Promise.all([
    sb.from("persons").select("*", { count: "exact", head: true }).eq("country", country),
    sb
      .from("persons")
      .select("*", { count: "exact", head: true })
      .eq("country", country)
      .in("status", ["localizado", "hospitalizado"]),
  ]);
  return {
    registered: registered ?? 0,
    located: located ?? 0,
    toLocate: (registered ?? 0) - (located ?? 0),
    lastUpdated: new Date().toISOString(),
  };
}

// ── Panel de cifras (dashboard de inicio) ───────────────────────────────────
export interface DashboardStats {
  registered: number;
  desaparecidos: number; // por_localizar
  enHospitales: number; // hospitalizado
  aSalvo: number; // localizado
  fallecidos: number;
  ninos: number; // age < 18
  denuncias: number;
  necesidades: number; // posts tipo "necesito"
  voluntarios: number; // posts tipo "ofrezco" (ofrecimientos de ayuda)
}

// `unstable_cache` documenta que la clave de caché ya incluye los argumentos
// de la llamada, pero en la práctica (confirmado en producción: cambiar de
// país en el banner de Inicio se quedaba mostrando cifras del país anterior
// hasta navegar a otra página) dos llamadas con distinto `country` podían
// terminar sirviendo la misma entrada cacheada. Con una instancia de
// `unstable_cache` DISTINTA por país (el código de país va FIJO en
// `keyParts`, no como argumento) no hay ambigüedad posible. `makeImpl(c)`
// recibe el país ya resuelto y devuelve la función a cachear para ESE país.
/* eslint-disable @typescript-eslint/no-explicit-any */
function perCountryCache<Fn extends (...args: any[]) => Promise<any>>(
  baseKey: string,
  makeImpl: (country: CountryCode) => Fn,
  options: { revalidate: number },
): Record<CountryCode, Fn> {
  const entries = COUNTRY_CODES.map(
    (c) => [c, unstable_cache(makeImpl(c), [baseKey, c], options)] as [CountryCode, Fn],
  );
  return Object.fromEntries(entries) as Record<CountryCode, Fn>;
}
/* eslint-enable @typescript-eslint/no-explicit-any */
function resolveCountry(country: string | undefined): CountryCode {
  return isCountryCode(country) ? country : DEFAULT_COUNTRY;
}

// Cifras del panel: consulta agregada pesada que se ve en CADA visita al inicio.
// Cacheada 60s (igual para todos) para no golpear Supabase en cada carga: con
// mucha gente a la vez, esto reduce drásticamente la carga. 60s de retraso en un
// contador es aceptable.
const dashboardStatsCache = perCountryCache(
  "dashboard-stats",
  (c) => () => getDashboardStatsImpl(c),
  { revalidate: 60 },
);
export function getDashboardStats(country = "ve"): Promise<DashboardStats> {
  return dashboardStatsCache[resolveCountry(country)]();
}
async function getDashboardStatsImpl(country = "ve"): Promise<DashboardStats> {
  const sb = getSupabase();
  if (!sb) {
    const p = mem.persons.filter((x) => (x.country ?? "ve") === country);
    return {
      registered: p.length,
      desaparecidos: p.filter((x) => x.status === "por_localizar").length,
      enHospitales: p.filter((x) => x.status === "hospitalizado").length,
      aSalvo: p.filter((x) => x.status === "localizado").length,
      fallecidos: p.filter((x) => x.status === "fallecido").length,
      ninos: p.filter((x) => x.age != null && x.age < 18).length,
      denuncias: mem.complaints.filter((x) => (x.country ?? "ve") === country).length,
      necesidades: mem.posts.filter((x) => (x.country ?? "ve") === country && x.type === "necesito").length,
      voluntarios: mem.volunteers.filter((x) => (x.country ?? "ve") === country).length,
    };
  }
  // Conteos agregados en vez de traer filas: `select()` sin `.range()` lo topa
  // Supabase/PostgREST en 1000 filas por defecto, así que un país con más de
  // 1000 personas (Venezuela ya supera 40.000) quedaba contado sobre una
  // muestra arbitraria en vez del total real. `head: true` con `count: "exact"`
  // solo pide el conteo, sin ese límite.
  const byStatus = (status: PersonStatus) =>
    sb.from("persons").select("*", { count: "exact", head: true }).eq("country", country).eq("status", status);
  const [
    { count: registered },
    { count: desaparecidos },
    { count: enHospitales },
    { count: aSalvo },
    { count: fallecidos },
    { count: ninos },
    { count: denuncias },
    { count: necesidades },
    { count: voluntarios },
  ] = await Promise.all([
    sb.from("persons").select("*", { count: "exact", head: true }).eq("country", country),
    byStatus("por_localizar"),
    byStatus("hospitalizado"),
    byStatus("localizado"),
    byStatus("fallecido"),
    sb.from("persons").select("*", { count: "exact", head: true }).eq("country", country).lt("age", 18),
    sb.from("complaints").select("*", { count: "exact", head: true }).eq("country", country),
    sb.from("posts").select("*", { count: "exact", head: true }).eq("type", "necesito").eq("country", country),
    sb.from("volunteers").select("*", { count: "exact", head: true }).eq("country", country),
  ]);
  return {
    registered: registered ?? 0,
    desaparecidos: desaparecidos ?? 0,
    enHospitales: enHospitales ?? 0,
    aSalvo: aSalvo ?? 0,
    fallecidos: fallecidos ?? 0,
    ninos: ninos ?? 0,
    denuncias: denuncias ?? 0,
    necesidades: necesidades ?? 0,
    voluntarios: voluntarios ?? 0,
  };
}

/** Personas que estaban desaparecidas y ya fueron ubicadas (con vida u hospital). */
// "Localizados recientemente" (inicio): cacheado 60s, es público e igual para
// todos. 60s de retraso en este listado de esperanza es imperceptible.
const recentlyLocatedCache = perCountryCache(
  "recently-located",
  (c) => (limit: number) => getRecentlyLocatedImpl(limit, c),
  { revalidate: 60 },
);
export function getRecentlyLocated(limit = 12, country = "ve"): Promise<Person[]> {
  return recentlyLocatedCache[resolveCountry(country)](limit);
}
async function getRecentlyLocatedImpl(limit = 12, country = "ve"): Promise<Person[]> {
  const sb = getSupabase();
  if (!sb) {
    return mem.persons
      .filter((p) => (p.country ?? "ve") === country && (p.status === "localizado" || p.status === "hospitalizado"))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .slice(0, limit);
  }
  const { data, error } = await sb
    .from("persons")
    .select("*")
    .eq("country", country)
    .in("status", ["localizado", "hospitalizado"])
    .order("updated_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []).map(rowToPerson);
}

/**
 * Personas por grupo de edad para las "Secciones destacadas" del inicio
 * (Niñas/niños, Adolescentes, Jóvenes, Adultos, Adultos mayores), tanto en
 * "Se busca" (excludeUnidentified) como en "¿La reconoces?" (unidentifiedOnly)
 * — el llamador decide cuál con `query`. Es la consulta más repetida del
 * sitio: la ve TODA visita al inicio sin filtros, la página con más tráfico.
 * Antes no tenía caché (a diferencia de las cifras y "localizados
 * recientemente", que sí), así que cada carga disparaba consultas nuevas a
 * Supabase. Cacheada 60s por combinación de edad, igual para todos.
 */
const featuredPersonsCache = perCountryCache(
  "featured-persons",
  (c) =>
    async (query: PersonQuery): Promise<Person[]> => {
      const { items } = await getPersons({ ...query, country: c });
      return items;
    },
  { revalidate: 60 },
);
export function getFeaturedPersons(query: PersonQuery = {}): Promise<Person[]> {
  return featuredPersonsCache[resolveCountry(query.country)](query);
}

/**
 * Personas con coordenada exacta marcada (para pinearlas en el mapa). Sobre todo
 * avistamientos de "¿La reconoces?" donde alguien señaló dónde la vio.
 * Cacheada 60s: solo se usa en /mapa (otra página de mucho tráfico) y, a
 * diferencia de las alertas de rescate, un retraso corto aquí es aceptable.
 */
async function getPersonsWithLocationImpl(limit: number, country: CountryCode): Promise<Person[]> {
  const sb = getSupabase();
  if (!sb) {
    return mem.persons
      .filter((p) => (p.country ?? "ve") === country && p.lat != null && p.lng != null)
      .slice(0, limit);
  }
  const { data, error } = await sb
    .from("persons")
    .select("*")
    .eq("country", country)
    .not("lat", "is", null)
    .not("lng", "is", null)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []).map(rowToPerson);
}
const personsWithLocationCache = perCountryCache(
  "persons-with-location",
  (c) => (limit: number) => getPersonsWithLocationImpl(limit, c),
  { revalidate: 60 },
);
export function getPersonsWithLocation(limit = 200, country = "ve"): Promise<Person[]> {
  return personsWithLocationCache[resolveCountry(country)](limit);
}

export interface CreatePersonResult {
  person: Person;
  ownerToken: string;
}

// ── Detección de posibles duplicados al registrar ───────────────────────────
function normalizeCedula(value: string | null | undefined): string {
  return (value ?? "").replace(/[^0-9]/g, "");
}

function normalizeName(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

// Nombres "parecidos" en vez de idénticos: alguien puede escribir "Ana Maria"
// donde otro puso "Ana María Saavedra" o invertir nombre/apellido. Con 2+
// palabras de 3+ letras en común (nombre de pila + al menos un apellido) hay
// buena probabilidad de que sea la misma persona, sin ser tan laxo como para
// que "María González" choque con cualquier otra María.
function nameTokens(value: string): string[] {
  return normalizeName(value)
    .split(" ")
    .filter((t) => t.length >= 3);
}

function sharedNameTokens(a: string, b: string): number {
  const tokensB = new Set(nameTokens(b));
  return nameTokens(a).filter((t) => tokensB.has(t)).length;
}

export type DuplicateMatchReason = "cedula" | "photo" | "name";

export interface PersonDuplicateMatch {
  id: string;
  firstName: string;
  lastName: string;
  cedula: string | null;
  estado: Estado | null;
  locationText: string;
  status: PersonStatus;
  photoUrl: string | null;
  isUnidentified: boolean;
  matchReason: DuplicateMatchReason;
}

function toDuplicateMatch(p: Person, matchReason: DuplicateMatchReason): PersonDuplicateMatch {
  return {
    id: p.id,
    firstName: p.firstName,
    lastName: p.lastName,
    cedula: p.cedula,
    estado: p.estado,
    locationText: p.locationText,
    status: p.status,
    photoUrl: p.photoUrl,
    isUnidentified: p.isUnidentified,
    matchReason,
  };
}

/**
 * Busca registros ya existentes que probablemente sean la misma persona: por
 * cédula exacta, por la MISMA foto (mismo SHA-256, ver `photoHash` — no es
 * IA ni hash perceptual, solo detecta el archivo idéntico repetido) o por
 * nombre PARECIDO (2+ palabras en común entre nombre y apellido, no exige
 * coincidencia exacta). Avisa antes de crear un duplicado; no bloquea nada.
 */
export async function findPersonDuplicates(params: {
  firstName: string;
  lastName: string;
  cedula: string | null;
  photoHash?: string | null;
  country: CountryCode;
}): Promise<PersonDuplicateMatch[]> {
  const cedulaDigits = normalizeCedula(params.cedula);
  const photoHash = params.photoHash?.trim() || null;
  const inputFullName = `${params.firstName} ${params.lastName}`;
  const inputTokens = nameTokens(inputFullName);
  if (!cedulaDigits && !photoHash && inputTokens.length < 2) return [];

  function matchReasonFor(p: Person): DuplicateMatchReason | null {
    if (cedulaDigits && normalizeCedula(p.cedula) === cedulaDigits) return "cedula";
    if (photoHash && p.photoHash === photoHash) return "photo";
    if (inputTokens.length >= 2 && sharedNameTokens(inputFullName, `${p.firstName} ${p.lastName}`) >= 2)
      return "name";
    return null;
  }

  const sb = getSupabase();
  if (!sb) {
    const out: PersonDuplicateMatch[] = [];
    for (const p of mem.persons) {
      if ((p.country ?? "ve") !== params.country) continue;
      const reason = matchReasonFor(p);
      if (reason) out.push(toDuplicateMatch(p, reason));
      if (out.length >= 5) break;
    }
    return out;
  }

  /* eslint-disable @typescript-eslint/no-explicit-any */
  const queries: Array<PromiseLike<{ data: any[] | null }>> = [];
  /* eslint-enable @typescript-eslint/no-explicit-any */
  if (cedulaDigits) {
    queries.push(
      sb
        .from("persons")
        .select("*")
        .eq("country", params.country)
        .ilike("cedula", `%${cedulaDigits}%`)
        .limit(5),
    );
  }
  if (photoHash) {
    queries.push(
      sb.from("persons").select("*").eq("country", params.country).eq("photo_hash", photoHash).limit(5),
    );
  }
  // Coincidencia difusa: trae candidatos por cualquier palabra del nombre
  // (3+ letras) y filtra en JS por 2+ palabras en común (ver matchReasonFor),
  // en vez de exigir nombre y apellido exactos como antes.
  if (inputTokens.length >= 2) {
    queries.push(
      sb
        .from("persons")
        .select("*")
        .eq("country", params.country)
        .or(inputTokens.map((t) => `first_name.ilike.%${t}%,last_name.ilike.%${t}%`).join(","))
        .limit(30),
    );
  }
  if (queries.length === 0) return [];

  const results = await Promise.all(queries);
  const byId = new Map<string, PersonDuplicateMatch>();
  for (const { data } of results) {
    for (const row of data ?? []) {
      const p = rowToPerson(row);
      const reason = matchReasonFor(p);
      if (reason && !byId.has(p.id)) byId.set(p.id, toDuplicateMatch(p, reason));
    }
  }
  return Array.from(byId.values()).slice(0, 5);
}

export async function createPerson(
  input: PersonInput,
  photoUrl: string | null,
  userId: string | null = null,
): Promise<CreatePersonResult> {
  const now = new Date().toISOString();
  const ownerToken = newToken();
  const sb = getSupabaseAdmin() ?? getSupabase();
  const age = typeof input.age === "number" && !Number.isNaN(input.age) ? input.age : null;
  // En un avistamiento sin identificar puede no conocerse el nombre: usamos un
  // marcador para no dejar el campo vacío (la BD exige first_name no nulo).
  const firstName = (input.firstName ?? "").trim() || "Sin identificar";
  // "Se busca" nace "por localizar". Un avistamiento ("¿La reconoces?") ya está
  // ubicado: respeta el estado elegido (con vida / hospital / sin vida) y nunca
  // queda "por localizar".
  const status: PersonStatus = input.isUnidentified
    ? input.status && input.status !== "por_localizar"
      ? input.status
      : "localizado"
    : "por_localizar";

  const country = input.country ?? "ve";
  const photoHash = input.photoHash?.trim() || null;
  // Chequeo del lado del servidor, además del aviso que ya vio quien publica
  // en el formulario: cubre tanto a quien salta el aviso a propósito como
  // cualquier llamado directo a esta Server Action. No bloquea, solo marca
  // el registro para revisión del moderador en /admin.
  const dupMatches = await findPersonDuplicates({
    firstName,
    lastName: input.lastName || "",
    cedula: input.cedula || null,
    photoHash,
    country,
  });
  const duplicateMatchId = dupMatches[0]?.id ?? null;

  if (!sb) {
    const person: Person = {
      id: uid("person"),
      country,
      firstName,
      lastName: input.lastName || "",
      cedula: input.cedula || null,
      age,
      gender: input.gender ?? null,
      estado: input.estado ?? null,
      locationText: input.locationText || "",
      lat: input.lat ?? null,
      lng: input.lng ?? null,
      description: input.description || "",
      photoUrl,
      status,
      hospitalName: null,
      isUnidentified: input.isUnidentified ?? false,
      cause: input.cause ?? "desastre",
      contactName: input.contactName || null,
      contactPhone: input.contactPhone || null,
      contactEmail: input.contactEmail || null,
      verified: false,
      photoHash,
      possibleDuplicate: duplicateMatchId !== null,
      duplicateMatchId,
      reactions: { fuerza: 0, corazon: 0, difundir: 0 },
      createdAt: now,
      updatedAt: now,
    };
    mem.persons.unshift(person);
    mem.ownerTokens[person.id] = ownerToken;
    return { person, ownerToken };
  }

  const { data, error } = await sb
    .from("persons")
    .insert({
      country,
      first_name: firstName,
      last_name: input.lastName || "",
      cedula: input.cedula || null,
      age,
      gender: input.gender ?? null,
      estado: input.estado ?? null,
      location_text: input.locationText || "",
      lat: input.lat ?? null,
      lng: input.lng ?? null,
      description: input.description || "",
      photo_url: photoUrl,
      status,
      is_unidentified: input.isUnidentified ?? false,
      cause: input.cause ?? "desastre",
      contact_name: input.contactName || null,
      contact_phone: input.contactPhone || null,
      contact_email: input.contactEmail || null,
      photo_hash: photoHash,
      possible_duplicate: duplicateMatchId !== null,
      duplicate_match_id: duplicateMatchId,
      user_id: userId,
    })
    .select("*")
    .single();
  if (error) throw error;
  const person = rowToPerson(data);
  // Guarda el token en una tabla aparte, sin lectura pública (secreto). Si esto
  // falla en silencio, el enlace de gestión que se le muestra al autor nunca
  // funcionaría (el token jamás quedó guardado) — por eso se revisa el error.
  const { error: ownerError } = await sb
    .from("person_owners")
    .insert({ person_id: person.id, token: ownerToken });
  if (ownerError) throw ownerError;
  return { person, ownerToken };
}

/** Cola de revisión para el moderador: registros marcados como posible
 *  duplicado (por cédula, nombre parecido o foto idéntica) al crearse, ya sea
 *  desde el formulario o el sync automático. No están ocultos al público;
 *  esto solo los agrupa para que un moderador decida si son la misma persona. */
export async function getPossibleDuplicatePersons(country: string): Promise<Person[]> {
  if (!getSupabase()) {
    return mem.persons.filter((p) => p.possibleDuplicate && (p.country ?? "ve") === country);
  }
  const sb = getSupabaseAdmin() ?? getSupabase();
  if (!sb) return [];
  const { data, error } = await sb
    .from("persons")
    .select("*")
    .eq("country", country)
    .eq("possible_duplicate", true)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) throw error;
  return (data ?? []).map(rowToPerson);
}

/** El moderador revisó el aviso de duplicado y decide no marcarlo más
 *  (son personas distintas, o ya se fusionó/borró el otro registro a mano). */
export async function dismissPersonDuplicate(personId: string): Promise<void> {
  if (!getSupabase()) {
    const p = mem.persons.find((x) => x.id === personId);
    if (p) {
      p.possibleDuplicate = false;
      p.duplicateMatchId = null;
    }
    return;
  }
  const sb = getSupabaseAdmin();
  if (!sb) return;
  const { error } = await sb
    .from("persons")
    .update({ possible_duplicate: false, duplicate_match_id: null })
    .eq("id", personId);
  if (error) throw error;
}

// ── Gestión por el autor de la publicación ──────────────────────────────────
// El autor demuestra ser dueño de DOS formas: con su token privado (anónimo) o
// con su cuenta (sesión iniciada cuyo user_id coincide con el de la fila).

/** ¿La sesión actual es dueña de esta fila por cuenta (user_id)? Solo aplica con
 *  Supabase; en modo demostración no hay sesión, así que devuelve false. */
async function sessionOwns(table: string, id: string): Promise<boolean> {
  const sb = getSupabaseAdmin() ?? getSupabase();
  if (!sb) return false;
  const user = await getCurrentUser();
  if (!user) return false;
  const { data } = await sb.from(table).select("user_id").eq("id", id).maybeSingle();
  return Boolean(data && (data as { user_id?: string }).user_id === user.id);
}

/** ¿La sesión actual es GESTOR delegado (asignado por el admin) de este recurso?
 *  En modo demostración no hay sesión, así que devuelve false. */
async function sessionIsManager(entityType: ManagedEntity, entityId: string): Promise<boolean> {
  const user = await getCurrentUser();
  if (!user) return false;
  if (!getSupabase()) {
    return mem.resourceManagers.some(
      (m) => m.entityType === entityType && m.entityId === entityId && m.userId === user.id,
    );
  }
  const sb = getSupabaseAdmin();
  if (!sb) return false;
  const { data } = await sb
    .from("resource_managers")
    .select("user_id")
    .eq("entity_type", entityType)
    .eq("entity_id", entityId)
    .eq("user_id", user.id)
    .maybeSingle();
  return Boolean(data);
}

/** ¿La sesión actual tiene el rol de moderador de ESA categoría (cualquier
 *  hospital / cualquier punto de ayuda), asignado por el admin? */
async function sessionHasCategoryRole(role: AppRole): Promise<boolean> {
  const user = await getCurrentUser();
  if (!user) return false;
  return hasAppRole(user.id, role);
}

/** ¿Puede la sesión actual gestionar este punto de ayuda? (autor por cuenta,
 *  gestor delegado de ESE punto, o moderador de TODOS los puntos). El autor
 *  por TOKEN se verifica aparte con verifyResourceOwner. */
export async function canManageAidPoint(id: string): Promise<boolean> {
  if (await sessionOwns("aid_points", id)) return true;
  if (await sessionIsManager("aid_point", id)) return true;
  return sessionHasCategoryRole("aid_point_moderator");
}

/** ¿Puede la sesión actual gestionar este hospital? (autor por cuenta, gestor
 *  delegado de ESE hospital, o moderador de TODOS los hospitales). Los
 *  hospitales no usan token: la gestión es por cuenta, rol o admin. */
export async function canManageHospital(id: string): Promise<boolean> {
  if (await sessionOwns("hospitals", id)) return true;
  if (await sessionIsManager("hospital", id)) return true;
  return sessionHasCategoryRole("hospital_moderator");
}

/** Verifica que quien gestiona es el autor: por token privado o por su cuenta. */
export async function verifyOwner(personId: string, token: string): Promise<boolean> {
  if (token) {
    if (!getSupabase()) {
      // Modo memoria (demo).
      if (mem.ownerTokens[personId] === token) return true;
    } else {
      const sb = getSupabaseAdmin();
      if (sb) {
        const { data } = await sb
          .from("person_owners")
          .select("token")
          .eq("person_id", personId)
          .maybeSingle();
        if (data && data.token === token) return true;
      }
    }
  }
  return sessionOwns("persons", personId);
}

/** Cambia el estado de una persona (uso interno: autor o moderador). */
export async function updatePersonStatus(id: string, status: PersonStatus): Promise<void> {
  const sb = getSupabaseAdmin() ?? getSupabase();
  if (!sb) {
    const person = mem.persons.find((p) => p.id === id);
    if (person) {
      person.status = status;
      person.updatedAt = new Date().toISOString();
    }
    return;
  }
  const { error } = await sb.from("persons").update({ status }).eq("id", id);
  if (error) throw error;
}

/** Edita campos de una persona (autor). Solo campos corregibles. */
export async function updatePersonFields(id: string, input: PersonInput): Promise<void> {
  const age = typeof input.age === "number" && !Number.isNaN(input.age) ? input.age : null;
  const firstName = (input.firstName ?? "").trim() || "Sin identificar";
  const sb = getSupabaseAdmin() ?? getSupabase();
  if (!sb) {
    const person = mem.persons.find((p) => p.id === id);
    if (person) {
      person.firstName = firstName;
      person.lastName = input.lastName || "";
      person.age = age;
      person.gender = input.gender ?? null;
      person.estado = input.estado ?? null;
      person.locationText = input.locationText || "";
      if (input.lat !== undefined) person.lat = input.lat;
      if (input.lng !== undefined) person.lng = input.lng;
      if (input.cause !== undefined) person.cause = input.cause;
      person.description = input.description || "";
      person.contactName = input.contactName || null;
      person.contactPhone = input.contactPhone || null;
      person.contactEmail = input.contactEmail || null;
      person.updatedAt = new Date().toISOString();
    }
    return;
  }
  const { error } = await sb
    .from("persons")
    .update({
      first_name: firstName,
      last_name: input.lastName || "",
      age,
      gender: input.gender ?? null,
      estado: input.estado ?? null,
      location_text: input.locationText || "",
      ...(input.lat !== undefined ? { lat: input.lat } : {}),
      ...(input.lng !== undefined ? { lng: input.lng } : {}),
      ...(input.cause !== undefined ? { cause: input.cause } : {}),
      description: input.description || "",
      contact_name: input.contactName || null,
      contact_phone: input.contactPhone || null,
      contact_email: input.contactEmail || null,
    })
    .eq("id", id);
  if (error) throw error;
}

/** Elimina una publicación (autor, p. ej. duplicado o error). */
export async function deletePerson(id: string): Promise<void> {
  const sb = getSupabaseAdmin() ?? getSupabase();
  if (!sb) {
    mem.persons = mem.persons.filter((p) => p.id !== id);
    delete mem.ownerTokens[id];
    return;
  }
  const { data } = await sb.from("persons").select("photo_url").eq("id", id).maybeSingle();
  const { error } = await sb.from("persons").delete().eq("id", id);
  if (error) throw error;
  await deleteStoragePhoto(data?.photo_url as string | undefined);
}

/**
 * Registra un reporte de cambio de estado. NO cambia el estado público:
 * queda pendiente de verificación (verified = false) para frenar abusos.
 */
export async function createStatusReport(input: StatusReportInput): Promise<StatusReport> {
  const now = new Date().toISOString();
  const sb = getSupabaseAdmin() ?? getSupabase();
  if (!sb) {
    const report: StatusReport = {
      id: uid("report"),
      personId: input.personId,
      reportedStatus: input.reportedStatus,
      reporterName: input.reporterName,
      reporterPhone: input.reporterPhone,
      reporterRelationship: input.reporterRelationship,
      locationFound: input.locationFound,
      notes: input.notes || "",
      verified: false,
      createdAt: now,
    };
    mem.reports.unshift(report);
    return report;
  }
  const { data, error } = await sb
    .from("status_reports")
    .insert({
      person_id: input.personId,
      reported_status: input.reportedStatus,
      reporter_name: input.reporterName,
      reporter_phone: input.reporterPhone,
      reporter_relationship: input.reporterRelationship,
      location_found: input.locationFound,
      notes: input.notes || "",
    })
    .select("*")
    .single();
  if (error) throw error;
  return {
    id: data.id,
    personId: data.person_id,
    reportedStatus: data.reported_status,
    reporterName: data.reporter_name,
    reporterPhone: data.reporter_phone,
    reporterRelationship: data.reporter_relationship,
    locationFound: data.location_found,
    notes: data.notes ?? "",
    verified: data.verified,
    createdAt: data.created_at,
  };
}

// ── Gestión por el autor de recursos (puntos de ayuda, caravanas) ───────────
// Mismo modelo que las personas (enlace privado con token), pero genérico para
// cualquier recurso. El token es secreto: en producción vive en `resource_owners`
// (sin lectura pública) y solo el servidor lo verifica con la service role.
async function createResourceOwner(
  entityType: ResourceOwnerEntity,
  entityId: string,
  token: string,
): Promise<void> {
  if (!getSupabase()) {
    mem.resourceOwners.push({ entityType, entityId, token });
    return;
  }
  const sb = getSupabaseAdmin() ?? getSupabase();
  if (!sb) return;
  const { error } = await sb
    .from("resource_owners")
    .insert({ entity_type: entityType, entity_id: entityId, token });
  if (error) throw error;
}

async function deleteResourceOwner(entityType: ResourceOwnerEntity, entityId: string): Promise<void> {
  if (!getSupabase()) {
    mem.resourceOwners = mem.resourceOwners.filter(
      (o) => !(o.entityType === entityType && o.entityId === entityId),
    );
    return;
  }
  const sb = getSupabaseAdmin() ?? getSupabase();
  if (!sb) return;
  const { error } = await sb
    .from("resource_owners")
    .delete()
    .eq("entity_type", entityType)
    .eq("entity_id", entityId);
  if (error) throw error;
}

/** Verifica que el token corresponde al autor del recurso (punto o caravana). */
export async function verifyResourceOwner(
  entityType: ResourceOwnerEntity,
  entityId: string,
  token: string,
): Promise<boolean> {
  if (token) {
    if (!getSupabase()) {
      // Modo memoria (demo).
      if (
        mem.resourceOwners.some(
          (o) => o.entityType === entityType && o.entityId === entityId && o.token === token,
        )
      )
        return true;
    } else {
      const sb = getSupabaseAdmin();
      if (sb) {
        const { data } = await sb
          .from("resource_owners")
          .select("token")
          .eq("entity_type", entityType)
          .eq("entity_id", entityId)
          .maybeSingle();
        if (data && data.token === token) return true;
      }
    }
  }
  const table =
    entityType === "post"
      ? "posts"
      : entityType === "aid_point"
        ? "aid_points"
        : entityType === "pet"
          ? "pets"
          : "marches";
  if (await sessionOwns(table, entityId)) return true;
  // Además del autor, un gestor delegado por el admin (o un moderador de
  // TODOS los puntos de ayuda, rol global) puede administrar el punto.
  if (entityType === "aid_point") {
    if (await sessionIsManager("aid_point", entityId)) return true;
    if (await sessionHasCategoryRole("aid_point_moderator")) return true;
  }
  return false;
}

// ── Gestores delegados de recursos (los asigna el admin) ────────────────────
/** Todos los gestores delegados, con su nombre de usuario, para el panel admin. */
export async function getAllResourceManagers(): Promise<ResourceManager[]> {
  if (!getSupabase()) return mem.resourceManagers.slice();
  const sb = getSupabaseAdmin();
  if (!sb) return [];
  const { data, error } = await sb
    .from("resource_managers")
    .select("entity_type, entity_id, user_id, created_at")
    .order("created_at", { ascending: false });
  if (error) throw error;
  const rows = data ?? [];
  const ids = [...new Set(rows.map((r) => r.user_id as string))];
  const nameById: Record<string, string> = {};
  if (ids.length > 0) {
    const { data: profs } = await sb.from("profiles").select("user_id, username").in("user_id", ids);
    for (const p of profs ?? []) nameById[p.user_id as string] = p.username as string;
  }
  return rows.map((r) => ({
    entityType: r.entity_type as ManagedEntity,
    entityId: r.entity_id as string,
    userId: r.user_id as string,
    username: nameById[r.user_id as string] ?? "Usuario",
    createdAt: r.created_at as string,
  }));
}

/** Asigna a un usuario como gestor de un recurso (admin). Idempotente. */
export async function addResourceManager(
  entityType: ManagedEntity,
  entityId: string,
  userId: string,
  username: string,
  grantedBy: string,
): Promise<void> {
  const createdAt = new Date().toISOString();
  if (!getSupabase()) {
    const exists = mem.resourceManagers.some(
      (m) => m.entityType === entityType && m.entityId === entityId && m.userId === userId,
    );
    if (!exists) mem.resourceManagers.push({ entityType, entityId, userId, username, createdAt });
    return;
  }
  const sb = getSupabaseAdmin();
  if (!sb) return;
  const { error } = await sb
    .from("resource_managers")
    .upsert(
      { entity_type: entityType, entity_id: entityId, user_id: userId, granted_by: grantedBy },
      { onConflict: "entity_type,entity_id,user_id" },
    );
  if (error) throw error;
}

/** Quita a un usuario como gestor de un recurso (admin). */
export async function removeResourceManager(
  entityType: ManagedEntity,
  entityId: string,
  userId: string,
): Promise<void> {
  if (!getSupabase()) {
    mem.resourceManagers = mem.resourceManagers.filter(
      (m) => !(m.entityType === entityType && m.entityId === entityId && m.userId === userId),
    );
    return;
  }
  const sb = getSupabaseAdmin();
  if (!sb) return;
  const { error } = await sb
    .from("resource_managers")
    .delete()
    .eq("entity_type", entityType)
    .eq("entity_id", entityId)
    .eq("user_id", userId);
  if (error) throw error;
}

// ── Solicitudes de gestor delegado (el voluntario pide, el admin aprueba) ───
/** Crea una solicitud para gestionar un hospital/punto de ayuda concreto. */
export async function createManagerRequest(
  entityType: ManagedEntity,
  entityId: string,
  entityName: string,
  userId: string,
  username: string,
  message: string,
): Promise<void> {
  const id = randomUUID();
  const createdAt = new Date().toISOString();
  if (!getSupabase()) {
    mem.managerRequests.push({
      id,
      entityType,
      entityId,
      entityName,
      userId,
      username,
      message,
      status: "pending",
      createdAt,
    });
    return;
  }
  const sb = getSupabaseAdmin();
  if (!sb) return;
  const { error } = await sb
    .from("manager_requests")
    .insert({ entity_type: entityType, entity_id: entityId, entity_name: entityName, user_id: userId, message });
  if (error) throw error;
}

/** Solicitudes pendientes, con nombre de usuario, para la cola del panel admin. */
export async function getPendingManagerRequests(): Promise<ManagerRequest[]> {
  if (!getSupabase()) return mem.managerRequests.filter((r) => r.status === "pending");
  const sb = getSupabaseAdmin();
  if (!sb) return [];
  const { data, error } = await sb
    .from("manager_requests")
    .select("id, entity_type, entity_id, entity_name, user_id, message, status, created_at")
    .eq("status", "pending")
    .order("created_at", { ascending: false });
  if (error) throw error;
  const rows = data ?? [];
  const ids = [...new Set(rows.map((r) => r.user_id as string))];
  const nameById: Record<string, string> = {};
  if (ids.length > 0) {
    const { data: profs } = await sb.from("profiles").select("user_id, username").in("user_id", ids);
    for (const p of profs ?? []) nameById[p.user_id as string] = p.username as string;
  }
  return rows.map((r) => ({
    id: r.id as string,
    entityType: r.entity_type as ManagedEntity,
    entityId: r.entity_id as string,
    entityName: r.entity_name as string,
    userId: r.user_id as string,
    username: nameById[r.user_id as string] ?? "Usuario",
    message: r.message as string,
    status: r.status as ManagerRequest["status"],
    createdAt: r.created_at as string,
  }));
}

/** Aprueba una solicitud: crea el `ResourceManager` y marca la solicitud resuelta. */
export async function approveManagerRequest(requestId: string, grantedBy: string): Promise<void> {
  if (!getSupabase()) {
    const req = mem.managerRequests.find((r) => r.id === requestId);
    if (!req) return;
    req.status = "approved";
    await addResourceManager(req.entityType, req.entityId, req.userId, req.username, grantedBy);
    return;
  }
  const sb = getSupabaseAdmin();
  if (!sb) return;
  const { data, error } = await sb
    .from("manager_requests")
    .select("entity_type, entity_id, user_id")
    .eq("id", requestId)
    .single();
  if (error) throw error;
  if (!data) return;
  const { data: prof } = await sb.from("profiles").select("username").eq("user_id", data.user_id).single();
  await addResourceManager(
    data.entity_type as ManagedEntity,
    data.entity_id as string,
    data.user_id as string,
    (prof?.username as string) ?? "Usuario",
    grantedBy,
  );
  const { error: updateError } = await sb.from("manager_requests").update({ status: "approved" }).eq("id", requestId);
  if (updateError) throw updateError;
}

/** Rechaza una solicitud sin crear ningún permiso. */
export async function rejectManagerRequest(requestId: string): Promise<void> {
  if (!getSupabase()) {
    const req = mem.managerRequests.find((r) => r.id === requestId);
    if (req) req.status = "rejected";
    return;
  }
  const sb = getSupabaseAdmin();
  if (!sb) return;
  const { error } = await sb.from("manager_requests").update({ status: "rejected" }).eq("id", requestId);
  if (error) throw error;
}

// ── Roles globales (admin por cuenta, moderador de hospitales/ayuda) ────────
/** ¿Tiene esta cuenta el rol dado? Usado por `isAdmin()` y por los guardias de
 *  las acciones de moderador (hospital/punto de ayuda), no por la UI. */
export async function hasAppRole(userId: string, role: AppRole): Promise<boolean> {
  if (!getSupabase()) return mem.appRoles.some((r) => r.userId === userId && r.role === role);
  const sb = getSupabaseAdmin();
  if (!sb) return false;
  const { data } = await sb
    .from("app_roles")
    .select("user_id")
    .eq("user_id", userId)
    .eq("role", role)
    .maybeSingle();
  return Boolean(data);
}

/** Todos los roles asignados, con su nombre de usuario, para el panel admin. */
export async function getAllAppRoles(): Promise<AppRoleGrant[]> {
  if (!getSupabase()) return mem.appRoles.slice();
  const sb = getSupabaseAdmin();
  if (!sb) return [];
  const { data, error } = await sb
    .from("app_roles")
    .select("user_id, role, created_at")
    .order("created_at", { ascending: false });
  if (error) throw error;
  const rows = data ?? [];
  const ids = [...new Set(rows.map((r) => r.user_id as string))];
  const nameById: Record<string, string> = {};
  if (ids.length > 0) {
    const { data: profs } = await sb.from("profiles").select("user_id, username").in("user_id", ids);
    for (const p of profs ?? []) nameById[p.user_id as string] = p.username as string;
  }
  return rows.map((r) => ({
    userId: r.user_id as string,
    username: nameById[r.user_id as string] ?? "Usuario",
    role: r.role as AppRole,
    createdAt: r.created_at as string,
  }));
}

/** Asigna un rol global a una cuenta (admin). Idempotente. */
export async function addAppRole(
  userId: string,
  username: string,
  role: AppRole,
  grantedBy: string,
): Promise<void> {
  const createdAt = new Date().toISOString();
  if (!getSupabase()) {
    const exists = mem.appRoles.some((r) => r.userId === userId && r.role === role);
    if (!exists) mem.appRoles.push({ userId, username, role, createdAt });
    return;
  }
  const sb = getSupabaseAdmin();
  if (!sb) return;
  const { error } = await sb
    .from("app_roles")
    .upsert({ user_id: userId, role, granted_by: grantedBy }, { onConflict: "user_id,role" });
  if (error) throw error;
}

/** Quita un rol global de una cuenta (admin). */
export async function removeAppRole(userId: string, role: AppRole): Promise<void> {
  if (!getSupabase()) {
    mem.appRoles = mem.appRoles.filter((r) => !(r.userId === userId && r.role === role));
    return;
  }
  const sb = getSupabaseAdmin();
  if (!sb) return;
  const { error } = await sb.from("app_roles").delete().eq("user_id", userId).eq("role", role);
  if (error) throw error;
}

// ── Puntos de ayuda ─────────────────────────────────────────────────────────
const aidPointsCache = perCountryCache("aid-points", (c) => () => getAidPointsImpl(c), { revalidate: 60 });
export function getAidPoints(country = "ve"): Promise<AidPoint[]> {
  return aidPointsCache[resolveCountry(country)]();
}
async function getAidPointsImpl(country = "ve"): Promise<AidPoint[]> {
  const sb = getSupabase();
  if (!sb)
    return mem.aidPoints
      .filter((p) => (p.country ?? "ve") === country)
      .slice()
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const { data, error } = await sb
    .from("aid_points")
    .select("*")
    .eq("country", country)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map(rowToAidPoint);
}

/* eslint-disable @typescript-eslint/no-explicit-any */
function rowToAidPoint(r: any): AidPoint {
  return {
    id: r.id,
    country: r.country ?? "ve",
    name: r.name,
    types: r.types ?? (r.type ? [r.type] : []),
    estado: r.estado,
    locationText: r.location_text,
    lat: r.lat ?? null,
    lng: r.lng ?? null,
    scheduleText: r.schedule_text ?? "",
    description: r.description ?? "",
    photoUrl: r.photo_url,
    contactName: r.contact_name,
    contactPhone: r.contact_phone,
    verified: r.verified,
    available: r.available ?? true,
    votesAvailable: r.votes_available ?? 0,
    votesDepleted: r.votes_depleted ?? 0,
    categoryStatus: r.category_status ?? {},
    likes: r.likes ?? 0,
    updatedAt: r.updated_at ?? r.created_at,
    createdAt: r.created_at,
  };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

export async function getAidPointById(id: string): Promise<AidPoint | null> {
  const sb = getSupabase();
  if (!sb) return mem.aidPoints.find((p) => p.id === id) ?? null;
  const { data, error } = await sb.from("aid_points").select("*").eq("id", id).single();
  if (error) return null;
  return data ? rowToAidPoint(data) : null;
}

export interface AidPointResult {
  items: AidPoint[];
  total: number;
  page: number;
  pageSize: number;
}

/**
 * Puntos de ayuda, PAGINADOS. `getAidPoints` no tenía límite NI paginación —
 * traía la tabla entera de un jalón en cada visita a /ayuda; con pocos puntos
 * no se nota, pero no escala. Se deja `getAidPoints` intacta para el mapa y
 * el admin (necesitan "todos"); esta es solo para el listado. Sin caché a
 * propósito: acabas de registrar un punto y quieres verte ya en la lista.
 */
export async function getAidPointsPage(
  filter: {
    country?: string;
    type?: AidPointType | "all";
    availOnly?: boolean;
    estado?: string | "all";
    dateFrom?: string;
    dateTo?: string;
  },
  page = 1,
  pageSize = 10,
): Promise<AidPointResult> {
  const country = filter.country ?? "ve";
  const sb = getSupabase();
  if (!sb) {
    let items = mem.aidPoints.filter((p) => (p.country ?? "ve") === country);
    if (filter.type && filter.type !== "all") {
      const t = filter.type;
      items = items.filter((p) => p.types.includes(t));
    }
    if (filter.availOnly) items = items.filter((p) => p.available);
    if (filter.estado && filter.estado !== "all") items = items.filter((p) => p.estado === filter.estado);
    if (filter.dateFrom) items = items.filter((p) => p.createdAt >= filter.dateFrom!);
    if (filter.dateTo) items = items.filter((p) => p.createdAt <= `${filter.dateTo}T23:59:59.999Z`);
    items = [...items.filter((p) => p.available), ...items.filter((p) => !p.available)];
    const total = items.length;
    const start = (page - 1) * pageSize;
    return { items: items.slice(start, start + pageSize), total, page, pageSize };
  }
  let query = sb
    .from("aid_points")
    .select("*", { count: "exact" })
    .eq("country", country)
    .order("created_at", { ascending: false });
  if (filter.type && filter.type !== "all") query = query.contains("types", [filter.type]);
  if (filter.availOnly) query = query.eq("available", true);
  if (filter.estado && filter.estado !== "all") query = query.eq("estado", filter.estado);
  if (filter.dateFrom) query = query.gte("created_at", filter.dateFrom);
  if (filter.dateTo) query = query.lte("created_at", `${filter.dateTo}T23:59:59.999Z`);
  const start = (page - 1) * pageSize;
  const { data, error, count } = await query.range(start, start + pageSize - 1);
  if (error) throw error;
  const items = (data ?? []).map(rowToAidPoint);
  // Disponibles primero, dentro de la página actual (misma regla que antes).
  const sorted = [...items.filter((p) => p.available), ...items.filter((p) => !p.available)];
  return { items: sorted, total: count ?? 0, page, pageSize };
}

export interface CreateAidPointResult {
  point: AidPoint;
  ownerToken: string;
}

export async function createAidPoint(
  input: AidPointInput,
  photoUrl: string | null,
  userId: string | null = null,
): Promise<CreateAidPointResult> {
  const now = new Date().toISOString();
  const ownerToken = newToken();
  const sb = getSupabaseAdmin() ?? getSupabase();
  const country = input.country ?? "ve";
  if (!sb) {
    const point: AidPoint = {
      id: uid("aid"),
      country,
      name: input.name,
      types: input.types,
      estado: input.estado ?? null,
      locationText: input.locationText,
      lat: input.lat ?? null,
      lng: input.lng ?? null,
      scheduleText: input.scheduleText || "",
      description: input.description || "",
      photoUrl,
      contactName: input.contactName || null,
      contactPhone: input.contactPhone || null,
      verified: false,
      available: true,
      votesAvailable: 0,
      votesDepleted: 0,
      categoryStatus: input.categoryStatus ?? {},
      likes: 0,
      updatedAt: now,
      createdAt: now,
    };
    mem.aidPoints.unshift(point);
    await createResourceOwner("aid_point", point.id, ownerToken);
    return { point, ownerToken };
  }
  const { data, error } = await sb
    .from("aid_points")
    .insert({
      country,
      name: input.name,
      types: input.types,
      estado: input.estado ?? null,
      location_text: input.locationText,
      lat: input.lat ?? null,
      lng: input.lng ?? null,
      schedule_text: input.scheduleText || "",
      description: input.description || "",
      photo_url: photoUrl,
      contact_name: input.contactName || null,
      contact_phone: input.contactPhone || null,
      category_status: input.categoryStatus ?? {},
      user_id: userId,
    })
    .select("*")
    .single();
  if (error) throw error;
  const point = rowToAidPoint(data);
  await createResourceOwner("aid_point", point.id, ownerToken);
  return { point, ownerToken };
}

/** Edita los datos de un punto de ayuda (autor). No toca votos ni disponibilidad. */
export async function updateAidPointFields(id: string, input: AidPointInput): Promise<void> {
  const now = new Date().toISOString();
  const sb = getSupabaseAdmin() ?? getSupabase();
  if (!sb) {
    const point = mem.aidPoints.find((p) => p.id === id);
    if (point) {
      point.name = input.name;
      point.types = input.types;
      point.categoryStatus = input.categoryStatus ?? {};
      point.estado = input.estado ?? null;
      point.locationText = input.locationText;
      if (input.lat !== undefined) point.lat = input.lat;
      if (input.lng !== undefined) point.lng = input.lng;
      point.scheduleText = input.scheduleText || "";
      point.description = input.description || "";
      point.contactName = input.contactName || null;
      point.contactPhone = input.contactPhone || null;
      point.updatedAt = now;
    }
    return;
  }
  const { error } = await sb
    .from("aid_points")
    .update({
      name: input.name,
      types: input.types,
      category_status: input.categoryStatus ?? {},
      estado: input.estado ?? null,
      location_text: input.locationText,
      ...(input.lat !== undefined ? { lat: input.lat } : {}),
      ...(input.lng !== undefined ? { lng: input.lng } : {}),
      schedule_text: input.scheduleText || "",
      description: input.description || "",
      contact_name: input.contactName || null,
      contact_phone: input.contactPhone || null,
      updated_at: now,
    })
    .eq("id", id);
  if (error) throw error;
}

/** Elimina un punto de ayuda (autor, p. ej. duplicado o ya cerrado). */
export async function deleteAidPoint(id: string): Promise<void> {
  const sb = getSupabaseAdmin() ?? getSupabase();
  if (!sb) {
    mem.aidPoints = mem.aidPoints.filter((p) => p.id !== id);
    await deleteResourceOwner("aid_point", id);
    return;
  }
  const { data } = await sb.from("aid_points").select("photo_url").eq("id", id).maybeSingle();
  const { error } = await sb.from("aid_points").delete().eq("id", id);
  if (error) throw error;
  await deleteResourceOwner("aid_point", id);
  await deleteStoragePhoto(data?.photo_url as string | undefined);
}

/** "Me gusta" a un punto de ayuda (comunidad). */
export async function likeAidPoint(id: string): Promise<void> {
  const sb = getSupabaseAdmin() ?? getSupabase();
  if (!sb) {
    const point = mem.aidPoints.find((p) => p.id === id);
    if (point) point.likes++;
    return;
  }
  const { data, error } = await sb.from("aid_points").select("likes").eq("id", id).single();
  if (error) throw error;
  const { error: updateError } = await sb.from("aid_points").update({ likes: (data.likes ?? 0) + 1 }).eq("id", id);
  if (updateError) throw updateError;
}

/**
 * Voto de consenso sobre la disponibilidad de un punto. Si los votos de
 * "se acabó" superan a los de "sí hay", el punto pasa a agotado automáticamente.
 */
/** Un voto por cuenta y punto de ayuda (puede cambiarlo, no repetirlo): sin
 *  esto, la misma cuenta podía llamar la acción sin límite y falsear el
 *  consenso que otros usan para decidir a dónde ir a buscar ayuda. */
export async function voteAidAvailability(
  id: string,
  vote: "available" | "depleted",
  userId: string,
): Promise<void> {
  const now = new Date().toISOString();
  const sb = getSupabaseAdmin() ?? getSupabase();
  if (!sb) {
    const key = `aid_point:${id}:${userId}`;
    const previous = mem.consensusVotes[key];
    if (previous === vote) return;
    const point = mem.aidPoints.find((p) => p.id === id);
    if (point) {
      if (previous === "available") point.votesAvailable = Math.max(0, point.votesAvailable - 1);
      else if (previous === "depleted") point.votesDepleted = Math.max(0, point.votesDepleted - 1);
      if (vote === "available") point.votesAvailable++;
      else point.votesDepleted++;
      point.updatedAt = now;
    }
    mem.consensusVotes[key] = vote;
    return;
  }

  const { data: existing } = await sb
    .from("consensus_votes")
    .select("vote")
    .eq("entity_type", "aid_point")
    .eq("entity_id", id)
    .eq("user_id", userId)
    .maybeSingle();
  if (existing?.vote === vote) return;

  const { data, error } = await sb
    .from("aid_points")
    .select("votes_available,votes_depleted")
    .eq("id", id)
    .single();
  if (error) throw error;

  let va = data.votes_available ?? 0;
  let vd = data.votes_depleted ?? 0;
  if (existing?.vote === "available") va = Math.max(0, va - 1);
  else if (existing?.vote === "depleted") vd = Math.max(0, vd - 1);
  if (vote === "available") va++;
  else vd++;

  const { error: updateError } = await sb
    .from("aid_points")
    .update({ votes_available: va, votes_depleted: vd, updated_at: now })
    .eq("id", id);
  if (updateError) throw updateError;

  const { error: voteError } = await sb
    .from("consensus_votes")
    .upsert(
      { entity_type: "aid_point", entity_id: id, user_id: userId, vote, updated_at: now },
      { onConflict: "entity_type,entity_id,user_id" },
    );
  if (voteError) throw voteError;
}

// La disponibilidad oficial (disponible/agotado) la fija el AUTOR del punto o el
// admin; el voto comunitario es solo una señal y ya no la cambia.
export async function setAidAvailability(id: string, available: boolean): Promise<void> {
  const now = new Date().toISOString();
  const sb = getSupabaseAdmin() ?? getSupabase();
  if (!sb) {
    const point = mem.aidPoints.find((p) => p.id === id);
    if (point) {
      point.available = available;
      point.updatedAt = now;
    }
    return;
  }
  const { error } = await sb.from("aid_points").update({ available, updated_at: now }).eq("id", id);
  if (error) throw error;
}

// ── Marchas ──────────────────────────────────────────────────────────────────
export const getMarches = unstable_cache(getMarchesImpl, ["marches"], { revalidate: 60 });
async function getMarchesImpl(): Promise<March[]> {
  const sb = getSupabase();
  if (!sb) return mem.marches.slice().sort((a, b) => a.departAt.localeCompare(b.departAt));
  const { data, error } = await sb.from("marches").select("*").order("depart_at", { ascending: true });
  if (error) throw error;
  /* eslint-disable @typescript-eslint/no-explicit-any */
  return (data ?? []).map(rowToMarch);
  /* eslint-enable @typescript-eslint/no-explicit-any */
}

export interface MarchResult {
  items: March[];
  total: number;
  page: number;
  pageSize: number;
  upcomingCount: number;
  pastCount: number;
}

type MarchShow = "all" | "upcoming" | "past";

// Antes `getMarches()` (cacheada 60s, sin límite) traía TODAS las caravanas en
// cada visita a /caravanas. Ahora la página usa esta versión, en vivo y
// paginada (10/20/50 a elegir); `getMarches` se deja intacta para el mapa.
export async function getMarchesPage(
  show: MarchShow,
  page = 1,
  pageSize = 10,
  dateFrom?: string,
  dateTo?: string,
  country = "ve",
): Promise<MarchResult> {
  const sb = getSupabase();
  const nowIso = new Date().toISOString();
  if (!sb) {
    const all = mem.marches.filter((m) => (m.country ?? "ve") === country);
    const upcomingCount = all.filter((m) => m.departAt >= nowIso).length;
    const pastCount = all.length - upcomingCount;
    let items = all;
    if (show === "upcoming") {
      items = all.filter((m) => m.departAt >= nowIso).sort((a, b) => a.departAt.localeCompare(b.departAt));
    } else if (show === "past") {
      items = all.filter((m) => m.departAt < nowIso).sort((a, b) => b.departAt.localeCompare(a.departAt));
    } else {
      items = all.slice().sort((a, b) => a.departAt.localeCompare(b.departAt));
    }
    if (dateFrom) items = items.filter((m) => m.departAt >= dateFrom);
    if (dateTo) items = items.filter((m) => m.departAt <= `${dateTo}T23:59:59.999Z`);
    const total = items.length;
    const start = (page - 1) * pageSize;
    return { items: items.slice(start, start + pageSize), total, page, pageSize, upcomingCount, pastCount };
  }

  let query = sb.from("marches").select("*", { count: "exact" }).eq("country", country);
  if (show === "upcoming") query = query.gte("depart_at", nowIso).order("depart_at", { ascending: true });
  else if (show === "past") query = query.lt("depart_at", nowIso).order("depart_at", { ascending: false });
  else query = query.order("depart_at", { ascending: true });
  if (dateFrom) query = query.gte("depart_at", dateFrom);
  if (dateTo) query = query.lte("depart_at", `${dateTo}T23:59:59.999Z`);

  const start = (page - 1) * pageSize;
  const [{ data, error, count }, upcomingRes, pastRes] = await Promise.all([
    query.range(start, start + pageSize - 1),
    sb.from("marches").select("*", { count: "exact", head: true }).eq("country", country).gte("depart_at", nowIso),
    sb.from("marches").select("*", { count: "exact", head: true }).eq("country", country).lt("depart_at", nowIso),
  ]);
  if (error) throw error;
  /* eslint-disable @typescript-eslint/no-explicit-any */
  return {
    items: ((data ?? []) as any[]).map(rowToMarch),
    total: count ?? 0,
    page,
    pageSize,
    upcomingCount: upcomingRes.count ?? 0,
    pastCount: pastRes.count ?? 0,
  };
  /* eslint-enable @typescript-eslint/no-explicit-any */
}

/* eslint-disable @typescript-eslint/no-explicit-any */
function rowToMarch(r: any): March {
  return {
    id: r.id,
    country: r.country ?? "ve",
    title: r.title,
    originText: r.origin_text,
    destinationText: r.destination_text,
    departAt: r.depart_at,
    organizerName: r.organizer_name,
    organizerPhone: r.organizer_phone,
    whatsappUrl: r.whatsapp_url ?? null,
    description: r.description ?? "",
    attendeesCount: r.attendees_count ?? 0,
    likes: r.likes ?? 0,
    aidPointId: r.aid_point_id ?? null,
    createdAt: r.created_at,
  };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

export async function getMarchById(id: string): Promise<March | null> {
  const sb = getSupabase();
  if (!sb) return mem.marches.find((m) => m.id === id) ?? null;
  const { data, error } = await sb.from("marches").select("*").eq("id", id).single();
  if (error) return null;
  return data ? rowToMarch(data) : null;
}

/** ¿Puede la sesión actual gestionar esta caravana? (autor por cuenta; el
 *  token privado se verifica aparte con verifyResourceOwner). */
export async function canManageMarch(id: string): Promise<boolean> {
  return sessionOwns("marches", id);
}

export interface CreateMarchResult {
  march: March;
  ownerToken: string;
}

export async function createMarch(
  input: MarchInput,
  userId: string | null = null,
): Promise<CreateMarchResult> {
  const now = new Date().toISOString();
  const ownerToken = newToken();
  const sb = getSupabaseAdmin() ?? getSupabase();
  const country = input.country ?? "ve";
  if (!sb) {
    const march: March = {
      id: uid("march"),
      country,
      title: input.title,
      originText: input.originText,
      destinationText: input.destinationText,
      departAt: new Date(input.departAt).toISOString(),
      organizerName: input.organizerName,
      organizerPhone: input.organizerPhone,
      whatsappUrl: input.whatsappUrl || null,
      description: input.description || "",
      attendeesCount: 0,
      likes: 0,
      aidPointId: input.aidPointId || null,
      createdAt: now,
    };
    mem.marches.unshift(march);
    await createResourceOwner("march", march.id, ownerToken);
    return { march, ownerToken };
  }
  const { data, error } = await sb
    .from("marches")
    .insert({
      country,
      title: input.title,
      origin_text: input.originText,
      destination_text: input.destinationText,
      depart_at: new Date(input.departAt).toISOString(),
      organizer_name: input.organizerName,
      organizer_phone: input.organizerPhone,
      whatsapp_url: input.whatsappUrl || null,
      description: input.description || "",
      aid_point_id: input.aidPointId || null,
      user_id: userId,
    })
    .select("*")
    .single();
  if (error) throw error;
  const march = rowToMarch(data);
  await createResourceOwner("march", march.id, ownerToken);
  return { march, ownerToken };
}

/** Edita los datos de una caravana (autor, p. ej. cambiar la hora de salida). */
export async function updateMarchFields(id: string, input: MarchInput): Promise<void> {
  const departAt = new Date(input.departAt).toISOString();
  const sb = getSupabaseAdmin() ?? getSupabase();
  if (!sb) {
    const march = mem.marches.find((m) => m.id === id);
    if (march) {
      march.title = input.title;
      march.originText = input.originText;
      march.destinationText = input.destinationText;
      march.departAt = departAt;
      march.organizerName = input.organizerName;
      march.organizerPhone = input.organizerPhone;
      march.whatsappUrl = input.whatsappUrl || null;
      march.description = input.description || "";
      march.aidPointId = input.aidPointId || null;
    }
    return;
  }
  const { error } = await sb
    .from("marches")
    .update({
      title: input.title,
      origin_text: input.originText,
      destination_text: input.destinationText,
      depart_at: departAt,
      organizer_name: input.organizerName,
      organizer_phone: input.organizerPhone,
      whatsapp_url: input.whatsappUrl || null,
      description: input.description || "",
      aid_point_id: input.aidPointId || null,
    })
    .eq("id", id);
  if (error) throw error;
}

/** Elimina una caravana (autor, p. ej. se canceló o fue un duplicado). */
export async function deleteMarch(id: string): Promise<void> {
  const sb = getSupabaseAdmin() ?? getSupabase();
  if (!sb) {
    mem.marches = mem.marches.filter((m) => m.id !== id);
    await deleteResourceOwner("march", id);
    return;
  }
  const { error } = await sb.from("marches").delete().eq("id", id);
  if (error) throw error;
  await deleteResourceOwner("march", id);
}

/** "Me gusta" a una caravana (comunidad). */
export async function likeMarch(id: string): Promise<void> {
  const sb = getSupabaseAdmin() ?? getSupabase();
  if (!sb) {
    const march = mem.marches.find((m) => m.id === id);
    if (march) march.likes++;
    return;
  }
  const { data, error } = await sb.from("marches").select("likes").eq("id", id).single();
  if (error) throw error;
  const { error: updateError } = await sb.from("marches").update({ likes: (data.likes ?? 0) + 1 }).eq("id", id);
  if (updateError) throw updateError;
}

// ── Perfil del autor (avatar/usuario) en posts y comentarios ────────────────
// `posts.user_id` / `comments.user_id` no tienen FK directa a `profiles` (ambas
// apuntan a auth.users por separado), así que no hay join automático de
// Supabase: se resuelve con una sola consulta por lote a `profiles`, igual que
// `getReportCountsForPersons` evita el N+1 para reportes. Ausente = publicó
// sin cuenta (anónimo), que sigue siendo válido en esta app.
async function attachAuthorProfiles<T extends { authorAvatarUrl?: string | null; authorUsername?: string | null }>(
  items: T[],
  userIds: (string | null | undefined)[],
): Promise<T[]> {
  const ids = Array.from(new Set(userIds.filter((id): id is string => Boolean(id))));
  if (ids.length === 0) return items;
  const sb = getSupabaseAdmin() ?? getSupabase();
  if (!sb) return items;
  const { data } = await sb.from("profiles").select("user_id, username, avatar_url").in("user_id", ids);
  if (!data || data.length === 0) return items;
  /* eslint-disable @typescript-eslint/no-explicit-any */
  const byId = new Map(
    (data as any[]).map((p) => [
      p.user_id as string,
      { username: p.username as string, avatarUrl: (p.avatar_url as string | null) ?? null },
    ]),
  );
  /* eslint-enable @typescript-eslint/no-explicit-any */
  return items.map((item, i) => {
    const uid = userIds[i];
    const profile = uid ? byId.get(uid) : undefined;
    return profile ? { ...item, authorUsername: profile.username, authorAvatarUrl: profile.avatarUrl } : item;
  });
}

// ── Comentarios (foro) ───────────────────────────────────────────────────────
export async function getComments(entityType: Comment["entityType"], entityId: string): Promise<Comment[]> {
  const sb = getSupabase();
  if (!sb)
    return mem.comments
      .filter((c) => c.entityType === entityType && c.entityId === entityId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const { data, error } = await sb
    .from("comments")
    .select("*")
    .eq("entity_type", entityType)
    .eq("entity_id", entityId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  /* eslint-disable @typescript-eslint/no-explicit-any */
  const rows = (data ?? []) as any[];
  const comments: Comment[] = rows.map((r) => ({
    id: r.id,
    entityType: r.entity_type,
    entityId: r.entity_id,
    parentId: r.parent_id ?? null,
    authorName: r.author_name,
    body: r.body,
    photoUrl: r.photo_url ?? null,
    likes: r.likes ?? 0,
    createdAt: r.created_at,
  }));
  /* eslint-enable @typescript-eslint/no-explicit-any */
  return attachAuthorProfiles(comments, rows.map((r) => r.user_id ?? null));
}

// Comentarios de varias entidades del MISMO tipo en una sola consulta. Evita el
// N+1 al pintar listas (p. ej. /comunidad, que antes consultaba por cada post).
// Devuelve un mapa entityId → comentarios (más recientes primero, igual que getComments).
export async function getCommentsForEntities(
  entityType: Comment["entityType"],
  ids: string[],
): Promise<Record<string, Comment[]>> {
  const out: Record<string, Comment[]> = {};
  if (ids.length === 0) return out;
  const sb = getSupabase();
  if (!sb) {
    for (const c of mem.comments) {
      if (c.entityType !== entityType || !ids.includes(c.entityId)) continue;
      (out[c.entityId] ??= []).push(c);
    }
  } else {
    const { data, error } = await sb
      .from("comments")
      .select("*")
      .eq("entity_type", entityType)
      .in("entity_id", ids)
      .order("created_at", { ascending: false });
    if (error) throw error;
    /* eslint-disable @typescript-eslint/no-explicit-any */
    const rows = (data ?? []) as any[];
    const comments: Comment[] = rows.map((r) => ({
      id: r.id,
      entityType: r.entity_type,
      entityId: r.entity_id,
      parentId: r.parent_id ?? null,
      authorName: r.author_name,
      body: r.body,
      photoUrl: r.photo_url ?? null,
      likes: r.likes ?? 0,
      createdAt: r.created_at,
    }));
    /* eslint-enable @typescript-eslint/no-explicit-any */
    const enriched = await attachAuthorProfiles(comments, rows.map((r) => r.user_id ?? null));
    for (const c of enriched) (out[c.entityId] ??= []).push(c);
  }
  for (const arr of Object.values(out)) {
    arr.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
  return out;
}

export async function createComment(
  entityType: Comment["entityType"],
  entityId: string,
  authorName: string,
  body: string,
  photoUrl: string | null = null,
  parentId: string | null = null,
  userId: string | null = null,
): Promise<Comment> {
  const now = new Date().toISOString();
  const sb = getSupabaseAdmin() ?? getSupabase();
  if (!sb) {
    const comment: Comment = {
      id: uid("comment"),
      entityType,
      entityId,
      parentId,
      authorName,
      body,
      photoUrl,
      likes: 0,
      createdAt: now,
    };
    mem.comments.unshift(comment);
    return comment;
  }
  const { data, error } = await sb
    .from("comments")
    .insert({
      entity_type: entityType,
      entity_id: entityId,
      parent_id: parentId,
      author_name: authorName,
      body,
      photo_url: photoUrl,
      user_id: userId,
    })
    .select("*")
    .single();
  if (error) throw error;
  return {
    id: data.id,
    entityType: data.entity_type,
    entityId: data.entity_id,
    parentId: data.parent_id ?? null,
    authorName: data.author_name,
    body: data.body,
    photoUrl: data.photo_url ?? null,
    likes: data.likes ?? 0,
    createdAt: data.created_at,
  };
}

/** "Me gusta" de la comunidad a un comentario (uno por dispositivo). */
export async function likeComment(id: string): Promise<void> {
  const sb = getSupabaseAdmin() ?? getSupabase();
  if (!sb) {
    const c = mem.comments.find((c) => c.id === id);
    if (c) c.likes++;
    return;
  }
  const { data, error } = await sb.from("comments").select("likes").eq("id", id).single();
  if (error) throw error;
  const { error: updateError } = await sb.from("comments").update({ likes: (data.likes ?? 0) + 1 }).eq("id", id);
  if (updateError) throw updateError;
}

// ── Reportes: lectura pública + moderación (no bloqueante) ──────────────────
/** Reportes de una persona, visibles de inmediato en su ficha. */
export async function getStatusReports(personId: string): Promise<StatusReport[]> {
  const sb = getSupabase();
  if (!sb)
    return mem.reports
      .filter((r) => r.personId === personId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const { data, error } = await sb
    .from("status_reports")
    .select("*")
    .eq("person_id", personId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map(rowToReport);
}

/** Conteo de reportes por persona, en una sola consulta (para avisos del autor). */
export async function getReportCountsForPersons(ids: string[]): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  if (ids.length === 0) return out;
  const sb = getSupabase();
  if (!sb) {
    for (const r of mem.reports) {
      if (ids.includes(r.personId)) out[r.personId] = (out[r.personId] ?? 0) + 1;
    }
    return out;
  }
  const { data, error } = await sb.from("status_reports").select("person_id").in("person_id", ids);
  if (error) throw error;
  /* eslint-disable @typescript-eslint/no-explicit-any */
  for (const r of (data ?? []) as any[]) {
    out[r.person_id] = (out[r.person_id] ?? 0) + 1;
  }
  /* eslint-enable @typescript-eslint/no-explicit-any */
  return out;
}

/** Cola de moderación: reportes aún sin verificar (para el panel admin). */
export async function getPendingReports(limit = 100): Promise<StatusReport[]> {
  const sb = getSupabase();
  if (!sb)
    return mem.reports
      .filter((r) => !r.verified)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, limit);
  const { data, error } = await sb
    .from("status_reports")
    .select("*")
    .eq("verified", false)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []).map(rowToReport);
}

/** Verifica un reporte y APLICA el cambio de estado a la persona. */
export async function verifyAndApplyReport(reportId: string): Promise<void> {
  const sb = getSupabaseAdmin() ?? getSupabase();
  if (!sb) {
    const report = mem.reports.find((r) => r.id === reportId);
    if (!report) return;
    report.verified = true;
    const person = mem.persons.find((p) => p.id === report.personId);
    if (person) {
      person.status = report.reportedStatus;
      person.updatedAt = new Date().toISOString();
    }
    return;
  }
  const { data: report, error } = await sb
    .from("status_reports")
    .update({ verified: true })
    .eq("id", reportId)
    .select("*")
    .single();
  if (error) throw error;
  const { error: updateError } = await sb
    .from("persons")
    .update({ status: report.reported_status })
    .eq("id", report.person_id);
  if (updateError) throw updateError;
}

/** Descarta un reporte (p. ej. falso) sin tocar el estado de la persona. */
export async function dismissReport(reportId: string): Promise<void> {
  const sb = getSupabaseAdmin() ?? getSupabase();
  if (!sb) {
    mem.reports = mem.reports.filter((r) => r.id !== reportId);
    return;
  }
  const { error } = await sb.from("status_reports").delete().eq("id", reportId);
  if (error) throw error;
}

/** Da/quita el "visto bueno" a un registro de persona (sello de confianza). */
export async function setPersonVerified(personId: string, value: boolean): Promise<void> {
  const sb = getSupabaseAdmin() ?? getSupabase();
  if (!sb) {
    const person = mem.persons.find((p) => p.id === personId);
    if (person) person.verified = value;
    return;
  }
  const { error } = await sb.from("persons").update({ verified: value }).eq("id", personId);
  if (error) throw error;
}

/** Da/quita el "visto bueno" del admin a un punto de ayuda. */
export async function setAidPointVerified(id: string, value: boolean): Promise<void> {
  const sb = getSupabaseAdmin() ?? getSupabase();
  if (!sb) {
    const point = mem.aidPoints.find((p) => p.id === id);
    if (point) point.verified = value;
    return;
  }
  const { error } = await sb.from("aid_points").update({ verified: value }).eq("id", id);
  if (error) throw error;
}

/** Da/quita el "visto bueno" del admin a un hospital. */
export async function setHospitalVerified(id: string, value: boolean): Promise<void> {
  const sb = getSupabaseAdmin() ?? getSupabase();
  if (!sb) {
    const hospital = mem.hospitals.find((h) => h.id === id);
    if (hospital) hospital.verified = value;
    return;
  }
  const { error } = await sb.from("hospitals").update({ verified: value }).eq("id", id);
  if (error) throw error;
}

/** Reacción de la comunidad a la ficha de una persona (🙏 ❤️ 📢). */
export async function reactToPerson(id: string, kind: PersonReaction): Promise<void> {
  const sb = getSupabaseAdmin() ?? getSupabase();
  if (!sb) {
    const person = mem.persons.find((p) => p.id === id);
    if (person) person.reactions[kind] = (person.reactions[kind] ?? 0) + 1;
    return;
  }
  const { data, error } = await sb.from("persons").select("reactions").eq("id", id).single();
  if (error) throw error;
  const reactions = { fuerza: 0, corazon: 0, difundir: 0, ...(data.reactions ?? {}) };
  reactions[kind] = (reactions[kind] ?? 0) + 1;
  // Antes no se comprobaba el resultado: si el guardado fallaba (p. ej. sin
  // permisos), quedaba en silencio — el botón se veía "presionado" para
  // siempre en este dispositivo, pero el contador real nunca subía.
  const { error: updateError } = await sb.from("persons").update({ reactions }).eq("id", id);
  if (updateError) throw updateError;
}

/** Personas recientes para revisión en el panel admin. */
export async function getRecentPersons(limit = 30): Promise<Person[]> {
  const { items } = await getPersons({ sort: "recent", pageSize: limit });
  return items;
}

export interface EstadoBreakdown {
  total: number;
  toLocate: number;
  located: number; // localizado + hospitalizado
  deceased: number;
}

/** Desglose por estado y por estado de localización (para el mapa). */
// Desglose por estado para el mapa (cuenta todas las personas por región).
// También cacheado 60s: es público e igual para todos.
const estadoBreakdownCache = perCountryCache(
  "estado-breakdown",
  (c) => () => getEstadoBreakdownImpl(c),
  { revalidate: 60 },
);
export function getEstadoBreakdown(country = "ve"): Promise<Record<string, EstadoBreakdown>> {
  return estadoBreakdownCache[resolveCountry(country)]();
}
async function getEstadoBreakdownImpl(country = "ve"): Promise<Record<string, EstadoBreakdown>> {
  const tally = (rows: { estado: string | null; status: PersonStatus }[]) => {
    const out: Record<string, EstadoBreakdown> = {};
    for (const r of rows) {
      if (!r.estado) continue;
      const b = (out[r.estado] ??= { total: 0, toLocate: 0, located: 0, deceased: 0 });
      b.total++;
      if (r.status === "por_localizar") b.toLocate++;
      else if (r.status === "fallecido") b.deceased++;
      else b.located++; // localizado u hospitalizado
    }
    return out;
  };

  const sb = getSupabase();
  if (!sb)
    return tally(
      mem.persons
        .filter((p) => (p.country ?? "ve") === country)
        .map((p) => ({ estado: p.estado, status: p.status })),
    );
  // Paginado en bloques de 1000: PostgREST tope por defecto es 1000 filas por
  // consulta. Sin esto, un país con más de 1000 personas (Venezuela ya supera
  // 40.000) quedaba contado sobre una muestra arbitraria de las primeras 1000
  // en vez del total real — subestimando fuerte el desglose por estado del mapa.
  const rows: { estado: string | null; status: PersonStatus }[] = [];
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await sb
      .from("persons")
      .select("estado,status")
      .eq("country", country)
      .range(from, from + PAGE - 1);
    if (error) throw error;
    rows.push(...((data ?? []) as { estado: string | null; status: PersonStatus }[]));
    if (!data || data.length < PAGE) break;
  }
  return tally(rows);
}

/**
 * Conteo de personas por estado/región (para el mapa y "Por estado" del
 * inicio). Traía la tabla `persons` COMPLETA (sin límite) en cada carga del
 * inicio, sin caché — el peor caso de los tres que encontré hoy. Cacheado 60s
 * igual que el resto del panel.
 */
const countsByEstadoCache = perCountryCache(
  "counts-by-estado",
  (c) => () => getCountsByEstadoImpl(c),
  { revalidate: 60 },
);
export function getCountsByEstado(country = "ve"): Promise<Record<string, number>> {
  return countsByEstadoCache[resolveCountry(country)]();
}
async function getCountsByEstadoImpl(country = "ve"): Promise<Record<string, number>> {
  const sb = getSupabase();
  if (!sb) {
    const counts: Record<string, number> = {};
    for (const p of mem.persons) {
      if ((p.country ?? "ve") !== country) continue;
      if (p.estado) counts[p.estado] = (counts[p.estado] ?? 0) + 1;
    }
    return counts;
  }
  // Paginado en bloques de 1000 (mismo motivo que en getEstadoBreakdownImpl):
  // sin `.range()`, PostgREST topa en 1000 filas y subestima países grandes.
  const counts: Record<string, number> = {};
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await sb
      .from("persons")
      .select("estado")
      .eq("country", country)
      .range(from, from + PAGE - 1);
    if (error) throw error;
    for (const r of data ?? []) {
      if (r.estado) counts[r.estado] = (counts[r.estado] ?? 0) + 1;
    }
    if (!data || data.length < PAGE) break;
  }
  return counts;
}

// ── Comunidad / Feed ────────────────────────────────────────────────────────
/* eslint-disable @typescript-eslint/no-explicit-any */
function rowToPost(r: any): Post {
  return {
    id: r.id,
    country: r.country ?? "ve",
    type: r.type,
    body: r.body,
    estado: r.estado,
    locationText: r.location_text ?? "",
    photoUrl: r.photo_url,
    linkUrl: r.link_url,
    authorName: r.author_name,
    contactPhone: r.contact_phone,
    pinned: r.pinned ?? false,
    aidPointId: r.aid_point_id ?? null,
    reactions: { apoyo: 0, corazon: 0, hecho: 0, ...(r.reactions ?? {}) },
    createdAt: r.created_at,
    origin: r.origin ?? "community",
    moderationStatus: r.moderation_status ?? "approved",
  };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

export async function getPosts(
  filter: {
    country?: string;
    type?: PostType | "all";
    estado?: string | "all";
    search?: string;
    pinnedOnly?: boolean;
    aidPointId?: string;
  } = {},
): Promise<Post[]> {
  const country = filter.country ?? "ve";
  const sb = getSupabase();
  if (!sb) {
    // Lo importado por hashtag (Bluesky/Mastodon) nace "pending": nunca se ve
    // en el muro hasta que un moderador le da el visto bueno en /admin.
    let items = mem.posts.filter((p) => (p.country ?? "ve") === country && p.moderationStatus !== "pending");
    if (filter.type && filter.type !== "all") items = items.filter((p) => p.type === filter.type);
    if (filter.estado && filter.estado !== "all")
      items = items.filter((p) => p.estado === filter.estado);
    if (filter.pinnedOnly) items = items.filter((p) => p.pinned);
    if (filter.aidPointId) items = items.filter((p) => p.aidPointId === filter.aidPointId);
    if (filter.search) {
      const s = filter.search.toLowerCase().trim();
      items = items.filter((p) =>
        [p.body, p.locationText, p.authorName, p.estado]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(s),
      );
    }
    return items.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
  let query = sb
    .from("posts")
    .select("*")
    .eq("country", country)
    .neq("moderation_status", "pending")
    .order("created_at", { ascending: false })
    .limit(100);
  if (filter.type && filter.type !== "all") query = query.eq("type", filter.type);
  if (filter.estado && filter.estado !== "all") query = query.eq("estado", filter.estado);
  if (filter.pinnedOnly) query = query.eq("pinned", true);
  if (filter.aidPointId) query = query.eq("aid_point_id", filter.aidPointId);
  if (filter.search) {
    // Quita caracteres que rompen el filtro `or` de PostgREST.
    const s = filter.search.replace(/[,()*]/g, " ").trim();
    if (s) {
      query = query.or(
        `body.ilike.%${s}%,location_text.ilike.%${s}%,author_name.ilike.%${s}%`,
      );
    }
  }
  const { data, error } = await query;
  if (error) throw error;
  const rows = data ?? [];
  return attachAuthorProfiles(rows.map(rowToPost), rows.map((r) => r.user_id ?? null));
}

export interface PostResult {
  items: Post[];
  total: number;
  page: number;
  pageSize: number;
}

export type PostSort = "recent" | "oldest" | "popular" | "least_popular";

function postPopularity(p: Post): number {
  return p.reactions.apoyo + p.reactions.corazon + p.reactions.hecho;
}

/**
 * Muro de Comunidad, PAGINADO. Antes `getPosts` traía hasta 100 publicaciones
 * completas (con foto) en cada visita, sin límite de página — pasados los 100
 * posts (esperable en una emergencia activa el primer día) no había forma de
 * ver nada más antiguo. 20 por página, con conteo real para la paginación.
 * `sort: "popular"`/"least_popular" usan `reactions_total` (columna calculada
 * en la base de datos) para no tener que traer todo y sumar reacciones en el
 * servidor. `estado` filtra por región y `dateFrom`/`dateTo` (fechas ISO,
 * solo la parte de fecha) acotan cuándo se publicó.
 */
export async function getPostsPage(
  filter: {
    country?: string;
    type?: PostType | "all";
    search?: string;
    estado?: string | "all";
    dateFrom?: string;
    dateTo?: string;
  },
  page = 1,
  pageSize = 20,
  sort: PostSort = "recent",
): Promise<PostResult> {
  const country = filter.country ?? "ve";
  const sb = getSupabase();
  if (!sb) {
    let items = mem.posts.filter((p) => (p.country ?? "ve") === country && p.moderationStatus !== "pending");
    if (filter.type && filter.type !== "all") items = items.filter((p) => p.type === filter.type);
    if (filter.estado && filter.estado !== "all") items = items.filter((p) => p.estado === filter.estado);
    if (filter.dateFrom) items = items.filter((p) => p.createdAt >= filter.dateFrom!);
    if (filter.dateTo) items = items.filter((p) => p.createdAt <= `${filter.dateTo}T23:59:59.999Z`);
    if (filter.search) {
      const s = filter.search.toLowerCase().trim();
      items = items.filter((p) =>
        [p.body, p.locationText, p.authorName, p.estado].filter(Boolean).join(" ").toLowerCase().includes(s),
      );
    }
    items =
      sort === "oldest"
        ? items.sort((a, b) => a.createdAt.localeCompare(b.createdAt))
        : sort === "popular"
          ? items.sort((a, b) => postPopularity(b) - postPopularity(a) || b.createdAt.localeCompare(a.createdAt))
          : sort === "least_popular"
            ? items.sort((a, b) => postPopularity(a) - postPopularity(b) || b.createdAt.localeCompare(a.createdAt))
            : items.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const total = items.length;
    const start = (page - 1) * pageSize;
    return { items: items.slice(start, start + pageSize), total, page, pageSize };
  }
  let query = sb
    .from("posts")
    .select("*", { count: "exact" })
    .eq("country", country)
    .neq("moderation_status", "pending");
  query =
    sort === "oldest"
      ? query.order("created_at", { ascending: true })
      : sort === "popular"
        ? query.order("reactions_total", { ascending: false }).order("created_at", { ascending: false })
        : sort === "least_popular"
          ? query.order("reactions_total", { ascending: true }).order("created_at", { ascending: false })
          : query.order("created_at", { ascending: false });
  if (filter.type && filter.type !== "all") query = query.eq("type", filter.type);
  if (filter.estado && filter.estado !== "all") query = query.eq("estado", filter.estado);
  if (filter.dateFrom) query = query.gte("created_at", filter.dateFrom);
  if (filter.dateTo) query = query.lte("created_at", `${filter.dateTo}T23:59:59.999Z`);
  if (filter.search) {
    const s = filter.search.replace(/[,()*]/g, " ").trim();
    if (s) query = query.or(`body.ilike.%${s}%,location_text.ilike.%${s}%,author_name.ilike.%${s}%`);
  }
  const start = (page - 1) * pageSize;
  const { data, error, count } = await query.range(start, start + pageSize - 1);
  if (error) throw error;
  const rows = data ?? [];
  const items = await attachAuthorProfiles(rows.map(rowToPost), rows.map((r) => r.user_id ?? null));
  return { items, total: count ?? 0, page, pageSize };
}

/**
 * Posts "necesito"/"ofrezco" para las capas del mapa, cacheados 60s (misma
 * lógica que el resto del mapa: hospitales, puntos de ayuda, caravanas...).
 * A propósito NO se usa para "rescate": una alerta de rescate es urgente de
 * verdad y un retraso de hasta 60s ahí sí puede importar, así que esas se
 * siguen consultando en vivo (ver getPosts en mapa/page.tsx).
 */
const mapPostsCache = perCountryCache(
  "map-posts",
  (c) => (type: "necesito" | "ofrezco"): Promise<Post[]> => getPosts({ type, country: c }),
  { revalidate: 60 },
);
export function getMapPosts(type: "necesito" | "ofrezco", country = "ve"): Promise<Post[]> {
  return mapPostsCache[resolveCountry(country)](type);
}

export async function getPostById(id: string): Promise<Post | null> {
  const sb = getSupabase();
  if (!sb) return mem.posts.find((p) => p.id === id) ?? null;
  const { data, error } = await sb.from("posts").select("*").eq("id", id).single();
  if (error || !data) return null;
  const [post] = await attachAuthorProfiles([rowToPost(data)], [data.user_id ?? null]);
  return post;
}

// ── Cola de moderación: publicaciones importadas de otras redes por hashtag ──
// Las llena `scripts/fetch-social-posts.mjs` (Bluesky/Mastodon, vía sus APIs
// públicas oficiales) con `moderationStatus: "pending"`. Nunca aparecen en
// /comunidad (ver el filtro en `getPosts`/`getPostsPage`) hasta que un
// moderador las aprueba o rechaza aquí.
export async function getPendingExternalPosts(): Promise<Post[]> {
  const sb = getSupabaseAdmin() ?? getSupabase();
  if (!sb) {
    return mem.posts
      .filter((p) => p.moderationStatus === "pending")
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }
  const { data, error } = await sb
    .from("posts")
    .select("*")
    .eq("moderation_status", "pending")
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []).map(rowToPost);
}

export async function approveExternalPost(id: string): Promise<void> {
  const sb = getSupabaseAdmin() ?? getSupabase();
  if (!sb) {
    const post = mem.posts.find((p) => p.id === id);
    if (post) post.moderationStatus = "approved";
    return;
  }
  const { error } = await sb.from("posts").update({ moderation_status: "approved" }).eq("id", id);
  if (error) throw error;
}

export async function rejectExternalPost(id: string): Promise<void> {
  const sb = getSupabaseAdmin() ?? getSupabase();
  if (!sb) {
    mem.posts = mem.posts.filter((p) => p.id !== id);
    return;
  }
  const { error } = await sb.from("posts").delete().eq("id", id);
  if (error) throw error;
}

export interface CreatePostResult {
  post: Post;
  ownerToken: string;
}

export async function createPost(
  input: PostInput,
  photoUrl: string | null,
  userId: string | null = null,
): Promise<CreatePostResult> {
  const now = new Date().toISOString();
  const ownerToken = newToken();
  const sb = getSupabaseAdmin() ?? getSupabase();
  const country = input.country ?? "ve";
  if (!sb) {
    const post: Post = {
      id: uid("post"),
      country,
      type: input.type,
      body: input.body,
      estado: input.estado ?? null,
      locationText: input.locationText || "",
      photoUrl,
      linkUrl: input.linkUrl || null,
      authorName: input.authorName,
      contactPhone: input.contactPhone || null,
      pinned: false,
      aidPointId: input.aidPointId || null,
      reactions: { apoyo: 0, corazon: 0, hecho: 0 },
      createdAt: now,
    };
    mem.posts.unshift(post);
    await createResourceOwner("post", post.id, ownerToken);
    return { post, ownerToken };
  }
  const { data, error } = await sb
    .from("posts")
    .insert({
      country,
      type: input.type,
      body: input.body,
      estado: input.estado ?? null,
      location_text: input.locationText || "",
      photo_url: photoUrl,
      link_url: input.linkUrl || null,
      author_name: input.authorName,
      contact_phone: input.contactPhone || null,
      aid_point_id: input.aidPointId || null,
      reactions: { apoyo: 0, corazon: 0, hecho: 0 },
      user_id: userId,
    })
    .select("*")
    .single();
  if (error) throw error;
  const post = rowToPost(data);
  await createResourceOwner("post", post.id, ownerToken);
  return { post, ownerToken };
}

// Publicaciones ligadas a una cuenta (para "Mis publicaciones" cross-device).
// Solo aplica con Supabase; en demo no hay sesión, así que devuelve [].
//
// IMPORTANTE: esta lista se quedó desactualizada — `hospitals`, `complaints` y
// `pets` ganaron su columna `user_id` en migraciones posteriores (ver
// supabase/schema.sql), pero esta función nunca se extendió para incluirlas.
// Resultado real: alguien que registra un hospital, una denuncia o una
// mascota con su cuenta NUNCA las veía en "Mis publicaciones" (/perfil) NI
// recibía avisos de comentarios nuevos en ellas (la campanita depende de
// esta misma función). El perfil ya tenía listos los enlaces/etiquetas para
// estos tres tipos (`PUBLIC_PATH`/`TYPE_LABEL` en app/perfil/page.tsx) —
// solo faltaba traerlos aquí.
export type MyPublication = {
  type: "person" | "post" | "aid_point" | "march" | "hospital" | "complaint" | "pet";
  id: string;
  title: string;
  createdAt: string;
};

export async function getMyPublications(userId: string): Promise<MyPublication[]> {
  const sb = getSupabaseAdmin() ?? getSupabase();
  if (!sb) return [];
  const [persons, posts, aids, marches, hospitals, complaints, pets] = await Promise.all([
    sb.from("persons").select("id, first_name, last_name, created_at").eq("user_id", userId),
    sb.from("posts").select("id, body, created_at").eq("user_id", userId),
    sb.from("aid_points").select("id, name, created_at").eq("user_id", userId),
    sb.from("marches").select("id, title, created_at").eq("user_id", userId),
    sb.from("hospitals").select("id, name, created_at").eq("user_id", userId),
    sb.from("complaints").select("id, body, created_at").eq("user_id", userId),
    sb.from("pets").select("id, name, created_at").eq("user_id", userId),
  ]);
  /* eslint-disable @typescript-eslint/no-explicit-any */
  const out: MyPublication[] = [];
  for (const r of (persons.data ?? []) as any[]) {
    out.push({
      type: "person",
      id: r.id,
      title: `${r.first_name ?? ""} ${r.last_name ?? ""}`.trim() || "Persona sin identificar",
      createdAt: r.created_at,
    });
  }
  for (const r of (posts.data ?? []) as any[]) {
    out.push({ type: "post", id: r.id, title: String(r.body ?? "").slice(0, 40) || "Publicación", createdAt: r.created_at });
  }
  for (const r of (aids.data ?? []) as any[]) {
    out.push({ type: "aid_point", id: r.id, title: r.name || "Punto de ayuda", createdAt: r.created_at });
  }
  for (const r of (marches.data ?? []) as any[]) {
    out.push({ type: "march", id: r.id, title: r.title || "Caravana", createdAt: r.created_at });
  }
  for (const r of (hospitals.data ?? []) as any[]) {
    out.push({ type: "hospital", id: r.id, title: r.name || "Hospital", createdAt: r.created_at });
  }
  for (const r of (complaints.data ?? []) as any[]) {
    out.push({ type: "complaint", id: r.id, title: String(r.body ?? "").slice(0, 40) || "Denuncia", createdAt: r.created_at });
  }
  for (const r of (pets.data ?? []) as any[]) {
    out.push({ type: "pet", id: r.id, title: r.name || "Mascota", createdAt: r.created_at });
  }
  /* eslint-enable @typescript-eslint/no-explicit-any */
  out.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return out;
}

// ── Estadísticas de "voluntario digital" (perfil) ───────────────────────────
// Solo cifras REALES y verificables — nada estimado que no se pueda calcular
// con lo que ya guarda la base de datos. "Reacciones recibidas" combina las
// distintas formas en que cada tabla las guarda: `reactions` (jsonb, en
// persons/posts), `likes` (int, en aid_points/marches/hospitals) y
// `supports` (int, en complaints) — no hay una columna común a todas.
export interface VolunteerStats {
  publications: number;
  commentsMade: number;
  commentsReceived: number;
  reactionsReceived: number;
  savedByOthers: number;
  savedByMe: number;
}

const EMPTY_VOLUNTEER_STATS: VolunteerStats = {
  publications: 0,
  commentsMade: 0,
  commentsReceived: 0,
  reactionsReceived: 0,
  savedByOthers: 0,
  savedByMe: 0,
};

export async function getDigitalVolunteerStats(userId: string): Promise<VolunteerStats> {
  const sb = getSupabaseAdmin() ?? getSupabase();
  if (!sb) return EMPTY_VOLUNTEER_STATS;

  const [pubs, commentsMadeRes, savedByMeRes] = await Promise.all([
    getMyPublications(userId),
    sb.from("comments").select("id", { count: "exact", head: true }).eq("user_id", userId),
    sb.from("saved_items").select("id", { count: "exact", head: true }).eq("user_id", userId),
  ]);

  const myIds = pubs.map((p) => p.id);
  if (myIds.length === 0) {
    return {
      ...EMPTY_VOLUNTEER_STATS,
      commentsMade: commentsMadeRes.count ?? 0,
      savedByMe: savedByMeRes.count ?? 0,
    };
  }

  const byType = (t: MyPublication["type"]) => pubs.filter((p) => p.type === t).map((p) => p.id);
  const personIds = byType("person");
  const postIds = byType("post");
  const aidIds = byType("aid_point");
  const marchIds = byType("march");
  const hospIds = byType("hospital");
  const complaintIds = byType("complaint");

  /* eslint-disable @typescript-eslint/no-explicit-any */
  const sumJsonReactions = (rows: any[]) =>
    rows.reduce((n, r) => {
      const v = (r.reactions ?? {}) as Record<string, number>;
      return n + Object.values(v).reduce((a, x) => a + (Number(x) || 0), 0);
    }, 0);
  const sumColumn = (rows: any[], col: string) => rows.reduce((n, r) => n + (Number(r[col]) || 0), 0);

  const [commentsReceivedRes, savedByOthersRes, personsRes, postsRes, aidRes, marchRes, hospRes, complaintsRes] =
    await Promise.all([
      sb.from("comments").select("id", { count: "exact", head: true }).in("entity_id", myIds),
      sb.from("saved_items").select("id", { count: "exact", head: true }).in("entity_id", myIds),
      personIds.length ? sb.from("persons").select("reactions").in("id", personIds) : Promise.resolve({ data: [] as any[] }),
      postIds.length ? sb.from("posts").select("reactions").in("id", postIds) : Promise.resolve({ data: [] as any[] }),
      aidIds.length ? sb.from("aid_points").select("likes").in("id", aidIds) : Promise.resolve({ data: [] as any[] }),
      marchIds.length ? sb.from("marches").select("likes").in("id", marchIds) : Promise.resolve({ data: [] as any[] }),
      hospIds.length ? sb.from("hospitals").select("likes").in("id", hospIds) : Promise.resolve({ data: [] as any[] }),
      complaintIds.length
        ? sb.from("complaints").select("supports").in("id", complaintIds)
        : Promise.resolve({ data: [] as any[] }),
    ]);

  const reactionsReceived =
    sumJsonReactions(personsRes.data ?? []) +
    sumJsonReactions(postsRes.data ?? []) +
    sumColumn(aidRes.data ?? [], "likes") +
    sumColumn(marchRes.data ?? [], "likes") +
    sumColumn(hospRes.data ?? [], "likes") +
    sumColumn(complaintsRes.data ?? [], "supports");
  /* eslint-enable @typescript-eslint/no-explicit-any */

  return {
    publications: pubs.length,
    commentsMade: commentsMadeRes.count ?? 0,
    commentsReceived: commentsReceivedRes.count ?? 0,
    reactionsReceived,
    savedByOthers: savedByOthersRes.count ?? 0,
    savedByMe: savedByMeRes.count ?? 0,
  };
}

// ── Guardar / seguir publicaciones (requiere cuenta) ─────────────────────────
// Account-only: en modo demostración (sin Supabase) no hay sesión, así que estas
// funciones devuelven vacío / no hacen nada. Todo se filtra por user_id.

/** Publicaciones que la cuenta guardó, de la más reciente a la más antigua. */
export async function getSavedItems(userId: string): Promise<SavedItem[]> {
  const sb = getSupabaseAdmin() ?? getSupabase();
  if (!sb) return [];
  const { data } = await sb
    .from("saved_items")
    .select("entity_type, entity_id, title, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  /* eslint-disable @typescript-eslint/no-explicit-any */
  return ((data ?? []) as any[]).map((r) => ({
    type: r.entity_type as SavedEntity,
    id: r.entity_id as string,
    title: (r.title as string) || "",
    createdAt: r.created_at as string,
  }));
  /* eslint-enable @typescript-eslint/no-explicit-any */
}

/** Claves `${tipo}:${id}` de lo guardado (para marcar los botones). */
export async function getSavedKeys(userId: string): Promise<string[]> {
  return (await getSavedItems(userId)).map((i) => `${i.type}:${i.id}`);
}

/** Guarda una publicación (idempotente por el único de la tabla). */
export async function saveItem(
  userId: string,
  type: SavedEntity,
  id: string,
  title: string,
): Promise<void> {
  const sb = getSupabaseAdmin() ?? getSupabase();
  if (!sb) return;
  const { error } = await sb.from("saved_items").upsert(
    { user_id: userId, entity_type: type, entity_id: id, title: title.slice(0, 120) },
    { onConflict: "user_id,entity_type,entity_id", ignoreDuplicates: true },
  );
  if (error) throw error;
}

/** Quita una publicación de los guardados de la cuenta. */
export async function unsaveItem(userId: string, type: SavedEntity, id: string): Promise<void> {
  const sb = getSupabaseAdmin() ?? getSupabase();
  if (!sb) return;
  const { error } = await sb
    .from("saved_items")
    .delete()
    .eq("user_id", userId)
    .eq("entity_type", type)
    .eq("entity_id", id);
  if (error) throw error;
}

/** Edita una publicación de la comunidad (autor). No toca reacciones ni foto. */
export async function updatePostFields(id: string, input: PostInput): Promise<void> {
  const sb = getSupabaseAdmin() ?? getSupabase();
  if (!sb) {
    const post = mem.posts.find((p) => p.id === id);
    if (post) {
      post.type = input.type;
      post.body = input.body;
      post.estado = input.estado ?? null;
      post.locationText = input.locationText || "";
      post.linkUrl = input.linkUrl || null;
      post.authorName = input.authorName;
      post.contactPhone = input.contactPhone || null;
      post.aidPointId = input.aidPointId || null;
    }
    return;
  }
  const { error } = await sb
    .from("posts")
    .update({
      type: input.type,
      body: input.body,
      estado: input.estado ?? null,
      location_text: input.locationText || "",
      link_url: input.linkUrl || null,
      author_name: input.authorName,
      contact_phone: input.contactPhone || null,
      aid_point_id: input.aidPointId || null,
    })
    .eq("id", id);
  if (error) throw error;
}

/** Fija/desfija una publicación en el muro (destacado por el admin). */
export async function setPostPinned(id: string, value: boolean): Promise<void> {
  const sb = getSupabaseAdmin() ?? getSupabase();
  if (!sb) {
    const post = mem.posts.find((p) => p.id === id);
    if (post) post.pinned = value;
    return;
  }
  const { error } = await sb.from("posts").update({ pinned: value }).eq("id", id);
  if (error) throw error;
}

/** Elimina una publicación de la comunidad (autor). */
export async function deletePost(id: string): Promise<void> {
  const sb = getSupabaseAdmin() ?? getSupabase();
  if (!sb) {
    mem.posts = mem.posts.filter((p) => p.id !== id);
    await deleteResourceOwner("post", id);
    return;
  }
  const { data } = await sb.from("posts").select("photo_url").eq("id", id).maybeSingle();
  const { error } = await sb.from("posts").delete().eq("id", id);
  if (error) throw error;
  await deleteResourceOwner("post", id);
  await deleteStoragePhoto(data?.photo_url as string | undefined);
}

export async function reactToPost(id: string, kind: ReactionKind): Promise<void> {
  const sb = getSupabaseAdmin() ?? getSupabase();
  if (!sb) {
    const post = mem.posts.find((p) => p.id === id);
    if (post) post.reactions[kind] = (post.reactions[kind] ?? 0) + 1;
    return;
  }
  const { data, error } = await sb.from("posts").select("reactions").eq("id", id).single();
  if (error) throw error;
  const reactions = { apoyo: 0, corazon: 0, hecho: 0, ...(data.reactions ?? {}) };
  reactions[kind] = (reactions[kind] ?? 0) + 1;
  const { error: updateError } = await sb.from("posts").update({ reactions }).eq("id", id);
  if (updateError) throw updateError;
}

// ── Denuncias de irregularidades ────────────────────────────────────────────
/* eslint-disable @typescript-eslint/no-explicit-any */
function rowToComplaint(r: any): Complaint {
  return {
    id: r.id,
    country: r.country ?? "ve",
    category: r.category,
    body: r.body,
    estado: r.estado,
    locationText: r.location_text ?? "",
    photoUrl: r.photo_url,
    authorName: r.author_name,
    supports: r.supports ?? 0,
    createdAt: r.created_at,
  };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

export interface ComplaintResult {
  items: Complaint[];
  total: number;
  page: number;
  pageSize: number;
}

// Antes traía hasta 200 denuncias de un tirón sin paginar. Ahora pagina de
// verdad (10/20/50 a elegir), en vivo.
export async function getComplaints(
  filter: {
    country?: string;
    category?: ComplaintCategory | "all";
    search?: string;
    estado?: string | "all";
    dateFrom?: string;
    dateTo?: string;
  } = {},
  page = 1,
  pageSize = 10,
): Promise<ComplaintResult> {
  const country = filter.country ?? "ve";
  const sb = getSupabase();
  if (!sb) {
    let items = mem.complaints.filter((c) => (c.country ?? "ve") === country);
    if (filter.category && filter.category !== "all")
      items = items.filter((c) => c.category === filter.category);
    if (filter.estado && filter.estado !== "all") items = items.filter((c) => c.estado === filter.estado);
    if (filter.dateFrom) items = items.filter((c) => c.createdAt >= filter.dateFrom!);
    if (filter.dateTo) items = items.filter((c) => c.createdAt <= `${filter.dateTo}T23:59:59.999Z`);
    if (filter.search) {
      const s = filter.search.toLowerCase().trim();
      items = items.filter((c) =>
        [c.body, c.locationText, c.authorName, c.estado]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(s),
      );
    }
    items = items.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const total = items.length;
    const start = (page - 1) * pageSize;
    return { items: items.slice(start, start + pageSize), total, page, pageSize };
  }
  let query = sb
    .from("complaints")
    .select("*", { count: "exact" })
    .eq("country", country)
    .order("created_at", { ascending: false });
  if (filter.category && filter.category !== "all") query = query.eq("category", filter.category);
  if (filter.estado && filter.estado !== "all") query = query.eq("estado", filter.estado);
  if (filter.dateFrom) query = query.gte("created_at", filter.dateFrom);
  if (filter.dateTo) query = query.lte("created_at", `${filter.dateTo}T23:59:59.999Z`);
  if (filter.search) {
    const s = filter.search.replace(/[,()*]/g, " ").trim();
    if (s) query = query.or(`body.ilike.%${s}%,location_text.ilike.%${s}%,author_name.ilike.%${s}%`);
  }
  const start = (page - 1) * pageSize;
  const { data, error, count } = await query.range(start, start + pageSize - 1);
  if (error) throw error;
  return { items: (data ?? []).map(rowToComplaint), total: count ?? 0, page, pageSize };
}

export async function createComplaint(
  input: ComplaintInput,
  photoUrl: string | null,
  userId: string,
  authorName: string,
): Promise<Complaint> {
  const now = new Date().toISOString();
  const sb = getSupabaseAdmin() ?? getSupabase();
  const country = input.country ?? "ve";
  if (!sb) {
    const complaint: Complaint = {
      id: uid("complaint"),
      country,
      category: input.category,
      body: input.body,
      estado: input.estado ?? null,
      locationText: input.locationText || "",
      photoUrl,
      authorName,
      supports: 0,
      createdAt: now,
    };
    mem.complaints.unshift(complaint);
    return complaint;
  }
  const { data, error } = await sb
    .from("complaints")
    .insert({
      country,
      category: input.category,
      body: input.body,
      estado: input.estado ?? null,
      location_text: input.locationText || "",
      photo_url: photoUrl,
      author_name: authorName,
      user_id: userId,
    })
    .select("*")
    .single();
  if (error) throw error;
  return rowToComplaint(data);
}

/** Solo el admin elimina una denuncia (comprobadamente falsa/inapropiada).
 *  El autor NO puede borrarla él mismo (a propósito, para que una denuncia no
 *  "desaparezca" tras publicada) — ver docs/PLAN-TINDER-Y-ROLES.md §3.1. */
export async function deleteComplaint(id: string): Promise<void> {
  const sb = getSupabaseAdmin() ?? getSupabase();
  if (!sb) {
    mem.complaints = mem.complaints.filter((c) => c.id !== id);
    return;
  }
  const { error } = await sb.from("complaints").delete().eq("id", id);
  if (error) throw error;
}

/** Apoyo de la comunidad a una denuncia (uno por dispositivo; exige sesión). */
export async function supportComplaint(id: string): Promise<void> {
  const sb = getSupabaseAdmin() ?? getSupabase();
  if (!sb) {
    const c = mem.complaints.find((c) => c.id === id);
    if (c) c.supports++;
    return;
  }
  const { data, error } = await sb.from("complaints").select("supports").eq("id", id).single();
  if (error) throw error;
  const { error: updateError } = await sb
    .from("complaints")
    .update({ supports: (data.supports ?? 0) + 1 })
    .eq("id", id);
  if (updateError) throw updateError;
}

// ── Mascotas ────────────────────────────────────────────────────────────────
/* eslint-disable @typescript-eslint/no-explicit-any */
function rowToPet(r: any): Pet {
  return {
    id: r.id,
    country: r.country ?? "ve",
    status: r.status,
    species: r.species ?? "perro",
    name: r.name ?? "",
    description: r.description ?? "",
    photoUrl: r.photo_url,
    estado: r.estado,
    locationText: r.location_text ?? "",
    contactPhone: r.contact_phone,
    updatedAt: r.updated_at ?? r.created_at,
    createdAt: r.created_at,
  };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

export interface PetResult {
  items: Pet[];
  total: number;
  page: number;
  pageSize: number;
}

// Antes traía hasta 200 mascotas de un tirón sin paginar. Ahora pagina de
// verdad (10/20/50 a elegir), en vivo.
export type PetSort = "recent" | "oldest";

export async function getPets(
  filter: {
    country?: string;
    status?: PetStatus | "all";
    search?: string;
    estado?: string | "all";
    dateFrom?: string;
    dateTo?: string;
  } = {},
  page = 1,
  pageSize = 10,
  sort: PetSort = "recent",
): Promise<PetResult> {
  const country = filter.country ?? "ve";
  const sb = getSupabase();
  if (!sb) {
    let items = mem.pets.filter((p) => (p.country ?? "ve") === country);
    if (filter.status && filter.status !== "all") items = items.filter((p) => p.status === filter.status);
    if (filter.estado && filter.estado !== "all") items = items.filter((p) => p.estado === filter.estado);
    if (filter.dateFrom) items = items.filter((p) => p.createdAt >= filter.dateFrom!);
    if (filter.dateTo) items = items.filter((p) => p.createdAt <= `${filter.dateTo}T23:59:59.999Z`);
    if (filter.search) {
      const s = filter.search.toLowerCase().trim();
      items = items.filter((p) =>
        [p.name, p.description, p.locationText, p.estado]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(s),
      );
    }
    items =
      sort === "oldest"
        ? items.sort((a, b) => a.createdAt.localeCompare(b.createdAt))
        : items.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const total = items.length;
    const start = (page - 1) * pageSize;
    return { items: items.slice(start, start + pageSize), total, page, pageSize };
  }
  let query = sb
    .from("pets")
    .select("*", { count: "exact" })
    .eq("country", country)
    .order("created_at", { ascending: sort === "oldest" });
  if (filter.status && filter.status !== "all") query = query.eq("status", filter.status);
  if (filter.estado && filter.estado !== "all") query = query.eq("estado", filter.estado);
  if (filter.dateFrom) query = query.gte("created_at", filter.dateFrom);
  if (filter.dateTo) query = query.lte("created_at", `${filter.dateTo}T23:59:59.999Z`);
  if (filter.search) {
    const s = filter.search.replace(/[,()*]/g, " ").trim();
    if (s) query = query.or(`name.ilike.%${s}%,description.ilike.%${s}%,location_text.ilike.%${s}%`);
  }
  const start = (page - 1) * pageSize;
  const { data, error, count } = await query.range(start, start + pageSize - 1);
  if (error) throw error;
  return { items: (data ?? []).map(rowToPet), total: count ?? 0, page, pageSize };
}

export async function getPetById(id: string): Promise<Pet | null> {
  const sb = getSupabase();
  if (!sb) return mem.pets.find((p) => p.id === id) ?? null;
  const { data, error } = await sb.from("pets").select("*").eq("id", id).single();
  if (error) return null;
  return data ? rowToPet(data) : null;
}

export interface CreatePetResult {
  pet: Pet;
  ownerToken: string;
}

// Mismo modelo de gestión que un punto de ayuda: enlace privado (token) para
// que quien reporta la mascota pueda editarla, marcarla como encontrada o
// eliminarla después. Antes quedaba fija para siempre.
export async function createPet(
  input: PetInput,
  photoUrl: string | null,
  userId: string | null = null,
): Promise<CreatePetResult> {
  const now = new Date().toISOString();
  const ownerToken = newToken();
  const sb = getSupabaseAdmin() ?? getSupabase();
  const country = input.country ?? "ve";
  if (!sb) {
    const pet: Pet = {
      id: uid("pet"),
      country,
      status: input.status,
      species: input.species,
      name: input.name || "",
      description: input.description,
      photoUrl,
      estado: input.estado ?? null,
      locationText: input.locationText || "",
      contactPhone: input.contactPhone || null,
      updatedAt: now,
      createdAt: now,
    };
    mem.pets.unshift(pet);
    await createResourceOwner("pet", pet.id, ownerToken);
    return { pet, ownerToken };
  }
  const { data, error } = await sb
    .from("pets")
    .insert({
      country,
      status: input.status,
      species: input.species,
      name: input.name || "",
      description: input.description,
      photo_url: photoUrl,
      estado: input.estado ?? null,
      location_text: input.locationText || "",
      contact_phone: input.contactPhone || null,
      user_id: userId,
    })
    .select("*")
    .single();
  if (error) throw error;
  const pet = rowToPet(data);
  await createResourceOwner("pet", pet.id, ownerToken);
  return { pet, ownerToken };
}

/** Edita los datos de una mascota (autor). No toca el estado (ver setPetStatus). */
export async function updatePetFields(id: string, input: PetInput): Promise<void> {
  const now = new Date().toISOString();
  const sb = getSupabaseAdmin() ?? getSupabase();
  if (!sb) {
    const pet = mem.pets.find((p) => p.id === id);
    if (pet) {
      pet.species = input.species;
      pet.name = input.name || "";
      pet.description = input.description;
      pet.estado = input.estado ?? null;
      pet.locationText = input.locationText || "";
      pet.contactPhone = input.contactPhone || null;
      pet.updatedAt = now;
    }
    return;
  }
  const { error } = await sb
    .from("pets")
    .update({
      species: input.species,
      name: input.name || "",
      description: input.description,
      estado: input.estado ?? null,
      location_text: input.locationText || "",
      contact_phone: input.contactPhone || null,
    })
    .eq("id", id);
  if (error) throw error;
}

/** El autor marca el estado (perdida/encontrada/refugio/veterinario). */
export async function setPetStatus(id: string, status: PetStatus): Promise<void> {
  const now = new Date().toISOString();
  const sb = getSupabaseAdmin() ?? getSupabase();
  if (!sb) {
    const pet = mem.pets.find((p) => p.id === id);
    if (pet) {
      pet.status = status;
      pet.updatedAt = now;
    }
    return;
  }
  const { error } = await sb.from("pets").update({ status }).eq("id", id);
  if (error) throw error;
}

export async function deletePet(id: string): Promise<void> {
  const sb = getSupabaseAdmin() ?? getSupabase();
  if (!sb) {
    mem.pets = mem.pets.filter((p) => p.id !== id);
    await deleteResourceOwner("pet", id);
    return;
  }
  const { data } = await sb.from("pets").select("photo_url").eq("id", id).maybeSingle();
  const { error } = await sb.from("pets").delete().eq("id", id);
  if (error) throw error;
  await deleteResourceOwner("pet", id);
  await deleteStoragePhoto(data?.photo_url as string | undefined);
}

/** ¿Puede la sesión actual gestionar esta mascota? (autor por cuenta; el token
 *  privado se verifica aparte con verifyResourceOwner). */
export async function canManagePet(id: string): Promise<boolean> {
  return sessionOwns("pets", id);
}

// ── Voluntarios ─────────────────────────────────────────────────────────────
/* eslint-disable @typescript-eslint/no-explicit-any */
function rowToVolunteer(r: any): Volunteer {
  return {
    id: r.id,
    country: r.country ?? "ve",
    type: r.type,
    name: r.name,
    availabilityText: r.availability_text ?? "",
    skillsText: r.skills_text ?? "",
    estado: r.estado,
    locationText: r.location_text ?? "",
    lat: r.lat ?? null,
    lng: r.lng ?? null,
    contactPhone: r.contact_phone,
    contactEmail: r.contact_email,
    photoUrl: r.photo_url ?? null,
    createdAt: r.created_at,
  };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

export const getVolunteers = unstable_cache(getVolunteersImpl, ["volunteers"], { revalidate: 60 });
async function getVolunteersImpl(
  filter: { type?: VolunteerType | "all"; search?: string } = {},
): Promise<Volunteer[]> {
  const sb = getSupabase();
  if (!sb) {
    let items = mem.volunteers.slice();
    if (filter.type && filter.type !== "all") items = items.filter((v) => v.type === filter.type);
    if (filter.search) {
      const s = filter.search.toLowerCase().trim();
      items = items.filter((v) =>
        [v.name, v.skillsText, v.locationText, v.estado]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(s),
      );
    }
    return items.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
  let query = sb.from("volunteers").select("*").order("created_at", { ascending: false }).limit(300);
  if (filter.type && filter.type !== "all") query = query.eq("type", filter.type);
  if (filter.search) {
    const s = filter.search.replace(/[,()*]/g, " ").trim();
    if (s) query = query.or(`name.ilike.%${s}%,skills_text.ilike.%${s}%,location_text.ilike.%${s}%`);
  }
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []).map(rowToVolunteer);
}

export interface VolunteerResult {
  items: Volunteer[];
  total: number;
  page: number;
  pageSize: number;
}

/**
 * Lista de voluntarios, PAGINADA. `getVolunteers` (de arriba) se deja igual
 * para el mapa (necesita "todos, cacheados"); esta es para la página
 * /voluntarios, que antes traía hasta 300 sin límite de página — pasados los
 * 300 no había forma de ver más. Sin caché a propósito: te acabas de ofrecer
 * de voluntario y quieres verte en la lista al instante.
 */
export type VolunteerSort = "recent" | "oldest" | "name";

export async function getVolunteersPage(
  filter: {
    country?: string;
    type?: VolunteerType | "all";
    search?: string;
    estado?: string | "all";
    dateFrom?: string;
    dateTo?: string;
  },
  page = 1,
  pageSize = 10,
  sort: VolunteerSort = "recent",
): Promise<VolunteerResult> {
  const country = filter.country ?? "ve";
  const sb = getSupabase();
  if (!sb) {
    let items = mem.volunteers.filter((v) => (v.country ?? "ve") === country);
    if (filter.type && filter.type !== "all") items = items.filter((v) => v.type === filter.type);
    if (filter.estado && filter.estado !== "all") items = items.filter((v) => v.estado === filter.estado);
    if (filter.dateFrom) items = items.filter((v) => v.createdAt >= filter.dateFrom!);
    if (filter.dateTo) items = items.filter((v) => v.createdAt <= `${filter.dateTo}T23:59:59.999Z`);
    if (filter.search) {
      const s = filter.search.toLowerCase().trim();
      items = items.filter((v) =>
        [v.name, v.skillsText, v.locationText, v.estado].filter(Boolean).join(" ").toLowerCase().includes(s),
      );
    }
    items =
      sort === "oldest"
        ? items.sort((a, b) => a.createdAt.localeCompare(b.createdAt))
        : sort === "name"
          ? items.sort((a, b) => a.name.localeCompare(b.name))
          : items.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const total = items.length;
    const start = (page - 1) * pageSize;
    return { items: items.slice(start, start + pageSize), total, page, pageSize };
  }
  let query = sb.from("volunteers").select("*", { count: "exact" }).eq("country", country);
  query =
    sort === "oldest"
      ? query.order("created_at", { ascending: true })
      : sort === "name"
        ? query.order("name", { ascending: true })
        : query.order("created_at", { ascending: false });
  if (filter.type && filter.type !== "all") query = query.eq("type", filter.type);
  if (filter.estado && filter.estado !== "all") query = query.eq("estado", filter.estado);
  if (filter.dateFrom) query = query.gte("created_at", filter.dateFrom);
  if (filter.dateTo) query = query.lte("created_at", `${filter.dateTo}T23:59:59.999Z`);
  if (filter.search) {
    const s = filter.search.replace(/[,()*]/g, " ").trim();
    if (s) query = query.or(`name.ilike.%${s}%,skills_text.ilike.%${s}%,location_text.ilike.%${s}%`);
  }
  const start = (page - 1) * pageSize;
  const { data, error, count } = await query.range(start, start + pageSize - 1);
  if (error) throw error;
  return { items: (data ?? []).map(rowToVolunteer), total: count ?? 0, page, pageSize };
}

export async function createVolunteer(
  input: VolunteerInput,
  photoUrl: string | null = null,
  userId: string | null = null,
): Promise<Volunteer> {
  const now = new Date().toISOString();
  const sb = getSupabaseAdmin() ?? getSupabase();
  const country = input.country ?? "ve";
  if (!sb) {
    const volunteer: Volunteer = {
      id: uid("vol"),
      country,
      type: input.type,
      name: input.name,
      availabilityText: input.availabilityText || "",
      skillsText: input.skillsText || "",
      estado: input.estado ?? null,
      locationText: input.locationText || "",
      lat: input.lat ?? null,
      lng: input.lng ?? null,
      contactPhone: input.contactPhone || null,
      contactEmail: input.contactEmail || null,
      photoUrl: photoUrl || null,
      createdAt: now,
    };
    mem.volunteers.unshift(volunteer);
    return volunteer;
  }
  const { data, error } = await sb
    .from("volunteers")
    .insert({
      country,
      type: input.type,
      name: input.name,
      availability_text: input.availabilityText || "",
      skills_text: input.skillsText || "",
      estado: input.estado ?? null,
      location_text: input.locationText || "",
      lat: input.lat ?? null,
      lng: input.lng ?? null,
      contact_phone: input.contactPhone || null,
      contact_email: input.contactEmail || null,
      photo_url: photoUrl || null,
      user_id: userId,
    })
    .select("*")
    .single();
  if (error) throw error;
  return rowToVolunteer(data);
}

/** ¿Esta cuenta ya se ofreció como voluntario? Para ocultar el aviso "Quiero
 *  ayudar" del inicio si ya lo hizo. Solo tiene sentido con Supabase (en modo
 *  demostración no hay cuentas). */
export async function hasVolunteered(userId: string): Promise<boolean> {
  const sb = getSupabaseAdmin() ?? getSupabase();
  if (!sb) return false;
  const { data } = await sb.from("volunteers").select("id").eq("user_id", userId).limit(1);
  return Boolean(data && data.length > 0);
}

// ── Héroes (sección curada de Noticias) ─────────────────────────────────────
/* eslint-disable @typescript-eslint/no-explicit-any */
function rowToHero(r: any): Hero {
  return {
    id: r.id,
    country: r.country ?? "ve",
    category: r.category,
    title: r.title,
    body: r.body ?? "",
    estado: r.estado,
    locationText: r.location_text ?? "",
    photoUrl: r.photo_url ?? null,
    sourceName: r.source_name ?? null,
    sourceUrl: r.source_url ?? null,
    authorName: r.author_name ?? "Comunidad",
    verified: r.verified ?? false,
    likes: r.likes ?? 0,
    createdAt: r.created_at,
  };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

async function getHeroesImpl(opts: { includeUnverified?: boolean; country?: string } = {}): Promise<Hero[]> {
  const sb = getSupabase();
  if (!sb) {
    let items = mem.heroes.slice();
    if (opts.country) items = items.filter((h) => (h.country ?? "ve") === opts.country);
    if (!opts.includeUnverified) items = items.filter((h) => h.verified);
    return items.sort(
      (a, b) => Number(b.verified) - Number(a.verified) || b.createdAt.localeCompare(a.createdAt),
    );
  }
  let query = sb.from("heroes").select("*").limit(300);
  if (opts.country) query = query.eq("country", opts.country);
  if (!opts.includeUnverified) query = query.eq("verified", true);
  const { data, error } = await query
    .order("verified", { ascending: false })
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map(rowToHero);
}

/** Héroes verificados de un país (portada de `/ayuda`). Cacheado 60s por país. */
const heroesCache = perCountryCache("heroes", (c) => () => getHeroesImpl({ country: c }), { revalidate: 60 });
export function getHeroes(country = "ve"): Promise<Hero[]> {
  return heroesCache[resolveCountry(country)]();
}

/** Todos los héroes de TODOS los países, incluidos los sin verificar (panel de admin). Sin caché. */
export function getHeroesForAdmin(): Promise<Hero[]> {
  return getHeroesImpl({ includeUnverified: true });
}

export async function createHero(
  input: HeroInput,
  photoUrl: string | null,
  authorName: string,
): Promise<Hero> {
  const now = new Date().toISOString();
  const sb = getSupabaseAdmin() ?? getSupabase();
  const country = input.country ?? "ve";
  if (!sb) {
    const hero: Hero = {
      id: uid("hero"),
      country,
      category: input.category,
      title: input.title,
      body: input.body,
      estado: input.estado ?? null,
      locationText: input.locationText || "",
      photoUrl: photoUrl || null,
      sourceName: input.sourceName || null,
      sourceUrl: input.sourceUrl || null,
      authorName,
      verified: false, // propuesto por la comunidad: nace sin verificar
      likes: 0,
      createdAt: now,
    };
    mem.heroes.unshift(hero);
    return hero;
  }
  const { data, error } = await sb
    .from("heroes")
    .insert({
      country,
      category: input.category,
      title: input.title,
      body: input.body,
      estado: input.estado ?? null,
      location_text: input.locationText || "",
      photo_url: photoUrl || null,
      source_name: input.sourceName || null,
      source_url: input.sourceUrl || null,
      author_name: authorName,
      verified: false,
    })
    .select("*")
    .single();
  if (error) throw error;
  return rowToHero(data);
}

/** "Me gusta" a un héroe (comunidad). */
export async function likeHero(id: string): Promise<void> {
  const sb = getSupabaseAdmin() ?? getSupabase();
  if (!sb) {
    const hero = mem.heroes.find((h) => h.id === id);
    if (hero) hero.likes++;
    return;
  }
  const { data, error } = await sb.from("heroes").select("likes").eq("id", id).single();
  if (error) throw error;
  const { error: updateError } = await sb.from("heroes").update({ likes: (data.likes ?? 0) + 1 }).eq("id", id);
  if (updateError) throw updateError;
}

/** Da/quita el visto bueno del moderador a un héroe. */
export async function setHeroVerified(id: string, value: boolean): Promise<void> {
  const sb = getSupabaseAdmin() ?? getSupabase();
  if (!sb) {
    const hero = mem.heroes.find((h) => h.id === id);
    if (hero) hero.verified = value;
    return;
  }
  const { error } = await sb.from("heroes").update({ verified: value }).eq("id", id);
  if (error) throw error;
}

/** Elimina un héroe (moderación de contenido falso o inapropiado). */
export async function deleteHero(id: string): Promise<void> {
  const sb = getSupabaseAdmin() ?? getSupabase();
  if (!sb) {
    mem.heroes = mem.heroes.filter((h) => h.id !== id);
    return;
  }
  const { data } = await sb.from("heroes").select("photo_url").eq("id", id).maybeSingle();
  const { error } = await sb.from("heroes").delete().eq("id", id);
  if (error) throw error;
  await deleteStoragePhoto(data?.photo_url as string | undefined);
}

// ── Noticias curadas (las agrega el equipo) ─────────────────────────────────
/* eslint-disable @typescript-eslint/no-explicit-any */
function rowToNewsItem(r: any): NewsItem {
  return {
    id: r.id,
    country: r.country ?? "ve",
    kind: r.kind,
    title: r.title,
    body: r.body ?? "",
    sourceName: r.source_name ?? null,
    sourceUrl: r.source_url ?? null,
    photoUrl: r.photo_url ?? null,
    likes: r.likes ?? 0,
    createdAt: r.created_at,
  };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

async function getNewsItemsImpl(kind: NewsItem["kind"] | undefined, country: string): Promise<NewsItem[]> {
  const sb = getSupabase();
  if (!sb) {
    let items = mem.newsItems.filter((n) => (n.country ?? "ve") === country);
    if (kind) items = items.filter((n) => n.kind === kind);
    return items.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
  let query = sb
    .from("news_items")
    .select("*")
    .eq("country", country)
    .order("created_at", { ascending: false })
    .limit(200);
  if (kind) query = query.eq("kind", kind);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []).map(rowToNewsItem);
}

/**
 * Noticias curadas de un país; con `kind` se filtra por ayuda humanitaria o
 * titulares. Cacheado 60s por país (trae TODOS los kinds de ese país y el
 * filtro por kind se aplica después, sin caché — pasar `kind` como argumento
 * a `unstable_cache` no distingue entradas de forma confiable, mismo motivo
 * por el que `country` va fijo en la clave y no como argumento).
 */
const newsItemsCache = perCountryCache("news-items", (c) => () => getNewsItemsImpl(undefined, c), {
  revalidate: 60,
});
export async function getNewsItems(kind: NewsItem["kind"] | undefined, country = "ve"): Promise<NewsItem[]> {
  const items = await newsItemsCache[resolveCountry(country)]();
  return kind ? items.filter((n) => n.kind === kind) : items;
}

export async function createNewsItem(input: NewsItemInput, photoUrl: string | null = null): Promise<NewsItem> {
  const now = new Date().toISOString();
  const sb = getSupabaseAdmin() ?? getSupabase();
  const country = input.country ?? "ve";
  if (!sb) {
    const item: NewsItem = {
      id: uid("news"),
      country,
      kind: input.kind,
      title: input.title,
      body: input.body,
      sourceName: input.sourceName || null,
      sourceUrl: input.sourceUrl || null,
      photoUrl: photoUrl || null,
      likes: 0,
      createdAt: now,
    };
    mem.newsItems.unshift(item);
    return item;
  }
  const { data, error } = await sb
    .from("news_items")
    .insert({
      country,
      kind: input.kind,
      title: input.title,
      body: input.body,
      source_name: input.sourceName || null,
      source_url: input.sourceUrl || null,
      photo_url: photoUrl || null,
    })
    .select("*")
    .single();
  if (error) throw error;
  return rowToNewsItem(data);
}

/** "Me gusta" a una noticia curada (comunidad). */
export async function likeNewsItem(id: string): Promise<void> {
  const sb = getSupabaseAdmin() ?? getSupabase();
  if (!sb) {
    const item = mem.newsItems.find((n) => n.id === id);
    if (item) item.likes++;
    return;
  }
  const { data, error } = await sb.from("news_items").select("likes").eq("id", id).single();
  if (error) throw error;
  const { error: updateError } = await sb
    .from("news_items")
    .update({ likes: (data.likes ?? 0) + 1 })
    .eq("id", id);
  if (updateError) throw updateError;
}

/** Elimina una noticia curada (solo el equipo). */
export async function deleteNewsItem(id: string): Promise<void> {
  const sb = getSupabaseAdmin() ?? getSupabase();
  if (!sb) {
    mem.newsItems = mem.newsItems.filter((n) => n.id !== id);
    return;
  }
  const { data } = await sb.from("news_items").select("photo_url").eq("id", id).maybeSingle();
  const { error } = await sb.from("news_items").delete().eq("id", id);
  if (error) throw error;
  await deleteStoragePhoto(data?.photo_url as string | undefined);
}

// ── Hospitales ──────────────────────────────────────────────────────────────
/* eslint-disable @typescript-eslint/no-explicit-any */
function rowToHospital(r: any): Hospital {
  return {
    id: r.id,
    country: r.country ?? "ve",
    name: r.name,
    estado: r.estado,
    locationText: r.location_text ?? "",
    lat: r.lat ?? null,
    lng: r.lng ?? null,
    status: r.status,
    specialties: r.specialties ?? [],
    needsText: r.needs_text ?? "",
    contactName: r.contact_name,
    contactPhone: r.contact_phone,
    photoUrl: r.photo_url ?? null,
    verified: r.verified ?? false,
    votesSupplies: r.votes_supplies ?? 0,
    votesNoSupplies: r.votes_no_supplies ?? 0,
    likes: r.likes ?? 0,
    updatedAt: r.updated_at ?? r.created_at,
    createdAt: r.created_at,
  };
}
function rowToPatient(r: any): HospitalPatient {
  return {
    id: r.id,
    hospitalId: r.hospital_id,
    fullName: r.full_name,
    cedula: r.cedula,
    condition: r.condition ?? "",
    status: r.status,
    note: r.note ?? "",
    createdAt: r.created_at,
  };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

function splitSpecialties(s: string | undefined): string[] {
  return (s ?? "")
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
}

const hospitalsCache = perCountryCache("hospitals", (c) => () => getHospitalsImpl(c), { revalidate: 60 });
export function getHospitals(country = "ve"): Promise<Hospital[]> {
  return hospitalsCache[resolveCountry(country)]();
}
async function getHospitalsImpl(country = "ve"): Promise<Hospital[]> {
  const sb = getSupabase();
  if (!sb)
    return mem.hospitals
      .filter((h) => (h.country ?? "ve") === country)
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name));
  const { data, error } = await sb.from("hospitals").select("*").eq("country", country).order("name");
  if (error) throw error;
  return (data ?? []).map(rowToHospital);
}

export type HospitalSort = "name" | "recent" | "oldest";

export interface HospitalResult {
  items: Hospital[];
  total: number;
  page: number;
  pageSize: number;
}

// Antes `getHospitales()` (cacheada 60s, sin límite) traía TODOS los
// hospitales y la página filtraba por estado en el cliente, sin paginar.
// Ahora pagina de verdad (10/20/50 a elegir), en vivo. `getHospitals` se deja
// intacta para `/mapa` y `/admin`.
export async function getHospitalsPage(
  filter: {
    country?: string;
    status?: HospitalStatus;
    estado?: string | "all";
    dateFrom?: string;
    dateTo?: string;
  },
  page = 1,
  pageSize = 10,
  sort: HospitalSort = "name",
): Promise<HospitalResult> {
  const country = filter.country ?? "ve";
  const sb = getSupabase();
  if (!sb) {
    let items = mem.hospitals.filter((h) => (h.country ?? "ve") === country);
    if (filter.status) items = items.filter((h) => h.status === filter.status);
    if (filter.estado && filter.estado !== "all") items = items.filter((h) => h.estado === filter.estado);
    if (filter.dateFrom) items = items.filter((h) => h.createdAt >= filter.dateFrom!);
    if (filter.dateTo) items = items.filter((h) => h.createdAt <= `${filter.dateTo}T23:59:59.999Z`);
    items =
      sort === "recent"
        ? items.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        : sort === "oldest"
          ? items.sort((a, b) => a.createdAt.localeCompare(b.createdAt))
          : items.sort((a, b) => a.name.localeCompare(b.name));
    const total = items.length;
    const start = (page - 1) * pageSize;
    return { items: items.slice(start, start + pageSize), total, page, pageSize };
  }
  let query = sb.from("hospitals").select("*", { count: "exact" }).eq("country", country);
  query =
    sort === "recent"
      ? query.order("created_at", { ascending: false })
      : sort === "oldest"
        ? query.order("created_at", { ascending: true })
        : query.order("name", { ascending: true });
  if (filter.status) query = query.eq("status", filter.status);
  if (filter.estado && filter.estado !== "all") query = query.eq("estado", filter.estado);
  if (filter.dateFrom) query = query.gte("created_at", filter.dateFrom);
  if (filter.dateTo) query = query.lte("created_at", `${filter.dateTo}T23:59:59.999Z`);
  const start = (page - 1) * pageSize;
  const { data, error, count } = await query.range(start, start + pageSize - 1);
  if (error) throw error;
  return { items: (data ?? []).map(rowToHospital), total: count ?? 0, page, pageSize };
}

export async function getHospitalById(id: string): Promise<Hospital | null> {
  const sb = getSupabase();
  if (!sb) return mem.hospitals.find((h) => h.id === id) ?? null;
  const { data, error } = await sb.from("hospitals").select("*").eq("id", id).single();
  if (error) return null;
  return data ? rowToHospital(data) : null;
}

export async function createHospital(
  input: HospitalInput,
  photoUrl: string | null = null,
  userId: string | null = null,
): Promise<Hospital> {
  const now = new Date().toISOString();
  const specialties = splitSpecialties(input.specialties);
  const sb = getSupabaseAdmin() ?? getSupabase();
  const country = input.country ?? "ve";
  if (!sb) {
    const hospital: Hospital = {
      id: uid("hosp"),
      country,
      name: input.name,
      estado: input.estado ?? null,
      locationText: input.locationText || "",
      lat: input.lat ?? null,
      lng: input.lng ?? null,
      status: input.status,
      specialties,
      needsText: input.needsText || "",
      contactName: input.contactName || null,
      contactPhone: input.contactPhone || null,
      photoUrl: photoUrl || null,
      verified: false,
      votesSupplies: 0,
      votesNoSupplies: 0,
      likes: 0,
      updatedAt: now,
      createdAt: now,
    };
    mem.hospitals.unshift(hospital);
    return hospital;
  }
  const { data, error } = await sb
    .from("hospitals")
    .insert({
      country,
      name: input.name,
      estado: input.estado ?? null,
      location_text: input.locationText || "",
      lat: input.lat ?? null,
      lng: input.lng ?? null,
      status: input.status,
      specialties,
      needs_text: input.needsText || "",
      contact_name: input.contactName || null,
      contact_phone: input.contactPhone || null,
      photo_url: photoUrl || null,
      user_id: userId,
    })
    .select("*")
    .single();
  if (error) throw error;
  return rowToHospital(data);
}

/** Actualiza estado de capacidad e insumos (la comunidad lo mantiene al día). */
export async function updateHospitalStatus(
  id: string,
  status: HospitalStatus,
  needsText: string,
): Promise<void> {
  const now = new Date().toISOString();
  const sb = getSupabaseAdmin() ?? getSupabase();
  if (!sb) {
    const hospital = mem.hospitals.find((h) => h.id === id);
    if (hospital) {
      hospital.status = status;
      hospital.needsText = needsText;
      hospital.updatedAt = now;
    }
    return;
  }
  const { error } = await sb
    .from("hospitals")
    .update({ status, needs_text: needsText, updated_at: now })
    .eq("id", id);
  if (error) throw error;
}

/** Voto de consenso sobre si el hospital tiene insumos/abasto. */
/** Un voto por cuenta y hospital (puede cambiarlo, no repetirlo): misma razón
 *  que `voteAidAvailability`. */
export async function voteHospitalSupplies(
  id: string,
  vote: "yes" | "no",
  userId: string,
): Promise<void> {
  const now = new Date().toISOString();
  const sb = getSupabaseAdmin() ?? getSupabase();
  if (!sb) {
    const key = `hospital:${id}:${userId}`;
    const previous = mem.consensusVotes[key];
    if (previous === vote) return;
    const hospital = mem.hospitals.find((h) => h.id === id);
    if (hospital) {
      if (previous === "yes") hospital.votesSupplies = Math.max(0, hospital.votesSupplies - 1);
      else if (previous === "no") hospital.votesNoSupplies = Math.max(0, hospital.votesNoSupplies - 1);
      if (vote === "yes") hospital.votesSupplies++;
      else hospital.votesNoSupplies++;
      hospital.updatedAt = now;
    }
    mem.consensusVotes[key] = vote;
    return;
  }

  const { data: existing } = await sb
    .from("consensus_votes")
    .select("vote")
    .eq("entity_type", "hospital")
    .eq("entity_id", id)
    .eq("user_id", userId)
    .maybeSingle();
  if (existing?.vote === vote) return;

  const { data, error } = await sb
    .from("hospitals")
    .select("votes_supplies,votes_no_supplies")
    .eq("id", id)
    .single();
  if (error) throw error;

  let vs = data.votes_supplies ?? 0;
  let vn = data.votes_no_supplies ?? 0;
  if (existing?.vote === "yes") vs = Math.max(0, vs - 1);
  else if (existing?.vote === "no") vn = Math.max(0, vn - 1);
  if (vote === "yes") vs++;
  else vn++;

  const { error: updateError } = await sb
    .from("hospitals")
    .update({ votes_supplies: vs, votes_no_supplies: vn, updated_at: now })
    .eq("id", id);
  if (updateError) throw updateError;

  const { error: voteError } = await sb
    .from("consensus_votes")
    .upsert(
      { entity_type: "hospital", entity_id: id, user_id: userId, vote, updated_at: now },
      { onConflict: "entity_type,entity_id,user_id" },
    );
  if (voteError) throw voteError;
}

/** "Me gusta" a un hospital (comunidad). */
export async function likeHospital(id: string): Promise<void> {
  const sb = getSupabaseAdmin() ?? getSupabase();
  if (!sb) {
    const hospital = mem.hospitals.find((h) => h.id === id);
    if (hospital) hospital.likes++;
    return;
  }
  const { data, error } = await sb.from("hospitals").select("likes").eq("id", id).single();
  if (error) throw error;
  const { error: updateError } = await sb.from("hospitals").update({ likes: (data.likes ?? 0) + 1 }).eq("id", id);
  if (updateError) throw updateError;
}

export async function getHospitalPatients(hospitalId: string): Promise<HospitalPatient[]> {
  const sb = getSupabase();
  if (!sb)
    return mem.patients
      .filter((p) => p.hospitalId === hospitalId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const { data, error } = await sb
    .from("hospital_patients")
    .select("*")
    .eq("hospital_id", hospitalId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map(rowToPatient);
}

/** Conteo de pacientes por hospital (para mostrar en el listado). */
export async function getPatientCounts(): Promise<Record<string, number>> {
  const sb = getSupabase();
  if (!sb) {
    const counts: Record<string, number> = {};
    for (const p of mem.patients) counts[p.hospitalId] = (counts[p.hospitalId] ?? 0) + 1;
    return counts;
  }
  const { data, error } = await sb.from("hospital_patients").select("hospital_id");
  if (error) throw error;
  const counts: Record<string, number> = {};
  for (const r of data ?? []) counts[r.hospital_id] = (counts[r.hospital_id] ?? 0) + 1;
  return counts;
}

export async function addHospitalPatient(input: HospitalPatientInput): Promise<HospitalPatient> {
  const now = new Date().toISOString();
  const sb = getSupabaseAdmin() ?? getSupabase();
  if (!sb) {
    const patient: HospitalPatient = {
      id: uid("pat"),
      hospitalId: input.hospitalId,
      fullName: input.fullName,
      cedula: input.cedula || null,
      condition: input.condition || "",
      status: input.status,
      note: input.note || "",
      createdAt: now,
    };
    mem.patients.unshift(patient);
    return patient;
  }
  const { data, error } = await sb
    .from("hospital_patients")
    .insert({
      hospital_id: input.hospitalId,
      full_name: input.fullName,
      cedula: input.cedula || null,
      condition: input.condition || "",
      status: input.status,
      note: input.note || "",
    })
    .select("*")
    .single();
  if (error) throw error;
  return rowToPatient(data);
}

export { isSupabaseConfigured };
