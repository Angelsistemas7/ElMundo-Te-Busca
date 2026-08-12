// Aviso (no bloqueo) de "este número parece inventado". Es una regla simple
// y determinística —no un validador de operadoras ni un servicio externo—
// para casos obvios como "0000000000" o "123456789". El teléfono sigue
// siendo el dato para que puedan escribirle a quien reporta, así que solo se
// avisa: la persona decide si lo corrige o lo deja igual.
export function suspiciousPhoneReason(raw: string): string | null {
  const digits = raw.replace(/\D/g, "");
  if (digits.length < 6) return null; // muy corto para evaluar, lo cubre el formato general

  if (/^(\d)\1+$/.test(digits)) {
    return "Parece un número inventado: todos los dígitos son iguales.";
  }

  const ascending = "0123456789";
  const descending = "9876543210";
  if (ascending.includes(digits) || descending.includes(digits)) {
    return "Parece un número inventado: los dígitos van en secuencia.";
  }

  return null;
}
