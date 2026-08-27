import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createAidPoint,
  createHospital,
  createPost,
  getAidPointById,
  getAidPointsPage,
  getHospitalById,
  getHospitalsPage,
  getPostsPage,
  likeAidPoint,
  reactToPost,
  setAidAvailability,
  verifyResourceOwner,
  voteAidAvailability,
  voteHospitalSupplies,
} from "@/lib/data";
import type { AidPointInput, HospitalInput, PostInput } from "@/lib/validation";

// Consenso, paginación y filtros de recursos en la rama en memoria de `data.ts`.
// Igual que en las pruebas de personas, todo se crea en el país "co" (sin datos
// de ejemplo) y con marcadores únicos para no depender del seed.

const AHORA = "2026-08-20T12:00:00.000Z";
let contador = 0;

function marcador(nombre: string): string {
  return `${nombre}-${contador++}`;
}

function puntoEntrada(over: Partial<AidPointInput> = {}): AidPointInput {
  return {
    country: "co",
    name: "Comedor Kennedy",
    types: ["comida"],
    locationText: "Pereira",
    contactPhone: "+57 3001112233",
    ...over,
  } as AidPointInput;
}

async function crearPunto(over: Partial<AidPointInput> = {}) {
  const res = await createAidPoint(puntoEntrada(over), null);
  vi.advanceTimersByTime(1000);
  return res;
}

async function crearHospital(over: Partial<HospitalInput> = {}) {
  const res = await createHospital({
    country: "co",
    name: "Hospital San Jorge",
    status: "operativo",
    contactPhone: "+57 3001112233",
    ...over,
  } as HospitalInput);
  vi.advanceTimersByTime(1000);
  return res;
}

