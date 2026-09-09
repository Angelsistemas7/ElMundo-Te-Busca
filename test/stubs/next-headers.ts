// Doble de `next/headers` para las pruebas: fuera del grafo de Server
// Components no existe el almacen de peticion, asi que se guarda uno propio que
// las pruebas pueden preparar con `__setHeaders`.
let actuales = new Headers();

export function __setHeaders(init?: Record<string, string>): void {
  actuales = new Headers(init);
}

export async function headers(): Promise<Headers> {
  return actuales;
}
