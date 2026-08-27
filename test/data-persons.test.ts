import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createPerson,
  createStatusReport,
  deletePerson,
  findPersonDuplicates,
  getPersonById,
  getPersonGroups,
  getPersons,
  getPersonsByIds,
  getStats,
  updatePersonFields,
  updatePersonStatus,
  verifyOwner,
} from "@/lib/data";
import type { PersonInput } from "@/lib/validation";

// Sin credenciales de Supabase, `data.ts` usa su almacen en memoria (modo
// demostración). Estas pruebas ejercitan ESA rama: filtros, paginación,
// ordenamientos y reglas de escritura, sin red ni base de datos.
//
// Todo se crea en el país "co", que NO tiene datos de ejemplo (`seed.ts` solo
// trae Venezuela), así que los conteos son deterministas y no dependen del
// contenido del seed. Además cada prueba etiqueta sus registros con un marcador
// único en `locationText` y filtra por él con `search`.

const AHORA = "2026-08-20T12:00:00.000Z"; // dentro de la ventana de prioridad de CO (sismo 2026-08-10)
let contador = 0;

function marcador(nombre: string): string {
  return `${nombre}-${contador++}`;
}

function entrada(over: Partial<PersonInput> = {}): PersonInput {
  return {
    country: "co",
    firstName: "Ana",
    lastName: "Perez",
    isUnidentified: false,
    ...over,
  } as PersonInput;
}

/** Crea una persona y avanza el reloj para que `createdAt` sea distinto. */
async function crear(over: Partial<PersonInput> = {}, photoUrl: string | null = null) {
  const res = await createPerson(entrada(over), photoUrl);
  vi.advanceTimersByTime(1000);
  return res;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(AHORA));
});

afterEach(() => {
  vi.useRealTimers();
});

describe("getPersons — paginación (rama en memoria)", () => {
  it("parte los resultados en páginas y reporta el total completo", async () => {
    const marca = marcador("PAGINA");
    for (let i = 0; i < 7; i++) await crear({ locationText: marca });

    const p1 = await getPersons({ country: "co", search: marca, pageSize: 3, page: 1 });
    expect(p1.total).toBe(7);
    expect(p1.items).toHaveLength(3);
    expect(p1.page).toBe(1);
    expect(p1.pageSize).toBe(3);

    const p3 = await getPersons({ country: "co", search: marca, pageSize: 3, page: 3 });
    expect(p3.items).toHaveLength(1);
    expect(p3.total).toBe(7);

    // Sin solapamiento entre páginas.
    const p2 = await getPersons({ country: "co", search: marca, pageSize: 3, page: 2 });
    const ids = [...p1.items, ...p2.items, ...p3.items].map((p) => p.id);
    expect(new Set(ids).size).toBe(7);
  });

  it("una página más allá del final viene vacía pero conserva el total", async () => {
    const marca = marcador("PAGINA-VACIA");
    await crear({ locationText: marca });
    const res = await getPersons({ country: "co", search: marca, pageSize: 10, page: 5 });
    expect(res.items).toEqual([]);
    expect(res.total).toBe(1);
  });

  it("no mezcla países", async () => {
    const marca = marcador("PAIS");
    await crear({ locationText: marca });
    expect((await getPersons({ country: "co", search: marca })).total).toBe(1);
    expect((await getPersons({ country: "ve", search: marca })).total).toBe(0);
    // Sin `country` se asume Venezuela (compatibilidad).
    expect((await getPersons({ search: marca })).total).toBe(0);
  });
});

