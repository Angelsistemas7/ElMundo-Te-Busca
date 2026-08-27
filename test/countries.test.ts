import { describe, expect, it } from "vitest";
import {
  ALL_REGIONS,
  AMERICAS_COUNTRIES,
  COUNTRIES,
  COUNTRY_CODES,
  DEFAULT_COUNTRY,
  getCountry,
  isCountryCode,
} from "@/lib/countries";

describe("isCountryCode", () => {
  it("reconoce solo los paises activos", () => {
    expect(isCountryCode("ve")).toBe(true);
    expect(isCountryCode("co")).toBe(true);
    expect(isCountryCode("ar")).toBe(false);
    expect(isCountryCode("VE")).toBe(false);
    expect(isCountryCode(null)).toBe(false);
    expect(isCountryCode(undefined)).toBe(false);
    expect(isCountryCode("")).toBe(false);
  });
});

describe("getCountry", () => {
  it("devuelve la configuracion del pais pedido", () => {
    expect(getCountry("co").code).toBe("co");
  });

  it("cae al pais por defecto con valores desconocidos o nulos", () => {
    for (const value of [null, undefined, "", "xx", "VE"]) {
      expect(getCountry(value).code).toBe(DEFAULT_COUNTRY);
    }
  });
});

describe("configuracion por pais", () => {
  it("cada pais activo tiene regiones, coordenadas de todas ellas y datos del sismo", () => {
    for (const code of COUNTRY_CODES) {
      const cfg = COUNTRIES[code];
      expect(cfg.code).toBe(code);
      expect(cfg.regions.length).toBeGreaterThan(0);
      for (const region of cfg.regions) {
        expect(cfg.regionCoords[region], `${code}/${region}`).toBeDefined();
      }
      // Sin coordenadas huerfanas: cada entrada de regionCoords es una region real.
      expect(Object.keys(cfg.regionCoords).sort()).toEqual([...cfg.regions].sort());
      expect(cfg.quakeInfo.dateISO).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(Number.isNaN(Date.parse(cfg.quakeInfo.dateISO))).toBe(false);
      expect(cfg.emergency.nationalLine.number).not.toBe("");
      expect(cfg.usgsBbox).toHaveLength(4);
    }
  });

  it("el bbox de USGS esta bien ordenado (min < max)", () => {
    for (const code of COUNTRY_CODES) {
      const [minLat, minLon, maxLat, maxLon] = COUNTRIES[code].usgsBbox;
      expect(minLat).toBeLessThan(maxLat);
      expect(minLon).toBeLessThan(maxLon);
    }
  });

  it("el epicentro cae dentro del bbox del pais", () => {
    for (const code of COUNTRY_CODES) {
      const cfg = COUNTRIES[code];
      const [minLat, minLon, maxLat, maxLon] = cfg.usgsBbox;
      expect(cfg.epicenter[0]).toBeGreaterThanOrEqual(minLat);
      expect(cfg.epicenter[0]).toBeLessThanOrEqual(maxLat);
      expect(cfg.epicenter[1]).toBeGreaterThanOrEqual(minLon);
      expect(cfg.epicenter[1]).toBeLessThanOrEqual(maxLon);
    }
  });

  it("el patron de noticias compila como regex", () => {
    for (const code of COUNTRY_CODES) {
      expect(() => new RegExp(COUNTRIES[code].news.matchPattern, "i")).not.toThrow();
    }
  });
});

describe("ALL_REGIONS", () => {
  it("es la union sin repetidos de las regiones de todos los paises", () => {
    expect(new Set(ALL_REGIONS).size).toBe(ALL_REGIONS.length);
    for (const code of COUNTRY_CODES) {
      for (const region of COUNTRIES[code].regions) expect(ALL_REGIONS).toContain(region);
    }
  });

  it("colapsa las regiones homonimas de varios paises (p. ej. Amazonas)", () => {
    expect(ALL_REGIONS.filter((r) => r === "Amazonas")).toHaveLength(1);
  });
});

describe("AMERICAS_COUNTRIES", () => {
  it("incluye los paises activos y no repite codigos", () => {
    const codes = AMERICAS_COUNTRIES.map((c) => c.code);
    expect(new Set(codes).size).toBe(codes.length);
    for (const code of COUNTRY_CODES) expect(codes).toContain(code);
  });
});
