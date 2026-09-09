import { afterEach, describe, expect, it, vi } from "vitest";
import {
  aidPointSchema,
  hospitalPatientSchema,
  isSafePhotoUrl,
  managerAssignSchema,
  marchSchema,
  personSchema,
  petSchema,
  postSchema,
  signupSchema,
  statusReportSchema,
  volunteerSchema,
} from "@/lib/validation";

// Ayuda a leer los errores por campo sin depender del orden de los issues.
function issuePaths(result: { success: boolean; error?: { issues: { path: (string | number)[] }[] } }) {
  return (result.error?.issues ?? []).map((i) => i.path.join("."));
}

describe("personSchema — nombre obligatorio solo si se sabe quien es", () => {
  it("exige nombre cuando NO es un avistamiento sin identificar", () => {
    const res = personSchema.safeParse({ isUnidentified: false, description: "Vive en Macuto" });
    expect(res.success).toBe(false);
    expect(issuePaths(res)).toContain("firstName");
    expect(res.error!.issues.find((i) => i.path[0] === "firstName")!.message).toBe(
      "El nombre es obligatorio",
    );
  });

  it("acepta sin nombre cuando es un avistamiento sin identificar", () => {
    const res = personSchema.safeParse({ isUnidentified: true, description: "Mujer mayor, camisa azul" });
    expect(res.success).toBe(true);
  });

  it("trata el nombre en blanco como ausente (no basta con espacios)", () => {
    const res = personSchema.safeParse({ isUnidentified: false, firstName: "   " });
    expect(res.success).toBe(false);
    expect(issuePaths(res)).toContain("firstName");
  });

  it("isUnidentified por defecto es false, asi que un objeto vacio falla por nombre", () => {
    const res = personSchema.safeParse({});
    expect(res.success).toBe(false);
    expect(issuePaths(res)).toEqual(["firstName"]);
  });
});

describe("personSchema — resto de campos", () => {
  it("acepta cedulas con y sin prefijo de nacionalidad", () => {
    for (const cedula of ["V-12345678", "12345678", "e-1234567", "J-123456789"]) {
      expect(personSchema.safeParse({ firstName: "Ana", cedula }).success).toBe(true);
    }
  });

  it("rechaza cedulas mal formadas", () => {
    for (const cedula of ["V-1234", "V-1234567890", "abc", "V 12345678", "12.345.678"]) {
      const res = personSchema.safeParse({ firstName: "Ana", cedula });
      expect(res.success, cedula).toBe(false);
      expect(issuePaths(res)).toContain("cedula");
    }
  });

  it("acepta cedula vacia (campo opcional)", () => {
    expect(personSchema.safeParse({ firstName: "Ana", cedula: "" }).success).toBe(true);
  });

  it("acota la edad a 0..120 y la convierte desde texto", () => {
    const ok = personSchema.safeParse({ firstName: "Ana", age: "34" });
    expect(ok.success).toBe(true);
    expect(ok.success && ok.data.age).toBe(34);
    expect(personSchema.safeParse({ firstName: "Ana", age: "121" }).success).toBe(false);
    expect(personSchema.safeParse({ firstName: "Ana", age: "-1" }).success).toBe(false);
    expect(personSchema.safeParse({ firstName: "Ana", age: "12.5" }).success).toBe(false);
  });

  it("acota coordenadas a rangos geograficos validos", () => {
    expect(personSchema.safeParse({ firstName: "Ana", lat: 10.6, lng: -66.9 }).success).toBe(true);
    expect(personSchema.safeParse({ firstName: "Ana", lat: 91 }).success).toBe(false);
    expect(personSchema.safeParse({ firstName: "Ana", lng: -181 }).success).toBe(false);
  });

  it("rechaza estados y paises fuera del enum cerrado", () => {
    expect(personSchema.safeParse({ firstName: "Ana", estado: "La Guaira" }).success).toBe(true);
    expect(personSchema.safeParse({ firstName: "Ana", estado: "Risaralda" }).success).toBe(true);
    expect(personSchema.safeParse({ firstName: "Ana", estado: "Narnia" }).success).toBe(false);
    expect(personSchema.safeParse({ firstName: "Ana", country: "ve" }).success).toBe(true);
    expect(personSchema.safeParse({ firstName: "Ana", country: "ar" }).success).toBe(false);
  });

  it("rechaza telefonos de contacto con formato invalido y acepta el vacio", () => {
    expect(personSchema.safeParse({ firstName: "Ana", contactPhone: "" }).success).toBe(true);
    expect(personSchema.safeParse({ firstName: "Ana", contactPhone: "+58 412-1234567" }).success).toBe(true);
    expect(personSchema.safeParse({ firstName: "Ana", contactPhone: "0412ABC1234" }).success).toBe(false);
    expect(personSchema.safeParse({ firstName: "Ana", contactPhone: "12345" }).success).toBe(false);
    // Mas de 20 caracteres: fuera del rango del patron.
    expect(personSchema.safeParse({ firstName: "Ana", contactPhone: "+58 (0412) 123-4567890" }).success).toBe(
      false,
    );
  });

  it("rechaza correos invalidos", () => {
    expect(personSchema.safeParse({ firstName: "Ana", contactEmail: "ana@ejemplo.org" }).success).toBe(true);
    expect(personSchema.safeParse({ firstName: "Ana", contactEmail: "ana@" }).success).toBe(false);
  });

  it("recorta espacios y respeta los maximos de longitud", () => {
    const ok = personSchema.safeParse({ firstName: "  Ana  ", description: " hola " });
    expect(ok.success && ok.data.firstName).toBe("Ana");
    expect(ok.success && ok.data.description).toBe("hola");
    expect(personSchema.safeParse({ firstName: "A".repeat(81) }).success).toBe(false);
    expect(personSchema.safeParse({ firstName: "Ana", description: "x".repeat(801) }).success).toBe(false);
  });
});

