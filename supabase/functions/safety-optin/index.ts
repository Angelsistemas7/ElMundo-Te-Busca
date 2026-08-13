// Red de auxilio — check-in "¿estás bien?" tras un sismo.
//
// Policy enforcement point para safety_optins/safety_checkins (ver
// supabase/schema.sql y plan-app-movil/investigacion-tecnica/10-alerta-sismo-checkin.md
// en MundoTebuscaAPP). El cliente Flutter NUNCA toca estas tablas con la anon
// key: pasa siempre por aquí, que usa la service role y valida todo antes de
// escribir. No es un proxy — cada acción tiene su propia validación.
//
// Deploy: supabase functions deploy safety-optin

import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

const PAISES_VALIDOS = new Set(["co", "ve"]);

function esCoordenadaValida(lat: unknown, lng: unknown): lat is number {
  return (
    typeof lat === "number" &&
    typeof lng === "number" &&
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180
  );
}

function esDeviceIdValido(deviceId: unknown): deviceId is string {
  // DeviceId.get() en Flutter genera un uuid v4 — no aceptamos cualquier string.
  return (
    typeof deviceId === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      deviceId,
    )
  );
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid_json" }, 400);
  }

  const { action, device_id: deviceId } = body;

  if (!esDeviceIdValido(deviceId)) {
    return json({ error: "invalid_device_id" }, 400);
  }

  const db = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  switch (action) {
    case "activate": {
      const { country, lat, lng, push_token: pushToken } = body;
      if (typeof country !== "string" || !PAISES_VALIDOS.has(country)) {
        return json({ error: "invalid_country" }, 400);
      }
      if (!esCoordenadaValida(lat, lng)) {
        return json({ error: "invalid_location" }, 400);
      }

      const { error } = await db.from("safety_optins").upsert(
        {
          device_id: deviceId,
          country,
          last_lat: lat,
          last_lng: lng,
          last_location_at: new Date().toISOString(),
          push_token: typeof pushToken === "string" ? pushToken : null,
          active: true,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "device_id" },
      );
      if (error) {
        console.error("safety-optin activate", error.code);
        return json({ error: "db_error" }, 500);
      }
      return json({ ok: true, active: true });
    }

    case "deactivate": {
      const { error } = await db
        .from("safety_optins")
        .update({ active: false, updated_at: new Date().toISOString() })
        .eq("device_id", deviceId);
      if (error) {
        console.error("safety-optin deactivate", error.code);
        return json({ error: "db_error" }, 500);
      }
      return json({ ok: true, active: false });
    }

    case "update-location": {
      const { lat, lng } = body;
      if (!esCoordenadaValida(lat, lng)) {
        return json({ error: "invalid_location" }, 400);
      }
      const { data, error } = await db
        .from("safety_optins")
        .update({
          last_lat: lat,
          last_lng: lng,
          last_location_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("device_id", deviceId)
        .eq("active", true)
        .select("id")
        .maybeSingle();
      if (error) {
        console.error("safety-optin update-location", error.code);
        return json({ error: "db_error" }, 500);
      }
      // No es error que no exista fila (nunca se activó, o está inactiva):
      // el cliente llama esto oportunistamente en cada apertura de la app.
      return json({ ok: true, updated: Boolean(data) });
    }

    // Dispara un check-in de prueba sin esperar un sismo real ni el cron de
    // USGS (que todavía no existe) — para poder probar el flujo completo
    // (push + botones + compartir ubicación) de punta a punta hoy mismo.
    case "test-alert": {
      const { data: optin, error: findError } = await db
        .from("safety_optins")
        .select("id, last_lat, last_lng")
        .eq("device_id", deviceId)
        .eq("active", true)
        .maybeSingle();
      if (findError) {
        console.error("safety-optin test-alert find", findError.code);
        return json({ error: "db_error" }, 500);
      }
      if (!optin) return json({ error: "not_opted_in" }, 404);

      const quakeId = `manual-test-${Date.now()}`;
      const { error: insertError } = await db.from("safety_checkins").insert({
        optin_id: optin.id,
        quake_id: quakeId,
        status: "pending",
        lat: optin.last_lat,
        lng: optin.last_lng,
      });
      if (insertError) {
        console.error("safety-optin test-alert insert", insertError.code);
        return json({ error: "db_error" }, 500);
      }
      return json({ ok: true, quake_id: quakeId });
    }

    // Respuesta al push "¿Estás bien?" — 'ok' o 'needs_help'. Si no responde,
    // un cron aparte (todavía no implementado) marca 'no_response' pasada la
    // ventana de espera (ver §5 de 10-alerta-sismo-checkin.md).
    case "respond": {
      const { quake_id: quakeId, status } = body;
      if (typeof quakeId !== "string" || quakeId.length === 0) {
        return json({ error: "invalid_quake_id" }, 400);
      }
      if (status !== "ok" && status !== "needs_help") {
        return json({ error: "invalid_status" }, 400);
      }

      const { data: optin, error: findError } = await db
        .from("safety_optins")
        .select("id")
        .eq("device_id", deviceId)
        .maybeSingle();
      if (findError) {
        console.error("safety-optin respond find", findError.code);
        return json({ error: "db_error" }, 500);
      }
      if (!optin) return json({ error: "not_opted_in" }, 404);

      const update: Record<string, unknown> = {
        status,
        responded_at: new Date().toISOString(),
      };
      if (status === "ok") update.resolved_at = new Date().toISOString();

      const { error } = await db
        .from("safety_checkins")
        .update(update)
        .eq("optin_id", optin.id)
        .eq("quake_id", quakeId);
      if (error) {
        console.error("safety-optin respond", error.code);
        return json({ error: "db_error" }, 500);
      }
      return json({ ok: true });
    }

    default:
      return json({ error: "invalid_action" }, 400);
  }
});
