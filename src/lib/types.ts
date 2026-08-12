// ─────────────────────────────────────────────────────────────
// Modelo de datos central de "El Mundo Te Busca".
// Estos tipos son la fuente de verdad: la base de datos (Supabase),
// los formularios y la UI se ajustan a ellos.
// ─────────────────────────────────────────────────────────────

export type Gender = "masculino" | "femenino" | "otro";

/** Estado de localización de una persona. */
export type PersonStatus =
  | "por_localizar" // aún no se sabe de la persona
  | "localizado" // apareció con vida
  | "hospitalizado" // localizado e ingresado en un centro de salud
  | "fallecido"; // confirmado fallecido

export const PERSON_STATUS_LABEL: Record<PersonStatus, string> = {
  por_localizar: "Por localizar",
  localizado: "Localizado",
  hospitalizado: "Hospitalizado",
  fallecido: "Confirmado sin vida",
};

/** Código de país activo en la plataforma. Ver `countries.ts` para su configuración completa. */
export type Country = "ve" | "co";

/** Estados de Venezuela (lista completa del país). Se mantiene por compatibilidad
 *  (dropdowns/seed de VE); para el resto de países usa `COUNTRIES[code].regions`
 *  en `countries.ts`. */
export const ESTADOS = [
  "Amazonas",
  "Anzoátegui",
  "Apure",
  "Aragua",
  "Barinas",
  "Bolívar",
  "Carabobo",
  "Cojedes",
  "Delta Amacuro",
  "Distrito Capital",
  "Falcón",
  "Guárico",
  "La Guaira",
  "Lara",
  "Mérida",
  "Miranda",
  "Monagas",
  "Nueva Esparta",
  "Portuguesa",
  "Sucre",
  "Táchira",
  "Trujillo",
  "Yaracuy",
  "Zulia",
] as const;

/**
 * Región administrativa de primer nivel (estado/departamento). Antes era una
 * unión estricta de los 24 estados de Venezuela; ahora que la plataforma sirve
 * varios países, es texto libre validado por país contra `COUNTRIES[code].regions`
 * (ver `validation.ts`) en vez de un enum fijo a nivel de tipo.
 */
export type Estado = string;

/**
 * Por qué se publicó a esta persona: si su desaparición está ligada al
 * desastre activo (terremoto) o es ajena a él (una desaparición cotidiana,
 * sin relación con la emergencia). Ausente en registros migrados antes de
 * este campo = "desastre" (el caso por defecto de la plataforma).
 */
export type PersonCause = "desastre" | "otra";

export const PERSON_CAUSE_LABEL: Record<PersonCause, string> = {
  desastre: "Relacionado con el desastre",
  otra: "Otro motivo",
};

/** Reacciones de la comunidad a la ficha de una persona. */
export type PersonReaction = "fuerza" | "corazon" | "difundir";

export const PERSON_REACTION_EMOJI: Record<PersonReaction, string> = {
  fuerza: "🙏",
  corazon: "❤️",
  difundir: "📢",
};

export const PERSON_REACTION_LABEL: Record<PersonReaction, string> = {
  fuerza: "Fuerza",
  corazon: "Cariño",
  difundir: "Difundo",
};

