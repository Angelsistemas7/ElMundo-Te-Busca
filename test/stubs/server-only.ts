// Doble de `server-only`: el paquete real solo existe para que el empaquetador
// falle si un modulo de servidor acaba en el bundle del cliente. En pruebas
// unitarias no aporta nada y su import lanza fuera del grafo RSC.
export {};
