"use client";

import { getSupabase } from "./supabase";

// Sube una foto a Supabase Storage (bucket público "photos") desde el
// navegador y devuelve la URL pública. Si Supabase no está configurado,
// devuelve null y la app continúa sin foto persistida.
// Solo imágenes raster (sin SVG, que podría ejecutar scripts) y con tope de
// tamaño. Esto es defensa en el cliente; el control DURO debe estar también en
// el bucket de Supabase (allowedMimeTypes + fileSizeLimit) porque la clave anon
// permite subir directamente. Ver docs/GUIA-DESPLIEGUE.md.
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
const MAX_BYTES = 8 * 1024 * 1024; // 8 MB

export async function uploadPhoto(file: File): Promise<string | null> {
  const sb = getSupabase();
  if (!sb) return null;

  if (!ALLOWED_TYPES.includes(file.type as (typeof ALLOWED_TYPES)[number])) {
    throw new Error("Tipo de imagen no permitido (usa JPG, PNG o WebP).");
  }
  if (file.size > MAX_BYTES) {
    throw new Error("La imagen es demasiado grande (máx. 8 MB).");
  }

  // Extensión derivada del tipo MIME, no del nombre (que controla el usuario).
  const ext = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
  const name = `${crypto.randomUUID()}.${ext}`;

  const { error } = await sb.storage.from("photos").upload(name, file, {
    cacheControl: "3600",
    upsert: false,
    contentType: file.type,
  });
  if (error) throw error;

  const { data } = sb.storage.from("photos").getPublicUrl(name);
  return data.publicUrl;
}

// SHA-256 de los bytes del archivo (Web Crypto, sin librerías). Determinístico
// y barato: sirve para detectar el MISMO archivo repetido entre publicaciones
// (aviso de posible duplicado), no es reconocimiento facial ni un modelo de IA.
export async function hashFile(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  const digest = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