export interface Person {
  id: string;
  /** País/instancia de desastre al que pertenece el registro. Ausente = 've' (Venezuela). */
  country?: Country;
  firstName: string;
  lastName: string;
  cedula: string | null;
  age: number | null;
  gender: Gender | null;
  estado: Estado | null;
  /** Texto libre de ubicación: municipio, sector, edificio, referencia. */
  locationText: string;
  /** Coordenada exacta donde fue vista/encontrada (mapa o GPS). Ausente/null si solo texto. */
  lat?: number | null;
  lng?: number | null;
  /** Ropa que vestía, señas particulares, contexto de la desaparición. */
  description: string;
  photoUrl: string | null;
  status: PersonStatus;
  hospitalName: string | null;
  /** Caso sin identificar: se busca por foto/rasgos, no por nombre. */
  isUnidentified: boolean;
  cause: PersonCause;
  contactName: string | null;
  contactPhone: string | null;
  contactEmail: string | null;
  /**
   * Sello opcional de "visto bueno" de un moderador. Su ausencia NO oculta el
   * registro: todo aparece de inmediato. Solo añade una insignia de confianza.
   */
  verified: boolean;
  /** SHA-256 de los bytes de la foto (no un modelo de IA). Sirve para detectar
   *  el mismo archivo repetido entre publicaciones manuales y el sync. */
  photoHash: string | null;
  /** Aviso de posible duplicado (nombre parecido, cédula o foto idéntica a
   *  otro registro). No oculta ni bloquea nada, solo lo pone en la cola de
   *  revisión del moderador (`/admin`). */
  possibleDuplicate: boolean;
  duplicateMatchId: string | null;
  reactions: Record<PersonReaction, number>;
  createdAt: string; // ISO
  updatedAt: string; // ISO
}

/**
 * Reporte de cambio de estado (p. ej. "lo encontré").
 * NO cambia el estado público automáticamente: queda pendiente de
 * verificación para evitar abuso/trolling.
 */
export interface StatusReport {
  id: string;
  personId: string;
  reportedStatus: PersonStatus;
  reporterName: string;
  reporterPhone: string;
  /** Relación con la persona: familiar, médico, rescatista, testigo... */
  reporterRelationship: string;
  locationFound: string;
  notes: string;
  verified: boolean;
  createdAt: string;
}

export type AidPointType =
  | "comida"
  | "agua"
  | "medicina"
  | "refugio"
  | "alojamiento" // hogares/casas que abren sus puertas para que la gente duerma
  | "ropa"
  | "otro";

export const AID_POINT_TYPE_LABEL: Record<AidPointType, string> = {
  comida: "Comida",
  agua: "Agua",
  medicina: "Medicinas",
  refugio: "Refugio",
  alojamiento: "Alojamiento",
  ropa: "Ropa",
  otro: "Otro",
};

/** Qué tan surtida está UNA categoría concreta del punto (no todo el punto en
 *  bloque, como el viejo "disponible/agotado"). La fija el autor o el admin,
 *  igual que la disponibilidad general — no es un voto de la comunidad (ese
 *  sigue existiendo aparte, como señal). Sin número exacto a propósito: nadie
 *  puede mantener un inventario preciso en medio de una emergencia, pero sí
 *  puede decir "esto se está acabando". */
export type AidStockLevel = "urgente" | "limitado" | "cubierto";

export const AID_STOCK_LEVEL_LABEL: Record<AidStockLevel, string> = {
  urgente: "Urgente: casi no queda",
  limitado: "Limitado: queda poco",
  cubierto: "Cubierto: hay suficiente",
};

export const AID_STOCK_LEVEL_EMOJI: Record<AidStockLevel, string> = {
  urgente: "🔴",
  limitado: "🟡",
  cubierto: "🟢",
};

/** Punto físico de ayuda: donatón de comida, refugio, agua, etc. */
export interface AidPoint {
  id: string;
  /** País/instancia de desastre al que pertenece el registro. Ausente = 've' (Venezuela). */
  country?: Country;
  name: string;
  /** Un mismo punto puede ofrecer varios recursos a la vez. */
  types: AidPointType[];
  estado: Estado | null;
  locationText: string;
  /** Coordenada exacta marcada en el mapa (o por GPS). Ausente/null si solo hay texto. */
  lat?: number | null;
  lng?: number | null;
  scheduleText: string; // horario de atención
  description: string;
  photoUrl: string | null;
  contactName: string | null;
  contactPhone: string | null;
  verified: boolean;
  /** ¿Sigue disponible? Se actualiza por consenso de la comunidad. */
  available: boolean;
  /** Votos de la comunidad: "sí hay" vs "se acabó". */
  votesAvailable: number;
  votesDepleted: number;
  /** Nivel de existencias por CADA recurso que ofrece (ver `AidStockLevel`).
   *  Solo tiene sentido para las categorías presentes en `types`; una
   *  categoría sin entrada aquí se asume cubierta. Opcional para no romper
   *  puntos ya creados antes de este campo. */
  categoryStatus?: Partial<Record<AidPointType, AidStockLevel>>;
  likes: number;
  updatedAt: string;
  createdAt: string;
}