describe("getPersons — filtros", () => {
  it("separa 'Se busca' de '¿La reconoces?'", async () => {
    const marca = marcador("INTENCION");
    await crear({ locationText: marca });
    await crear({ locationText: marca, firstName: "", isUnidentified: true });

    const seBusca = await getPersons({ country: "co", search: marca, excludeUnidentified: true });
    expect(seBusca.items.map((p) => p.isUnidentified)).toEqual([false]);

    const reconoces = await getPersons({ country: "co", search: marca, unidentifiedOnly: true });
    expect(reconoces.items.map((p) => p.isUnidentified)).toEqual([true]);
  });

  it("unresolvedOnly esconde a quien ya apareció (localizado o sin vida)", async () => {
    const marca = marcador("RESUELTOS");
    const porLocalizar = await crear({ locationText: marca });
    const localizado = await crear({ locationText: marca, isUnidentified: true, status: "localizado" });
    const fallecido = await crear({ locationText: marca, isUnidentified: true, status: "fallecido" });
    const hospitalizado = await crear({ locationText: marca, isUnidentified: true, status: "hospitalizado" });

    const res = await getPersons({ country: "co", search: marca, unresolvedOnly: true });
    const ids = res.items.map((p) => p.id);
    expect(ids).toContain(porLocalizar.person.id);
    expect(ids).toContain(hospitalizado.person.id);
    expect(ids).not.toContain(localizado.person.id);
    expect(ids).not.toContain(fallecido.person.id);
  });

  it("filtra por estado exacto, género, causa y hospitalizados", async () => {
    const marca = marcador("CAMPOS");
    await crear({ locationText: marca, estado: "Risaralda", gender: "femenino", cause: "desastre" });
    await crear({ locationText: marca, estado: "Chocó", gender: "masculino", cause: "otra" });
    await crear({ locationText: marca, isUnidentified: true, status: "hospitalizado" });

    expect((await getPersons({ country: "co", search: marca, estado: "Risaralda" })).total).toBe(1);
    expect((await getPersons({ country: "co", search: marca, gender: "masculino" })).total).toBe(1);
    expect((await getPersons({ country: "co", search: marca, cause: "otra" })).total).toBe(1);
    expect((await getPersons({ country: "co", search: marca, hospitalizedOnly: true })).total).toBe(1);
    // "all" equivale a no filtrar.
    expect(
      (await getPersons({ country: "co", search: marca, estado: "all", gender: "all", cause: "all" })).total,
    ).toBe(3);
  });

  it("filtra por rango de edad y descarta a quien no tiene edad registrada", async () => {
    const marca = marcador("EDAD");
    await crear({ locationText: marca, age: 8 });
    await crear({ locationText: marca, age: 30 });
    await crear({ locationText: marca, age: 80 });
    await crear({ locationText: marca }); // sin edad

    expect((await getPersons({ country: "co", search: marca })).total).toBe(4);
    expect((await getPersons({ country: "co", search: marca, minAge: 18 })).total).toBe(2);
    expect((await getPersons({ country: "co", search: marca, maxAge: 17 })).total).toBe(1);
    expect((await getPersons({ country: "co", search: marca, minAge: 18, maxAge: 40 })).total).toBe(1);
    // Los límites son inclusivos.
    expect((await getPersons({ country: "co", search: marca, minAge: 30, maxAge: 30 })).total).toBe(1);
    // minAge 0 es un filtro real, no un valor ausente: excluye a quien no tiene edad.
    expect((await getPersons({ country: "co", search: marca, minAge: 0 })).total).toBe(3);
  });

  it("filtra por fecha de publicación incluyendo todo el día de dateTo", async () => {
    const marca = marcador("FECHAS");
    vi.setSystemTime(new Date("2026-08-18T23:30:00.000Z"));
    await crear({ locationText: marca });
    vi.setSystemTime(new Date("2026-08-20T10:00:00.000Z"));
    await crear({ locationText: marca });

    expect((await getPersons({ country: "co", search: marca, dateFrom: "2026-08-19" })).total).toBe(1);
    expect((await getPersons({ country: "co", search: marca, dateTo: "2026-08-18" })).total).toBe(1);
    expect(
      (await getPersons({ country: "co", search: marca, dateFrom: "2026-08-18", dateTo: "2026-08-20" })).total,
    ).toBe(2);
    expect((await getPersons({ country: "co", search: marca, dateTo: "2026-08-17" })).total).toBe(0);
  });

  it("busca en nombre, apellido, cédula, región y ubicación, sin distinguir mayúsculas", async () => {
    const marca = marcador("BUSQUEDA");
    await crear({
      locationText: `${marca} Barrio Kennedy`,
      firstName: "Yusmary",
      lastName: "Marcano",
      cedula: "V-19222333",
      estado: "Risaralda",
    });

    for (const termino of ["yusmary", "MARCANO", "19222333", "risaralda", "barrio kennedy", `  ${marca}  `]) {
      expect((await getPersons({ country: "co", search: termino })).total, termino).toBeGreaterThanOrEqual(1);
    }
    expect((await getPersons({ country: "co", search: `${marca}-inexistente` })).total).toBe(0);
  });

  it("acota por radio alrededor de un punto y descarta a quien no tiene coordenada", async () => {
    const marca = marcador("RADIO");
    const cerca = await crear({ locationText: marca, lat: 4.81, lng: -75.69 }); // Pereira
    const lejos = await crear({ locationText: marca, lat: 10.96, lng: -74.8 }); // Barranquilla
    const sinCoord = await crear({ locationText: marca });

    const conPunto = await getPersons({ country: "co", search: marca, nearLat: 4.81, nearLng: -75.69 });
    expect(conPunto.items.map((p) => p.id).sort()).toEqual([cerca.person.id, lejos.person.id].sort());
    expect(conPunto.items.map((p) => p.id)).not.toContain(sinCoord.person.id);

    const enRadio = await getPersons({
      country: "co",
      search: marca,
      nearLat: 4.81,
      nearLng: -75.69,
      radiusKm: 50,
    });
    expect(enRadio.items.map((p) => p.id)).toEqual([cerca.person.id]);
  });
});

