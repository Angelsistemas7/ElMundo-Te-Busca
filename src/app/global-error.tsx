"use client";

import { useEffect } from "react";

// Frontera de error de último recurso: solo se usa si falla el propio layout
// raíz. Debe traer sus etiquetas <html>/<body> porque reemplaza todo el árbol.
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[ui.global-error]", { digest: error.digest ?? "sin-digest" });
  }, [error]);

  return (
    <html lang="es">
      <body
        style={{
          fontFamily: "ui-sans-serif, system-ui, sans-serif",
          background: "#f8fafc",
          color: "#18181b",
          display: "flex",
          minHeight: "100vh",
          alignItems: "center",
          justifyContent: "center",
          margin: 0,
          padding: "1.5rem",
        }}
      >
        <div style={{ maxWidth: "26rem", textAlign: "center" }}>
          <h1 style={{ fontSize: "1.25rem", fontWeight: 700, margin: 0 }}>Algo salió mal</h1>
          <p style={{ marginTop: "0.5rem", color: "#52525b", fontSize: "0.9rem" }}>
            Tuvimos un problema al cargar la página. Vuelve a intentarlo en un momento.
          </p>
          <button
            onClick={reset}
            style={{
              marginTop: "1.25rem",
              background: "#fbbf24",
              color: "#18181b",
              border: 0,
              borderRadius: "0.75rem",
              padding: "0.6rem 1.1rem",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Reintentar
          </button>
        </div>
      </body>
    </html>
  );
}