/** Marcha / caravana / ida coordinada hacia una zona. */
export interface March {
  id: string;
  country?: Country;
  title: string;
  originText: string;
  destinationText: string;
  departAt: string; // ISO datetime
  organizerName: string;
  organizerPhone: string;
  /** Enlace al grupo de WhatsApp para coordinarse. */
  whatsappUrl: string | null;
  description: string;
  attendeesCount: number;
  likes: number;
  /** Punto de ayuda al que responde esta caravana (opcional): qué necesidad
   *  concreta va a atender, para que se vea cruzada en la ficha del punto. */
  aidPointId?: string | null;
  createdAt: string;
}

/**
 * Recursos cuyo autor puede gestionarlos con un enlace privado (token), igual
 * que las personas. Las personas usan su propia tabla `person_owners`; estos
 * recursos comparten una tabla genérica `resource_owners`.
 */
export type ResourceOwnerEntity = "aid_point" | "march" | "post" | "pet";

// ── Comunidad / Feed ────────────────────────────────────────────────────────
/** Tipo de publicación del muro comunitario. */
export type PostType =
  | "necesito" // pido ayuda: cobijas, agua, vivienda...
  | "ofrezco" // ofrezco ayuda/recursos
  | "rescate" // rescate urgente (escombros, desaparecidos bajo estructuras)
  | "medico" // disponibilidad/insumos en hospitales, brigadas médicas
  | "caravana" // "voy saliendo", convoco o me uno a una caravana
  | "identificar" // ayuda a identificar personas/fallecidos
  | "info"; // información general

export const POST_TYPE_LABEL: Record<PostType, string> = {
  necesito: "Necesito ayuda",
  ofrezco: "Ofrezco ayuda",
  rescate: "Rescate urgente",
  medico: "Médico / hospital",
  caravana: "Caravana",
  identificar: "Ayuda a identificar",
  info: "Información",
};

export const POST_TYPE_EMOJI: Record<PostType, string> = {
  necesito: "🆘",
  ofrezco: "🤲",
  rescate: "🚨",
  medico: "🏥",
  caravana: "🚐",
  identificar: "🕊️",
  info: "📣",
};

export type ReactionKind = "apoyo" | "corazon" | "hecho";

export const REACTION_EMOJI: Record<ReactionKind, string> = {
  apoyo: "🙏",
  corazon: "❤️",
  hecho: "✅",
};

/** De dónde vino la publicación: escrita en la plataforma, o importada
 *  automáticamente por hashtag desde otra red (ver `scripts/fetch-social-posts.mjs`). */
export type PostOrigin = "community" | "bluesky" | "mastodon";

export const POST_ORIGIN_LABEL: Record<PostOrigin, string> = {
  community: "Comunidad",
  bluesky: "Bluesky",
  mastodon: "Mastodon",
};

export const POST_ORIGIN_EMOJI: Record<PostOrigin, string> = {
  community: "",
  bluesky: "🦋",
  mastodon: "🐘",
};

/** Solo aplica a publicaciones importadas: nacen `pending` y un moderador las
 *  aprueba o rechaza en /admin antes de que aparezcan en /comunidad. Las
 *  publicadas por la comunidad nacen `approved` directamente. */
export type PostModerationStatus = "pending" | "approved" | "rejected";

