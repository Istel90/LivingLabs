import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const COLLECTOR_TOKEN_SHA256 =
  "3a181d81e8af8af97fbab105e6a69f2138e89048daa252b8da4645dc838b5bc6";

const jsonHeaders = {
  "content-type": "application/json; charset=utf-8",
};

async function sha256(value: string) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function validStation(station: Record<string, unknown>) {
  const id = Number(station.station_id);
  const longitude = Number(station.longitude);
  const latitude = Number(station.latitude);
  const distance = Number(station.distance_from_suwon_km);
  return (
    Number.isInteger(id) &&
    id > 0 &&
    typeof station.station_name === "string" &&
    station.station_name.length > 0 &&
    longitude >= 120 &&
    longitude <= 135 &&
    latitude >= 30 &&
    latitude <= 40 &&
    distance >= 0 &&
    distance <= 35.01
  );
}

function validObservation(observation: Record<string, unknown>) {
  const id = Number(observation.station_id);
  const hour = Number(observation.hour_kst);
  const date = String(observation.observation_date || "");
  const observedAt = new Date(String(observation.observed_at || ""));
  return (
    Number.isInteger(id) &&
    id > 0 &&
    [13, 14, 15].includes(hour) &&
    /^\d{4}-\d{2}-\d{2}$/.test(date) &&
    date >= "2020-06-01" &&
    date <= "2026-09-30" &&
    [6, 7, 8, 9].includes(Number(date.slice(5, 7))) &&
    Number.isFinite(observedAt.getTime())
  );
}

Deno.serve(async (request) => {
  try {
    if (request.method !== "POST") {
      return new Response(JSON.stringify({ ok: false, error: "POST required" }), {
        status: 405,
        headers: jsonHeaders,
      });
    }

    const suppliedToken = request.headers.get("x-collector-token") || "";
    if (!suppliedToken || (await sha256(suppliedToken)) !== COLLECTOR_TOKEN_SHA256) {
      return new Response(JSON.stringify({ ok: false, error: "Unauthorized" }), {
        status: 401,
        headers: jsonHeaders,
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceRoleKey) {
      throw new Error("Supabase server environment is unavailable");
    }

    const body = await request.json();
    const action = String(body?.action || "batch");
    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    if (action === "start") {
      const { data, error } = await supabase.rpc("start_weather_collection_run", {
        p_period_start: body.period_start,
        p_period_end: body.period_end,
        p_requested_timestamps: Number(body.requested_timestamps || 0),
      });
      if (error) throw error;
      return new Response(JSON.stringify({ ok: true, run_id: data }), {
        headers: jsonHeaders,
      });
    }

    if (action === "finish") {
      const { data, error } = await supabase.rpc("finish_weather_collection_run", {
        p_run_id: body.run_id,
        p_status: body.status,
        p_completed_timestamps: Number(body.completed_timestamps || 0),
        p_upserted_rows: Number(body.upserted_rows || 0),
        p_error_details: body.error_details || [],
      });
      if (error) throw error;
      return new Response(JSON.stringify({ ok: true, result: data }), {
        headers: jsonHeaders,
      });
    }

    const stations = Array.isArray(body?.stations) ? body.stations : [];
    const observations = Array.isArray(body?.observations) ? body.observations : [];
    if (
      stations.length > 200 ||
      observations.length > 1200 ||
      !stations.every(validStation) ||
      !observations.every(validObservation)
    ) {
      return new Response(JSON.stringify({ ok: false, error: "Invalid batch" }), {
        status: 400,
        headers: jsonHeaders,
      });
    }

    const { data, error } = await supabase.rpc("ingest_weather_aws_batch", {
      p_stations: stations,
      p_observations: observations,
    });
    if (error) throw error;

    return new Response(JSON.stringify({ ok: true, ...data }), {
      headers: jsonHeaders,
    });
  } catch (error) {
    return new Response(
      JSON.stringify({ ok: false, error: error instanceof Error ? error.message : String(error) }),
      { status: 500, headers: jsonHeaders },
    );
  }
});
