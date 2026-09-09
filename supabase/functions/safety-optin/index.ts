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
const TEST_ALERTS_ENABLED = Deno.env.get("ENABLE_SAFETY_TEST_ALERTS") === "true";

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

  const { action } = body;

  const db = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  // Única acción que no está atada a un device_id: la usa un voluntario
  // autenticado, no un dispositivo con la Red de auxilio activa.
  if (action === "list-needs-help") {
    const authHeader = req.headers.get("Authorization") ?? "";
    const jwt = authHeader.replace(/^Bearer\s+/i, "");
    if (!jwt) return json({ error: "unauthorized" }, 401);

    const { data: userRes, error: userError } = await db.auth.getUser(jwt);
    if (userError || !userRes.user) return json({ error: "unauthorized" }, 401);

    const { data: rol, error: rolError } = await db
      .from("app_roles")
      .select("role")
      .eq("user_id", userRes.user.id)
      .eq("role", "volunteer")
      .maybeSingle();
    if (rolError) {
      console.error("safety-optin list-needs-help role", rolError.code);
      return json({ error: "db_error" }, 500);
    }
    if (!rol) return json({ error: "forbidden" }, 403);

    // Ventana de espera del push antes de considerar 'no_response': ver §5 de
    // 10-alerta-sismo-checkin.md. Se resuelve aquí mismo (sin cron aparte)
    // porque un voluntario solo necesita la lista al momento de mirarla.
    const limiteEspera = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    const { error: pendingError } = await db
      .from("safety_checkins")
      .update({ status: "no_response" })
      .eq("status", "pending")
      .is("resolved_at", null)
      .lt("notified_at", limiteEspera);
    if (pendingError) {
      console.error("safety-optin list-needs-help pending", pendingError.code);
      return json({ error: "db_error" }, 500);
    }

    const { data: checkins, error: listError } = await db
      .from("safety_checkins")
      .select(
        "id, quake_id, status, lat, lng, notified_at, responded_at, " +
          "safety_optins(user_id, country, last_lat, last_lng, last_location_at)",
      )
      .in("status", ["needs_help", "no_response"])
      .is("resolved_at", null)
      .order("notified_at", { ascending: false })
      .limit(50);
    if (listError) {
      console.error("safety-optin list-needs-help list", listError.code);
      return json({ error: "db_error" }, 500);
    }

    const userIds = Array.from(
      new Set(
        (checkins ?? [])
          .map((c) => (c.safety_optins as { user_id: string | null } | null)?.user_id)
          .filter((id): id is string => Boolean(id)),
      ),
    );
    const perfiles = new Map<string, { username: string; blood_type: string | null }>();
    if (userIds.length > 0) {
      const { data: filas, error: perfilError } = await db
        .from("profiles")
        .select("user_id, username, blood_type")
        .in("user_id", userIds);
      if (perfilError) {
        console.error("safety-optin list-needs-help profiles", perfilError.code);
      } else {
        for (const p of filas ?? []) {
          perfiles.set(p.user_id as string, {
            username: p.username as string,
            blood_type: p.blood_type as string | null,
          });
        }
      }
    }

    const resultado = (checkins ?? []).map((c) => {
      const optin = c.safety_optins as {
        user_id: string | null;
        country: string;
        last_lat: number | null;
        last_lng: number | null;
        last_location_at: string | null;
      } | null;
      const perfil = optin?.user_id ? perfiles.get(optin.user_id) : undefined;
      const lastLocationAt = optin?.last_location_at
        ? Date.parse(optin.last_location_at)
        : Number.NaN;
      const notifiedAt = Date.parse(c.notified_at as string);
      const hasCurrentLocation =
        optin?.last_lat != null &&
        optin.last_lng != null &&
        Number.isFinite(lastLocationAt) &&
        Number.isFinite(notifiedAt) &&
        lastLocationAt >= notifiedAt;
      return {
        id: c.id,
        quake_id: c.quake_id,
        status: c.status,
        notified_at: c.notified_at,
        responded_at: c.responded_at,
        lat: hasCurrentLocation ? optin.last_lat : c.lat,
        lng: hasCurrentLocation ? optin.last_lng : c.lng,
        username: perfil?.username ?? null,
        blood_type: perfil?.blood_type ?? null,
      };
    });

    return json({ ok: true, checkins: resultado });
  }

  const { device_id: deviceId } = body;
  if (!esDeviceIdValido(deviceId)) {
    return json({ error: "invalid_device_id" }, 400);
  }

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
    // USGS. Está deshabilitado por defecto: solo se habilita temporalmente en
    // un entorno controlado con ENABLE_SAFETY_TEST_ALERTS=true.
    case "test-alert": {
      if (!TEST_ALERTS_ENABLED) {
        return json({ error: "test_alerts_disabled" }, 403);
      }
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

    // Sondeo del propio dispositivo: ¿tengo un check-in sin resolver ahora
    // mismo? Se llama en un timer corto mientras la app está en primer plano
    // (no hay push real todavía — ver §7 de 10-alerta-sismo-checkin.md).
    case "poll": {
      const { data: optin, error: findError } = await db
        .from("safety_optins")
        .select("id")
        .eq("device_id", deviceId)
        .eq("active", true)
        .maybeSingle();
      if (findError) {
        console.error("safety-optin poll find", findError.code);
        return json({ error: "db_error" }, 500);
      }
      if (!optin) return json({ ok: true, checkin: null });

      const { data: checkin, error: checkinError } = await db
        .from("safety_checkins")
        .select("quake_id, status, notified_at")
        .eq("optin_id", optin.id)
        .is("resolved_at", null)
        .order("notified_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (checkinError) {
        console.error("safety-optin poll checkin", checkinError.code);
        return json({ error: "db_error" }, 500);
      }
      return json({ ok: true, checkin: checkin ?? null });
    }

    // Respuesta al push "¿Estás bien?" — 'ok' o 'needs_help'. Si no responde,
    // `list-needs-help` marca 'no_response' pasada la ventana de espera.
    case "respond": {
      const { quake_id: quakeId, status } = body;
      if (typeof quakeId !== "string" || quakeId.length === 0 || quakeId.length > 128) {
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

      const { data: updated, error } = await db
        .from("safety_checkins")
        .update(update)
        .eq("optin_id", optin.id)
        .eq("quake_id", quakeId)
        .is("resolved_at", null)
        .select("id")
        .maybeSingle();
      if (error) {
        console.error("safety-optin respond", error.code);
        return json({ error: "db_error" }, 500);
      }
      if (!updated) return json({ error: "checkin_not_found" }, 404);
      return json({ ok: true });
    }

    default:
      return json({ error: "invalid_action" }, 400);
  }
});