export interface Post {
  id: string;
  /** País/instancia de desastre al que pertenece el registro. Ausente = 've' (Venezuela). */
  country?: Country;
  type: PostType;
  body: string;
  estado: Estado | null;
  locationText: string;
  photoUrl: string | null;
  linkUrl: string | null; // enlace externo (video, red social)
  authorName: string;
  contactPhone: string | null;
  /** Punto de ayuda al que responde este post (opcional): qué necesidad u
   *  oferta concreta va ligada a ese punto, para que se vea cruzada en su ficha. */
  aidPointId?: string | null;
  /** Fijado arriba del muro (destacado por el equipo: avisos importantes). */
  pinned: boolean;
  reactions: Record<ReactionKind, number>;
  createdAt: string;
  /** Foto de perfil y usuario de quien publicó, SOLO si lo hizo con cuenta
   *  (se enriquece aparte contra `profiles`; ausente = publicación anónima). */
  authorAvatarUrl?: string | null;
  authorUsername?: string | null;
  /** Ausente = "community" (publicación normal de la plataforma). */
  origin?: PostOrigin;
  /** Ausente = "approved" (publicación normal de la plataforma). */
  moderationStatus?: PostModerationStatus;
}

// ── Hospitales ──────────────────────────────────────────────────────────────
/** Estado de capacidad de un hospital. */
export type HospitalStatus = "operativo" | "saturado" | "lleno" | "cerrado";

export const HOSPITAL_STATUS_LABEL: Record<HospitalStatus, string> = {
  operativo: "Operativo",
  saturado: "Saturado",
  lleno: "Lleno (sin cupo)",
  cerrado: "Cerrado",
};

export interface Hospital {
  id: string;
  /** País/instancia de desastre al que pertenece el registro. Ausente = 've' (Venezuela). */
  country?: Country;
  name: string;
  estado: Estado | null;
  locationText: string;
  /** Coordenada exacta marcada en el mapa (o por GPS). Ausente/null si solo texto. */
  lat?: number | null;
  lng?: number | null;
  status: HospitalStatus;
  /** Especialidades que puede atender (trauma, cirugía, pediatría...). */
  specialties: string[];
  /** Insumos o apoyo que necesitan ahora mismo. */
  needsText: string;
  contactName: string | null;
  contactPhone: string | null;
  photoUrl: string | null;
  /**
   * Sello de "visto bueno" del moderador, igual que en personas y puntos de
   * ayuda. Su ausencia NO oculta el hospital: aparece de inmediato, solo añade
   * una insignia de confianza una vez revisada la evidencia.
   */
  verified: boolean;
  /** Consenso de la comunidad sobre si tiene insumos/abasto. */
  votesSupplies: number;
  votesNoSupplies: number;
  likes: number;
  updatedAt: string;
  createdAt: string;
}

/**
 * Recursos a los que el admin puede asignar un GESTOR delegado: una cuenta
 * concreta que administra ese recurso (estado, disponibilidad, insumos, edición)
 * sin ser el admin global ni el publicador original. Ver [[verificacion-gestores]].
 */
export type ManagedEntity = "aid_point" | "hospital";

export const MANAGED_ENTITY_LABEL: Record<ManagedEntity, string> = {
  aid_point: "Punto de ayuda",
  hospital: "Hospital",
};

/** Gestor delegado de un recurso (asignado por el admin). */
export interface ResourceManager {
  entityType: ManagedEntity;
  entityId: string;
  userId: string;
  /** Nombre de usuario (desnormalizado para mostrarlo en el panel). */
  username: string;
  createdAt: string;
}

/**
 * Solicitud de un usuario logueado para convertirse en gestor delegado de UN
 * hospital o punto de ayuda concreto (p. ej. "trabajo en este hospital, puedo
 * mantener actualizado el estado/insumos"). El admin la revisa en /admin y, si
 * la aprueba, se crea el `ResourceManager` correspondiente. Distinta del
 * registro general de voluntario ("Puedo ayudar"): esta pide un permiso
 * concreto sobre un recurso, no solo aparecer en el directorio público.
 */
