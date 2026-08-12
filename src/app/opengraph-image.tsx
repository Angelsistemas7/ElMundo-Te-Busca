import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

// Tarjeta que se ve al compartir el enlace (WhatsApp, redes). Sin acentos a
// propósito: la fuente por defecto de ImageResponse no incluye glifos
// acentuados y saldrían cuadros. Next la cablea como og:image y twitter:image.
// El texto es deliberadamente GENÉRICO (no nombra un país/evento concreto):
// la plataforma responde a cualquier emergencia, no solo a la actual.
export const alt = "El Mundo Te Busca — Respuesta ciudadana a tragedias en el mundo";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function OpengraphImage() {
  // El logo va incrustado como data URL (Satori no resuelve rutas relativas).
  const logo = await readFile(join(process.cwd(), "public", "logo.png"));
  const logoSrc = `data:image/png;base64,${logo.toString("base64")}`;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          gap: "56px",
          background: "linear-gradient(135deg, #16142f 0%, #1d1b40 55%, #332c5e 100%)",
          padding: "70px 80px",
        }}
      >
        {/* Logo dentro de una tarjeta blanca para que destaque sobre el fondo oscuro. */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: "300px",
            height: "300px",
            borderRadius: "36px",
            background: "#ffffff",
            flexShrink: 0,
            boxShadow: "0 20px 60px rgba(0,0,0,0.35)",
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={logoSrc} width={250} height={250} alt="" />
        </div>

        <div style={{ display: "flex", flexDirection: "column", flex: 1 }}>
          <div
            style={{
              display: "flex",
              fontSize: "76px",
              fontWeight: 800,
              color: "#ffffff",
              lineHeight: 1.05,
            }}
          >
            El Mundo Te Busca
          </div>
          {/* Acento naranja de marca. */}
          <div
            style={{ display: "flex", width: "180px", height: "8px", borderRadius: "4px", background: "#d3824a", marginTop: "24px" }}
          />
          <div style={{ display: "flex", marginTop: "28px", fontSize: "34px", color: "#cbd5e1", lineHeight: 1.3 }}>
            Localizar personas desaparecidas y coordinar ayuda ante cualquier emergencia, en cualquier parte del mundo
          </div>
          <div style={{ display: "flex", marginTop: "26px", fontSize: "26px", fontWeight: 600, color: "#f2af5e" }}>
            Iniciativa ciudadana, voluntaria y sin fines de lucro
          </div>
        </div>
      </div>
    ),
    { ...size },
  );
}