describe("getPersons — ordenamientos", () => {
  it("ordena por nombre completo", async () => {
    const marca = marcador("ORDEN-NOMBRE");
    await crear({ locationText: marca, firstName: "Zoraida", lastName: "Alvarez" });
    await crear({ locationText: marca, firstName: "Ana", lastName: "Zapata" });
    await crear({ locationText: marca, firstName: "Bruno", lastName: "Bello" });

    const res = await getPersons({ country: "co", search: marca, sort: "name" });
    expect(res.items.map((p) => p.firstName)).toEqual(["Ana", "Bruno", "Zoraida"]);
  });

  it("ordena por región", async () => {
    const marca = marcador("ORDEN-REGION");
    await crear({ locationText: marca, estado: "Tolima" });
    await crear({ locationText: marca, estado: "Antioquia" });

    const res = await getPersons({ country: "co", search: marca, sort: "estado" });
    expect(res.items.map((p) => p.estado)).toEqual(["Antioquia", "Tolima"]);
  });

  it("ordena por distancia al punto de referencia", async () => {
    const marca = marcador("ORDEN-DISTANCIA");
    await crear({ locationText: marca, lat: 10.96, lng: -74.8 }); // Barranquilla
    await crear({ locationText: marca, lat: 4.81, lng: -75.69 }); // Pereira
    await crear({ locationText: marca, lat: 6.25, lng: -75.57 }); // Medellín

    const res = await getPersons({
      country: "co",
      search: marca,
      sort: "distance",
      nearLat: 4.81,
      nearLng: -75.69,
    });
    expect(res.items.map((p) => p.lat)).toEqual([4.81, 6.25, 10.96]);
  });

  it("dentro de la ventana tras el sismo, los casos del desastre van primero", async () => {
    const marca = marcador("PRIORIDAD");
    // El caso ajeno al desastre es el MÁS reciente: aun así debe quedar detrás.
    await crear({ locationText: marca, cause: "desastre" });
    await crear({ locationText: marca, cause: "otra" });

    const res = await getPersons({ country: "co", search: marca, sort: "recent" });
    expect(res.items.map((p) => p.cause)).toEqual(["desastre", "otra"]);
  });

  it("pasada la ventana de prioridad manda la fecha, no la causa", async () => {
    const marca = marcador("PRIORIDAD-VENCIDA");
    await crear({ locationText: marca, cause: "desastre" });
    await crear({ locationText: marca, cause: "otra" });

    // 46+ días después del sismo de Colombia (2026-08-10).
    vi.setSystemTime(new Date("2026-12-01T12:00:00.000Z"));
    const res = await getPersons({ country: "co", search: marca, sort: "recent" });
    expect(res.items.map((p) => p.cause)).toEqual(["otra", "desastre"]);
  });
});