export interface ManagerRequest {
  id: string;
  entityType: ManagedEntity;
  entityId: string;
  entityName: string;
  userId: string;
  username: string;
  message: string;
  status: "pending" | "approved" | "rejected";
  createdAt: string;
}

/**
 * Roles globales (no atados a un recurso concreto), asignados por el admin a
 * una cuenta. Distinto de `ResourceManager` (que gestiona UN punto de ayuda u
 * hospital específico): estos roles aplican a TODA una categoría.
 *   • admin              → mismo alcance que el ADMIN_TOKEN, pero por cuenta.
 *   • hospital_moderator → puede actualizar estado/insumos de CUALQUIER hospital.
 *   • aid_point_moderator→ puede fijar disponible/agotado en CUALQUIER punto.
 */
export type AppRole = "admin" | "moderator" | "hospital_moderator" | "aid_point_moderator";

export const APP_ROLE_LABEL: Record<AppRole, string> = {
  admin: "Admin completo",
  moderator: "Moderador",
  hospital_moderator: "Moderador de hospitales",
  aid_point_moderator: "Moderador de puntos de ayuda",
};

/** Rol global asignado a una cuenta (ver `AppRole`). */
export interface AppRoleGrant {
  userId: string;
  /** Nombre de usuario (desnormalizado para mostrarlo en el panel). */
  username: string;
  role: AppRole;
  createdAt: string;
}

export type PatientStatus = "estable" | "critico" | "observacion" | "alta";

export const PATIENT_STATUS_LABEL: Record<PatientStatus, string> = {
  estable: "Estable",
  critico: "Crítico",
  observacion: "En observación",
  alta: "De alta",
};

/** Persona que está siendo atendida en un hospital (para que la familia la ubique). */
export interface HospitalPatient {
  id: string;
  hospitalId: string;
  fullName: string;
  cedula: string | null;
  condition: string;
  status: PatientStatus;
  note: string;
  createdAt: string;
}

export type CommentEntity = "person" | "aid_point" | "march" | "post" | "hospital" | "complaint" | "pet" | "hero" | "news_item";

/** Tipos de publicación que un usuario puede "guardar" para seguir su actividad. */
export type SavedEntity = "person" | "aid_point" | "march" | "post" | "hospital" | "complaint" | "pet" | "hero";

/** Una publicación guardada por una cuenta (privado de cada usuario). */
export type SavedItem = { type: SavedEntity; id: string; title: string; createdAt: string };

// ── Denuncias de irregularidades ────────────────────────────────────────────
/** Categoría de una denuncia ciudadana de irregularidad. */
export type ComplaintCategory =
  | "riesgo_ninos" // riesgo o desprotección de menores
  | "desvio_ayuda" // desvío o robo de ayuda/donaciones
  | "fraude" // estafa o fraude
  | "abuso_autoridad" // abuso de autoridad
  | "persona_desaparecida" // persona desaparecida (también ver sección Personas)
  | "otra"; // otra irregularidad

export const COMPLAINT_CATEGORY_LABEL: Record<ComplaintCategory, string> = {
  riesgo_ninos: "Riesgo a la niñez",
  desvio_ayuda: "Desvío o robo de ayuda",
  fraude: "Fraude o estafa",
  abuso_autoridad: "Abuso de autoridad",
  persona_desaparecida: "Persona desaparecida",
  otra: "Otra irregularidad",
};

export const COMPLAINT_CATEGORY_EMOJI: Record<ComplaintCategory, string> = {
  riesgo_ninos: "🧒",
  desvio_ayuda: "📦",
  fraude: "💸",
  abuso_autoridad: "🛑",
  persona_desaparecida: "🔍",
  otra: "⚠️",
};

