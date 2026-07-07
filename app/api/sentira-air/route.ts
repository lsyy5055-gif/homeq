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

    const { data: sensorData, error: sensorError } = await supabase
      .from("sensor_readings")
      .select("*")
      .order("id", { ascending: false })
      .limit(12);

    if (sensorError) {
      return NextResponse.json({ error: sensorError.message }, { status: 500 });
    }

    const { data: controlData } = await supabase
      .from("device_controls")
      .select("*")
      .eq("serial_number", "SA-0001")
      .single();

    return NextResponse.json(
      {
        ok: true,
        latest: sensorData?.[0] ?? null,
        history: sensorData ? [...sensorData].reverse() : [],
        controls: controlData ?? {
          mode: "auto",
          fan_percent: 40,
          fan1_percent: 40,
          fan2_percent: 40,
          ptc_percent: 0,
        },
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
    const serialNum = body.serial_number ?? "SA-0001";

    const payload = {
      serial_number: serialNum,
      temperature: body.temperature ?? null,
      humidity: body.humidity ?? null,
      body_temp: body.body_temp ?? body.temperature ?? null,
      body_humidity: body.body_humidity ?? body.humidity ?? null,
      co2: body.co2 ?? null,
      voc: body.voc ?? null,
      outdoor_temp: body.outdoor_temp ?? body.ntc1_temp ?? null,
      heater_temp: body.heater_temp ?? body.ntc2_temp ?? null,
      ntc1_temp: body.ntc1_temp ?? null,
      ntc2_temp: body.ntc2_temp ?? null,
      window_temp: body.window_temp ?? null,
      dew_point: body.dew_point ?? null,
      fan_percent: body.fan_percent ?? null,
      fan1_percent: body.fan1_percent ?? null,
      fan2_percent: body.fan2_percent ?? null,
      ptc_percent: body.ptc_percent ?? null,
      auto_heater_percent: body.auto_heater_percent ?? null,
      condensation_risk: body.condensation_risk ?? null,
      air_quality_status: body.air_quality_status ?? null,
      ai_message: body.ai_message ?? null,
    };

    const { error: insertError } = await supabase
      .from("sensor_readings")
      .insert(payload);

    if (insertError) {
      console.error("[Supabase Insert Error]", insertError);
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }

    let { data: controlData } = await supabase
      .from("device_controls")
      .select("*")
      .eq("serial_number", serialNum)
      .single();

    if (!controlData) {
      const { data: newControl } = await supabase
        .from("device_controls")
        .insert({
          serial_number: serialNum,
          mode: "auto",
          fan_percent: 40,
          fan1_percent: 40,
          fan2_percent: 40,
          ptc_percent: 0,
        })
        .select()
        .single();

      controlData = newControl;
    }

    const fan1 = controlData?.fan1_percent ?? controlData?.fan_percent ?? 40;
    const fan2 = controlData?.fan2_percent ?? controlData?.fan_percent ?? 40;

    return NextResponse.json(
      {
        ok: true,
        mode: controlData?.mode ?? "auto",
        fan_percent: Math.max(fan1, fan2),
        fan1_percent: fan1,
        fan2_percent: fan2,
        heater_percent: controlData?.ptc_percent ?? 0,
      },
      { status: 200 }
    );
  } catch (err) {
    console.error("[API POST Error]", err);
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}

export async function PATCH(req: Request) {
  try {
    const body = await req.json();
    const supabase = getSupabaseAdmin();
    const serialNum = body.serial_number ?? "SA-0001";

    const updatePayload: Record<string, any> = {};

    if (body.mode !== undefined) updatePayload.mode = body.mode;
    if (body.fan_percent !== undefined) updatePayload.fan_percent = body.fan_percent;
    if (body.fan1_percent !== undefined) updatePayload.fan1_percent = body.fan1_percent;
    if (body.fan2_percent !== undefined) updatePayload.fan2_percent = body.fan2_percent;
    if (body.ptc_percent !== undefined) updatePayload.ptc_percent = body.ptc_percent;

    updatePayload.updated_at = new Date().toISOString();

    const { data, error } = await supabase
      .from("device_controls")
      .update(updatePayload)
      .eq("serial_number", serialNum)
      .select()
      .single();

    if (error) {
      console.error("[Supabase Update Error]", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, data }, { status: 200 });
  } catch (err) {
    console.error("[API PATCH Error]", err);
    return NextResponse.json({ error: "Invalid PATCH request" }, { status: 400 });
  }
}