describe("isSafePhotoUrl — freno de SSRF sobre la URL de foto", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("solo acepta el bucket publico del propio proyecto cuando esta configurado", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://miproyecto.supabase.co");
    expect(isSafePhotoUrl("https://miproyecto.supabase.co/storage/v1/object/public/photos/a.webp")).toBe(true);
    // Otro proyecto de Supabase: no es el propio bucket.
    expect(isSafePhotoUrl("https://ajeno.supabase.co/storage/v1/object/public/photos/a.webp")).toBe(false);
  });

  it("rechaza esquemas y rutas peligrosas", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://miproyecto.supabase.co");
    expect(isSafePhotoUrl("http://miproyecto.supabase.co/storage/v1/object/public/photos/a.webp")).toBe(false);
    expect(isSafePhotoUrl("https://miproyecto.supabase.co/otra/ruta/a.webp")).toBe(false);
    expect(isSafePhotoUrl("https://miproyecto.supabase.co/storage/v1/object/public/private/a.webp")).toBe(
      false,
    );
    expect(isSafePhotoUrl("javascript:alert(1)")).toBe(false);
    expect(isSafePhotoUrl("no es una url")).toBe(false);
    expect(isSafePhotoUrl("")).toBe(false);
    expect(isSafePhotoUrl("file:///etc/passwd")).toBe(false);
    expect(isSafePhotoUrl("https://127.0.0.1/storage/v1/object/public/photos/a.webp")).toBe(false);
  });

  it("sin proyecto configurado cae al patron generico de dominio Supabase", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    expect(isSafePhotoUrl("https://cualquiera.supabase.co/storage/v1/object/public/photos/a.webp")).toBe(true);
    expect(isSafePhotoUrl("https://cualquiera.supabase.in/storage/v1/object/public/photos/a.webp")).toBe(true);
    expect(isSafePhotoUrl("https://malicioso.example.com/storage/v1/object/public/photos/a.webp")).toBe(false);
    // Sufijo enganoso: el host debe TERMINAR en el dominio de Supabase.
    expect(isSafePhotoUrl("https://supabase.co.malicioso.net/storage/v1/object/public/photos/a.webp")).toBe(
      false,
    );
  });
});

describe("enlaces externos (httpUrl)", () => {
  it("solo acepta http/https, nunca javascript: ni data:", () => {
    expect(marchSchema.shape.whatsappUrl.safeParse("https://chat.whatsapp.com/abc").success).toBe(true);
    expect(marchSchema.shape.whatsappUrl.safeParse("").success).toBe(true);
    expect(marchSchema.shape.whatsappUrl.safeParse("javascript:alert(1)").success).toBe(false);
    expect(marchSchema.shape.whatsappUrl.safeParse("data:text/html,<script>").success).toBe(false);
    expect(postSchema.shape.linkUrl.safeParse("ftp://ejemplo.org/x").success).toBe(false);
    expect(postSchema.shape.linkUrl.safeParse("no-es-url").success).toBe(false);
  });
});

describe("statusReportSchema — reporte de estado por un tercero", () => {
  const base = {
    personId: "p1",
    reportedStatus: "localizado" as const,
    reporterName: "Ana",
    reporterPhone: "0412-1234567",
    reporterRelationship: "vecina",
    locationFound: "Macuto",
  };

  it("acepta un reporte completo", () => {
    expect(statusReportSchema.safeParse(base).success).toBe(true);
  });

  it("exige identificar a quien reporta, su telefono, relacion y lugar", () => {
    const res = statusReportSchema.safeParse({
      ...base,
      reporterName: "A",
      reporterPhone: "123",
      reporterRelationship: "",
      locationFound: "",
    });
    expect(res.success).toBe(false);
    expect(issuePaths(res).sort()).toEqual(
      ["locationFound", "reporterName", "reporterPhone", "reporterRelationship"].sort(),
    );
  });

  it("rechaza un estado reportado fuera del enum", () => {
    expect(statusReportSchema.safeParse({ ...base, reportedStatus: "desaparecido" }).success).toBe(false);
  });
});

