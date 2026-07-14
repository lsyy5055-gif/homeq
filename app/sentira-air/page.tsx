"use client";

import { useEffect, useMemo, useState } from "react";

type SensorReading = {
  id?: number;
  serial_number?: string | null;

  temperature?: number | null;
  humidity?: number | null;
  body_temp?: number | null;
  body_humidity?: number | null;

  co2?: number | null;
  voc?: number | null;

  outdoor_temp?: number | null;
  heater_temp?: number | null;
  ntc1_temp?: number | null;
  ntc2_temp?: number | null;

  window_temp?: number | null;
  dew_point?: number | null;

  fan_percent?: number | null;
  fan1_percent?: number | null;
  fan2_percent?: number | null;
  ptc_percent?: number | null;
  auto_heater_percent?: number | null;

  condensation_risk?: number | string | null;
  air_quality_status?: string | null;
  ai_message?: string | null;

  created_at?: string | null;
};

type ControlState = {
  mode?: "auto" | "manual";
  fan_percent?: number;
  fan1_percent?: number;
  fan2_percent?: number;
  ptc_percent?: number;
};

const fallbackReading: SensorReading = {
  id: 0,
  serial_number: "SA-0001",
  body_temp: null,
  body_humidity: null,
  temperature: null,
  humidity: null,
  co2: null,
  voc: null,
  outdoor_temp: null,
  heater_temp: null,
  window_temp: null,
  dew_point: null,
  fan_percent: null,
  fan1_percent: null,
  fan2_percent: null,
  ptc_percent: null,
  condensation_risk: null,
  air_quality_status: "WAIT",
  ai_message: "센서 데이터 수신 대기 중입니다.",
  created_at: null,
};

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function formatValue(value: number | null | undefined, unit = "", digits = 1) {
  if (value === null || value === undefined || Number.isNaN(value)) return `--${unit}`;
  return `${Number(value).toFixed(digits).replace(".0", "")}${unit}`;
}

function clamp(value: number, min = 0, max = 100) {
  return Math.max(min, Math.min(max, value));
}

function getRiskPercent(risk: number | string | null | undefined) {
  if (typeof risk === "number") return clamp(risk);
  if (risk === "HIGH" || risk === "높음") return 85;
  if (risk === "CAUTION" || risk === "주의") return 55;
  if (risk === "LOW" || risk === "낮음") return 20;
  return 0;
}

function getRiskGrade(percent: number) {
  if (percent >= 80) return { label: "위험", tone: "text-rose-300", dot: "bg-rose-400", bg: "bg-rose-500/10" };
  if (percent >= 50) return { label: "주의", tone: "text-amber-300", dot: "bg-amber-400", bg: "bg-amber-500/10" };
  return { label: "안전", tone: "text-emerald-300", dot: "bg-emerald-400", bg: "bg-emerald-500/10" };
}

function getMoistureStatus(value?: number | null, detected?: boolean | null) {
  if (detected === true || (typeof value === "number" && value >= 30)) {
    return {
      label: "결로 심각",
      detail: "수분이 강하게 감지되었습니다.",
      tone: "text-rose-300",
      dot: "bg-rose-400",
      bg: "bg-rose-500/10",
      border: "border-rose-400/30",
    };
  }

  if (typeof value === "number" && value >= 20) {
    return {
      label: "결로 시작",
      detail: "초기 수분이 감지되었습니다.",
      tone: "text-amber-300",
      dot: "bg-amber-400",
      bg: "bg-amber-500/10",
      border: "border-amber-400/30",
    };
  }

  return {
    label: "정상",
    detail: "수분이 감지되지 않았습니다.",
    tone: "text-emerald-300",
    dot: "bg-emerald-400",
    bg: "bg-emerald-500/10",
    border: "border-emerald-400/20",
  };
}

function getAirQualityGrade(co2?: number | null, voc?: number | null) {
  const c = co2 ?? 0;
  const v = voc ?? 0;
  if (c >= 1200 || v >= 700) return { label: "나쁨", tone: "text-rose-300", dot: "bg-rose-400", bg: "bg-rose-500/10" };
  if (c >= 900 || v >= 400) return { label: "보통", tone: "text-amber-300", dot: "bg-amber-400", bg: "bg-amber-500/10" };
  return { label: "좋음", tone: "text-emerald-300", dot: "bg-emerald-400", bg: "bg-emerald-500/10" };
}

