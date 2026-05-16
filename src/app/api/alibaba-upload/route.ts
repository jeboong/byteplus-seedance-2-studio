import { NextRequest, NextResponse } from "next/server";

const DASHSCOPE_UPLOAD_BASE =
  process.env.DASHSCOPE_UPLOAD_BASE ||
  "https://dashscope-intl.aliyuncs.com/api/v1";
const MAX_HAPPYHORSE_IMAGE_BYTES = 10 * 1024 * 1024;
const SUPPORTED_IMAGE_MIME = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/bmp",
  "image/webp",
]);

export const maxDuration = 120;

interface UploadPolicyData {
  policy: string;
  signature: string;
  upload_dir: string;
  upload_host: string;
  expire_in_seconds?: number | string;
  max_file_size_mb?: number | string;
  oss_access_key_id: string;
  x_oss_object_acl: string;
  x_oss_forbid_overwrite: string;
}

function isSupportedImage(file: File): boolean {
  if (SUPPORTED_IMAGE_MIME.has(file.type.toLowerCase())) return true;
  return /\.(jpe?g|png|bmp|webp)$/i.test(file.name);
}

function safeFileName(name: string): string {
  const cleaned = name
    .replace(/[\\/:*?"<>|#%{}^~[\]`]/g, "-")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(-120);
  return cleaned || `image-${Date.now()}.png`;
}

async function getUploadPolicy(
  apiKey: string,
  model: string
): Promise<UploadPolicyData> {
  const url = `${DASHSCOPE_UPLOAD_BASE}/uploads?action=getPolicy&model=${encodeURIComponent(
    model
  )}`;
  const res = await fetch(url, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    signal: AbortSignal.timeout(30_000),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const detail = data?.message || data?.error?.message || `API Error: ${res.status}`;
    throw new Error(
      `ModelStudio 임시 업로드 policy 발급 실패: ${detail}`
    );
  }

  if (!data?.data?.upload_host || !data?.data?.upload_dir) {
    throw new Error("ModelStudio 임시 업로드 policy 응답이 올바르지 않습니다.");
  }

  return data.data as UploadPolicyData;
}

async function uploadToTemporaryOss(
  policy: UploadPolicyData,
  file: File
): Promise<string> {
  const key = `${policy.upload_dir}/${Date.now()}-${Math.random()
    .toString(36)
    .slice(2)}-${safeFileName(file.name)}`;
  const form = new FormData();
  form.append("OSSAccessKeyId", policy.oss_access_key_id);
  form.append("Signature", policy.signature);
  form.append("policy", policy.policy);
  form.append("x-oss-object-acl", policy.x_oss_object_acl);
  form.append("x-oss-forbid-overwrite", policy.x_oss_forbid_overwrite);
  form.append("key", key);
  form.append("success_action_status", "200");
  form.append("file", file, file.name);

  const res = await fetch(policy.upload_host, {
    method: "POST",
    body: form,
    signal: AbortSignal.timeout(120_000),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`ModelStudio 임시 OSS 업로드 실패: ${text || res.status}`);
  }

  return `oss://${key}`;
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const apiKey = formData.get("apiKey") as string | null;
    const model = formData.get("model") as string | null;

    if (!file || !apiKey || !model) {
      return NextResponse.json(
        { error: "file, apiKey, and model are required" },
        { status: 400 }
      );
    }
    if (!model.startsWith("happyhorse-")) {
      return NextResponse.json(
        { error: "Alibaba upload is only available for HappyHorse models." },
        { status: 400 }
      );
    }
    if (!isSupportedImage(file)) {
      return NextResponse.json(
        { error: "HappyHorse는 JPEG/JPG/PNG/BMP/WEBP 이미지만 첨부할 수 있습니다." },
        { status: 400 }
      );
    }
    if (file.size > MAX_HAPPYHORSE_IMAGE_BYTES) {
      return NextResponse.json(
        { error: "HappyHorse 이미지 첨부는 10MB 이하여야 합니다." },
        { status: 400 }
      );
    }

    const policy = await getUploadPolicy(apiKey, model);
    const maxMb = Number(policy.max_file_size_mb ?? 0);
    if (Number.isFinite(maxMb) && maxMb > 0 && file.size > maxMb * 1024 * 1024) {
      return NextResponse.json(
        { error: `ModelStudio 임시 업로드 한도는 ${maxMb}MB입니다.` },
        { status: 400 }
      );
    }

    const url = await uploadToTemporaryOss(policy, file);
    return NextResponse.json({
      url,
      bytes: file.size,
      filename: file.name,
      expiresInSeconds: Number(policy.expire_in_seconds || 0) || undefined,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown upload error";
    console.error("[alibaba-upload] Error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
