/**
 * Limpia el parámetro `next` (a dónde se sigue viaje después de ingresar).
 *
 * Viene de la URL, o sea de quien manda el enlace, así que solo se acepta una
 * ruta interna. No basta con "empieza por / y no por //": los navegadores
 * convierten la barra invertida en barra normal, así que `/\evil.com` termina
 * navegando a `//evil.com`, es decir a otro dominio, y con la sesión ya
 * iniciada. Por eso se rechaza cualquier barra invertida y los caracteres de
 * control (que también se usan para colar `//` disimulado).
 */
export function safeNextPath(next: string | null | undefined, fallback = "/"): string {
  if (!next) return fallback;
  if (!next.startsWith("/")) return fallback;
  if (next.startsWith("//")) return fallback;
  if (next.includes("\\")) return fallback;
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f]/.test(next)) return fallback;
  return next;
}