function getEnvironmentScore(riskPercent: number, co2?: number | null, humidity?: number | null, voc?: number | null) {
  let score = 100;

  if (riskPercent >= 80) score -= 35;
  else if (riskPercent >= 50) score -= 18;
  else if (riskPercent >= 30) score -= 8;

  const c = co2 ?? 0;
  if (c >= 1500) score -= 25;
  else if (c >= 1200) score -= 18;
  else if (c >= 900) score -= 8;

  const h = humidity ?? 0;
  if (h >= 75) score -= 18;
  else if (h >= 65) score -= 10;
  else if (h <= 25 && h > 0) score -= 8;

  const v = voc ?? 0;
  if (v >= 700) score -= 18;
  else if (v >= 400) score -= 8;

  return clamp(score);
}

function averageNullable(a?: number | null, b?: number | null) {
  const values = [a, b].filter((v): v is number => typeof v === "number" && Number.isFinite(v));
  if (values.length === 0) return null;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

function getMainStatus(score: number, riskPercent: number, airLabel: string) {
  if (riskPercent >= 80 || score < 60) return { label: "점검 필요", tone: "text-rose-200", dot: "bg-rose-400" };
  if (riskPercent >= 50 || airLabel === "보통" || score < 80) return { label: "주의 관찰", tone: "text-amber-200", dot: "bg-amber-400" };
  return { label: "매우 좋음", tone: "text-emerald-200", dot: "bg-emerald-400" };
}

function makeOperationText(mode: "auto" | "manual", fan1: number, fan2: number, ptc: number) {
  if (mode === "manual") return "수동 제어 중";
  if (ptc > 0) return "자동 환기 · 예열 중";
  if (fan1 > 0 || fan2 > 0) return "자동 환기 중";
  return "대기 중";
}

function makeReasonList(reading: SensorReading, mode: "auto" | "manual", ptc: number) {
  const reasons: string[] = [];

  if (mode === "manual") {
    reasons.push("사용자가 수동 제어값을 적용했습니다.");
    return reasons;
  }

  const co2 = reading.co2 ?? 0;
  const voc = reading.voc ?? 0;
  const outdoor = reading.outdoor_temp ?? reading.ntc1_temp;
  const risk = getRiskPercent(reading.condensation_risk);

  if (co2 >= 1000) reasons.push(`CO₂ ${co2}ppm으로 환기를 강화합니다.`);
  if (voc >= 500) reasons.push(`VOC ${voc}ppb로 냄새 배출을 강화합니다.`);
  if (risk >= 50) reasons.push(`결로위험 ${getRiskGrade(risk).label} 단계로 팬 출력을 높입니다.`);
  if (typeof outdoor === "number" && ptc > 0) reasons.push(`외기온도 ${formatValue(outdoor, "℃")} 기준으로 PTC ${ptc}%를 적용합니다.`);
  if (reasons.length === 0) reasons.push("실내 환경이 안정 범위입니다.");

  return reasons;
}

function getUpdatedText(createdAt?: string | null, id?: number) {
  if (createdAt) return new Date(createdAt).toLocaleString("ko-KR");
  if (id) return `DB ID ${id}`;
  return "대기 중";
}

export default function SentiraAirPage() {
  const [reading, setReading] = useState<SensorReading>(fallbackReading);
  const [history, setHistory] = useState<SensorReading[]>([]);
  const [loading, setLoading] = useState(true);

  const [controlMode, setControlMode] = useState<"auto" | "manual">("auto");
  const [targetFan1, setTargetFan1] = useState(40);
  const [targetFan2, setTargetFan2] = useState(40);
  const [targetHeater, setTargetHeater] = useState(0);
  const [isUpdating, setIsUpdating] = useState(false);
  const [isUserInteracting, setIsUserInteracting] = useState(false);

  async function fetchDashboard() {
    try {
      const res = await fetch("/api/sentira-air", { cache: "no-store" });
      const result = await res.json();

      if (!res.ok || !result.ok) {
        console.error("Sentira Air API error:", result.error);
        setLoading(false);
        return;
      }

      if (result.latest) setReading(result.latest as SensorReading);
      if (result.history) setHistory(result.history as SensorReading[]);

      if (result.controls && !isUserInteracting) {
        const controls = result.controls as ControlState;
        const fan1 = controls.fan1_percent ?? controls.fan_percent ?? 40;
        const fan2 = controls.fan2_percent ?? controls.fan_percent ?? 40;

        setControlMode(controls.mode ?? "auto");
        setTargetFan1(fan1);
        setTargetFan2(fan2);
        setTargetHeater(controls.ptc_percent ?? 0);
      }

      setLoading(false);
    } catch (err) {
      console.error("Sentira Air fetch error:", err);
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchDashboard();
    const timer = setInterval(fetchDashboard, 5000);
    return () => clearInterval(timer);
  }, [isUserInteracting]);

  async function patchControls(updatedFields: {
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
        body: JSON.stringify({
          serial_number: reading.serial_number ?? "SA-0001",
          ...updatedFields,
        }),
      });

      if (!res.ok) {
        const body = await res.text();
        console.error("Control PATCH failed:", body);
      }
    } catch (err) {
      console.error("Control PATCH error:", err);
    } finally {
      setIsUpdating(false);
    }
  }

  const bodyTemp = reading.body_temp ?? reading.temperature ?? null;
  const bodyHumidity = reading.body_humidity ?? reading.humidity ?? null;
  const outdoorTemp = reading.outdoor_temp ?? reading.ntc1_temp ?? null;
  const heaterTemp = reading.heater_temp ?? reading.ntc2_temp ?? null;

  const glassSurfaceTemp = asNumber((reading as any).glass_surface_temp ?? reading.window_temp);
  const glassAirTemp = asNumber((reading as any).glass_air_temp);
  const glassAirHumidity = asNumber((reading as any).glass_air_humidity);
  const moistureValue = asNumber((reading as any).moisture_value);
  const batteryPercent = asNumber((reading as any).battery_percent);

  const avgTemp = averageNullable(bodyTemp, glassAirTemp);
  const avgHumidity = averageNullable(bodyHumidity, glassAirHumidity);

  const actualFan1 = reading.fan1_percent ?? reading.fan_percent ?? 0;
  const actualFan2 = reading.fan2_percent ?? reading.fan_percent ?? 0;
  const actualHeater = reading.ptc_percent ?? 0;

  const riskPercent = useMemo(() => getRiskPercent(reading.condensation_risk), [reading.condensation_risk]);
  const riskGrade = useMemo(() => getRiskGrade(riskPercent), [riskPercent]);
  const airGrade = useMemo(() => getAirQualityGrade(reading.co2, reading.voc), [reading.co2, reading.voc]);
  const score = useMemo(() => getEnvironmentScore(riskPercent, reading.co2, avgHumidity, reading.voc), [riskPercent, reading.co2, avgHumidity, reading.voc]);
  const mainStatus = useMemo(() => getMainStatus(score, riskPercent, airGrade.label), [score, riskPercent, airGrade.label]);
  const operationText = makeOperationText(controlMode, actualFan1, actualFan2, actualHeater);
  const reasons = makeReasonList(reading, controlMode, actualHeater);

  const glassConnected =
    glassSurfaceTemp !== null ||
    glassAirTemp !== null ||
    glassAirHumidity !== null ||
    moistureValue !== null ||
    batteryPercent !== null;

  const updatedText = getUpdatedText(reading.created_at, reading.id);

  return (
    <main className="min-h-screen w-full overflow-x-hidden bg-slate-950 text-white">
      <section className="mx-auto max-w-3xl px-4 pb-10 pt-5">
        <header className="mb-5 flex items-center justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.24em] text-cyan-300">Sentira Air</p>
            <h1 className="mt-1 text-2xl font-black">스마트 환기 모니터</h1>
          </div>
          <div className={`flex items-center gap-2 rounded-full px-3 py-2 text-xs font-bold ${loading ? "bg-slate-800 text-slate-300" : "bg-emerald-400/10 text-emerald-300"}`}>
            <span className={`h-2 w-2 rounded-full ${loading ? "bg-slate-400" : "bg-emerald-400"}`} />
            {loading ? "연결 중" : "온라인"}
          </div>
        </header>

        <section className="rounded-[32px] border border-cyan-400/20 bg-gradient-to-br from-slate-900 via-slate-900 to-cyan-950 p-6 shadow-2xl">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-sm font-bold ${riskGrade.bg} ${mainStatus.tone}`}>
                <span className={`h-2.5 w-2.5 rounded-full ${mainStatus.dot}`} />
                {mainStatus.label}
              </div>
              <p className="mt-4 text-sm font-semibold text-slate-400">환경점수</p>
              <div className="mt-1 flex items-end gap-2">
                <p className="text-7xl font-black tracking-tight">{score}</p>
                <p className="pb-3 text-2xl font-black text-slate-400">점</p>
              </div>
            </div>

            <div className="rounded-3xl bg-white/5 p-4 text-right">
              <p className="text-xs text-slate-400">현재 동작</p>
              <p className="mt-2 text-lg font-black text-cyan-200">{operationText}</p>
              <p className="mt-2 text-xs text-slate-500">업데이트 {updatedText}</p>
            </div>
          </div>

          <div className="mt-6 grid grid-cols-3 gap-3">
            <StatusPill title="결로위험" value={riskGrade.label} tone={riskGrade.tone} dot={riskGrade.dot} />
            <StatusPill title="공기질" value={airGrade.label} tone={airGrade.tone} dot={airGrade.dot} />
            <StatusPill title="모드" value={controlMode === "auto" ? "자동" : "수동"} tone={controlMode === "auto" ? "text-cyan-300" : "text-orange-300"} dot={controlMode === "auto" ? "bg-cyan-400" : "bg-orange-400"} />
          </div>
        </section>

        <section className="mt-4 grid grid-cols-2 gap-3">
          <MiniMetric title="평균온도" value={formatValue(avgTemp, "℃")} />
          <MiniMetric title="평균습도" value={formatValue(avgHumidity, "%")} />
        </section>

        <section className="mt-4 rounded-[28px] bg-slate-900 p-5">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-black">센티라 판단</h2>
            <span className="rounded-full bg-slate-800 px-3 py-1 text-xs font-bold text-slate-300">Rule Engine</span>
          </div>

          <div className="mt-4 space-y-3">
            {reasons.map((reason, index) => (
              <div key={index} className="rounded-2xl bg-slate-950/70 p-4 text-sm font-semibold text-slate-200">
                {reason}
              </div>
            ))}
          </div>
        </section>

        {moistureDetected && (
          <section className={`mt-4 rounded-[28px] border ${moistureStatus.border} ${moistureStatus.bg} p-5`}>
            <div className="flex items-start gap-3">
              <span className={`mt-1 h-3 w-3 shrink-0 rounded-full ${moistureStatus.dot}`} />
              <div>
                <p className={`text-lg font-black ${moistureStatus.tone}`}>창문 수분 감지</p>
                <p className="mt-1 text-sm font-semibold text-slate-200">
                  {moistureStatus.detail}
                </p>
                <p className="mt-2 text-xs text-slate-400">
                  현재 측정값 {moistureValue === null ? "--" : `${moistureValue.toFixed(2)} pF`}
                </p>
              </div>
            </div>
          </section>
        )}

        <Accordion title="본체 상태" defaultOpen>
          <div className="grid grid-cols-2 gap-3">
            <Metric title="본체온도" value={formatValue(bodyTemp, "℃")} />
            <Metric title="본체습도" value={formatValue(bodyHumidity, "%")} />
            <Metric title="외기온도 J2" value={formatValue(outdoorTemp, "℃")} />
            <Metric title="히터온도 J3" value={formatValue(heaterTemp, "℃")} />
            <Metric title="CO₂" value={formatValue(reading.co2, " ppm", 0)} />
            <Metric title="VOC" value={formatValue(reading.voc, " ppb", 0)} />
          </div>
        </Accordion>

        <Accordion title="창문 센서">
          {glassConnected ? (
            <div className="grid grid-cols-2 gap-3">
              <Metric title="유리표면온도" value={formatValue(glassSurfaceTemp, "℃")} />
              <Metric title="창가온도" value={formatValue(glassAirTemp, "℃")} />
              <Metric title="창가습도" value={formatValue(glassAirHumidity, "%")} />
              <Metric title="수분측정" value={moistureValue === null ? "--" : `${moistureValue}`} />
              <Metric title="배터리" value={formatValue(batteryPercent, "%", 0)} />
              <Metric title="BLE 상태" value="연결됨" />
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-slate-700 bg-slate-950/50 p-5 text-center">
              <p className="text-lg font-black text-slate-300">창문센서 연결 대기중</p>
              <p className="mt-2 text-sm text-slate-500">BLE 유리센서가 연결되면 표면온도, 창가 온습도, 수분값, 배터리가 표시됩니다.</p>
            </div>
          )}
        </Accordion>

        <Accordion title="원격 제어" defaultOpen>
          <div className="space-y-5">
            <div className="flex rounded-2xl bg-slate-950 p-1">
              <button
                onClick={() => {
                  setControlMode("auto");
                  patchControls({ mode: "auto" });
                }}
                className={`flex-1 rounded-xl px-4 py-3 text-sm font-black transition ${
                  controlMode === "auto" ? "bg-cyan-400 text-slate-950" : "text-slate-400"
                }`}
              >
                자동모드
              </button>
              <button
                onClick={() => {
                  setControlMode("manual");
                  patchControls({ mode: "manual" });
                }}
                className={`flex-1 rounded-xl px-4 py-3 text-sm font-black transition ${
                  controlMode === "manual" ? "bg-orange-400 text-slate-950" : "text-slate-400"
                }`}
              >
                수동제어
              </button>
            </div>

            <ControlSlider
              title="FAN1"
              value={controlMode === "auto" ? actualFan1 : targetFan1}
              disabled={controlMode === "auto"}
              mode={controlMode}
              onStart={() => setIsUserInteracting(true)}
              onChange={setTargetFan1}
              onCommit={() => {
                setIsUserInteracting(false);
                patchControls({ fan1_percent: targetFan1 });
              }}
            />

            <ControlSlider
              title="FAN2"
              value={controlMode === "auto" ? actualFan2 : targetFan2}
              disabled={controlMode === "auto"}
              mode={controlMode}
              onStart={() => setIsUserInteracting(true)}
              onChange={setTargetFan2}
              onCommit={() => {
                setIsUserInteracting(false);
                patchControls({ fan2_percent: targetFan2 });
              }}
            />

            <ControlSlider
              title="PTC 히터"
              value={controlMode === "auto" ? actualHeater : targetHeater}
              disabled={controlMode === "auto"}
              mode={controlMode}
              accent="orange"
              onStart={() => setIsUserInteracting(true)}
              onChange={setTargetHeater}
              onCommit={() => {
                setIsUserInteracting(false);
                patchControls({ ptc_percent: targetHeater });
              }}
            />

            <p className="text-center text-xs text-slate-500">
              {isUpdating ? "원격 서버 반영 중..." : controlMode === "auto" ? "자동모드에서는 센서값 기준으로 현재 출력값을 표시합니다." : "수동모드에서는 사용자가 설정한 출력값을 표시합니다."}
            </p>
          </div>
        </Accordion>

        <Accordion title="최근 CO₂ 변화">
          {history.length === 0 ? (
            <p className="text-sm text-slate-500">히스토리 데이터를 불러오는 중입니다.</p>
          ) : (
            <div className="flex h-36 items-end gap-2">
              {history.slice(-12).map((item, index) => {
                const co2 = item.co2 ?? 0;
                const height = Math.max(8, Math.min(co2 / 10, 130));
                return (
                  <div key={item.id ?? index} className="flex flex-1 flex-col items-center">
                    <div className="w-full rounded-t-lg bg-cyan-400" style={{ height: `${height}px` }} />
                    <span className="mt-2 text-[10px] text-slate-500">{item.co2 ?? "--"}</span>
                  </div>
                );
              })}
            </div>
          )}
        </Accordion>

        <Accordion title="상세 데이터">
          <div className="grid grid-cols-2 gap-3">
            <Metric title="이슬점" value={formatValue(reading.dew_point, "℃")} />
            <Metric title="결로위험도" value={`${riskPercent}%`} />
            <Metric title="FAN 통합" value={formatValue(reading.fan_percent, "%", 0)} />
            <Metric title="PTC 자동값" value={formatValue(reading.auto_heater_percent, "%", 0)} />
            <Metric title="시리얼" value={reading.serial_number ?? "SA-0001"} />
            <Metric title="펌웨어" value="v4.x" />
          </div>
        </Accordion>
      </section>
    </main>
  );
}

function StatusPill({ title, value, tone, dot }: { title: string; value: string; tone: string; dot: string }) {
  return (
    <div className="rounded-2xl bg-white/5 p-3">
      <p className="text-[11px] font-bold text-slate-400">{title}</p>
      <div className="mt-2 flex items-center gap-2">
        <span className={`h-2 w-2 rounded-full ${dot}`} />
        <p className={`text-sm font-black ${tone}`}>{value}</p>
      </div>
    </div>
  );
}

function MiniMetric({ title, value }: { title: string; value: string }) {
  return (
    <div className="rounded-[24px] bg-slate-900 p-5">
      <p className="text-sm font-bold text-slate-400">{title}</p>
      <p className="mt-2 text-3xl font-black">{value}</p>
    </div>
  );
}

function Metric({ title, value }: { title: string; value: string }) {
  return (
    <div className="rounded-2xl bg-slate-950/70 p-4">
      <p className="text-xs font-bold text-slate-500">{title}</p>
      <p className="mt-2 break-words text-2xl font-black text-slate-100">{value}</p>
    </div>
  );
}

function Accordion({
  title,
  children,
  defaultOpen = false,
}: {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <section className="mt-4 rounded-[28px] bg-slate-900 p-5">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center justify-between text-left"
      >
        <h2 className="text-lg font-black">{title}</h2>
        <span className="rounded-full bg-slate-800 px-3 py-1 text-sm font-black text-slate-300">
          {open ? "접기" : "보기"}
        </span>
      </button>

      {open && <div className="mt-4">{children}</div>}
    </section>
  );
}

function ControlSlider({
  title,
  value,
  disabled,
  mode,
  accent = "cyan",
  onStart,
  onChange,
  onCommit,
}: {
  title: string;
  value: number;
  disabled: boolean;
  mode: "auto" | "manual";
  accent?: "cyan" | "orange";
  onStart: () => void;
  onChange: (value: number) => void;
  onCommit: () => void;
}) {
  const safeValue = clamp(value);
  const barColor = accent === "orange" ? "bg-orange-400" : "bg-cyan-400";
  const accentClass = accent === "orange" ? "accent-orange-400" : "accent-cyan-400";
  const label = mode === "auto" ? "자동모드 현재 출력" : "수동모드 설정 출력";

  return (
    <div className="rounded-2xl bg-slate-950/70 p-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-black">{title}</p>
          <p className="mt-1 text-xs text-slate-500">{label}</p>
        </div>
        <p className="text-2xl font-black">{safeValue}%</p>
      </div>

      <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-800">
        <div className={`h-full rounded-full ${barColor}`} style={{ width: `${safeValue}%` }} />
      </div>

      <input
        type="range"
        min="0"
        max="100"
        value={safeValue}
        disabled={disabled}
        onMouseDown={onStart}
        onTouchStart={onStart}
        onChange={(e) => onChange(Number(e.target.value))}
        onMouseUp={onCommit}
        onTouchEnd={onCommit}
        className={`mt-4 h-2 w-full cursor-pointer appearance-none rounded-lg bg-slate-800 ${accentClass} disabled:cursor-not-allowed disabled:opacity-30`}
      />
    </div>
  );
}