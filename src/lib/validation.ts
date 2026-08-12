import { z } from "zod";
import { ALL_REGIONS, COUNTRY_CODES } from "./countries";

// Validación compartida por formularios (cliente) y acciones de servidor.
// Mantener aquí evita que datos basura entren a la base de datos.

// Unión de las regiones (estados/departamentos) de TODOS los países activos:
// sigue siendo un enum cerrado (no texto libre), solo que ahora cubre varios
// países en vez de solo los 24 estados de Venezuela. Ver `countries.ts`.
const estadoEnum = z.enum(ALL_REGIONS as [string, ...string[]]);
const countryEnum = z.enum(COUNTRY_CODES);

const phone = z
  .string()
  .trim()
  .regex(/^[+\d\s()-]{7,20}$/u, "Teléfono no válido")
  .optional()
  .or(z.literal(""));

// Enlace externo seguro: SOLO http/https. `z.url()` por sí solo aceptaría
// `javascript:` o `data:`, que pintados como href permitirían XSS al hacer clic.
const httpUrl = (msg: string) =>
  z
    .string()
    .trim()
    .url(msg)
    .refine((u) => /^https?:\/\//i.test(u), "El enlace debe empezar por http:// o https://")
    .optional()
    .or(z.literal(""));

// `photoUrl` no pasa por un schema de formulario: llega ya subida por
// `uploadPhoto` (src/lib/upload.ts) y se lee directo del FormData en
// `actions.ts`. Sin este chequeo, cualquiera podría llamar la Server Action
// directamente con una URL arbitraria; esa URL luego se pasa a `fetch()` en
// el servidor (src/lib/ogImage.ts, para la tarjeta de compartir), lo que
// permitiría SSRF contra la red interna. Solo se acepta el bucket del PROPIO
// proyecto de Supabase (por su host exacto), no el de cualquier proyecto
// *.supabase.co ajeno.
const PHOTO_HOST_FALLBACK_RE = /\.(supabase\.co|supabase\.in)$/i;

function ownSupabaseHost(): string | null {
  const configured = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!configured) return null;
  try {
    return new URL(configured).hostname;
  } catch {
    return null;
  }
}

export function isSafePhotoUrl(url: string): boolean {
  try {
    const u = new URL(url);
    if (u.protocol !== "https:") return false;
    if (!u.pathname.startsWith("/storage/v1/object/public/photos/")) return false;

    const ownHost = ownSupabaseHost();
    // Con el proyecto configurado, exige ese host exacto. Sin configurar
    // (p. ej. en pruebas locales), cae al patrón genérico de dominio Supabase.
    return ownHost ? u.hostname === ownHost : PHOTO_HOST_FALLBACK_RE.test(u.hostname);
  } catch {
    return false;
  }
}

export const personSchema = z
  .object({
    country: countryEnum.optional(),
    // El nombre es obligatorio solo si SE SABE quién es la persona. En un
    // avistamiento de alguien "sin identificar" puede no conocerse (ver refine).
    firstName: z.string().trim().max(80).optional().or(z.literal("")),
    lastName: z.string().trim().max(80).optional().or(z.literal("")),
    cedula: z
      .string()
      .trim()
      .regex(/^[VEJGvejg]?-?\d{5,9}$/u, "Formato de cédula no válido (ej. V-12345678)")
      .optional()
      .or(z.literal("")),
    age: z.coerce.number().int().min(0).max(120).optional().or(z.nan()),
    gender: z.enum(["masculino", "femenino", "otro"]).optional(),
    estado: estadoEnum.optional(),
    locationText: z.string().trim().max(160).optional().or(z.literal("")),
    lat: z.coerce.number().min(-90).max(90).optional(),
    lng: z.coerce.number().min(-180).max(180).optional(),
    description: z.string().trim().max(800).optional().or(z.literal("")),
    isUnidentified: z.boolean().default(false),
    cause: z.enum(["desastre", "otra"]).optional(),
    // Solo aplica a avistamientos ("¿La reconoces?"): la persona ya está ubicada.
    status: z.enum(["por_localizar", "localizado", "hospitalizado", "fallecido"]).optional(),
    contactName: z.string().trim().max(80).optional().or(z.literal("")),
    contactPhone: phone,
    contactEmail: z.string().trim().email("Correo no válido").optional().or(z.literal("")),
  })
  .superRefine((data, ctx) => {
    // Caso "busco a esta persona": se conoce la identidad → el nombre es obligatorio.
    if (!data.isUnidentified && !data.firstName) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["firstName"],
        message: "El nombre es obligatorio",
      });
    }
  });

export type PersonInput = z.infer<typeof personSchema>;

