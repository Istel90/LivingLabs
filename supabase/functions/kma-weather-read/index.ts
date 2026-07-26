import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.95.0";

const corsHeaders = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization, x-client-info, apikey, content-type",
  "access-control-allow-methods": "POST, OPTIONS",
  "content-type": "application/json; charset=utf-8",
};

function response(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders });
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (request.method !== "POST") {
    return response({ ok: false, error: "POST required" }, 405);
  }

  try {
    const body = await request.json();
    const action = String(body?.action || "map");
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceRoleKey) {
      throw new Error("Supabase server environment is unavailable");
    }

    const database = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    if (action === "availability") {
      const { data, error } = await database.rpc("read_weather_availability");
      if (error) throw error;
      return response({ ok: true, ...data });
    }

    const date = String(body?.date || "");
    const hour = Number(body?.hour);
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
      date < "2020-06-01" ||
      date > "2026-09-30" ||
      ![6, 7, 8, 9].includes(Number(date.slice(5, 7))) ||
      ![13, 14, 15].includes(hour)
    ) {
      return response({ ok: false, error: "Invalid date or hour" }, 400);
    }

    const { data, error } = await database.rpc("read_weather_map", {
      p_date: date,
      p_hour: hour,
    });
    if (error) throw error;
    return response(data);
  } catch (error) {
    return response(
      { ok: false, error: error instanceof Error ? error.message : String(error) },
      500,
    );
  }
});
