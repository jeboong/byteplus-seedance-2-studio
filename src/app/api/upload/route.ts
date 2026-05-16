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

async function readApiResponse(res: Response) {
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

function errorMessage(data: unknown, fallback: string): string {
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
    const err = await readApiResponse(res);
    throw new Error(errorMessage(err, `Files API error: ${res.status}`));
  }

  return readApiResponse(res) as Promise<FileResponse>;
}

async function retrieveFile(
  apiKey: string,
  fileId: string
): Promise<FileResponse> {
  const res = await fetch(`${ARK_BASE}/files/${fileId}`, {
    method: "GET",
    headers: { Authorization: `Bearer ${apiKey}` },
    signal: AbortSignal.timeout(15_000),
  });
  const data = await readApiResponse(res);
  if (!res.ok) {
    throw new Error(errorMessage(data, `Retrieve file error: ${res.status}`));
  }
  return data as FileResponse;
}

async function waitForFileReady(
  apiKey: string,
  file: FileResponse
): Promise<FileResponse> {
  let current = file;
  for (let i = 0; i < 20; i += 1) {
    if (
      current.status === "active" ||
      current.status === "succeeded" ||
      current.status === "uploaded"
    ) {
      return current;
    }
    if (current.status === "failed" || current.status === "error") {
      throw new Error(`Files API preprocessing failed: ${current.status}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 1500));
    current = await retrieveFile(apiKey, current.id);
  }
  throw new Error("Files API preprocessing timed out.");
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

    const uploaded = await uploadToFiles(apiKey, file);
    const fileResp = await waitForFileReady(apiKey, uploaded);
    console.log("[upload] File uploaded:", fileResp.id, fileResp.status);

    let downloadUrl = "";
    try {
      downloadUrl = await getFileUrl(apiKey, fileResp.id);
    } catch (urlErr) {
      console.warn("[upload] getFileUrl failed:", urlErr);
    }

    if (!downloadUrl) {
      return NextResponse.json(
        {
          error:
            "BytePlus Files API가 공개 다운로드 URL을 반환하지 않았습니다. Seedance reference video/audio는 공개 HTTP(S) URL 또는 Asset URL을 사용하세요.",
        },
        { status: 502 }
      );
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