export const statusReportSchema = z.object({
  personId: z.string().min(1),
  reportedStatus: z.enum(["por_localizar", "localizado", "hospitalizado", "fallecido"]),
  reporterName: z.string().trim().min(2, "Indica tu nombre"),
  reporterPhone: z
    .string()
    .trim()
    .regex(/^[+\d\s()-]{7,20}$/u, "Teléfono de contacto no válido"),
  reporterRelationship: z
    .string()
    .trim()
    .min(2, "Indica tu relación con la persona (familiar, médico, testigo...)"),
  locationFound: z.string().trim().min(2, "Indica dónde la viste/encontraste"),
  notes: z.string().trim().max(800).optional().or(z.literal("")),
});

export type StatusReportInput = z.infer<typeof statusReportSchema>;

export const aidPointSchema = z.object({
  country: countryEnum.optional(),
  name: z.string().trim().min(2, "Nombre del punto obligatorio").max(120),
  types: z
    .array(z.enum(["comida", "agua", "medicina", "refugio", "alojamiento", "ropa", "otro"]))
    .min(1, "Selecciona al menos un recurso"),
  estado: estadoEnum.optional(),
  locationText: z.string().trim().min(2, "Indica la ubicación").max(160),
  lat: z.coerce.number().min(-90).max(90).optional(),
  lng: z.coerce.number().min(-180).max(180).optional(),
  scheduleText: z.string().trim().max(120).optional().or(z.literal("")),
  description: z.string().trim().max(800).optional().or(z.literal("")),
  contactName: z.string().trim().max(80).optional().or(z.literal("")),
  contactPhone: z
    .string()
    .trim()
    .regex(/^[+\d\s()-]{7,20}$/u, "Teléfono no válido"),
});

export type AidPointInput = z.infer<typeof aidPointSchema>;

export const marchSchema = z.object({
  country: countryEnum.optional(),
  title: z.string().trim().min(3, "Título obligatorio").max(120),
  originText: z.string().trim().min(2, "Indica el punto de salida").max(160),
  destinationText: z.string().trim().min(2, "Indica el destino").max(160),
  departAt: z.string().min(1, "Indica fecha y hora de salida"),
  organizerName: z.string().trim().min(2, "Indica quién organiza").max(80),
  organizerPhone: z
    .string()
    .trim()
    .regex(/^[+\d\s()-]{7,20}$/u, "Teléfono de contacto no válido"),
  whatsappUrl: httpUrl("Enlace de WhatsApp no válido"),
  description: z.string().trim().max(800).optional().or(z.literal("")),
});

export type MarchInput = z.infer<typeof marchSchema>;

export const postSchema = z.object({
  country: countryEnum.optional(),
  type: z.enum(["necesito", "ofrezco", "rescate", "medico", "caravana", "identificar", "info"]),
  body: z.string().trim().min(5, "Escribe tu mensaje (mín. 5 caracteres)").max(1500),
  estado: estadoEnum.optional(),
  locationText: z.string().trim().max(160).optional().or(z.literal("")),
  linkUrl: httpUrl("Enlace no válido"),
  authorName: z.string().trim().min(2, "Indica tu nombre").max(80),
  contactPhone: phone,
});

export type PostInput = z.infer<typeof postSchema>;

export const hospitalSchema = z.object({
  country: countryEnum.optional(),
  name: z.string().trim().min(2, "Nombre del hospital obligatorio").max(140),
  estado: estadoEnum.optional(),
  locationText: z.string().trim().max(160).optional().or(z.literal("")),
  lat: z.coerce.number().min(-90).max(90).optional(),
  lng: z.coerce.number().min(-180).max(180).optional(),
  status: z.enum(["operativo", "saturado", "lleno", "cerrado"]),
  specialties: z.string().trim().max(300).optional().or(z.literal("")), // separadas por coma
  needsText: z.string().trim().max(600).optional().or(z.literal("")),
  contactName: z.string().trim().max(80).optional().or(z.literal("")),
  contactPhone: phone,
});

export type HospitalInput = z.infer<typeof hospitalSchema>;

export const hospitalPatientSchema = z.object({
  hospitalId: z.string().min(1),
  fullName: z.string().trim().min(2, "Indica el nombre de la persona").max(120),
  cedula: z
    .string()
    .trim()
    .regex(/^[VEJGvejg]?-?\d{5,9}$/u, "Cédula no válida")
    .optional()
    .or(z.literal("")),
  condition: z.string().trim().max(200).optional().or(z.literal("")),
  status: z.enum(["estable", "critico", "observacion", "alta"]),
  note: z.string().trim().max(400).optional().or(z.literal("")),
});

export type HospitalPatientInput = z.infer<typeof hospitalPatientSchema>;

// ── Cuentas (login opcional) ────────────────────────────────────────────────
// Usuario único + contraseña fuerte (mínimo 10). El correo es opcional y solo
// sirve para recuperar la clave. NUNCA contraseñas cortas.
const USERNAME_RE = /^[a-zA-Z0-9_.]{3,24}$/u;

