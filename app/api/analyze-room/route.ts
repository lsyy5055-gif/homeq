import OpenAI from "openai";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

function extractJson(text: string) {
  return text.replace(/```json/g, "").replace(/```/g, "").trim();
}

export async function POST(req: Request) {
  try {
    const { imageUrl } = await req.json();

    if (!imageUrl) {
      return NextResponse.json(
        { error: "imageUrl is required" },
        { status: 400 }
      );
    }

    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json(
        { error: "OPENAI_API_KEY is missing" },
        { status: 500 }
      );
    }

    const imageResponse = await fetch(imageUrl);

    if (!imageResponse.ok) {
      return NextResponse.json(
        { error: `Image download failed: ${imageResponse.status}` },
        { status: 400 }
      );
    }

    const contentType =
      imageResponse.headers.get("content-type") || "image/jpeg";

    const imageBuffer = await imageResponse.arrayBuffer();
    const base64Image = Buffer.from(imageBuffer).toString("base64");
    const dataUrl = `data:${contentType};base64,${base64Image}`;

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      response_format: { type: "json_object" },
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `
당신은 한국 주거 인테리어 전문가입니다.

사진을 보고 공간을 분석하세요.

반드시 아래 JSON 형식만 반환하세요.
마크다운, 설명문, 코드블록은 절대 쓰지 마세요.

{
  "roomType": "거실/침실/주방/욕실/작업실/기타 중 하나",
  "style": "추천 인테리어 스타일",
  "wall": "벽지 또는 벽 마감 추천",
  "floor": "바닥재 추천",
  "lighting": "조명 추천",
  "budget": "예상 예산 범위",
  "recommendations": [
    "추천 작업 1",
    "추천 작업 2",
    "추천 작업 3",
    "추천 작업 4"
  ]
}
`,
            },
            {
              type: "image_url",
              image_url: {
                url: dataUrl,
              },
            },
          ],
        },
      ],
    });

    const resultText = extractJson(
      response.choices[0]?.message?.content ?? "{}"
    );

    return NextResponse.json({
      result: resultText,
    });
  } catch (err) {
    console.error("AI route error:", err);

    const message = err instanceof Error ? err.message : "AI 분석 실패";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}