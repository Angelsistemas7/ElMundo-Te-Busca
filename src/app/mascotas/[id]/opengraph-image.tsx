import { ImageResponse } from "next/og";
import { getPetById } from "@/lib/data";
import { PET_SPECIES_LABEL, PET_STATUS_LABEL, type PetStatus } from "@/lib/types";
import { getLogoDataUrl, PLATFORM_BLURB, toEmbeddablePhoto } from "@/lib/ogImage";

// Tarjeta que se ve al compartir la ficha de una mascota (WhatsApp, redes).
// Mismo formato que la de una persona: foto real + estado + descripción.
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
// Ver la nota en persona/[id]/opengraph-image.tsx: sin esto se regenera
// (BD + descarga de foto + sharp) en cada petición de WhatsApp/redes.
export const revalidate = 3600;

const STATUS_COLOR: Record<PetStatus, string> = {
  perdida: "#f43f5e",
  encontrada: "#10b981",
  refugio: "#0ea5e9",
  veterinario: "#f59e0b",
};

export default async function PetOpengraphImage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const pet = await getPetById(id);
  const logoSrc = await getLogoDataUrl();
  const photoSrc = pet?.photoUrl ? await toEmbeddablePhoto(pet.photoUrl) : null;

  const displayName = pet?.name || (pet ? PET_SPECIES_LABEL[pet.species] : "Mascota");
  const statusColor = pet ? STATUS_COLOR[pet.status] : STATUS_COLOR.perdida;
  const statusLabel = pet ? PET_STATUS_LABEL[pet.status] : "Perdida";
  const cta = pet?.name
    ? `Ayudanos a encontrar a ${pet.name}. Su familia la espera.`
    : "Ayudanos a reunir a esta mascota con su familia.";

  return new ImageResponse(
    (
      // Mismo fondo claro tipo iOS que la tarjeta de persona (ver esa nota).
      <div
        style={{
          position: "relative",
          width: "100%",
          height: "100%",
          display: "flex",
          background: "linear-gradient(135deg, #ffffff 0%, #f2f2f7 100%)",
          padding: "56px 64px",
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={logoSrc}
          width={100}
          height={100}
          alt=""
          style={{ position: "absolute", top: "44px", right: "56px" }}
        />

        {/* Foto de la mascota (o silueta si no tiene) a la izquierda. */}
        <div
          style={{
            display: "flex",
            width: "420px",
            height: "100%",
            borderRadius: "28px",
            overflow: "hidden",
            flexShrink: 0,
            background: "#e2e0f0",
            border: `6px solid ${statusColor}`,
            boxShadow: "0 20px 45px rgba(29,27,64,0.14)",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {photoSrc ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={photoSrc} width={408} height={506} style={{ objectFit: "cover" }} alt="" />
          ) : (
            <div
              style={{
                display: "flex",
                width: "100%",
                height: "100%",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "160px",
              }}
            >
              {pet?.species === "gato" ? "🐈" : pet?.species === "perro" ? "🐕" : "🐾"}
            </div>
          )}
        </div>

        {/* Texto a la derecha. */}
        <div style={{ display: "flex", flexDirection: "column", flex: 1, paddingLeft: "52px" }}>
          <div style={{ display: "flex", fontSize: "28px", fontWeight: 700, color: "#b96a3a" }}>
            El Mundo Te Busca
          </div>

          <div
            style={{
              display: "flex",
              marginTop: "28px",
              alignSelf: "flex-start",
              padding: "8px 20px",
              borderRadius: "9999px",
              background: statusColor,
              color: "#ffffff",
              fontSize: "24px",
              fontWeight: 700,
            }}
          >
            {statusLabel}
          </div>

          <div
            style={{
              display: "flex",
              marginTop: "18px",
              fontSize: "58px",
              fontWeight: 800,
              color: "#16142f",
              lineHeight: 1.08,
            }}
          >
            {displayName}
          </div>

          <div style={{ display: "flex", marginTop: "24px", fontSize: "30px", color: "#475569", lineHeight: 1.35 }}>
            {cta}
          </div>

          <div style={{ display: "flex", marginTop: "16px", fontSize: "21px", color: "#94a3b8", lineHeight: 1.4 }}>
            {PLATFORM_BLURB}
          </div>

          <div style={{ display: "flex", marginTop: "auto", fontSize: "24px", fontWeight: 600, color: "#6f699e" }}>
            elmundotebusca.com
          </div>
        </div>
      </div>
    ),
    { ...size },
  );
}
