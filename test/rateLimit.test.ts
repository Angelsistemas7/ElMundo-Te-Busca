import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createRateLimiter, interactionLimiter } from "@/lib/rateLimit";

describe("createRateLimiter", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-27T12:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("permite exactamente `max` llamadas dentro de la ventana", () => {
    const limiter = createRateLimiter(3, 1000);
    expect(limiter.allow("ip")).toBe(true);
    expect(limiter.allow("ip")).toBe(true);
    expect(limiter.allow("ip")).toBe(true);
    expect(limiter.allow("ip")).toBe(false);
    expect(limiter.allow("ip")).toBe(false);
  });

  it("cuenta cada clave por separado", () => {
    const limiter = createRateLimiter(1, 1000);
    expect(limiter.allow("ip-a")).toBe(true);
    expect(limiter.allow("ip-a")).toBe(false);
    expect(limiter.allow("ip-b")).toBe(true);
  });

  it("abre de nuevo al pasar la ventana, no antes", () => {
    const limiter = createRateLimiter(2, 30_000);
    expect(limiter.allow("ip")).toBe(true);
    expect(limiter.allow("ip")).toBe(true);
    expect(limiter.allow("ip")).toBe(false);

    // Justo en el limite de la ventana todavia bloquea (la comparacion es estricta).
    vi.advanceTimersByTime(30_000);
    expect(limiter.allow("ip")).toBe(false);

    vi.advanceTimersByTime(1);
    expect(limiter.allow("ip")).toBe(true);
  });

  it("la ventana es fija: no se desliza con cada llamada bloqueada", () => {
    const limiter = createRateLimiter(1, 10_000);
    expect(limiter.allow("ip")).toBe(true);
    vi.advanceTimersByTime(9_000);
    expect(limiter.allow("ip")).toBe(false); // sigue en la ventana original
    vi.advanceTimersByTime(1_001);
    expect(limiter.allow("ip")).toBe(true); // ventana nueva
  });

  it("con max 0 no permite ninguna llamada mas que la que abre la ventana", () => {
    const limiter = createRateLimiter(0, 1000);
    // La primera llamada abre la ventana (entrada nueva) y pasa; a partir de ahi bloquea.
    expect(limiter.allow("ip")).toBe(true);
    expect(limiter.allow("ip")).toBe(false);
  });

  it("poda entradas vencidas cuando se alcanza el maximo de claves seguidas", () => {
    const limiter = createRateLimiter(1, 1000, 3);
    // Tres claves ocupan el mapa; luego vencen.
    limiter.allow("a");
    limiter.allow("b");
    limiter.allow("c");
    vi.advanceTimersByTime(2000);
    // Esta llamada dispara la poda (size >= maxTrackedKeys) y libera a,b,c.
    limiter.allow("d");
    // Las claves viejas vuelven a tener cupo (ventana nueva de todos modos).
    expect(limiter.allow("a")).toBe(true);
    expect(limiter.allow("a")).toBe(false);
  });
});

describe("interactionLimiter (instancia compartida de reacciones)", () => {
  it("frena a partir de 40 llamadas en la ventana de 30 s", () => {
    const key = `prueba-${Math.random()}`;
    for (let i = 0; i < 40; i++) expect(interactionLimiter.allow(key), `llamada ${i}`).toBe(true);
    expect(interactionLimiter.allow(key)).toBe(false);
  });
});
