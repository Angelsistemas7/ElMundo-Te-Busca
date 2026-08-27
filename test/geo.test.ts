import { describe, expect, it } from "vitest";
import { EPICENTER, geocode, geocodeFor, haversineKm, SECTOR_COORDS } from "@/lib/geo";
import { COUNTRIES } from "@/lib/countries";

describe("haversineKm", () => {
  it("da 0 para el mismo punto", () => {
    expect(haversineKm(10.6, -66.9, 10.6, -66.9)).toBe(0);
  });

  it("mide distancias conocidas con margen razonable", () => {
    // Macuto -> Caracas: ~15 km en linea recta.
    expect(haversineKm(10.601, -66.888, 10.5, -66.92)).toBeCloseTo(11.7, 0);
    // Un grado de latitud son ~111 km.
    expect(haversineKm(0, 0, 1, 0)).toBeCloseTo(111.19, 1);
  });

  it("es simetrica", () => {
    const ida = haversineKm(10.6, -66.9, 4.65, -74.1);
    const vuelta = haversineKm(4.65, -74.1, 10.6, -66.9);
    expect(ida).toBeCloseTo(vuelta, 9);
  });
});

describe("geocodeFor", () => {
  it("prefiere el sector mencionado en el texto libre", () => {
    const coord = geocodeFor("ve", "Plaza de Macuto, frente a la iglesia", null, "semilla");
    expect(coord).not.toBeNull();
    const [lat, lng] = coord!;
    const [baseLat, baseLng] = SECTOR_COORDS.macuto;
    expect(Math.abs(lat - baseLat)).toBeLessThan(0.01);
    expect(Math.abs(lng - baseLng)).toBeLessThan(0.01);
  });

  it("reconoce sectores sin importar el pais activo (acopio de la diaspora)", () => {
    const coord = geocodeFor("ve", "Centro de acopio en Madrid", null, "s");
    expect(coord).not.toBeNull();
    expect(coord![0]).toBeCloseTo(SECTOR_COORDS.madrid[0], 1);
  });

  it("cae a las coordenadas de la region cuando el texto no dice nada", () => {
    const coord = geocodeFor("co", "sin datos utiles", "Risaralda", "s");
    expect(coord).not.toBeNull();
    expect(coord![0]).toBeCloseTo(COUNTRIES.co.regionCoords.Risaralda[0], 1);
  });

  it("no mezcla regiones entre paises: 'Risaralda' no existe en Venezuela", () => {
    expect(geocodeFor("ve", "", "Risaralda", "s")).toBeNull();
    expect(geocodeFor("co", "", "La Guaira", "s")).toBeNull();
  });

  it("devuelve null cuando no hay ni texto reconocible ni region", () => {
    expect(geocodeFor("ve", null, null)).toBeNull();
    expect(geocodeFor("ve", "una direccion cualquiera", null)).toBeNull();
    expect(geocodeFor("ve", "", "Narnia", "s")).toBeNull();
  });

  it("es determinista para la misma semilla y distinta entre semillas", () => {
    const a = geocodeFor("ve", "Macuto", null, "persona-1");
    const b = geocodeFor("ve", "Macuto", null, "persona-1");
    const c = geocodeFor("ve", "Macuto", null, "persona-2");
    expect(a).toEqual(b);
    expect(a).not.toEqual(c);
  });

  it("nunca desplaza hacia el norte (el mar en La Guaira esta al norte)", () => {
    const base = SECTOR_COORDS.macuto[0];
    for (let i = 0; i < 50; i++) {
      const coord = geocodeFor("ve", "Macuto", null, `semilla-${i}`)!;
      expect(coord[0]).toBeLessThanOrEqual(base);
      expect(base - coord[0]).toBeLessThanOrEqual(0.006);
      expect(Math.abs(coord[1] - SECTOR_COORDS.macuto[1])).toBeLessThanOrEqual(0.005);
    }
  });

  it("con pais desconocido usa Venezuela por defecto", () => {
    const coord = geocodeFor("xx", "", "La Guaira", "s");
    expect(coord).not.toBeNull();
    expect(coord).toEqual(geocodeFor("ve", "", "La Guaira", "s"));
  });

  it("no incluye 'vargas' como sector (mandaba direcciones de Maracay a la costa)", () => {
    expect(geocodeFor("ve", "Av. Vargas, Maracay", null, "s")![0]).toBeCloseTo(SECTOR_COORDS.maracay[0], 1);
  });
});

describe("geocode (compatibilidad, asume Venezuela)", () => {
  it("equivale a geocodeFor con 've'", () => {
    expect(geocode("Macuto", null, "s")).toEqual(geocodeFor("ve", "Macuto", null, "s"));
  });
});

describe("constantes historicas", () => {
  it("EPICENTER apunta al epicentro de Venezuela", () => {
    expect(EPICENTER).toEqual(COUNTRIES.ve.epicenter);
  });
});