describe("aidPointSchema — punto de ayuda", () => {
  const base = {
    name: "Refugio escuela",
    types: ["agua"] as const,
    locationText: "Plaza de Macuto",
    contactPhone: "0412-1234567",
  };

  it("acepta un punto valido", () => {
    expect(aidPointSchema.safeParse(base).success).toBe(true);
  });

  it("exige al menos un recurso", () => {
    const res = aidPointSchema.safeParse({ ...base, types: [] });
    expect(res.success).toBe(false);
    expect(issuePaths(res)).toContain("types");
  });

  it("rechaza tipos de recurso desconocidos", () => {
    expect(aidPointSchema.safeParse({ ...base, types: ["gasolina"] }).success).toBe(false);
  });

  it("exige telefono de contacto valido (no es opcional aqui)", () => {
    expect(aidPointSchema.safeParse({ ...base, contactPhone: "" }).success).toBe(false);
    expect(aidPointSchema.safeParse({ ...base, contactPhone: "abcdefgh" }).success).toBe(false);
  });

  it("valida el nivel de existencias por categoria", () => {
    expect(
      aidPointSchema.safeParse({ ...base, categoryStatus: { agua: "urgente" } }).success,
    ).toBe(true);
    expect(aidPointSchema.safeParse({ ...base, categoryStatus: { agua: "mucho" } }).success).toBe(false);
  });
});

describe("otros esquemas con reglas propias", () => {
  it("signupSchema exige usuario con formato y contrasena de 10+", () => {
    expect(signupSchema.safeParse({ username: "ana_perez", password: "unaClaveLarga1" }).success).toBe(true);
    expect(signupSchema.safeParse({ username: "an", password: "unaClaveLarga1" }).success).toBe(false);
    expect(signupSchema.safeParse({ username: "ana perez", password: "unaClaveLarga1" }).success).toBe(false);
    expect(signupSchema.safeParse({ username: "ana!", password: "unaClaveLarga1" }).success).toBe(false);
    expect(signupSchema.safeParse({ username: "ana_perez", password: "corta123" }).success).toBe(false);
    expect(signupSchema.safeParse({ username: "ana_perez", password: "x".repeat(73) }).success).toBe(false);
    // El correo es opcional: vacio pasa, mal formado no.
    expect(signupSchema.safeParse({ username: "ana_perez", password: "unaClaveLarga1", email: "" }).success).toBe(
      true,
    );
    expect(
      signupSchema.safeParse({ username: "ana_perez", password: "unaClaveLarga1", email: "ana@" }).success,
    ).toBe(false);
  });

  it("postSchema exige mensaje de 5+ y autor de 2+", () => {
    const base = { type: "necesito" as const, body: "Necesito agua", authorName: "Ana" };
    expect(postSchema.safeParse(base).success).toBe(true);
    expect(postSchema.safeParse({ ...base, body: "agua" }).success).toBe(false);
    expect(postSchema.safeParse({ ...base, authorName: "A" }).success).toBe(false);
    expect(postSchema.safeParse({ ...base, type: "chisme" }).success).toBe(false);
  });

  it("petSchema exige descripcion util de la mascota", () => {
    const base = { status: "perdida" as const, species: "perro" as const, description: "Mestizo marron" };
    expect(petSchema.safeParse(base).success).toBe(true);
    expect(petSchema.safeParse({ ...base, description: "cafe" }).success).toBe(false);
    expect(petSchema.safeParse({ ...base, species: "loro" }).success).toBe(false);
  });

  it("volunteerSchema valida tipo, nombre y contacto", () => {
    const base = { type: "medico" as const, name: "Ana" };
    expect(volunteerSchema.safeParse(base).success).toBe(true);
    expect(volunteerSchema.safeParse({ ...base, contactPhone: "0412-1234567" }).success).toBe(true);
    expect(volunteerSchema.safeParse({ ...base, contactPhone: "12" }).success).toBe(false);
    expect(volunteerSchema.safeParse({ ...base, type: "influencer" }).success).toBe(false);
  });

  it("hospitalPatientSchema valida cedula opcional y estado clinico", () => {
    const base = { hospitalId: "h1", fullName: "Ana Perez", status: "estable" as const };
    expect(hospitalPatientSchema.safeParse(base).success).toBe(true);
    expect(hospitalPatientSchema.safeParse({ ...base, cedula: "" }).success).toBe(true);
    expect(hospitalPatientSchema.safeParse({ ...base, cedula: "V-123" }).success).toBe(false);
    expect(hospitalPatientSchema.safeParse({ ...base, status: "grave" }).success).toBe(false);
  });

  it("managerAssignSchema exige entidad conocida y usuario valido", () => {
    expect(managerAssignSchema.safeParse({ entityType: "hospital", entityId: "h1", username: "ana" }).success).toBe(
      true,
    );
    expect(managerAssignSchema.safeParse({ entityType: "post", entityId: "h1", username: "ana" }).success).toBe(
      false,
    );
    expect(
      managerAssignSchema.safeParse({ entityType: "hospital", entityId: "", username: "ana" }).success,
    ).toBe(false);
  });
});
