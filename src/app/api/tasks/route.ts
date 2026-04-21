import { NextRequest, NextResponse } from "next/server";

const ARK_BASE = "https://ark.ap-southeast.bytepluses.com/api/v3";

export async function GET(req: NextRequest) {
  const apiKey = req.headers.get("x-api-key");

  if (!apiKey) {
    return NextResponse.json(
      { error: "API Key is required" },
      { status: 400 }
    );
  }

  try {
    const url = new URL(req.url);
    const params = new URLSearchParams();

    const pageNum = url.searchParams.get("page_num");
    const pageSize = url.searchParams.get("page_size");
    const status = url.searchParams.get("filter.status");
    const model = url.searchParams.get("filter.model");

    if (pageNum) params.set("page_num", pageNum);
    if (pageSize) params.set("page_size", pageSize);
    if (status) params.set("filter.status", status);
    if (model) params.set("filter.model", model);

    const qs = params.toString();
    const res = await fetch(
      `${ARK_BASE}/contents/generations/tasks${qs ? `?${qs}` : ""}`,
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