async function crearPost(over: Partial<PostInput> = {}) {
  const res = await createPost(
    {
      country: "co",
      type: "necesito",
      body: "Necesitamos agua potable en el barrio",
      authorName: "Vecina",
      linkUrl: "",
      contactPhone: "",
      ...over,
    } as PostInput,
    null,
  );
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

describe("voteAidAvailability — un voto por cuenta", () => {
  it("cuenta un solo voto aunque la misma cuenta lo repita", async () => {
    const { point } = await crearPunto();
    await voteAidAvailability(point.id, "depleted", "usuario-1");
    await voteAidAvailability(point.id, "depleted", "usuario-1");
    await voteAidAvailability(point.id, "depleted", "usuario-1");

    const actual = (await getAidPointById(point.id))!;
    expect(actual.votesDepleted).toBe(1);
    expect(actual.votesAvailable).toBe(0);
  });

  it("permite cambiar de opinión: mueve el voto, no lo suma dos veces", async () => {
    const { point } = await crearPunto();
    await voteAidAvailability(point.id, "available", "usuario-1");
    await voteAidAvailability(point.id, "depleted", "usuario-1");

    const actual = (await getAidPointById(point.id))!;
    expect(actual.votesAvailable).toBe(0);
    expect(actual.votesDepleted).toBe(1);
  });

  it("cuenta a cada cuenta por separado", async () => {
    const { point } = await crearPunto();
    await voteAidAvailability(point.id, "depleted", "usuario-1");
    await voteAidAvailability(point.id, "depleted", "usuario-2");
    await voteAidAvailability(point.id, "available", "usuario-3");

    const actual = (await getAidPointById(point.id))!;
    expect(actual.votesDepleted).toBe(2);
    expect(actual.votesAvailable).toBe(1);
  });

  it("los votos de cada punto son independientes", async () => {
    const a = await crearPunto();
    const b = await crearPunto();
    await voteAidAvailability(a.point.id, "depleted", "usuario-1");

    expect((await getAidPointById(a.point.id))!.votesDepleted).toBe(1);
    expect((await getAidPointById(b.point.id))!.votesDepleted).toBe(0);
  });

  it("el consenso NO cambia la disponibilidad oficial (eso lo decide el autor)", async () => {
    const { point } = await crearPunto();
    for (const usuario of ["u1", "u2", "u3", "u4", "u5"]) {
      await voteAidAvailability(point.id, "depleted", usuario);
    }
    expect((await getAidPointById(point.id))!.available).toBe(true);

    await setAidAvailability(point.id, false);
    expect((await getAidPointById(point.id))!.available).toBe(false);
  });

  it("votar un punto inexistente no rompe ni contamina otros contadores", async () => {
    await expect(voteAidAvailability("aid-no-existe", "depleted", "usuario-1")).resolves.toBeUndefined();
  });

  it("actualiza updatedAt al registrar el voto", async () => {
    const { point } = await crearPunto();
    const antes = point.updatedAt;
    vi.advanceTimersByTime(60_000);
    await voteAidAvailability(point.id, "available", "usuario-1");
    expect((await getAidPointById(point.id))!.updatedAt > antes).toBe(true);
  });
});

describe("voteHospitalSupplies — un voto por cuenta", () => {
  it("no acumula votos repetidos de la misma cuenta", async () => {
    const hospital = await crearHospital();
    await voteHospitalSupplies(hospital.id, "yes", "usuario-1");
    await voteHospitalSupplies(hospital.id, "yes", "usuario-1");

    const actual = (await getHospitalById(hospital.id))!;
    expect(actual.votesSupplies).toBe(1);
    expect(actual.votesNoSupplies).toBe(0);
  });

  it("cambiar de 'sí' a 'no' descuenta el voto anterior", async () => {
    const hospital = await crearHospital();
    await voteHospitalSupplies(hospital.id, "yes", "usuario-1");
    await voteHospitalSupplies(hospital.id, "no", "usuario-1");

    const actual = (await getHospitalById(hospital.id))!;
    expect(actual.votesSupplies).toBe(0);
    expect(actual.votesNoSupplies).toBe(1);
  });

  it("los votos de hospital y de punto de ayuda no se pisan entre sí", async () => {
    // Mismo id de recurso en ambos espacios de nombres: las claves de voto
    // llevan el tipo de entidad, así que no deben interferir.
    const { point } = await crearPunto();
    const hospital = await crearHospital();
    await voteAidAvailability(point.id, "available", "usuario-1");
    await voteHospitalSupplies(hospital.id, "yes", "usuario-1");

    expect((await getAidPointById(point.id))!.votesAvailable).toBe(1);
    expect((await getHospitalById(hospital.id))!.votesSupplies).toBe(1);
  });
});

describe("getAidPointsPage", () => {
  it("pagina y pone los disponibles antes de los agotados", async () => {
    // `getAidPointsPage` no tiene filtro de texto, así que este caso se aísla
    // publicando todo en un día propio y consultando ese día exacto.
    const dia = "2026-08-14";
    vi.setSystemTime(new Date(`${dia}T09:00:00.000Z`));
    const agotado = await crearPunto({ name: "Punto agotado" });
    await setAidAvailability(agotado.point.id, false);
    const disponibles: string[] = [];
    for (let i = 0; i < 3; i++) disponibles.push((await crearPunto({ name: `Punto ok ${i}` })).point.id);
    const soloEseDia = { country: "co", dateFrom: dia, dateTo: dia };

    const p1 = await getAidPointsPage({ ...soloEseDia, estado: "all" }, 1, 2);
    expect(p1.total).toBe(4);
    expect(p1.items).toHaveLength(2);
    expect(p1.items.every((p) => p.available)).toBe(true);

    const p2 = await getAidPointsPage(soloEseDia, 2, 2);
    expect(p2.items.map((p) => p.id)).toContain(agotado.point.id);
    // El agotado va al final de la lista completa.
    const todos = await getAidPointsPage(soloEseDia, 1, 10);
    expect(todos.items[todos.items.length - 1]!.id).toBe(agotado.point.id);
    expect(disponibles.every((id) => todos.items.some((p) => p.id === id))).toBe(true);
  });

  it("filtra por tipo de recurso (un punto puede tener varios)", async () => {
    const agua = await crearPunto({ types: ["agua", "comida"] });
    await crearPunto({ types: ["refugio"] });

    const soloAgua = await getAidPointsPage({ country: "co", type: "agua" }, 1, 50);
    expect(soloAgua.items.map((p) => p.id)).toContain(agua.point.id);
    expect(soloAgua.items.every((p) => p.types.includes("agua"))).toBe(true);

    const soloMedicina = await getAidPointsPage({ country: "co", type: "medicina" }, 1, 50);
    expect(soloMedicina.total).toBe(0);
  });

  it("availOnly esconde los agotados y estado filtra por región", async () => {
    const dia = "2026-08-16";
    vi.setSystemTime(new Date(`${dia}T09:00:00.000Z`));
    const activo = await crearPunto({ estado: "Risaralda" });
    const agotado = await crearPunto({ estado: "Risaralda" });
    await setAidAvailability(agotado.point.id, false);
    await crearPunto({ estado: "Chocó" });
    const soloEseDia = { country: "co", dateFrom: dia, dateTo: dia };

    const disponibles = await getAidPointsPage({ ...soloEseDia, availOnly: true }, 1, 50);
    expect(disponibles.items.map((p) => p.id)).toContain(activo.point.id);
    expect(disponibles.items.map((p) => p.id)).not.toContain(agotado.point.id);

    const risaralda = await getAidPointsPage({ ...soloEseDia, estado: "Risaralda" }, 1, 50);
    expect(risaralda.items.every((p) => p.estado === "Risaralda")).toBe(true);
    expect(risaralda.total).toBe(2);
  });

  it("no mezcla países y filtra por fechas", async () => {
    vi.setSystemTime(new Date("2026-08-11T10:00:00.000Z"));
    const viejo = await crearPunto();
    vi.setSystemTime(new Date("2026-08-12T10:00:00.000Z"));
    const nuevo = await crearPunto();

    const desde = await getAidPointsPage(
      { country: "co", dateFrom: "2026-08-12", dateTo: "2026-08-12" },
      1,
      50,
    );
    expect(desde.items.map((p) => p.id)).toEqual([nuevo.point.id]);
    const hasta = await getAidPointsPage(
      { country: "co", dateFrom: "2026-08-11", dateTo: "2026-08-11" },
      1,
      50,
    );
    expect(hasta.items.map((p) => p.id)).toEqual([viejo.point.id]);

    const enVenezuela = await getAidPointsPage({ country: "ve" }, 1, 50);
    expect(enVenezuela.items.some((p) => p.id === viejo.point.id)).toBe(false);
  });
});

describe("createAidPoint — enlace de gestión del autor", () => {
  it("nace disponible, sin votos, sin verificar y con token propio", async () => {
    const { point, ownerToken } = await crearPunto();
    expect(point.available).toBe(true);
    expect(point.votesAvailable).toBe(0);
    expect(point.votesDepleted).toBe(0);
    expect(point.verified).toBe(false);
    expect(point.likes).toBe(0);

    expect(await verifyResourceOwner("aid_point", point.id, ownerToken)).toBe(true);
    expect(await verifyResourceOwner("aid_point", point.id, "token-falso")).toBe(false);
    expect(await verifyResourceOwner("aid_point", point.id, "")).toBe(false);
  });

  it("el token de un punto no sirve para otro ni para otro tipo de recurso", async () => {
    const a = await crearPunto();
    const b = await crearPunto();
    const post = await crearPost();
    expect(await verifyResourceOwner("aid_point", b.point.id, a.ownerToken)).toBe(false);
    expect(await verifyResourceOwner("post", post.post.id, a.ownerToken)).toBe(false);
    expect(await verifyResourceOwner("post", post.post.id, post.ownerToken)).toBe(true);
  });

  it("likeAidPoint suma de uno en uno (la deduplicación es del dispositivo)", async () => {
    const { point } = await crearPunto();
    await likeAidPoint(point.id);
    await likeAidPoint(point.id);
    expect((await getAidPointById(point.id))!.likes).toBe(2);
  });
});

describe("getHospitalsPage", () => {
  it("ordena por nombre, por más recientes o por más antiguos", async () => {
    const marca = marcador("HOSP");
    const zeta = await crearHospital({ name: `${marca} Zeta` });
    const alfa = await crearHospital({ name: `${marca} Alfa` });

    const porNombre = await getHospitalsPage({ country: "co" }, 1, 50, "name");
    const nombres = porNombre.items.map((h) => h.name);
    expect(nombres.indexOf(alfa.name)).toBeLessThan(nombres.indexOf(zeta.name));

    const recientes = await getHospitalsPage({ country: "co" }, 1, 50, "recent");
    expect(recientes.items[0]!.id).toBe(alfa.id);

    const antiguos = await getHospitalsPage({ country: "co" }, 1, 50, "oldest");
    expect(antiguos.items[0]!.id).toBe(zeta.id);
  });

  it("filtra por estado de capacidad y pagina", async () => {
    const cerrado = await crearHospital({ status: "cerrado" });
    await crearHospital({ status: "operativo" });

    const soloCerrados = await getHospitalsPage({ country: "co", status: "cerrado" }, 1, 50);
    expect(soloCerrados.items.map((h) => h.id)).toEqual([cerrado.id]);

    const pagina = await getHospitalsPage({ country: "co" }, 1, 1);
    expect(pagina.items).toHaveLength(1);
    expect(pagina.total).toBeGreaterThanOrEqual(2);
  });

  it("separa especialidades por coma y descarta las vacías", async () => {
    const hospital = await crearHospital({ specialties: " traumatología , , pediatría ," });
    expect(hospital.specialties).toEqual(["traumatología", "pediatría"]);
  });
});

describe("getPostsPage", () => {
  it("pagina el muro y respeta el total", async () => {
    const marca = marcador("MURO");
    for (let i = 0; i < 5; i++) await crearPost({ body: `${marca} mensaje ${i}` });

    const p1 = await getPostsPage({ country: "co", search: marca }, 1, 2);
    expect(p1.total).toBe(5);
    expect(p1.items).toHaveLength(2);
    const p3 = await getPostsPage({ country: "co", search: marca }, 3, 2);
    expect(p3.items).toHaveLength(1);
  });

  it("filtra por tipo, región y búsqueda en cuerpo, lugar y autor", async () => {
    const marca = marcador("FILTRO-MURO");
    await crearPost({
      body: `${marca} hace falta insulina`,
      type: "medico",
      estado: "Risaralda",
      locationText: "Barrio Cuba",
      authorName: "Yorbelis",
    });
    await crearPost({ body: `${marca} tengo cobijas`, type: "ofrezco", estado: "Chocó" });

    expect((await getPostsPage({ country: "co", search: marca, type: "medico" }, 1, 50)).total).toBe(1);
    expect((await getPostsPage({ country: "co", search: marca, estado: "Chocó" }, 1, 50)).total).toBe(1);
    expect((await getPostsPage({ country: "co", search: "barrio cuba" }, 1, 50)).total).toBe(1);
    expect((await getPostsPage({ country: "co", search: "YORBELIS" }, 1, 50)).total).toBe(1);
    expect((await getPostsPage({ country: "co", search: marca, type: "all" }, 1, 50)).total).toBe(2);
  });

  it("ordena por recientes, antiguos y popularidad (suma de reacciones)", async () => {
    const marca = marcador("ORDEN-MURO");
    const primero = await crearPost({ body: `${marca} uno` });
    const segundo = await crearPost({ body: `${marca} dos` });
    await reactToPost(primero.post.id, "apoyo");
    await reactToPost(primero.post.id, "corazon");

    const recientes = await getPostsPage({ country: "co", search: marca }, 1, 50, "recent");
    expect(recientes.items[0]!.id).toBe(segundo.post.id);

    const antiguos = await getPostsPage({ country: "co", search: marca }, 1, 50, "oldest");
    expect(antiguos.items[0]!.id).toBe(primero.post.id);

    const populares = await getPostsPage({ country: "co", search: marca }, 1, 50, "popular");
    expect(populares.items[0]!.id).toBe(primero.post.id);

    const menosPopulares = await getPostsPage({ country: "co", search: marca }, 1, 50, "least_popular");
    expect(menosPopulares.items[0]!.id).toBe(segundo.post.id);
  });

  it("un post recién publicado nace sin reacciones, sin fijar y con token de gestión", async () => {
    const { post, ownerToken } = await crearPost();
    expect(post.reactions).toEqual({ apoyo: 0, corazon: 0, hecho: 0 });
    expect(post.pinned).toBe(false);
    expect(await verifyResourceOwner("post", post.id, ownerToken)).toBe(true);
  });
});