describe("createPerson — reglas de las dos intenciones", () => {
  it("un avistamiento sin nombre queda como 'Sin identificar'", async () => {
    const { person } = await crear({ firstName: "", lastName: "", isUnidentified: true });
    expect(person.firstName).toBe("Sin identificar");
    expect(person.lastName).toBe("");
  });

  it("recorta el nombre en blanco antes de decidir el marcador", async () => {
    const { person } = await crear({ firstName: "   ", isUnidentified: true });
    expect(person.firstName).toBe("Sin identificar");
  });

  it("'Se busca' nace siempre 'por localizar', aunque se envíe otro estado", async () => {
    const { person } = await crear({ isUnidentified: false, status: "localizado" });
    expect(person.status).toBe("por_localizar");
  });

  it("un avistamiento nunca queda 'por localizar' (ya se sabe dónde está)", async () => {
    expect((await crear({ isUnidentified: true, status: "por_localizar" })).person.status).toBe("localizado");
    expect((await crear({ isUnidentified: true })).person.status).toBe("localizado");
    expect((await crear({ isUnidentified: true, status: "hospitalizado" })).person.status).toBe(
      "hospitalizado",
    );
    expect((await crear({ isUnidentified: true, status: "fallecido" })).person.status).toBe("fallecido");
  });

  it("normaliza los opcionales vacíos a null y arranca sin reacciones ni verificación", async () => {
    const { person } = await crear({ cedula: "", contactPhone: "", contactEmail: "", contactName: "" });
    expect(person.cedula).toBeNull();
    expect(person.contactPhone).toBeNull();
    expect(person.contactEmail).toBeNull();
    expect(person.contactName).toBeNull();
    expect(person.verified).toBe(false);
    expect(person.reactions).toEqual({ fuerza: 0, corazon: 0, difundir: 0 });
    expect(person.cause).toBe("desastre");
  });

  it("descarta una edad no numérica", async () => {
    const { person } = await crear({ age: Number.NaN });
    expect(person.age).toBeNull();
  });

  it("entrega un token de gestión aleatorio que solo sirve para esa persona", async () => {
    const a = await crear();
    const b = await crear();
    expect(a.ownerToken).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    expect(a.ownerToken).not.toBe(b.ownerToken);
    expect(await verifyOwner(a.person.id, a.ownerToken)).toBe(true);
    expect(await verifyOwner(a.person.id, b.ownerToken)).toBe(false);
    expect(await verifyOwner(a.person.id, "")).toBe(false);
  });

  it("marca como posible duplicado cuando ya hay un registro parecido", async () => {
    const marca = marcador("DUPLICADO");
    const primero = await crear({ locationText: marca, firstName: "Keiber", lastName: "Carrasquero" });
    expect(primero.person.possibleDuplicate).toBe(false);
    expect(primero.person.duplicateMatchId).toBeNull();

    const segundo = await crear({ locationText: marca, firstName: "Keiber", lastName: "Carrasquero" });
    expect(segundo.person.possibleDuplicate).toBe(true);
    expect(segundo.person.duplicateMatchId).toBe(primero.person.id);
  });
});

describe("findPersonDuplicates", () => {
  it("empareja por cédula ignorando puntos, guiones y la letra de nacionalidad", async () => {
    const { person } = await crear({ firstName: "Naile", lastName: "Liven", cedula: "V-9111222" });
    const matches = await findPersonDuplicates({
      firstName: "Otro",
      lastName: "Nombre",
      cedula: "9.111.222",
      country: "co",
    });
    expect(matches.map((m) => m.id)).toContain(person.id);
    expect(matches.find((m) => m.id === person.id)!.matchReason).toBe("cedula");
  });

  it("empareja por foto idéntica (mismo SHA-256)", async () => {
    const hash = `hash-${marcador("FOTO")}`;
    const { person } = await crear({ firstName: "Oriana", lastName: "Rubin", photoHash: hash });
    const matches = await findPersonDuplicates({
      firstName: "Sin",
      lastName: "Datos",
      cedula: null,
      photoHash: hash,
      country: "co",
    });
    expect(matches.map((m) => m.id)).toContain(person.id);
    expect(matches.find((m) => m.id === person.id)!.matchReason).toBe("photo");
  });

  it("empareja por nombre parecido con 2+ palabras en común, sin exigir orden ni tildes", async () => {
    const { person } = await crear({ firstName: "Ana María", lastName: "Saavedra" });
    const matches = await findPersonDuplicates({
      firstName: "Saavedra",
      lastName: "ana maria",
      cedula: null,
      country: "co",
    });
    expect(matches.map((m) => m.id)).toContain(person.id);
    expect(matches.find((m) => m.id === person.id)!.matchReason).toBe("name");
  });

  it("no empareja con una sola palabra en común (no toda 'María' es la misma persona)", async () => {
    await crear({ firstName: "Maria", lastName: "Gonzalez" });
    const matches = await findPersonDuplicates({
      firstName: "Maria",
      lastName: "Escobar",
      cedula: null,
      country: "co",
    });
    expect(matches.filter((m) => m.matchReason === "name")).toEqual([]);
  });

  it("ignora palabras de menos de 3 letras al comparar nombres", async () => {
    await crear({ firstName: "Jo", lastName: "Li" });
    const matches = await findPersonDuplicates({ firstName: "Jo", lastName: "Li", cedula: null, country: "co" });
    expect(matches).toEqual([]);
  });

  it("sin cédula, sin foto y sin nombre suficiente no busca nada", async () => {
    expect(await findPersonDuplicates({ firstName: "", lastName: "", cedula: "", country: "co" })).toEqual([]);
    expect(await findPersonDuplicates({ firstName: "Ana", lastName: "", cedula: null, country: "co" })).toEqual(
      [],
    );
  });

  it("no cruza países", async () => {
    const cedula = "V-9777888";
    await crear({ firstName: "Deyanira", lastName: "Pacheco", cedula });
    expect(
      await findPersonDuplicates({ firstName: "X", lastName: "Y", cedula, country: "ve" }),
    ).toEqual([]);
  });

  it("devuelve como máximo 5 candidatos", async () => {
    const cedula = "V-9555444";
    for (let i = 0; i < 8; i++) await crear({ firstName: `Nombre${i}`, lastName: "Repetido", cedula });
    const matches = await findPersonDuplicates({ firstName: "X", lastName: "Y", cedula, country: "co" });
    expect(matches).toHaveLength(5);
  });
});

