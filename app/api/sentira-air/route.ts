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

// 1. GET: 웹 대시보드에 실시간 센서 정보 및 사용자 제어 수치를 한 번에 제공
export async function GET() {
  try {
    const supabase = getSupabaseAdmin();

    // 센서 데이터 최신 12개 조회
    const { data: sensorData, error: sensorError } = await supabase
      .from("sensor_readings")
      .select("*")
      .order("id", { ascending: false })
      .limit(12);

    if (sensorError) {
      console.error("[Supabase Select Error]", sensorError);
      return NextResponse.json({ error: sensorError.message }, { status: 500 });
    }

    // 사용자 제어 명령 테이블 조회 (기본 SA-0001)
    const { data: controlData, error: controlError } = await supabase
      .from("device_controls")
      .select("*")
      .eq("serial_number", "SA-0001")
      .single();

    return NextResponse.json(
      {
        ok: true,
        latest: sensorData?.[0] ?? null,
        history: sensorData ? [...sensorData].reverse() : [],
        controls: controlData ?? { mode: "auto", fan_percent: 40, ptc_percent: 0 }
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

// 2. POST: ESP32 기기가 주기적으로 센서를 수집해서 보낼 때 (최신 제어 명령을 ESP32에 응답함)
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const supabase = getSupabaseAdmin();
    const serialNum = body.serial_number ?? "SA-0001";

    const payload = {
      serial_number: serialNum,
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

    // 센서 데이터 기록
    const { error: insertError } = await supabase
      .from("sensor_readings")
      .insert(payload);

    if (insertError) {
      console.error("[Supabase Insert Error]", insertError);
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }

    // 해당 기기의 원격 제어 상태 읽기
    let { data: controlData } = await supabase
      .from("device_controls")
      .select("*")
      .eq("serial_number", serialNum)
      .single();

    // 혹시라도 설정 데이터가 없는 신규 장치라면 자동 생성
    if (!controlData) {
      const { data: newControl } = await supabase
        .from("device_controls")
        .insert({ serial_number: serialNum, mode: "auto", fan_percent: 40, ptc_percent: 0 })
        .select()
        .single();
      controlData = newControl;
    }

    // 💡 [중요] ESP32 소스코드가 기대하는 형식에 맞춰 정확한 키 이름으로 반환합니다.
    return NextResponse.json({
      ok: true,
      mode: controlData?.mode ?? "auto",
      fan_percent: controlData?.fan_percent ?? 40,
      heater_percent: controlData?.ptc_percent ?? 0
    }, { status: 200 });

  } catch (err) {
    console.error("[API POST Error]", err);
    return NextResponse.json(
      { error: "Invalid request" },
      { status: 400 }
    );
  }
}

// 3. PATCH: 대시보드 화면에서 사용자가 스위치/슬라이더를 동작했을 때 DB 상태 업데이트
export async function PATCH(req: Request) {
  try {
    const body = await req.json(); // 예: { serial_number, mode, fan_percent, ptc_percent }
    const supabase = getSupabaseAdmin();
    const serialNum = body.serial_number ?? "SA-0001";

    const updatePayload: Record<string, any> = {};
    if (body.mode !== undefined) updatePayload.mode = body.mode;
    if (body.fan_percent !== undefined) updatePayload.fan_percent = body.fan_percent;
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