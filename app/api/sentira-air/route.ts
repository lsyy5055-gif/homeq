import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function getSupabaseAdmin() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Missing Supabase env variables");
  }

  return createClient(supabaseUrl, serviceRoleKey);
}

export async function GET() {
  try {
    const supabase = getSupabaseAdmin();

    const { data, error } = await supabase
      .from("sensor_readings")
      .select("*")
      .order("id", { ascending: false })
      .limit(12);

    if (error) {
      console.error("[Supabase Select Error]", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(
      {
        ok: true,
        latest: data?.[0] ?? null,
        history: data ? [...data].reverse() : [],
      },
      { status: 200 }
    );
  } catch (err) {
    console.error("[API GET Error]", err);
    return NextResponse.json(
      { error: "Failed to fetch sensor readings" },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const supabase = getSupabaseAdmin();

    const payload = {
      serial_number: body.serial_number ?? "SA-0001",
      temperature: body.temperature ?? null,
      humidity: body.humidity ?? null,
      co2: body.co2 ?? null,
      voc: body.voc ?? null,
      window_temp: body.window_temp ?? null,
      dew_point: body.dew_point ?? null,
      fan_percent: body.fan_percent ?? null,
      ptc_percent: body.ptc_percent ?? null,
      condensation_risk: body.condensation_risk ?? null,
      air_quality_status: body.air_quality_status ?? null,
      ai_message: body.ai_message ?? null,
    };

    const { data, error } = await supabase
      .from("sensor_readings")
      .insert(payload)
      .select()
      .single();

    if (error) {
      console.error("[Supabase Insert Error]", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, data }, { status: 200 });
  } catch (err) {
    console.error("[API POST Error]", err);
    return NextResponse.json(
      { error: "Invalid request" },
      { status: 400 }
    );
  }
}