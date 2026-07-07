"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";

type SensorReading = {
  id: number;
  serial_number?: string | null;
  temperature: number | null;
  humidity: number | null;
  co2: number | null;
  voc: number | null;
  window_temp: number | null;
  dew_point: number | null;
  fan_percent: number | null;
  ptc_percent: number | null;
  condensation_risk: number | string | null;
  air_quality_status: string | null;
  ai_message: string | null;
  created_at?: string | null;
};

const fallbackData: SensorReading = {
  id: 0,
  serial_number: "SA-0001",
  temperature: null,
  humidity: null,
  co2: null,
  voc: null,
  window_temp: null,
  dew_point: null,
  fan_percent: null,
  ptc_percent: null,
  condensation_risk: null,
  air_quality_status: "대기",
  ai_message: "센서 데이터 수신 대기 중입니다.",
  created_at: null,
};

function formatValue(value: number | null | undefined, unit = "") {
  if (value === null || value === undefined) return `--${unit}`;
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

export default function SentiraAirPage() {
  const [reading, setReading] = useState<SensorReading>(fallbackData);
  const [history, setHistory] = useState<SensorReading[]>([]);
  const [loading, setLoading] = useState(true);

  // === 실시간 원격 제어용 상태 변수들 ===
  const [controlMode, setControlMode] = useState<"auto" | "manual">("auto");
  const [targetFan, setTargetFan] = useState(40);
  const [targetHeater, setTargetHeater] = useState(0);
  const [isUpdating, setIsUpdating] = useState(false);
  const [isUserInteracting, setIsUserInteracting] = useState(false); // 사용자가 마우스 슬라이더를 잡고 조작 중인지 여부

  useEffect(() => {
    async function fetchReadings() {
      try {
        const res = await fetch("/api/sentira-air", {
          cache: "no-store",
        });
  
        const result = await res.json();
  
        if (!res.ok || !result.ok) {
          console.error("센서 데이터 조회 실패:", result.error);
          setLoading(false);
          return;
        }
  
        if (result.latest) {
          setReading(result.latest as SensorReading);
        }
  
        if (result.history) {
          setHistory(result.history as SensorReading[]);
        }

        // 사용자가 화면 슬라이더를 만지지 않고 있을 때만 서버의 최신 원격제어 상태와 동기화
        if (result.controls && !isUserInteracting) {
          setControlMode(result.controls.mode);
          setTargetFan(result.controls.fan_percent);
          setTargetHeater(result.controls.ptc_percent);
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

  // DB에 직접 조작 상태 업데이트를 반영하는 함수
  async function handleControlPatch(updatedFields: { mode?: "auto" | "manual"; fan_percent?: number; ptc_percent?: number }) {
    try {
      setIsUpdating(true);
      const res = await fetch("/api/sentira-air", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          serial_number: reading.serial_number ?? "SA-0001",
          ...updatedFields
        })
      });
      if (!res.ok) {
        console.error("원격 설정 변경 실패");
      }
    } catch (err) {
      console.error("원격 설정 처리 중 오류:", err);
    } finally {
      setIsUpdating(false);
    }
  }

  const hasSensorData =
    reading.temperature !== null ||
    reading.humidity !== null ||
    reading.co2 !== null ||
    reading.window_temp !== null;

  const riskPercent = useMemo(() => {
    return getRiskPercent(reading.condensation_risk);
  }, [reading.condensation_risk]);

  const riskText = useMemo(() => {
    return getRiskText(reading.condensation_risk);
  }, [reading.condensation_risk]);

  const score = useMemo(() => {
    if (!hasSensorData) return null;

    const co2 = reading.co2 ?? 0;
    const humidity = reading.humidity ?? 0;

    let result = 100;

    if (co2 > 800) result -= 10;
    if (co2 > 1000) result -= 15;
    if (humidity > 65) result -= 10;
    if (humidity > 75) result -= 15;
    if (riskPercent >= 50) result -= 10;
    if (riskPercent >= 80) result -= 25;

    return Math.max(0, Math.min(100, result));
  }, [reading, hasSensorData, riskPercent]);

  const aiMessage = hasSensorData
    ? reading.ai_message ?? "현재 상태를 분석 중입니다."
    : "센서 데이터 수신 대기 중입니다.";

  const lastUpdated = reading.created_at
    ? new Date(reading.created_at).toLocaleString("ko-KR")
    : `DB 최신 ID: ${reading.id}`;

  return (
    <main className="min-h-screen bg-slate-950 text-white">
      <section className="mx-auto max-w-7xl px-6 py-8 pb-12">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-black">Sentira Air</h1>
            <p className="mt-1 text-slate-400">
              실시간 주거환경 모니터링 대시보드
            </p>
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
              <p className="text-2xl font-black text-white">
                현재 실내 상태 분석
              </p>
              <p className="mt-4 text-lg font-medium text-blue-50">
                {aiMessage}
              </p>
              <p className="mt-3 text-sm text-blue-100">
                마지막 업데이트: {lastUpdated}
              </p>
            </div>
          </div>
        </section>

        <SectionTitle title="실내 센서 상태" />

        <section className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <InfoCard title="실내온도" value={formatValue(reading.temperature, "℃")} />
          <InfoCard title="습도" value={formatValue(reading.humidity, "%")} />
          <InfoCard title="CO₂" value={formatValue(reading.co2, " ppm")} />
          <InfoCard title="VOC" value={formatValue(reading.voc, " ppb")} />
        </section>

        <SectionTitle title="결로 예측" />

        <section className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <GaugeCard
            title="창문온도"
            value={formatValue(reading.window_temp, "℃")}
            percent={hasSensorData ? Math.min(100, Math.max(0, reading.window_temp ?? 0)) : 0}
            desc="표면온도"
          />

          <GaugeCard
            title="이슬점"
            value={formatValue(reading.dew_point, "℃")}
            percent={hasSensorData ? Math.min(100, Math.max(0, (reading.dew_point ?? 0) * 3)) : 0}
            desc="결로 기준"
          />

          <GaugeCard
            title="결로위험도"
            value={hasSensorData ? `${riskPercent}%` : "--%"}
            percent={riskPercent}
            desc={riskText}
          />
        </section>

        {/* ================= 기기 제어 및 현황부 ================= */}
        <div className="flex items-center justify-between mb-3 mt-8">
          <h2 className="text-2xl font-black">기기 제어 & 원격 조작</h2>
          {isUpdating && <span className="text-xs text-cyan-400 animate-pulse">원격 서버 반영 중...</span>}
        </div>

        <section className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          {/* 팬 & 히터 실시간 가동 피드백 화면 */}
          <div className="lg:col-span-1 grid grid-cols-1 gap-4">
            <div className="rounded-[28px] bg-slate-900 p-6 shadow-lg flex flex-col justify-between">
              <div>
                <p className="text-sm font-semibold text-slate-400">현재 팬 속도 (실제)</p>
                <p className="mt-2 text-4xl font-black text-cyan-300">{formatValue(reading.fan_percent, "%")}</p>
              </div>
              <div className="mt-4 h-2 rounded-full bg-slate-800 overflow-hidden">
                <div className="h-full bg-cyan-400 transition-all duration-500" style={{ width: `${reading.fan_percent ?? 0}%` }} />
              </div>
            </div>

            <div className="rounded-[28px] bg-slate-900 p-6 shadow-lg flex flex-col justify-between">
              <div>
                <p className="text-sm font-semibold text-slate-400">현재 PTC 히터 출력 (실제)</p>
                <p className="mt-2 text-4xl font-black text-orange-400">{formatValue(reading.ptc_percent, "%")}</p>
              </div>
              <div className="mt-4 h-2 rounded-full bg-slate-800 overflow-hidden">
                <div className="h-full bg-orange-400 transition-all duration-500" style={{ width: `${reading.ptc_percent ?? 0}%` }} />
              </div>
            </div>
          </div>

          {/* ⚡ 원격 무선 수동 제어 패널 */}
          <div className="lg:col-span-2 rounded-[28px] border border-cyan-400/20 bg-slate-900 p-6 shadow-xl flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between pb-4 border-b border-slate-800">
                <div>
                  <h3 className="text-lg font-bold">무선 원격 제어 패널</h3>
                  <p className="text-xs text-slate-500">기기를 강제로 자동 또는 수동 전환할 수 있습니다.</p>
                </div>

                {/* 자동/수동 모드 스위치 */}
                <div className="flex rounded-xl bg-slate-950 p-1">
                  <button
                    onClick={() => {
                      setControlMode("auto");
                      handleControlPatch({ mode: "auto" });
                    }}
                    className={`px-4 py-1.5 text-xs font-bold rounded-lg transition-all ${
                      controlMode === "auto" ? "bg-cyan-500 text-slate-950" : "text-slate-400 hover:text-white"
                    }`}
                  >
                    자동 제어
                  </button>
                  <button
                    onClick={() => {
                      setControlMode("manual");
                      handleControlPatch({ mode: "manual" });
                    }}
                    className={`px-4 py-1.5 text-xs font-bold rounded-lg transition-all ${
                      controlMode === "manual" ? "bg-orange-500 text-slate-950" : "text-slate-400 hover:text-white"
                    }`}
                  >
                    원격 수동
                  </button>
                </div>
              </div>

              {/* 제어 입력 슬라이더 영역 */}
              <div className="mt-6 space-y-6">
                {/* 1. 수동 팬 세기 조절 */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-semibold text-slate-300">수동 팬 속도 목표값</span>
                    <span className={`text-base font-bold ${controlMode === "manual" ? "text-cyan-400" : "text-slate-600"}`}>
                      {targetFan}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    disabled={controlMode === "auto"}
                    value={targetFan}
                    onMouseDown={() => setIsUserInteracting(true)}
                    onTouchStart={() => setIsUserInteracting(true)}
                    onChange={(e) => setTargetFan(Number(e.target.value))}
                    onMouseUp={() => {
                      setIsUserInteracting(false);
                      handleControlPatch({ fan_percent: targetFan });
                    }}
                    onTouchEnd={() => {
                      setIsUserInteracting(false);
                      handleControlPatch({ fan_percent: targetFan });
                    }}
                    className="w-full h-2 rounded-lg bg-slate-950 appearance-none cursor-pointer accent-cyan-400 disabled:opacity-20 disabled:cursor-not-allowed"
                  />
                </div>

                {/* 2. 수동 히터 출력 조절 */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-semibold text-slate-300">수동 PTC 히터 목표값</span>
                    <span className={`text-base font-bold ${controlMode === "manual" ? "text-orange-400" : "text-slate-600"}`}>
                      {targetHeater}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    disabled={controlMode === "auto"}
                    value={targetHeater}
                    onMouseDown={() => setIsUserInteracting(true)}
                    onTouchStart={() => setIsUserInteracting(true)}
                    onChange={(e) => setTargetHeater(Number(e.target.value))}
                    onMouseUp={() => {
                      setIsUserInteracting(false);
                      handleControlPatch({ ptc_percent: targetHeater });
                    }}
                    onTouchEnd={() => {
                      setIsUserInteracting(false);
                      handleControlPatch({ ptc_percent: targetHeater });
                    }}
                    className="w-full h-2 rounded-lg bg-slate-950 appearance-none cursor-pointer accent-orange-400 disabled:opacity-20 disabled:cursor-not-allowed"
                  />
                </div>
              </div>
            </div>

            <div className="mt-4 pt-3 border-t border-slate-800 text-center">
              <p className="text-xs text-slate-500">
                {controlMode === "auto" 
                  ? "현재 실내 환경 센서값에 의존해 하드웨어가 스스로 가동되고 있습니다." 
                  : "수동 제어 활성화 중. 설정한 조작값이 동기화 주기(약 10초)에 맞추어 ESP32 기기에 전송됩니다."}
              </p>
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
                    <div
                      className="w-full rounded-t-lg bg-cyan-400 transition-all"
                      style={{ height: `${height}px` }}
                    />
                    <span className="mt-2 text-xs text-slate-500">
                      {item.co2 ?? "--"}
                    </span>
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
            <DecisionCard
              title="환기 판단"
              value={hasSensorData && (reading.co2 ?? 0) > 1000 ? "즉시 환기" : "대기"}
            />

            <DecisionCard
              title="팬 제어"
              value={hasSensorData ? `${reading.fan_percent ?? 0}% 유지` : "대기"}
            />

            <DecisionCard
              title="PTC 제어"
              value={hasSensorData ? `${reading.ptc_percent ?? 0}% 유지` : "대기"}
            />
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

function GaugeCard({
  title,
  value,
  percent,
  desc,
}: {
  title: string;
  value: string;
  percent: number;
  desc: string;
}) {
  return (
    <div className="rounded-[28px] bg-slate-900 p-6 shadow-lg">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-base font-semibold text-slate-400">{title}</p>
          <p className="mt-3 text-4xl font-black">{value}</p>
        </div>

        <p className="rounded-full bg-slate-800 px-3 py-1 text-sm text-cyan-300">
          {desc}
        </p>
      </div>

      <div className="mt-6 h-4 overflow-hidden rounded-full bg-slate-800">
        <div
          className="h-full rounded-full bg-cyan-400"
          style={{ width: `${Math.max(0, Math.min(100, percent))}%` }}
        />
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
        <circle
          stroke="rgba(255,255,255,0.22)"
          fill="transparent"
          strokeWidth={stroke}
          r={normalizedRadius}
          cx={radius}
          cy={radius}
        />
        <circle
          stroke="white"
          fill="transparent"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${circumference} ${circumference}`}
          strokeDashoffset={strokeDashoffset}
          r={normalizedRadius}
          cx={radius}
          cy={radius}
        />
      </svg>

      <div className="absolute text-center">
        <p className="text-5xl font-black">{score === null ? "--" : score}</p>
        <p className="text-lg font-bold">점</p>
      </div>
    </div>
  );
}