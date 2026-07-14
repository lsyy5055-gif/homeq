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

const ALLOWED_LOCATIONS = new Set(["glass", "frame", "both"]);

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const supabase = getSupabaseAdmin();

    const serialNumber = body.serial_number ?? "SA-0001";
    const location = ALLOWED_LOCATIONS.has(body.location)
      ? body.location
      : "glass";

    const eventPayload = {
      serial_number: serialNumber,
      event_type: "manual_confirmed",
      location,
      note: typeof body.note === "string" ? body.note.slice(0, 500) : null,

      sensor_reading_id: body.sensor_reading_id ?? null,
      moisture_pf: body.moisture_pf ?? null,
      surface_temp: body.surface_temp ?? null,
      air_temp: body.air_temp ?? null,
      air_humidity: body.air_humidity ?? null,

      body_temp: body.body_temp ?? null,
      body_humidity: body.body_humidity ?? null,
      outdoor_temp: body.outdoor_temp ?? null,
      heater_temp: body.heater_temp ?? null,
      dew_point: body.dew_point ?? null,
      condensation_risk: body.condensation_risk ?? null,
      co2: body.co2 ?? null,
      voc: body.voc ?? null,
      fan1_percent: body.fan1_percent ?? null,
      fan2_percent: body.fan2_percent ?? null,
      ptc_percent: body.ptc_percent ?? null,
      glass_moisture_detected: body.glass_moisture_detected ?? false,
    };

    const { data: eventData, error: eventError } = await supabase
      .from("condensation_events")
      .insert(eventPayload)
      .select()
      .single();

    if (eventError) {
      console.error("[Condensation Event Insert Error]", eventError);
      return NextResponse.json(
        { ok: false, error: eventError.message },
        { status: 500 }
      );
    }

    let readingId = body.sensor_reading_id ?? null;

    if (!readingId) {
      const { data: latestReading } = await supabase
        .from("sensor_readings")
        .select("id")
        .eq("serial_number", serialNumber)
        .order("id", { ascending: false })
        .limit(1)
        .maybeSingle();

      readingId = latestReading?.id ?? null;
    }

    if (readingId) {
      const { error: updateError } = await supabase
        .from("sensor_readings")
        .update({ manual_confirmed: true })
        .eq("id", readingId);

      if (updateError) {
        console.error("[Manual Confirm Update Error]", updateError);
      }
    }

    return NextResponse.json(
      {
        ok: true,
        event: eventData,
        sensor_reading_id: readingId,
      },
      { status: 201 }
    );
  } catch (err) {
    console.error("[Condensation Event API Error]", err);
    return NextResponse.json(
      { ok: false, error: "Invalid condensation event request" },
      { status: 400 }
    );
  }
}