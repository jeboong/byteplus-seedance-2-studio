import { NextRequest, NextResponse } from "next/server";

const ARK_BASE = "https://ark.ap-southeast.bytepluses.com/api/v3";
const DASHSCOPE_INTL_BASE = "https://dashscope-intl.aliyuncs.com/api/v1";

function isAlibabaModel(modelId: string | null): boolean {
  return modelId?.startsWith("happyhorse-") ?? false;
}

function mapDashScopeStatus(status: unknown): string {
  switch (status) {
    case "PENDING":
      return "queued";
    case "RUNNING":
      return "running";
    case "SUCCEEDED":
      return "succeeded";
    case "FAILED":
      return "failed";
    case "CANCELED":
      return "cancelled";
    case "UNKNOWN":
      return "expired";
    default:
      return "running";
  }
}

function normalizeDashScopeTask(data: Record<string, unknown>) {
  const output = (data.output ?? {}) as Record<string, unknown>;
  const usage = (data.usage ?? {}) as Record<string, unknown>;
  const status = mapDashScopeStatus(output.task_status);
  const sr = usage.SR;
  const ratio = usage.ratio;
  return {
    id: output.task_id,
    status,
    content:
      typeof output.video_url === "string"
        ? { video_url: output.video_url }
        : undefined,
    usage,
    duration:
      typeof usage.output_video_duration === "number"
        ? usage.output_video_duration
        : usage.duration,
    ratio: typeof ratio === "string" ? ratio : undefined,
    resolution:
      typeof sr === "number" || typeof sr === "string" ? `${sr}p` : undefined,
    error:
      status === "failed"
        ? {
            code: output.code,
            message: output.message || "Generation failed",
          }
        : undefined,
    raw: data,
  };
}

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const apiKey = req.headers.get("x-api-key");
  const modelId = req.headers.get("x-model-id");

  if (!apiKey) {
    return NextResponse.json(
      { error: "API Key is required" },
      { status: 400 }
    );
  }

  try {
    if (isAlibabaModel(modelId)) {
      const res = await fetch(`${DASHSCOPE_INTL_BASE}/tasks/${params.id}`, {
        headers: {
          Authorization: `Bearer ${apiKey}`,
        },
      });
      const data = await res.json();
      if (!res.ok) {
        return NextResponse.json(
          { error: data.message || `API Error: ${res.status}` },
          { status: res.status }
        );
      }
      return NextResponse.json(normalizeDashScopeTask(data));
    }

    const res = await fetch(
      `${ARK_BASE}/contents/generations/tasks/${params.id}`,
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
        },
      }
    );

    const data = await res.json();

    if (!res.ok) {
      return NextResponse.json(
        { error: data.error?.message || `API Error: ${res.status}` },
        { status: res.status }
      );
    }

    return NextResponse.json(data);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const apiKey = req.headers.get("x-api-key");
  const modelId = req.headers.get("x-model-id");

  if (!apiKey) {
    return NextResponse.json(
      { error: "API Key is required" },
      { status: 400 }
    );
  }

  try {
    if (isAlibabaModel(modelId)) {
      return new NextResponse(null, { status: 204 });
    }

    const res = await fetch(
      `${ARK_BASE}/contents/generations/tasks/${params.id}`,
      {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${apiKey}`,
        },
      }
    );

    if (res.status === 204 || res.ok) {
      return new NextResponse(null, { status: 204 });
    }

    const data = await res.json().catch(() => ({}));
    return NextResponse.json(
      { error: data.error?.message || `API Error: ${res.status}` },
      { status: res.status }
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