/**
 * Denuncia ciudadana de una irregularidad (desvío de ayuda, riesgo a menores,
 * fraude, abuso...). Requiere SESIÓN para publicar (responsabilidad: no anónimo
 * frente al sistema). La comunidad puede "Apoyar" y comentar.
 */
export interface Complaint {
  id: string;
  country?: Country;
  category: ComplaintCategory;
  body: string;
  estado: Estado | null;
  locationText: string;
  photoUrl: string | null;
  /** Nombre mostrado (el de la cuenta con sesión que publicó). */
  authorName: string;
  /** Apoyos de la comunidad ("Apoyar"), uno por dispositivo. */
  supports: number;
  createdAt: string;
}

// ── Mascotas ────────────────────────────────────────────────────────────────
export type PetStatus = "perdida" | "encontrada" | "refugio" | "veterinario";

export const PET_STATUS_LABEL: Record<PetStatus, string> = {
  perdida: "Perdida",
  encontrada: "Encontrada",
  refugio: "En refugio",
  veterinario: "En veterinario",
};

export const PET_STATUS_EMOJI: Record<PetStatus, string> = {
  perdida: "😿",
  encontrada: "✅",
  refugio: "🏠",
  veterinario: "🏥",
};

export type PetSpecies = "perro" | "gato" | "otro";

export const PET_SPECIES_LABEL: Record<PetSpecies, string> = {
  perro: "Perro",
  gato: "Gato",
  otro: "Otro",
};

/** Mascota perdida/encontrada/en refugio/en veterinario. Igual que una persona:
 *  foto, descripción, ubicación y comentarios. */
export interface Pet {
  id: string;
  country?: Country;
  status: PetStatus;
  species: PetSpecies;
  /** Nombre de la mascota, si se conoce (puede ir vacío). */
  name: string;
  description: string;
  photoUrl: string | null;
  estado: Estado | null;
  locationText: string;
  contactPhone: string | null;
  updatedAt: string;
  createdAt: string;
}

// ── Voluntarios ("Puedo ayudar") ────────────────────────────────────────────
export type VolunteerType =
  | "medico"
  | "enfermero"
  | "psicologo"
  | "rescatista"
  | "conductor"
  | "cocinero"
  | "traductor"
  | "electricista"
  | "otra";

export const VOLUNTEER_TYPE_LABEL: Record<VolunteerType, string> = {
  medico: "Médico",
  enfermero: "Enfermero/a",
  psicologo: "Psicólogo/a",
  rescatista: "Rescatista",
  conductor: "Conductor/a",
  cocinero: "Cocinero/a",
  traductor: "Traductor/a",
  electricista: "Electricista",
  otra: "Otra ayuda",
};

export const VOLUNTEER_TYPE_EMOJI: Record<VolunteerType, string> = {
  medico: "🩺",
  enfermero: "💉",
  psicologo: "🧠",
  rescatista: "⛑️",
  conductor: "🚗",
  cocinero: "🍲",
  traductor: "🗣️",
  electricista: "🔌",
  otra: "🤝",
};

/** Persona que se ofrece como voluntaria, con su disponibilidad y ciudad. */
export interface Volunteer {
  id: string;
  country?: Country;
  type: VolunteerType;
  name: string;
  /** Disponibilidad (horarios, "24/7", "tardes"...). */
  availabilityText: string;
  /** Qué puede aportar / habilidades (idiomas, oficio...). */
  skillsText: string;
  estado: Estado | null;
  locationText: string;
  /** Ubicación exacta (GPS o mapa) del voluntario en la zona. Ausente/null si solo texto. */
  lat?: number | null;
  lng?: number | null;
  contactPhone: string | null;
  contactEmail: string | null;
  /** Foto opcional de quien se ofrece (rostro o equipo). */
  photoUrl: string | null;
  createdAt: string;
}

