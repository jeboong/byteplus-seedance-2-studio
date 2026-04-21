import { NextRequest, NextResponse } from "next/server";

const ARK_BASE = "https://ark.ap-southeast.bytepluses.com/api/v3";

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const apiKey = req.headers.get("x-api-key");

  if (!apiKey) {
    return NextResponse.json(
      { error: "API Key is required" },
      { status: 400 }
    );
  }

  try {
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

  if (!apiKey) {
    return NextResponse.json(
      { error: "API Key is required" },
      { status: 400 }
    );
  }

  try {
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
