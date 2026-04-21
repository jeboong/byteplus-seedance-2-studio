import { NextRequest, NextResponse } from "next/server";

const ARK_BASE = "https://ark.ap-southeast.bytepluses.com/api/v3";
export const maxDuration = 120;

interface FileResponse {
  id: string;
  object: string;
  purpose: string;
  filename: string;
  bytes: number;
  mime_type: string;
  status: string;
  created_at: number;
  expire_at: number;
}

async function uploadToFiles(
  apiKey: string,
  file: File
): Promise<FileResponse> {
  const form = new FormData();
  form.append("purpose", "user_data");
  form.append("file", file);

  const res = await fetch(`${ARK_BASE}/files`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
    signal: AbortSignal.timeout(120_000),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(
      err?.error?.message || `Files API error: ${res.status}`
    );
  }

  return res.json();
}

async function getFileUrl(
  apiKey: string,
  fileId: string
): Promise<string> {
  const res = await fetch(`${ARK_BASE}/files/${fileId}/content`, {
    method: "GET",
    headers: { Authorization: `Bearer ${apiKey}` },
    signal: AbortSignal.timeout(15_000),
    redirect: "manual",
  });

  if (res.status >= 300 && res.status < 400) {
    const loc = res.headers.get("location");
    if (loc) return loc;
  }

  if (res.ok) {
    const ct = res.headers.get("content-type") || "";
    if (ct.includes("json")) {
      const data = await res.json().catch(() => ({}));
      const url = (data as { url?: string; download_url?: string }).url ||
        (data as { url?: string; download_url?: string }).download_url;
      if (url) return url;
    }
  }

  return "";
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const apiKey = formData.get("apiKey") as string | null;

    if (!file || !apiKey) {
      return NextResponse.json(
        { error: "file and apiKey are required" },
        { status: 400 }
      );
    }

    const fileResp = await uploadToFiles(apiKey, file);
    console.log("[upload] File uploaded:", fileResp.id, fileResp.status);

    let downloadUrl = "";
    try {
      downloadUrl = await getFileUrl(apiKey, fileResp.id);
    } catch (urlErr) {
      console.warn("[upload] getFileUrl failed:", urlErr);
    }

    if (!downloadUrl) {
      downloadUrl = `${ARK_BASE}/files/${fileResp.id}/content`;
    }

    return NextResponse.json({
      fileId: fileResp.id,
      url: downloadUrl,
      status: fileResp.status,
      filename: fileResp.filename,
      bytes: fileResp.bytes,
      mime_type: fileResp.mime_type,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    console.error("[upload] Error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
