import { afterEach, describe, expect, it, vi } from "vitest";
import {
  clampPageSize,
  cn,
  DEFAULT_PAGE_SIZE,
  directionsLink,
  initials,
  PAGE_SIZE_OPTIONS,
  statusStyle,
  timeAgo,
  whatsappLink,
} from "@/lib/utils";

describe("cn", () => {
  it("descarta valores falsos y une el resto con espacios", () => {
    expect(cn("a", false, null, undefined, "b")).toBe("a b");
    expect(cn()).toBe("");
  });
});

describe("clampPageSize", () => {
  it("acepta solo los tamanos permitidos", () => {
    for (const size of PAGE_SIZE_OPTIONS) expect(clampPageSize(size)).toBe(size);
  });

  it("cae al valor por defecto con entradas invalidas", () => {
    for (const bad of [undefined, 0, 7, 1000, -10, Number.NaN]) {
      expect(clampPageSize(bad as number | undefined)).toBe(DEFAULT_PAGE_SIZE);
    }
  });

  it("permite un valor por defecto propio por seccion", () => {
    expect(clampPageSize(undefined, 20)).toBe(20);
    expect(clampPageSize(999, 20)).toBe(20);
    expect(clampPageSize(50, 20)).toBe(50);
  });
});

describe("timeAgo", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  function at(iso: string, nowISO = "2026-08-27T12:00:00.000Z") {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(nowISO));
    return timeAgo(iso);
  }

  it("usa los umbrales de minuto, hora y dia", () => {
    expect(at("2026-08-27T11:59:31.000Z")).toBe("hace instantes");
    expect(at("2026-08-27T11:59:00.000Z")).toBe("hace 1 min");
    expect(at("2026-08-27T11:01:00.000Z")).toBe("hace 59 min");
    expect(at("2026-08-27T11:00:00.000Z")).toBe("hace 1 h");
    expect(at("2026-08-26T13:00:00.000Z")).toBe("hace 23 h");
    expect(at("2026-08-26T12:00:00.000Z")).toBe("hace 1 d");
    expect(at("2026-07-29T12:00:00.000Z")).toBe("hace 29 d");
  });

  it("pasados 30 dias muestra la fecha en vez del relativo", () => {
    expect(at("2026-06-24T12:00:00.000Z")).toMatch(/2026/);
  });
});

describe("whatsappLink", () => {
  it("devuelve null sin telefono o con muy pocos digitos", () => {
    expect(whatsappLink(null)).toBeNull();
    expect(whatsappLink(undefined)).toBeNull();
    expect(whatsappLink("")).toBeNull();
    expect(whatsappLink("1234567")).toBeNull();
    expect(whatsappLink("(0212) 12")).toBeNull();
  });

  it("normaliza el 0 inicial venezolano al codigo 58", () => {
    expect(whatsappLink("0412-1234567")).toBe("https://wa.me/584121234567");
    expect(whatsappLink("0412 123 45 67")).toBe("https://wa.me/584121234567");
  });

  it("respeta numeros que ya traen codigo de pais", () => {
    expect(whatsappLink("+58 412 1234567")).toBe("https://wa.me/584121234567");
    expect(whatsappLink("+57 300 1234567")).toBe("https://wa.me/573001234567");
  });

  it("codifica el mensaje anadido", () => {
    expect(whatsappLink("0412-1234567", "Hola & ¿cómo estás?")).toBe(
      "https://wa.me/584121234567?text=Hola%20%26%20%C2%BFc%C3%B3mo%20est%C3%A1s%3F",
    );
  });
});

describe("directionsLink", () => {
  it("apunta a Google Maps con la coordenada destino", () => {
    expect(directionsLink(10.601, -66.888)).toBe(
      "https://www.google.com/maps/dir/?api=1&destination=10.601,-66.888",
    );
  });
});

describe("statusStyle", () => {
  it("da un estilo distinto por estado y cae en rosa para 'por localizar'", () => {
    expect(statusStyle("localizado").dot).toBe("bg-emerald-500");
    expect(statusStyle("hospitalizado").dot).toBe("bg-sky-500");
    expect(statusStyle("fallecido").dot).toBe("bg-zinc-400");
    expect(statusStyle("por_localizar").dot).toBe("bg-rose-500");
  });
});

describe("initials", () => {
  it("toma la primera letra de nombre y apellido en mayuscula", () => {
    expect(initials("ana", "pérez")).toBe("AP");
  });

  it("no revienta con cadenas vacias", () => {
    expect(initials("", "")).toBe("");
    expect(initials("Ana", "")).toBe("A");
  });
});
