import { AwsClient } from "aws4fetch";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 120;

const MAX_R2_UPLOAD_BYTES = 100 * 1024 * 1024;

function env(name: string): string {
  return process.env[name]?.trim() ?? "";
}

function getR2Config() {
  const config = {
    accountId: env("R2_ACCOUNT_ID"),
    accessKeyId: env("R2_ACCESS_KEY_ID"),
    secretAccessKey: env("R2_SECRET_ACCESS_KEY"),
    bucket: env("R2_BUCKET"),
    publicBaseUrl: env("R2_PUBLIC_BASE_URL").replace(/\/+$/, ""),
    prefix: env("R2_PREFIX").replace(/^\/+|\/+$/g, ""),
  };
  const missing = [
    ["R2_ACCOUNT_ID", config.accountId],
    ["R2_ACCESS_KEY_ID", config.accessKeyId],
    ["R2_SECRET_ACCESS_KEY", config.secretAccessKey],
    ["R2_BUCKET", config.bucket],
    ["R2_PUBLIC_BASE_URL", config.publicBaseUrl],
  ]
    .filter(([, value]) => !value)
    .map(([name]) => name);

  return { config, missing };
}

function safeName(name: string): string {
  const fallback = `upload-${Date.now()}`;
  const cleaned = (name || fallback)
    .normalize("NFKD")
    .replace(/[^\w.\-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[-.]+|[-.]+$/g, "")
    .slice(0, 120);
  return cleaned || fallback;
}

function folderFor(file: File): string {
  if (file.type.startsWith("image/")) return "images";
  if (file.type.startsWith("video/")) return "videos";
  if (file.type.startsWith("audio/")) return "audio";
  return "files";
}

function objectKey(file: File, prefix: string): string {
  const now = new Date();
  const year = String(now.getUTCFullYear());
  const month = String(now.getUTCMonth() + 1).padStart(2, "0");
  const random = globalThis.crypto.randomUUID().slice(0, 8);
  return [
    prefix,
    folderFor(file),
    year,
    month,
    `${Date.now()}-${random}-${safeName(file.name)}`,
  ]
    .filter(Boolean)
    .join("/");
}

function publicUrl(baseUrl: string, key: string): string {
  return `${baseUrl}/${key.split("/").map(encodeURIComponent).join("/")}`;
}

function objectApiUrl(accountId: string, bucket: string, key: string): string {
  const encodedBucket = encodeURIComponent(bucket);
  const encodedKey = key.split("/").map(encodeURIComponent).join("/");
  return `https://${accountId}.r2.cloudflarestorage.com/${encodedBucket}/${encodedKey}`;
}

export async function POST(req: NextRequest) {
  const { config, missing } = getR2Config();
  if (missing.length > 0) {
    return NextResponse.json(
      {
        configured: false,
        error: "R2 is not configured",
        missing,
      },
      { status: 501 }
    );
  }

  if (!/^https?:\/\//i.test(config.publicBaseUrl)) {
    return NextResponse.json(
      { error: "R2_PUBLIC_BASE_URL must start with http:// or https://" },
      { status: 500 }
    );
  }

  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    if (!file) {
      return NextResponse.json({ error: "file is required" }, { status: 400 });
    }
    if (file.size > MAX_R2_UPLOAD_BYTES) {
      return NextResponse.json(
        { error: "R2 upload file must be 100MB or smaller" },
        { status: 413 }
      );
    }

    const key = objectKey(file, config.prefix);
    const client = new AwsClient({
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
      service: "s3",
      region: "auto",
    });
    const contentType = file.type || "application/octet-stream";
    const body = await file.arrayBuffer();
    const uploadRes = await client.fetch(
      objectApiUrl(config.accountId, config.bucket, key),
      {
        method: "PUT",
        headers: {
          "content-type": contentType,
          "content-length": String(body.byteLength),
          "cache-control": "public, max-age=31536000, immutable",
        },
        body,
        signal: AbortSignal.timeout(120_000),
      }
    );

    if (!uploadRes.ok) {
      const err = await uploadRes.text().catch(() => "");
      throw new Error(err || `R2 upload failed: ${uploadRes.status}`);
    }

    return NextResponse.json({
      url: publicUrl(config.publicBaseUrl, key),
      key,
      filename: file.name,
      bytes: file.size,
      mime_type: contentType,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown R2 upload error";
    console.error("[r2-upload] Error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
