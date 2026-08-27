import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clientIp, createLockout } from "@/lib/ipLockout";
import { __setHeaders } from "./stubs/next-headers";

// La IP es la clave de todos los frenos por fuerza bruta: si se pudiera falsear,
// el bloqueo no serviria. Se comprueba el orden de confianza de las cabeceras.
describe("clientIp", () => {
  afterEach(() => {
    __setHeaders();
  });

  it("prefiere CF-Connecting-IP (la pone Cloudflare, el cliente no la puede falsear)", async () => {
    __setHeaders({ "cf-connecting-ip": " 203.0.113.7 ", "x-forwarded-for": "1.2.3.4", "x-real-ip": "5.6.7.8" });
    expect(await clientIp()).toBe("203.0.113.7");
  });

  it("sin Cloudflare usa el primer valor de X-Forwarded-For", async () => {
    __setHeaders({ "x-forwarded-for": " 198.51.100.9 , 10.0.0.1 , 10.0.0.2 " });
    expect(await clientIp()).toBe("198.51.100.9");
  });

  it("cae a X-Real-IP cuando X-Forwarded-For viene vacia", async () => {
    __setHeaders({ "x-forwarded-for": "  ", "x-real-ip": "192.0.2.5" });
    expect(await clientIp()).toBe("192.0.2.5");
  });

  it("sin ninguna cabecera devuelve 'unknown' (no lanza)", async () => {
    __setHeaders();
    expect(await clientIp()).toBe("unknown");
  });
});

describe("createLockout", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-27T12:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("una clave nueva no esta bloqueada", () => {
    const lockout = createLockout(3, 60_000);
    expect(lockout.isLocked("ip")).toBe(false);
  });

  it("bloquea al alcanzar el numero de intentos fallidos", () => {
    const lockout = createLockout(3, 60_000);
    lockout.registerFailure("ip");
    lockout.registerFailure("ip");
    expect(lockout.isLocked("ip")).toBe(false);
    lockout.registerFailure("ip");
    expect(lockout.isLocked("ip")).toBe(true);
  });

  it("el bloqueo caduca al pasar el tiempo configurado", () => {
    const lockout = createLockout(2, 15 * 60_000);
    lockout.registerFailure("ip");
    lockout.registerFailure("ip");
    expect(lockout.isLocked("ip")).toBe(true);

    vi.advanceTimersByTime(15 * 60_000);
    expect(lockout.isLocked("ip")).toBe(false);
  });

  it("tras caducar, hacen falta otros N fallos para volver a bloquear", () => {
    const lockout = createLockout(2, 1000);
    lockout.registerFailure("ip");
    lockout.registerFailure("ip");
    vi.advanceTimersByTime(1001);
    expect(lockout.isLocked("ip")).toBe(false);
    lockout.registerFailure("ip");
    expect(lockout.isLocked("ip")).toBe(false);
    lockout.registerFailure("ip");
    expect(lockout.isLocked("ip")).toBe(true);
  });

  it("un exito limpia el contador de fallos y el bloqueo", () => {
    const lockout = createLockout(3, 60_000);
    lockout.registerFailure("ip");
    lockout.registerFailure("ip");
    lockout.registerSuccess("ip");
    lockout.registerFailure("ip");
    lockout.registerFailure("ip");
    expect(lockout.isLocked("ip")).toBe(false);
    lockout.registerFailure("ip");
    expect(lockout.isLocked("ip")).toBe(true);
    lockout.registerSuccess("ip");
    expect(lockout.isLocked("ip")).toBe(false);
  });

  it("aisla claves distintas (no castiga a otras IP)", () => {
    const lockout = createLockout(1, 60_000);
    lockout.registerFailure("ip-a");
    expect(lockout.isLocked("ip-a")).toBe(true);
    expect(lockout.isLocked("ip-b")).toBe(false);
  });

  it("poda entradas viejas cuando el mapa llega al maximo de claves", () => {
    const lockout = createLockout(1, 1000, 2);
    lockout.registerFailure("a");
    lockout.registerFailure("b");
    expect(lockout.isLocked("a")).toBe(true);
    vi.advanceTimersByTime(1001);
    // Esta llamada dispara la poda: 'a' y 'b' llevan mas de lockoutMs sin intentos.
    lockout.registerFailure("c");
    expect(lockout.isLocked("a")).toBe(false);
    expect(lockout.isLocked("c")).toBe(true);
  });
});
