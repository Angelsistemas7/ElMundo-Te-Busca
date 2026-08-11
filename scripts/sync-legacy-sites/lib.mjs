// Utilidades compartidas por sync-colombia.mjs y sync-venezuela.mjs.
import { createClient } from "@supabase/supabase-js";
import crypto from "node:crypto";

export function requireEnv(name) {
  const v = process.env[name];
  if (!v) {
    console.error(`Falta la variable de entorno ${name}.`);
    process.exit(1);
  }
  return v;
}

export function makeSupabase() {
  const url = requireEnv("NEXT_PUBLIC_SUPABASE_URL");
  const key = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
  return createClient(url, key, { auth: { persistSession: false } });
}

// Departamentos de Colombia y estados de Venezuela ya soportados por la
// plataforma (src/lib/countries.ts). Se mantiene una copia liviana aquí para
// no depender del código TypeScript de la app desde un script suelto.
export const CO_REGIONS = [
  "Amazonas", "Antioquia", "Arauca", "Atlántico", "Bolívar", "Boyacá", "Caldas", "Caquetá",
  "Casanare", "Cauca", "Cesar", "Chocó", "Córdoba", "Cundinamarca", "Guainía", "Guaviare",
  "Huila", "La Guajira", "Magdalena", "Meta", "Nariño", "Norte de Santander", "Putumayo",
  "Quindío", "Risaralda", "San Andrés y Providencia", "Santander", "Sucre", "Tolima",
  "Valle del Cauca", "Vaupés", "Vichada", "Bogotá",
].sort((a, b) => b.length - a.length);

export const VE_REGIONS = [
  "Amazonas", "Anzoátegui", "Apure", "Aragua", "Barinas", "Bolívar", "Carabobo", "Cojedes",
  "Delta Amacuro", "Distrito Capital", "Falcón", "Guárico", "Lara", "Mérida", "Miranda",
  "Monagas", "Nueva Esparta", "Portuguesa", "Sucre", "Táchira", "Trujillo", "La Guaira",
  "Yaracuy", "Zulia",
].sort((a, b) => b.length - a.length);

export function guessRegion(text, regions) {
  if (!text) return null;
  const norm = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const t = norm(text);
  for (const r of regions) if (t.includes(norm(r))) return r;
  return null;
}

export async function uploadPhotoFromUrl(sb, photoUrl) {
  if (!photoUrl) return null;
  try {
    const res = await fetch(photoUrl);
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    const contentType = res.headers.get("content-type") || "image/jpeg";
    const ext = contentType.includes("png") ? "png" : contentType.includes("webp") ? "webp" : "jpg";
    const name = `${crypto.randomUUID()}.${ext}`;
    const { error } = await sb.storage.from("photos").upload(name, buf, {
      cacheControl: "3600",
      upsert: false,
      contentType,
    });
    if (error) throw error;
    return sb.storage.from("photos").getPublicUrl(name).data.publicUrl;
  } catch (e) {
    console.error("  [foto] no se pudo subir:", e.message);
    return null;
  }
}

// Inserta o actualiza por (external_source, external_id). Si ya existe, no
// vuelve a subir la foto (deja la que ya está). Devuelve "inserted" | "skipped" | "error".
export async function upsertPerson(sb, row) {
  const { data: existing, error: selErr } = await sb
    .from("persons")
    .select("id")
    .eq("external_source", row.external_source)
    .eq("external_id", row.external_id)
    .maybeSingle();
  if (selErr) return { status: "error", error: selErr.message };
  if (existing) return { status: "skipped" };

  const { error } = await sb.from("persons").insert(row);
  if (error) return { status: "error", error: error.message };
  return { status: "inserted" };
}
