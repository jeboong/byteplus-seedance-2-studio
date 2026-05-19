import { NextRequest, NextResponse } from "next/server";

const DEFAULT_TEAM = "6팀";
const DEFAULT_SOURCE = "external";
const MAX_REPORTED_TASKS = 5000;

const reportedTaskIds = new Set<string>();

function toPositiveNumber(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return null;
  }
  return value;
}

function rememberReportedTask(taskId: string) {
  reportedTaskIds.add(taskId);
  if (reportedTaskIds.size <= MAX_REPORTED_TASKS) return;
  const oldest = reportedTaskIds.values().next().value;
  if (oldest) reportedTaskIds.delete(oldest);
}

function parseJson(text: string): Record<string, unknown> {
  if (!text) return {};
  try {
    const data = JSON.parse(text);
    return data && typeof data === "object" ? data : {};
  } catch {
    return {};
  }
}

function normalizeTrackerUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  try {
    const url = new URL(trimmed);
    if (
      url.protocol !== "https:" ||
      url.hostname !== "script.google.com" ||
      !url.pathname.startsWith("/macros/s/") ||
      !url.pathname.endsWith("/exec")
    ) {
      return null;
    }
    return url.toString();
  } catch {
    return null;
  }
}

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid JSON body" },
      { status: 400 }
    );
  }

  const taskId = typeof body.task_id === "string" ? body.task_id.trim() : "";
  const totalTokens = toPositiveNumber(body.total_tokens);
  const completionTokens = toPositiveNumber(body.completion_tokens);
  const trackerUrl = normalizeTrackerUrl(body.tracker_url);

  if (!taskId || !totalTokens) {
    return NextResponse.json(
      { ok: false, error: "task_id and total_tokens are required" },
      { status: 400 }
    );
  }

  if (!trackerUrl) {
    return NextResponse.json({ ok: true, skipped: true });
  }

  if (reportedTaskIds.has(taskId)) {
    return NextResponse.json({ ok: true, skipped: true });
  }

  const payload: Record<string, unknown> = {
    team: process.env.USAGE_TRACKER_TEAM || DEFAULT_TEAM,
    task_id: taskId,
    total_tokens: totalTokens,
    source: process.env.USAGE_TRACKER_SOURCE || DEFAULT_SOURCE,
    timestamp:
      typeof body.timestamp === "number" && Number.isFinite(body.timestamp)
        ? body.timestamp
        : Date.now(),
  };

  if (completionTokens) {
    payload.completion_tokens = completionTokens;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  rememberReportedTask(taskId);

  try {
    const res = await fetch(trackerUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    const text = await res.text();
    const data = parseJson(text);

    if (!res.ok || data.ok === false) {
      reportedTaskIds.delete(taskId);
      return NextResponse.json(
        {
          ok: false,
          error:
            typeof data.error === "string"
              ? data.error
              : `Tracker error: ${res.status}`,
        },
        { status: 502 }
      );
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    reportedTaskIds.delete(taskId);
    const message = error instanceof Error ? error.message : "Tracker failed";
    return NextResponse.json({ ok: false, error: message }, { status: 502 });
  } finally {
    clearTimeout(timer);
  }
}
