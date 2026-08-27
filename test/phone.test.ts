import { describe, expect, it } from "vitest";
import { suspiciousPhoneReason } from "@/lib/phone";

describe("suspiciousPhoneReason", () => {
  it("no evalua numeros de menos de 6 digitos (lo cubre el formato general)", () => {
    expect(suspiciousPhoneReason("11111")).toBeNull();
    expect(suspiciousPhoneReason("")).toBeNull();
    expect(suspiciousPhoneReason("abc")).toBeNull();
  });

  it("avisa cuando todos los digitos son iguales", () => {
    expect(suspiciousPhoneReason("0000000000")).toMatch(/todos los d/i);
    expect(suspiciousPhoneReason("(0412) 444-4444".replace(/0412/, "4444"))).toMatch(/todos los d/i);
    expect(suspiciousPhoneReason("111111")).toMatch(/todos los d/i);
  });

  it("avisa cuando los digitos van en secuencia ascendente o descendente", () => {
    expect(suspiciousPhoneReason("123456")).toMatch(/secuencia/i);
    expect(suspiciousPhoneReason("0123456789")).toMatch(/secuencia/i);
    expect(suspiciousPhoneReason("9876543210")).toMatch(/secuencia/i);
    expect(suspiciousPhoneReason("98765432")).toMatch(/secuencia/i);
  });

  it("ignora separadores al analizar", () => {
    expect(suspiciousPhoneReason("+1 (234) 56")).toMatch(/secuencia/i);
  });

  it("acepta telefonos plausibles", () => {
    expect(suspiciousPhoneReason("0412-1234567")).toBeNull();
    expect(suspiciousPhoneReason("+58 412 5551234")).toBeNull();
    expect(suspiciousPhoneReason("+57 300 8675309")).toBeNull();
    // Secuencia pero no contigua: no es sospechoso por esta regla.
    expect(suspiciousPhoneReason("135791")).toBeNull();
  });
});
