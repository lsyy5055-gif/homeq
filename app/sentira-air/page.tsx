"use client";

import { useEffect, useMemo, useState } from "react";

type SensorReading = {
  id: number;
  serial_number?: string | null;

  temperature: number | null;
  humidity: number | null;
  body_temp?: number | null;
  body_humidity?: number | null;

  co2: number | null;
  voc: number | null;

  outdoor_temp?: number | null;
  heater_temp?: number | null;
  ntc1_temp?: number | null;
  ntc2_temp?: number | null;

  window_temp: number | null;
  dew_point: number | null;

  fan_percent: number | null;
  fan1_percent?: number | null;
  fan2_percent?: number | null;
  ptc_percent: number | null;
  auto_heater_percent?: number | null;

  condensation_risk: number | string | null;
  air_quality_status: string | null;
  ai_message: string | null;
  created_at?: string | null;
};

type Controls = {
  mode: "auto" | "manual";
  fan_percent?: number;
  fan1_percent?: number;
  fan2_percent?: number;
  ptc_percent?: number;
};

const fallbackData: SensorReading = {
  id: 0,
  serial_number: "SA-0001",
  temperature: null,
  humidity: null,
  body_temp: null,
  body_humidity: null,
  co2: null,
  voc: null,
  outdoor_temp: null,
  heater_temp: null,
  ntc1_temp: null,
  ntc2_temp: null,
  window_temp: null,
  dew_point: null,
  fan_percent: null,
  fan1_percent: null,
  fan2_percent: null,
  ptc_percent: null,
  auto_heater_percent: null,
  condensation_risk: null,
  air_quality_status: "대기",
  ai_message: "센서 데이터 수신 대기 중입니다.",
  created_at: null,
};

function formatValue(value: number | null | undefined, unit = "") {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return `--${unit}`;
  return `${Number(value).toFixed(1).replace(".0", "")}${unit}`;
}

function getRiskPercent(risk: number | string | null | undefined) {
  if (typeof risk === "number") return Math.max(0, Math.min(100, risk));
  if (risk === "높음" || risk === "HIGH") return 85;
  if (risk === "주의" || risk === "CAUTION") return 55;
  if (risk === "낮음" || risk === "LOW") return 22;
  return 0;
}

function getRiskText(risk: number | string | null | undefined) {
  const percent = getRiskPercent(risk);
  if (percent >= 80) return "높음";
  if (percent >= 50) return "주의";
  return "낮음";
}

