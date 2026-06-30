"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";

type AnalysisResult = {
  roomType: string;
  style: string;
  wall: string;
  floor: string;
  lighting: string;
  budget: string;
  recommendations: string[];
};

export default function Home() {
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [fileName, setFileName] = useState("");
  const [uploadedUrl, setUploadedUrl] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(
    null
  );

  async function handleImageUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];

    if (!file) return;

    setFileName(file.name);
    setUploadedUrl("");
    setErrorMessage("");
    setAnalysisResult(null);

    const previewUrl = URL.createObjectURL(file);
    setImagePreview(previewUrl);

    try {
      setIsUploading(true);

      const extension = file.name.split(".").pop();
      const uniqueFileName = `uploads/${Date.now()}.${extension}`;

      const { error } = await supabase.storage
        .from("room-photos")
        .upload(uniqueFileName, file, {
          cacheControl: "3600",
          upsert: false,
          contentType: file.type,
        });

      if (error) {
        setErrorMessage(error.message);
        alert(`사진 업로드 실패: ${error.message}`);
        return;
      }

      const { data } = supabase.storage
        .from("room-photos")
        .getPublicUrl(uniqueFileName);

      setUploadedUrl(data.publicUrl);
      alert("사진 업로드 성공!");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "알 수 없는 오류입니다.";
      setErrorMessage(message);
      alert(`예상하지 못한 오류: ${message}`);
    } finally {
      setIsUploading(false);
    }
  }

  async function handleAnalyze() {
    if (!uploadedUrl) return;

    setIsAnalyzing(true);
    setAnalysisResult(null);
    setErrorMessage("");

    try {
      const response = await fetch("/api/analyze-room", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          imageUrl: uploadedUrl,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "AI 분석에 실패했습니다.");
      }

      const parsedResult = JSON.parse(data.result) as AnalysisResult;

      setAnalysisResult(parsedResult);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "알 수 없는 오류입니다.";

      console.error("Analyze error:", error);
      setErrorMessage(message);
      alert(`AI 분석 실패: ${message}`);
    } finally {
      setIsAnalyzing(false);
    }
  }

  function resetPage() {
    setImagePreview(null);
    setFileName("");
    setUploadedUrl("");
    setErrorMessage("");
    setAnalysisResult(null);
    setIsUploading(false);
    setIsAnalyzing(false);
  }

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900">
     
      <section className="mx-auto max-w-6xl px-6 py-10">
        <div className="mb-10 text-center">
          <p className="mb-4 inline-flex rounded-full bg-blue-50 px-4 py-2 text-sm font-bold text-blue-600">
            AI 리모델링 MVP
          </p>

          <h1 className="text-4xl font-extrabold tracking-tight md:text-5xl">
            사진 한 장으로 공간을 분석합니다
          </h1>

          <p className="mx-auto mt-5 max-w-2xl text-lg leading-8 text-slate-600">
            HomeQ가 공간 사진을 업로드하고, AI가 리모델링 스타일과 예상 견적을
            제안합니다.
          </p>
        </div>

        <div className="grid gap-8 lg:grid-cols-2">
          <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
            <h2 className="text-xl font-bold">1. 사진 업로드</h2>
            <p className="mt-2 text-sm text-slate-500">
              거실, 방, 주방, 화장실 사진을 선택하세요.
            </p>

            <label className="mt-8 flex h-80 cursor-pointer flex-col items-center justify-center rounded-3xl border-2 border-dashed border-blue-300 bg-blue-50/50 text-center hover:bg-blue-50">
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleImageUpload}
              />

              <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-blue-600 text-3xl text-white">
                +
              </div>

              <p className="text-lg font-bold text-slate-900">
                사진을 선택하세요
              </p>
              <p className="mt-2 text-sm text-slate-500">
                JPG, PNG, WEBP 이미지 지원
              </p>
            </label>

            {fileName && (
              <p className="mt-4 rounded-2xl bg-slate-50 p-4 text-sm text-slate-600">
                선택된 파일: <span className="font-semibold">{fileName}</span>
              </p>
            )}

            {isUploading && (
              <p className="mt-4 rounded-2xl bg-blue-50 p-4 text-sm font-semibold text-blue-600">
                Supabase Storage에 업로드 중입니다...
              </p>
            )}

            {uploadedUrl && (
              <div className="mt-4 rounded-2xl bg-green-50 p-4 text-sm text-green-700">
                <p className="font-bold">업로드 완료</p>
                <p className="mt-1 break-all">{uploadedUrl}</p>
              </div>
            )}
          </div>

          <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
            <h2 className="text-xl font-bold">2. 미리보기 및 AI 분석</h2>
            <p className="mt-2 text-sm text-slate-500">
              업로드한 사진을 확인하고 AI 분석을 시작합니다.
            </p>

            <div className="mt-8 flex h-80 items-center justify-center overflow-hidden rounded-3xl bg-slate-100">
              {imagePreview ? (
                <img
                  src={imagePreview}
                  alt="업로드한 방 사진"
                  className="h-full w-full object-cover"
                />
              ) : (
                <p className="text-sm text-slate-400">
                  아직 업로드된 사진이 없습니다.
                </p>
              )}
            </div>

            <button
              onClick={handleAnalyze}
              disabled={!uploadedUrl || isUploading || isAnalyzing}
              className="mt-6 w-full rounded-full bg-blue-600 px-6 py-4 text-base font-bold text-white disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              {isAnalyzing ? "AI 분석 중..." : "AI 분석 시작하기"}
            </button>

            <button
              onClick={resetPage}
              className="mt-3 w-full rounded-full border border-slate-300 bg-white px-6 py-4 text-base font-bold text-slate-700 hover:bg-slate-50"
            >
              다시 업로드하기
            </button>
          </div>
        </div>

        {isAnalyzing && (
          <section className="mt-8 rounded-3xl border border-blue-100 bg-blue-50 p-8 text-center">
            <p className="text-lg font-bold text-blue-700">
              HomeQ AI가 공간을 분석하고 있습니다...
            </p>
            <p className="mt-2 text-sm text-blue-600">
              업로드된 이미지를 GPT Vision으로 분석 중입니다.
            </p>
          </section>
        )}

        {errorMessage && (
          <section className="mt-8 rounded-3xl border border-red-100 bg-red-50 p-6 text-red-700">
            <p className="font-bold">오류 발생</p>
            <p className="mt-2 break-all text-sm">{errorMessage}</p>
          </section>
        )}

        {analysisResult && (
          <section className="mt-8 rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
            <div className="mb-8 flex flex-col justify-between gap-4 md:flex-row md:items-center">
              <div>
                <p className="text-sm font-bold text-blue-600">
                  HomeQ AI 분석 결과
                </p>
                <h2 className="mt-2 text-3xl font-extrabold">
                  {analysisResult.roomType} 리모델링 제안
                </h2>
              </div>

              <div className="rounded-2xl bg-blue-50 px-5 py-3 text-sm font-bold text-blue-700">
                추천 스타일: {analysisResult.style}
              </div>
            </div>

            <div className="grid gap-5 md:grid-cols-4">
              <div className="rounded-2xl bg-slate-50 p-5">
                <p className="text-sm font-bold text-slate-500">벽</p>
                <p className="mt-2 font-bold">{analysisResult.wall}</p>
              </div>

              <div className="rounded-2xl bg-slate-50 p-5">
                <p className="text-sm font-bold text-slate-500">바닥</p>
                <p className="mt-2 font-bold">{analysisResult.floor}</p>
              </div>

              <div className="rounded-2xl bg-slate-50 p-5">
                <p className="text-sm font-bold text-slate-500">조명</p>
                <p className="mt-2 font-bold">{analysisResult.lighting}</p>
              </div>

              <div className="rounded-2xl bg-blue-600 p-5 text-white">
                <p className="text-sm font-bold text-blue-100">예상 예산</p>
                <p className="mt-2 font-bold">{analysisResult.budget}</p>
              </div>
            </div>

            <div className="mt-8 rounded-2xl border border-slate-200 p-6">
              <h3 className="text-xl font-bold">추천 작업</h3>

              <div className="mt-4 space-y-3">
                {analysisResult.recommendations.map((item) => (
                  <div
                    key={item}
                    className="flex gap-3 rounded-2xl bg-slate-50 p-4 text-sm text-slate-700"
                  >
                    <span className="font-bold text-blue-600">✓</span>
                    <p>{item}</p>
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}
      </section>
    </main>
  );
}