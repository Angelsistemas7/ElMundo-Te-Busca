import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

// Arnes de pruebas unitarias de la logica pura de `src/lib` (validacion zod,
// utilidades, geo, limites de tasa, rama en memoria de la capa de datos).
// No arranca Next ni toca red/Supabase.
//
// `server-only` y `next/headers` no se pueden importar en Node plano (el
// paquete `server-only` esta pensado para el grafo de React Server
// Components y revienta al importarse desde otro entorno). Los modulos bajo
// prueba lo importan de forma transitiva (data.ts -> auth.ts -> ipLockout.ts),
// asi que se sustituyen por dobles minimos en test/stubs/.
export default defineConfig({
  resolve: {
    alias: [
      { find: /^@\/(.*)$/, replacement: fileURLToPath(new URL("./src/$1", import.meta.url)) },
      { find: "server-only", replacement: fileURLToPath(new URL("./test/stubs/server-only.ts", import.meta.url)) },
      { find: "next/headers", replacement: fileURLToPath(new URL("./test/stubs/next-headers.ts", import.meta.url)) },
    ],
  },
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
    coverage: {
      provider: "v8",
      reportsDirectory: "coverage",
      include: ["src/lib/**/*.ts"],
      // Datos de ejemplo y hooks de React: no son logica que estas pruebas cubran.
      exclude: ["src/lib/seed.ts", "src/lib/use*.ts"],
      reporter: ["text", "html"],
    },
  },
});
