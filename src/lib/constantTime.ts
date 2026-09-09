// Comparación de secretos sin filtrar por temporización. `===` sobre strings
// corta en el primer byte distinto, así que el tiempo de respuesta revela
// cuánto prefijo acertó quien prueba tokens (enlaces de gestión, CRON_SECRET,
// cookie de admin). Esta versión no usa `node:crypto` a propósito: también
// tiene que funcionar en el middleware, que corre en el runtime Edge.
export function constantTimeEqual(a: string, b: string): boolean {
  const encoder = new TextEncoder();
  const bufA = encoder.encode(a);
  const bufB = encoder.encode(b);
  const len = Math.max(bufA.length, bufB.length, 1);
  let diff = bufA.length ^ bufB.length;
  for (let i = 0; i < len; i++) diff |= (bufA[i] ?? 0) ^ (bufB[i] ?? 0);
  return diff === 0;
}