function averageNullable(a?: number | null, b?: number | null) {
  const values = [a, b].filter((v): v is number => typeof v === "number" && !Number.isNaN(v));
  if (values.length === 0) return null;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

export default function SentiraAirPage() {
  const [reading, setReading] = useState<SensorReading>(fallbackData);
  const [history, setHistory] = useState<SensorReading[]>([]);
  const [loading, setLoading] = useState(true);

  const [controlMode, setControlMode] = useState<"auto" | "manual">("auto");
  const [targetFan1, setTargetFan1] = useState(40);
  const [targetFan2, setTargetFan2] = useState(40);
  const [targetHeater, setTargetHeater] = useState(0);
  const [isUpdating, setIsUpdating] = useState(false);
  const [isUserInteracting, setIsUserInteracting] = useState(false);

  useEffect(() => {
    async function fetchReadings() {
      try {
        const res = await fetch("/api/sentira-air", { cache: "no-store" });
        const result = await res.json();

        if (!res.ok || !result.ok) {
          console.error("센서 데이터 조회 실패:", result.error);
          setLoading(false);
          return;
        }

        if (result.latest) setReading(result.latest as SensorReading);
        if (result.history) setHistory(result.history as SensorReading[]);

        if (result.controls && !isUserInteracting) {
          const controls = result.controls as Controls;
          setControlMode(controls.mode ?? "auto");
          setTargetFan1(controls.fan1_percent ?? controls.fan_percent ?? 40);
          setTargetFan2(controls.fan2_percent ?? controls.fan_percent ?? 40);
          setTargetHeater(controls.ptc_percent ?? 0);
        }

        setLoading(false);
      } catch (err) {
        console.error("센서 데이터 조회 실패:", err);
        setLoading(false);
      }
    }

    fetchReadings();
    const timer = setInterval(fetchReadings, 5000);
    return () => clearInterval(timer);
  }, [isUserInteracting]);

  async function handleControlPatch(updatedFields: {
    mode?: "auto" | "manual";
    fan1_percent?: number;
    fan2_percent?: number;
    ptc_percent?: number;
  }) {
    try {
      setIsUpdating(true);
      const res = await fetch("/api/sentira-air", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ serial_number: reading.serial_number ?? "SA-0001", ...updatedFields }),
      });
      if (!res.ok) console.error("원격 설정 변경 실패");
    } catch (err) {
      console.error("원격 설정 처리 중 오류:", err);
    } finally {
      setIsUpdating(false);
    }
  }

  const bodyTemp = reading.body_temp ?? reading.temperature ?? null;
  const bodyHumidity = reading.body_humidity ?? reading.humidity ?? null;
  const outdoorTemp = reading.outdoor_temp ?? reading.ntc1_temp ?? null;
  const heaterTemp = reading.heater_temp ?? reading.ntc2_temp ?? null;

  // BLE 유리센서 미연동 상태. 추후 glass_sensor_readings 최신값으로 교체.
  const glassSurfaceTemp = reading.window_temp ?? null;
  const glassAirTemp = null;
  const glassAirHumidity = null;
  const moistureValue = null;
  const glassBattery = null;

  const averageTemp = averageNullable(bodyTemp, glassAirTemp);
  const averageHumidity = averageNullable(bodyHumidity, glassAirHumidity);

  const hasSensorData = bodyTemp !== null || bodyHumidity !== null || reading.co2 !== null;

  const riskPercent = useMemo(() => getRiskPercent(reading.condensation_risk), [reading.condensation_risk]);
  const riskText = useMemo(() => getRiskText(reading.condensation_risk), [reading.condensation_risk]);

  const score = useMemo(() => {
    if (!hasSensorData) return null;
    const co2 = reading.co2 ?? 0;
    const humidity = averageHumidity ?? bodyHumidity ?? 0;
    let result = 100;
    if (co2 > 800) result -= 10;
    if (co2 > 1000) result -= 15;
    if (humidity > 65) result -= 10;
    if (humidity > 75) result -= 15;
    if (riskPercent >= 50) result -= 10;
    if (riskPercent >= 80) result -= 25;
    return Math.max(0, Math.min(100, result));
  }, [reading.co2, averageHumidity, bodyHumidity, hasSensorData, riskPercent]);

  const aiMessage = hasSensorData ? reading.ai_message ?? "현재 상태를 분석 중입니다." : "센서 데이터 수신 대기 중입니다.";
  const lastUpdated = reading.created_at ? new Date(reading.created_at).toLocaleString("ko-KR") : `DB 최신 ID: ${reading.id}`;

  return (
    <main className="min-h-screen bg-slate-950 text-white">
      <section className="mx-auto max-w-7xl px-6 py-8 pb-12">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-black">Sentira Air</h1>
            <p className="mt-1 text-slate-400">실시간 주거환경 모니터링 대시보드</p>
          </div>
          <div className="rounded-full bg-emerald-400/10 px-5 py-2 text-sm font-bold text-emerald-300">
            {loading ? "데이터 연결 중" : "Supabase 실시간 조회 중"}
          </div>
        </div>

        <section className="mb-6 rounded-[32px] bg-gradient-to-br from-blue-600 to-cyan-400 p-8 shadow-2xl">
          <p className="text-lg font-semibold text-blue-100">실내 환경 점수</p>
          <div className="mt-6 flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
            <CircleScore score={score} />
            <div className="max-w-2xl">
              <p className="text-2xl font-black text-white">현재 실내 상태 분석</p>
              <p className="mt-4 text-lg font-medium text-blue-50">{aiMessage}</p>
              <p className="mt-3 text-sm text-blue-100">마지막 업데이트: {lastUpdated}</p>
            </div>
          </div>
        </section>

        <SectionTitle title="실내 환경 대표값" />
        <section className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <InfoCard title="평균온도" value={formatValue(averageTemp, "℃")} />
          <InfoCard title="평균습도" value={formatValue(averageHumidity, "%")} />
          <InfoCard title="CO₂" value={formatValue(reading.co2, " ppm")} />
          <InfoCard title="VOC" value={formatValue(reading.voc, " ppb")} />
        </section>

        <SectionTitle title="본체 상태" />
        <section className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <InfoCard title="본체온도" value={formatValue(bodyTemp, "℃")} />
          <InfoCard title="본체습도" value={formatValue(bodyHumidity, "%")} />
          <InfoCard title="외기온도 J2" value={formatValue(outdoorTemp, "℃")} />
          <InfoCard title="히터온도 J3" value={formatValue(heaterTemp, "℃")} />
        </section>

        <SectionTitle title="유리센서 상태 (BLE 예정)" />
        <section className="grid grid-cols-2 gap-4 md:grid-cols-5">
          <InfoCard title="유리표면온도" value={formatValue(glassSurfaceTemp, "℃")} />
          <InfoCard title="창가온도" value={formatValue(glassAirTemp, "℃")} />
          <InfoCard title="창가습도" value={formatValue(glassAirHumidity, "%")} />
          <InfoCard title="수분측정" value={formatValue(moistureValue, "")} />
          <InfoCard title="배터리" value={formatValue(glassBattery, "%")} />
        </section>

        <SectionTitle title="결로 예측" />
        <section className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <GaugeCard title="이슬점" value={formatValue(reading.dew_point, "℃")} percent={hasSensorData ? Math.min(100, Math.max(0, (reading.dew_point ?? 0) * 3)) : 0} desc="결로 기준" />
          <GaugeCard title="결로위험도" value={hasSensorData ? `${riskPercent}%` : "--%"} percent={riskPercent} desc={riskText} />
          <GaugeCard title="유리표면온도" value={formatValue(glassSurfaceTemp, "℃")} percent={glassSurfaceTemp ? Math.min(100, Math.max(0, glassSurfaceTemp)) : 0} desc="BLE 예정" />
        </section>

        <div className="mb-3 mt-8 flex items-center justify-between">
          <h2 className="text-2xl font-black">기기 제어 & 원격 조작</h2>
          {isUpdating && <span className="animate-pulse text-xs text-cyan-400">원격 서버 반영 중...</span>}
        </div>

        <section className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="grid grid-cols-1 gap-4 lg:col-span-1">
            <OutputCard title="현재 FAN1 출력" value={reading.fan1_percent ?? reading.fan_percent ?? 0} unit="%" />
            <OutputCard title="현재 FAN2 출력" value={reading.fan2_percent ?? reading.fan_percent ?? 0} unit="%" />
            <OutputCard title="현재 PTC 출력" value={reading.ptc_percent ?? 0} unit="%" accent="orange" />
          </div>

          <div className="flex flex-col justify-between rounded-[28px] border border-cyan-400/20 bg-slate-900 p-6 shadow-xl lg:col-span-2">
            <div>
              <div className="flex items-center justify-between border-b border-slate-800 pb-4">
                <div>
                  <h3 className="text-lg font-bold">무선 원격 제어 패널</h3>
                  <p className="text-xs text-slate-500">자동/수동 모드와 FAN1/FAN2/PTC 목표값을 제어합니다.</p>
                </div>
                <div className="flex rounded-xl bg-slate-950 p-1">
                  <button
                    onClick={() => {
                      setControlMode("auto");
                      handleControlPatch({ mode: "auto" });
                    }}
                    className={`rounded-lg px-4 py-1.5 text-xs font-bold transition-all ${controlMode === "auto" ? "bg-cyan-500 text-slate-950" : "text-slate-400 hover:text-white"}`}
                  >
                    자동 제어
                  </button>
                  <button
                    onClick={() => {
                      setControlMode("manual");
                      handleControlPatch({ mode: "manual" });
                    }}
                    className={`rounded-lg px-4 py-1.5 text-xs font-bold transition-all ${controlMode === "manual" ? "bg-orange-500 text-slate-950" : "text-slate-400 hover:text-white"}`}
                  >
                    원격 수동
                  </button>
                </div>
              </div>

              <div className="mt-6 space-y-6">
                <ControlSlider label="FAN1 목표값" value={targetFan1} disabled={controlMode === "auto"} accent="cyan" onStart={() => setIsUserInteracting(true)} onChange={setTargetFan1} onEnd={() => { setIsUserInteracting(false); handleControlPatch({ fan1_percent: targetFan1 }); }} />
                <ControlSlider label="FAN2 목표값" value={targetFan2} disabled={controlMode === "auto"} accent="cyan" onStart={() => setIsUserInteracting(true)} onChange={setTargetFan2} onEnd={() => { setIsUserInteracting(false); handleControlPatch({ fan2_percent: targetFan2 }); }} />
                <ControlSlider label="PTC 히터 목표값" value={targetHeater} disabled={controlMode === "auto"} accent="orange" onStart={() => setIsUserInteracting(true)} onChange={setTargetHeater} onEnd={() => { setIsUserInteracting(false); handleControlPatch({ ptc_percent: targetHeater }); }} />
              </div>
            </div>
            <div className="mt-4 border-t border-slate-800 pt-3 text-center">
              <p className="text-xs text-slate-500">{controlMode === "auto" ? "자동 모드: CO₂/VOC/결로/외기온도 기준으로 제어합니다." : "수동 모드: 설정값이 약 5초 주기로 ESP32에 반영됩니다."}</p>
            </div>
          </div>
        </section>

        <SectionTitle title="최근 CO₂ 변화" />
        <section className="rounded-[28px] bg-slate-900 p-6">
          {history.length === 0 ? (
            <p className="text-slate-400">히스토리 데이터를 불러오는 중입니다.</p>
          ) : (
            <div className="flex h-44 items-end gap-2">
              {history.map((item) => {
                const co2 = item.co2 ?? 0;
                const height = Math.max(12, Math.min(co2 / 8, 170));
                return (
                  <div key={item.id} className="flex flex-1 flex-col items-center">
                    <div className="w-full rounded-t-lg bg-cyan-400 transition-all" style={{ height: `${height}px` }} />
                    <span className="mt-2 text-xs text-slate-500">{item.co2 ?? "--"}</span>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        <SectionTitle title="AI 판단엔진" />
        <section className="rounded-[28px] border border-cyan-400/20 bg-slate-900 p-6">
          <p className="text-xl font-black text-cyan-300">현재 판단</p>
          <p className="mt-4 text-lg text-slate-200">{aiMessage}</p>
          <div className="mt-5 grid gap-3 md:grid-cols-3">
            <DecisionCard title="환기 판단" value={hasSensorData && (reading.co2 ?? 0) > 1000 ? "즉시 환기" : "대기"} />
            <DecisionCard title="FAN 제어" value={`FAN1 ${reading.fan1_percent ?? reading.fan_percent ?? 0}% / FAN2 ${reading.fan2_percent ?? reading.fan_percent ?? 0}%`} />
            <DecisionCard title="PTC 제어" value={`${reading.ptc_percent ?? 0}% 유지`} />
          </div>
        </section>
      </section>
    </main>
  );
}

function SectionTitle({ title }: { title: string }) {
  return <h2 className="mb-3 mt-8 text-2xl font-black">{title}</h2>;
}

function InfoCard({ title, value }: { title: string; value: string }) {
  return (
    <div className="rounded-[28px] bg-slate-900 p-6 shadow-lg">
      <p className="text-base font-semibold text-slate-400">{title}</p>
      <p className="mt-4 text-3xl font-black">{value}</p>
    </div>
  );
}

function OutputCard({ title, value, unit, accent = "cyan" }: { title: string; value: number; unit: string; accent?: "cyan" | "orange" }) {
  const textClass = accent === "orange" ? "text-orange-400" : "text-cyan-300";
  const barClass = accent === "orange" ? "bg-orange-400" : "bg-cyan-400";
  return (
    <div className="flex flex-col justify-between rounded-[28px] bg-slate-900 p-6 shadow-lg">
      <div>
        <p className="text-sm font-semibold text-slate-400">{title}</p>
        <p className={`mt-2 text-4xl font-black ${textClass}`}>{formatValue(value, unit)}</p>
      </div>
      <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-800">
        <div className={`h-full transition-all duration-500 ${barClass}`} style={{ width: `${Math.max(0, Math.min(100, value ?? 0))}%` }} />
      </div>
    </div>
  );
}

function ControlSlider({ label, value, disabled, accent, onStart, onChange, onEnd }: { label: string; value: number; disabled: boolean; accent: "cyan" | "orange"; onStart: () => void; onChange: (value: number) => void; onEnd: () => void }) {
  const textClass = accent === "orange" ? "text-orange-400" : "text-cyan-400";
  const accentClass = accent === "orange" ? "accent-orange-400" : "accent-cyan-400";
  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <span className="text-sm font-semibold text-slate-300">{label}</span>
        <span className={`text-base font-bold ${disabled ? "text-slate-600" : textClass}`}>{value}%</span>
      </div>
      <input
        type="range"
        min="0"
        max="100"
        disabled={disabled}
        value={value}
        onMouseDown={onStart}
        onTouchStart={onStart}
        onChange={(e) => onChange(Number(e.target.value))}
        onMouseUp={onEnd}
        onTouchEnd={onEnd}
        className={`h-2 w-full cursor-pointer appearance-none rounded-lg bg-slate-950 disabled:cursor-not-allowed disabled:opacity-20 ${accentClass}`}
      />
    </div>
  );
}

function GaugeCard({ title, value, percent, desc }: { title: string; value: string; percent: number; desc: string }) {
  return (
    <div className="rounded-[28px] bg-slate-900 p-6 shadow-lg">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-base font-semibold text-slate-400">{title}</p>
          <p className="mt-3 text-4xl font-black">{value}</p>
        </div>
        <p className="rounded-full bg-slate-800 px-3 py-1 text-sm text-cyan-300">{desc}</p>
      </div>
      <div className="mt-6 h-4 overflow-hidden rounded-full bg-slate-800">
        <div className="h-full rounded-full bg-cyan-400" style={{ width: `${Math.max(0, Math.min(100, percent))}%` }} />
      </div>
      <div className="mt-2 flex justify-between text-xs text-slate-500">
        <span>낮음</span>
        <span>주의</span>
        <span>높음</span>
      </div>
    </div>
  );
}

function DecisionCard({ title, value }: { title: string; value: string }) {
  return (
    <div className="rounded-2xl bg-slate-800 p-4">
      <p className="text-sm text-slate-400">{title}</p>
      <p className="mt-2 text-xl font-black">{value}</p>
    </div>
  );
}

function CircleScore({ score }: { score: number | null }) {
  const safeScore = score ?? 0;
  const radius = 80;
  const stroke = 14;
  const normalizedRadius = radius - stroke / 2;
  const circumference = normalizedRadius * 2 * Math.PI;
  const strokeDashoffset = circumference - (safeScore / 100) * circumference;

  return (
    <div className="relative flex h-44 w-44 items-center justify-center">
      <svg height={radius * 2} width={radius * 2} className="-rotate-90">
        <circle stroke="rgba(255,255,255,0.22)" fill="transparent" strokeWidth={stroke} r={normalizedRadius} cx={radius} cy={radius} />
        <circle stroke="white" fill="transparent" strokeWidth={stroke} strokeLinecap="round" strokeDasharray={`${circumference} ${circumference}`} strokeDashoffset={strokeDashoffset} r={normalizedRadius} cx={radius} cy={radius} />
      </svg>
      <div className="absolute text-center">
        <p className="text-5xl font-black">{score === null ? "--" : score}</p>
        <p className="text-lg font-bold">점</p>
      </div>
    </div>
  );
}