// ── Héroes (sección curada de "Noticias") ───────────────────────────────────
/** Categoría de un héroe de la emergencia. */
export type HeroCategory =
  | "bombero"
  | "rescatista"
  | "perro" // perros de búsqueda y rescate
  | "medico"
  | "voluntario"
  | "donante"
  | "fuerza" // policía, GNB, Protección Civil
  | "otro";

export const HERO_CATEGORY_LABEL: Record<HeroCategory, string> = {
  bombero: "Bomberos",
  rescatista: "Rescatistas",
  perro: "Perros rescatistas",
  medico: "Personal médico",
  voluntario: "Voluntarios",
  donante: "Donantes",
  fuerza: "Cuerpos de seguridad",
  otro: "Otro",
};

export const HERO_CATEGORY_EMOJI: Record<HeroCategory, string> = {
  bombero: "🚒",
  rescatista: "⛑️",
  perro: "🐕",
  medico: "🩺",
  voluntario: "🤝",
  donante: "🎁",
  fuerza: "🛡️",
  otro: "⭐",
};

/**
 * Reconocimiento a quien ayudó en la emergencia. Contenido curado de la sección
 * de Noticias: lo puede proponer cualquiera (Turnstile), pero aparece como
 * "sin verificar" hasta que un moderador le da el visto bueno; el admin también
 * puede eliminarlo. Cita su fuente cuando la hay. Tiene "me gusta" y comentarios.
 */
export interface Hero {
  id: string;
  country?: Country;
  category: HeroCategory;
  /** Nombre o grupo (p. ej. "Bomberos de La Guaira"). */
  title: string;
  /** Qué hizo. */
  body: string;
  estado: Estado | null;
  locationText: string;
  photoUrl: string | null;
  /** Fuente que respalda el reconocimiento (medio, organización). */
  sourceName: string | null;
  sourceUrl: string | null;
  /** Quién lo propone (cuenta o "Equipo" para los curados). */
  authorName: string;
  /** Visto bueno del moderador. Los propuestos por la comunidad nacen en false. */
  verified: boolean;
  likes: number;
  createdAt: string;
}

// ── Noticias curadas (sección de Noticias, las agrega el equipo) ─────────────
/** Tipo de entrada curada: ayuda humanitaria internacional o noticia/titular. */
export type NewsKind = "ayuda" | "noticia";

export const NEWS_KIND_LABEL: Record<NewsKind, string> = {
  ayuda: "Ayuda humanitaria",
  noticia: "Noticia",
};

/**
 * Noticia o reporte de ayuda CURADO por el equipo (no lo publica el público).
 * Convive con el feed en vivo de las APIs y nunca se inventa: cada entrada
 * conserva su fuente. Tiene "me gusta" y comentarios.
 */
export interface NewsItem {
  id: string;
  country?: Country;
  kind: NewsKind;
  title: string;
  body: string;
  /** Fuente (medio, organización) y su enlace. */
  sourceName: string | null;
  sourceUrl: string | null;
  photoUrl: string | null;
  likes: number;
  createdAt: string;
}

/** Comentario de la comunidad (foro) sobre cualquier publicación. */
export interface Comment {
  id: string;
  entityType: CommentEntity;
  entityId: string;
  /** Si es respuesta a otro comentario, el id de su raíz; null si es de primer nivel. */
  parentId: string | null;
  authorName: string;
  body: string;
  /** Foto opcional adjunta al comentario (evidencia). */
  photoUrl: string | null;
  /** "Me gusta" de la comunidad al comentario (uno por dispositivo). */
  likes: number;
  createdAt: string;
  /** Igual que en `Post`: foto de perfil y usuario si comentó con cuenta. */
  authorAvatarUrl?: string | null;
  authorUsername?: string | null;
}

export interface Stats {
  registered: number;
  toLocate: number;
  located: number;
  lastUpdated: string;
}