describe("edición y borrado (autor / moderador)", () => {
  it("updatePersonStatus cambia el estado y toca updatedAt", async () => {
    const { person } = await crear();
    const antes = person.updatedAt;
    vi.advanceTimersByTime(5000);
    await updatePersonStatus(person.id, "localizado");
    const actualizada = await getPersonById(person.id);
    expect(actualizada!.status).toBe("localizado");
    expect(actualizada!.updatedAt > antes).toBe(true);
  });

  it("updatePersonFields reescribe los campos corregibles y respeta lat/lng ausentes", async () => {
    const { person } = await crear({ firstName: "Ana", lat: 4.81, lng: -75.69, description: "camisa azul" });
    await updatePersonFields(person.id, entrada({ firstName: "Ana Lucía", description: "" }));
    const actualizada = (await getPersonById(person.id))!;
    expect(actualizada.firstName).toBe("Ana Lucía");
    expect(actualizada.description).toBe("");
    // No se enviaron coordenadas: se conservan las que ya había.
    expect(actualizada.lat).toBe(4.81);
    expect(actualizada.lng).toBe(-75.69);
  });

  it("updatePersonFields deja 'Sin identificar' si se borra el nombre", async () => {
    const { person } = await crear({ isUnidentified: true, firstName: "Quizás Ana" });
    await updatePersonFields(person.id, entrada({ firstName: "", isUnidentified: true }));
    expect((await getPersonById(person.id))!.firstName).toBe("Sin identificar");
  });

  it("deletePerson borra el registro y su token de gestión", async () => {
    const { person, ownerToken } = await crear();
    await deletePerson(person.id);
    expect(await getPersonById(person.id)).toBeNull();
    expect(await verifyOwner(person.id, ownerToken)).toBe(false);
  });
});

describe("createStatusReport", () => {
  it("nace sin verificar: no cambia el estado público de la persona", async () => {
    const { person } = await crear();
    const reporte = await createStatusReport({
      personId: person.id,
      reportedStatus: "localizado",
      reporterName: "Vecina",
      reporterPhone: "0412-1234567",
      reporterRelationship: "vecina",
      locationFound: "Refugio de Pereira",
      notes: "",
    });
    expect(reporte.verified).toBe(false);
    expect((await getPersonById(person.id))!.status).toBe("por_localizar");
  });
});

describe("consultas auxiliares", () => {
  it("getPersonsByIds resuelve varios ids de una vez y no inventa faltantes", async () => {
    const a = await crear();
    const b = await crear();
    const map = await getPersonsByIds([a.person.id, b.person.id, a.person.id, "no-existe"]);
    expect(map.size).toBe(2);
    expect(map.get(a.person.id)!.id).toBe(a.person.id);
    expect(await getPersonsByIds([])).toEqual(new Map());
  });

  it("getPersonGroups agrupa por región, con los grupos más grandes primero", async () => {
    const marca = marcador("GRUPOS");
    await crear({ locationText: marca, estado: "Risaralda" });
    await crear({ locationText: marca, estado: "Risaralda" });
    await crear({ locationText: marca, estado: "Chocó" });
    await crear({ locationText: marca });

    const grupos = await getPersonGroups({ country: "co", search: marca }, "estado");
    expect(grupos.map((g) => [g.label, g.items.length])).toEqual([
      ["Risaralda", 2],
      ["Chocó", 1],
      ["Sin región", 1],
    ]);
  });

  it("getStats cuenta registrados, localizados (incluye hospitalizados) y pendientes", async () => {
    const antes = await getStats("co");
    await crear();
    await crear({ isUnidentified: true, status: "localizado" });
    await crear({ isUnidentified: true, status: "hospitalizado" });

    const stats = await getStats("co");
    expect(stats.registered).toBe(antes.registered + 3);
    expect(stats.located).toBe(antes.located + 2);
    expect(stats.toLocate).toBe(stats.registered - stats.located);
  });
});
