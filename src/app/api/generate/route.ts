import { NextRequest, NextResponse } from "next/server";

const ARK_BASE = "https://ark.ap-southeast.bytepluses.com/api/v3";
const DASHSCOPE_INTL_BASE = "https://dashscope-intl.aliyuncs.com/api/v1";
const TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes

export const maxDuration = 600; // Vercel/Next.js route timeout (seconds)

async function readProviderResponse(res: Response) {
  const text = await res.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return {
      error:
        text.length > 500
          ? `${text.slice(0, 500)}...`
          : text,
    };
  }
}

function providerError(data: unknown, fallback: string): string {
  if (!data || typeof data !== "object") return fallback;
  const record = data as Record<string, unknown>;
  const nested = record.error;
  if (typeof nested === "string") return nested;
  if (nested && typeof nested === "object") {
    const message = (nested as Record<string, unknown>).message;
    if (typeof message === "string") return message;
  }
  if (typeof record.message === "string") return record.message;
  return fallback;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { apiKey, provider, ...payload } = body;

    if (!apiKey) {
      return NextResponse.json(
        { error: "API Key is required" },
        { status: 400 }
      );
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

    const isAlibaba =
      provider === "alibaba" ||
      (typeof payload.model === "string" && payload.model.startsWith("happyhorse-"));

    const url = isAlibaba
      ? `${DASHSCOPE_INTL_BASE}/services/aigc/video-generation/video-synthesis`
      : `${ARK_BASE}/contents/generations/tasks`;

    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(isAlibaba
          ? {
              "X-DashScope-Async": "enable",
              "X-DashScope-OssResourceResolve": "enable",
            }
          : {}),
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    clearTimeout(timer);

    const data = await readProviderResponse(res);

    if (!res.ok) {
      return NextResponse.json(
        { error: providerError(data, `API Error: ${res.status}`) },
        { status: res.status }
      );
    }

    return NextResponse.json(data);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    console.error("[generate] Error:", msg, e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