export const signupSchema = z.object({
  username: z
    .string()
    .trim()
    .regex(USERNAME_RE, "Usa 3–24 caracteres: letras, números, punto o guion bajo (sin espacios)."),
  password: z
    .string()
    .min(10, "La contraseña debe tener al menos 10 caracteres.")
    .max(72, "La contraseña es demasiado larga (máx. 72)."),
  email: z.string().trim().email("Correo no válido").optional().or(z.literal("")),
});

export type SignupInput = z.infer<typeof signupSchema>;

export const loginSchema = z.object({
  username: z.string().trim().min(1, "Indica tu usuario."),
  password: z.string().min(1, "Indica tu contraseña."),
});

export type LoginInput = z.infer<typeof loginSchema>;

// ── Gestores delegados (asignación desde el panel admin) ─────────────────────
// El admin asigna a un usuario (por su nombre de usuario) como gestor de un
// recurso concreto (hospital o punto de ayuda).
export const managerAssignSchema = z.object({
  entityType: z.enum(["aid_point", "hospital"]),
  entityId: z.string().min(1),
  username: z
    .string()
    .trim()
    .regex(USERNAME_RE, "Nombre de usuario no válido."),
});

export type ManagerAssignInput = z.infer<typeof managerAssignSchema>;

export const roleAssignSchema = z.object({
  role: z.enum(["admin", "moderator", "hospital_moderator", "aid_point_moderator"]),
  username: z
    .string()
    .trim()
    .regex(USERNAME_RE, "Nombre de usuario no válido."),
});

export type RoleAssignInput = z.infer<typeof roleAssignSchema>;

// ── Denuncias de irregularidades ─────────────────────────────────────────────
export const complaintSchema = z.object({
  country: countryEnum.optional(),
  category: z.enum([
    "riesgo_ninos",
    "desvio_ayuda",
    "fraude",
    "abuso_autoridad",
    "persona_desaparecida",
    "otra",
  ]),
  body: z.string().trim().min(10, "Describe la irregularidad (mín. 10 caracteres)").max(1500),
  estado: estadoEnum.optional(),
  locationText: z.string().trim().max(160).optional().or(z.literal("")),
});

export type ComplaintInput = z.infer<typeof complaintSchema>;

// ── Mascotas ─────────────────────────────────────────────────────────────────
export const petSchema = z.object({
  country: countryEnum.optional(),
  status: z.enum(["perdida", "encontrada", "refugio", "veterinario"]),
  species: z.enum(["perro", "gato", "otro"]),
  name: z.string().trim().max(60).optional().or(z.literal("")),
  description: z.string().trim().min(5, "Describe a la mascota (color, raza, señas)").max(800),
  estado: estadoEnum.optional(),
  locationText: z.string().trim().max(160).optional().or(z.literal("")),
  contactPhone: phone,
});

export type PetInput = z.infer<typeof petSchema>;

// ── Voluntarios ──────────────────────────────────────────────────────────────
export const volunteerSchema = z.object({
  country: countryEnum.optional(),
  type: z.enum([
    "medico",
    "enfermero",
    "psicologo",
    "rescatista",
    "conductor",
    "cocinero",
    "traductor",
    "electricista",
    "otra",
  ]),
  name: z.string().trim().min(2, "Indica tu nombre").max(80),
  availabilityText: z.string().trim().max(160).optional().or(z.literal("")),
  skillsText: z.string().trim().max(400).optional().or(z.literal("")),
  estado: estadoEnum.optional(),
  locationText: z.string().trim().max(160).optional().or(z.literal("")),
  lat: z.coerce.number().min(-90).max(90).optional(),
  lng: z.coerce.number().min(-180).max(180).optional(),
  contactPhone: phone,
  contactEmail: z.string().trim().email("Correo no válido").optional().or(z.literal("")),
});

export type VolunteerInput = z.infer<typeof volunteerSchema>;

export const heroSchema = z.object({
  country: countryEnum.optional(),
  category: z.enum([
    "bombero",
    "rescatista",
    "perro",
    "medico",
    "voluntario",
    "donante",
    "fuerza",
    "otro",
  ]),
  title: z.string().trim().min(2, "Indica el nombre o el grupo").max(120),
  body: z.string().trim().min(10, "Cuenta brevemente qué hizo").max(800),
  estado: estadoEnum.optional(),
  locationText: z.string().trim().max(160).optional().or(z.literal("")),
  sourceName: z.string().trim().max(120).optional().or(z.literal("")),
  sourceUrl: httpUrl("Enlace de la fuente no válido"),
});

export type HeroInput = z.infer<typeof heroSchema>;

export const newsItemSchema = z.object({
  country: countryEnum,
  kind: z.enum(["ayuda", "noticia"]),
  title: z.string().trim().min(4, "Indica el titular").max(200),
  body: z.string().trim().min(10, "Escribe un resumen").max(1200),
  sourceName: z.string().trim().max(120).optional().or(z.literal("")),
  sourceUrl: httpUrl("Enlace de la fuente no válido"),
});

export type NewsItemInput = z.infer<typeof newsItemSchema>;
