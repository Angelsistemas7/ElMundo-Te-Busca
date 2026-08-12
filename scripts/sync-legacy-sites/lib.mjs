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

// Devuelve la URL pública subida y el SHA-256 de los bytes (determinístico,
// no un hash perceptual ni IA): sirve para detectar más adelante si la MISMA
// foto ya fue importada en otro registro (aviso de posible duplicado).
export async function uploadPhotoFromUrl(sb, photoUrl) {
  if (!photoUrl) return { url: null, hash: null };
  try {
    const res = await fetch(photoUrl);
    if (!res.ok) return { url: null, hash: null };
    const buf = Buffer.from(await res.arrayBuffer());
    const hash = crypto.createHash("sha256").update(buf).digest("hex");
    const contentType = res.headers.get("content-type") || "image/jpeg";
    const ext = contentType.includes("png") ? "png" : contentType.includes("webp") ? "webp" : "jpg";
    const name = `${crypto.randomUUID()}.${ext}`;
    const { error } = await sb.storage.from("photos").upload(name, buf, {
      cacheControl: "3600",
      upsert: false,
      contentType,
    });
    if (error) throw error;
    return { url: sb.storage.from("photos").getPublicUrl(name).data.publicUrl, hash };
  } catch (e) {
    console.error("  [foto] no se pudo subir:", e.message);
    return { url: null, hash: null };
  }
}

function normalizeName(s) {
  return (s || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toLowerCase();
}

function nameTokens(s) {
  return normalizeName(s)
    .split(/\s+/)
    .filter((t) => t.length >= 3);
}

function sharedTokenCount(a, b) {
  const setB = new Set(nameTokens(b));
  return nameTokens(a).filter((t) => setB.has(t)).length;
}

// Busca en la base un registro que probablemente sea la misma persona: por
// cédula exacta, por la MISMA foto (mismo hash) o por 2+ palabras del nombre
// en común. Igual criterio que `findPersonDuplicates` en src/lib/data.ts,
// reescrito acá porque este script corre suelto en Node, sin importar TS.
// No bloquea el import: solo devuelve el id para dejarlo marcado y que un
// moderador lo revise en /admin — puede ser gente real con una sola foto.
async function findDuplicateMatch(sb, { firstName, lastName, cedula, photoHash, country }) {
  const cedulaDigits = (cedula || "").replace(/\D/g, "");
  const tokens = nameTokens(`${firstName} ${lastName}`);

  if (cedulaDigits) {
    const { data } = await sb
      .from("persons")
      .select("id")
      .eq("country", country)
      .ilike("cedula", `%${cedulaDigits}%`)
      .limit(1);
    if (data?.[0]) return data[0].id;
  }
  if (photoHash) {
    const { data } = await sb
      .from("persons")
      .select("id")
      .eq("country", country)
      .eq("photo_hash", photoHash)
      .limit(1);
    if (data?.[0]) return data[0].id;
  }
  if (tokens.length >= 2) {
    const { data } = await sb
      .from("persons")
      .select("id, first_name, last_name")
      .eq("country", country)
      .or(tokens.map((t) => `first_name.ilike.%${t}%,last_name.ilike.%${t}%`).join(","))
      .limit(30);
    for (const row of data ?? []) {
      if (sharedTokenCount(`${firstName} ${lastName}`, `${row.first_name} ${row.last_name}`) >= 2) {
        return row.id;
      }
    }
  }
  return null;
}

// Inserta o actualiza por (external_source, external_id). Si ya existe, no
// vuelve a subir la foto (deja la que ya está). Antes de insertar revisa
// duplicados (cédula, foto idéntica o nombre parecido) y marca el registro
// nuevo con `possible_duplicate`/`duplicate_match_id` si encuentra algo — sin
// dejar de importarlo. Devuelve "inserted" | "skipped" | "error".
export async function upsertPerson(sb, row) {
  const { data: existing, error: selErr } = await sb
    .from("persons")
    .select("id")
    .eq("external_source", row.external_source)
    .eq("external_id", row.external_id)
    .maybeSingle();
  if (selErr) return { status: "error", error: selErr.message };
  if (existing) return { status: "skipped" };

  const duplicateMatchId = await findDuplicateMatch(sb, {
    firstName: row.first_name,
    lastName: row.last_name,
    cedula: row.cedula,
    photoHash: row.photo_hash,
    country: row.country,
  }).catch(() => null); // el import sigue aunque falle el chequeo de duplicados

  const { error } = await sb.from("persons").insert({
    ...row,
    possible_duplicate: duplicateMatchId !== null,
    duplicate_match_id: duplicateMatchId,
  });
  if (error) return { status: "error", error: error.message };
  return { status: "inserted", possibleDuplicate: duplicateMatchId !== null };
}
