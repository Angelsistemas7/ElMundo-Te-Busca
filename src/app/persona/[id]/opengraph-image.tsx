import { ImageResponse } from "next/og";
import { getPersonById } from "@/lib/data";
import { PERSON_STATUS_LABEL, type PersonStatus } from "@/lib/types";
import { getLogoDataUrl, PLATFORM_BLURB, toEmbeddablePhoto } from "@/lib/ogImage";

// Tarjeta que se ve al compartir la ficha de una persona (WhatsApp, redes).
// A diferencia de la genérica del inicio, esta trae la FOTO real (si tiene) y
// un texto que invita a ayudar a localizarla — mucho más movilizador que solo
// el logo. Sin acentos: la fuente por defecto de ImageResponse no los trae.
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
// Sin esto, esta imagen se regenera desde cero (consulta a la BD + descarga
// de la foto + reconversión con sharp) en CADA petición — y WhatsApp/
// Telegram/Facebook vuelven a pedirla cada vez que alguien reenvía el
// enlace. Con la página compartiéndose activamente, eso compite por CPU con
// el único proceso Node que atiende a todos los visitantes (ver
// ecosystem.config.cjs: instances 1, fork). Una vista previa de compartir no
// necesita ser al segundo: se cachea 1 hora.
export const revalidate = 3600;

const STATUS_COLOR: Record<PersonStatus, string> = {
  por_localizar: "#f43f5e",
  hospitalizado: "#f59e0b",
  localizado: "#10b981",
  fallecido: "#71717a",
};

export default async function PersonOpengraphImage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const person = await getPersonById(id);
  const logoSrc = await getLogoDataUrl();
  const photoSrc = person?.photoUrl ? await toEmbeddablePhoto(person.photoUrl) : null;

  const fullName = person ? `${person.firstName} ${person.lastName}`.trim() : "";
  const displayName =
    person && person.isUnidentified && !fullName ? "Persona sin identificar" : fullName || "Persona desaparecida";
  const statusColor = person ? STATUS_COLOR[person.status] : STATUS_COLOR.por_localizar;
  const statusLabel = person ? PERSON_STATUS_LABEL[person.status] : "Se busca";
  const cta =
    person?.isUnidentified
      ? `Alguien vio a ${displayName === "Persona sin identificar" ? "esta persona" : displayName} y no se sabe quien es. Si la reconoces, avisa.`
      : `Ayudanos a localizar a ${displayName}. Sus familiares esperan verlo pronto.`;

  return new ImageResponse(
    (
      // Fondo claro tipo iOS (blanco con un gris de sistema sutil), en vez del
      // degradado oscuro anterior: el logo ya tiene su propio contraste
      // (corazón navy/ámbar sobre transparente), así que no necesita una
      // tarjeta oscura detrás para leerse.
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
        {/* Logo grande como marca, en la esquina donde no hay información. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={logoSrc}
          width={100}
          height={100}
          alt=""
          style={{ position: "absolute", top: "44px", right: "56px" }}
        />

        {/* Foto de la persona (o iniciales si no tiene) a la izquierda. */}
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
                fontWeight: 800,
                color: "#6f699e",
              }}
            >
              {displayName === "Persona sin identificar" ? "?" : displayName.slice(0, 1)}
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
