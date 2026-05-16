import { NextRequest, NextResponse } from "next/server";
import { callControlPlaneAPI } from "@/lib/byteplus-sign";

export const maxDuration = 120;

const ARK_BASE = "https://ark.ap-southeast.bytepluses.com/api/v3";

interface ControlPlaneError {
  Code: string;
  Message: string;
}

interface ControlPlaneResult {
  ResponseMetadata: {
    RequestId: string;
    Action: string;
    Error?: ControlPlaneError;
  };
  Result?: Record<string, unknown>;
}

type AssetType = "Image" | "Video" | "Audio";

function asResult(data: Record<string, unknown>): ControlPlaneResult {
  return data as unknown as ControlPlaneResult;
}

function inferAssetType(file: File): AssetType {
  if (file.type.startsWith("video/")) return "Video";
  if (file.type.startsWith("audio/")) return "Audio";
  return "Image";
}

function normalizeAssetType(value: unknown, file?: File): AssetType {
  if (typeof value === "string") {
    const normalized = value.toLowerCase();
    if (normalized === "image") return "Image";
    if (normalized === "video") return "Video";
    if (normalized === "audio") return "Audio";
  }
  return file ? inferAssetType(file) : "Image";
}

async function uploadToFilesAPI(apiKey: string, file: File): Promise<string> {
  const form = new FormData();
  form.append("purpose", "user_data");
  form.append("file", file);

  const res = await fetch(`${ARK_BASE}/files`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
    signal: AbortSignal.timeout(60_000),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message || `Files API error: ${res.status}`);
  }

  const data = await res.json();
  return data.id;
}

async function getFileDownloadUrl(
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
    return res.headers.get("location") || "";
  }

  if (res.ok) {
    const contentType = res.headers.get("content-type") || "";
    if (contentType.includes("json")) {
      const data = await res.json();
      return data.url || data.download_url || "";
    }
  }

  return "";
}

export async function GET(req: NextRequest) {
  try {
    const action = req.nextUrl.searchParams.get("action") || "list_groups";

    if (action === "list_groups") {
      const ownership =
        req.nextUrl.searchParams.get("ownership") || "AuthorizedToMe";
      const { status, data } = await callControlPlaneAPI(
        "ListAuthorizationAssetGroup",
        {
          Filter: { AssetOwnership: ownership },
          Page: { PageSize: 50, PageNumber: 1 },
        }
      );

      const result = asResult(data);
      if (result.ResponseMetadata.Error) {
        return NextResponse.json(
          { error: result.ResponseMetadata.Error.Message },
          { status }
        );
      }

      return NextResponse.json(result.Result);
    }

    if (action === "get_asset") {
      const assetId = req.nextUrl.searchParams.get("id");
      if (!assetId) {
        return NextResponse.json(
          { error: "id parameter required" },
          { status: 400 }
        );
      }

      const { status, data } = await callControlPlaneAPI("GetAsset", {
        Id: assetId,
      });

      const result = asResult(data);
      if (result.ResponseMetadata.Error) {
        return NextResponse.json(
          { error: result.ResponseMetadata.Error.Message },
          { status }
        );
      }

      return NextResponse.json(result.Result);
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const contentType = req.headers.get("content-type") || "";

    if (contentType.includes("multipart/form-data")) {
      const formData = await req.formData();
      const file = formData.get("file") as File | null;
      const apiKey = formData.get("apiKey") as string | null;
      const groupId = formData.get("groupId") as string | null;
      const name = formData.get("name") as string | null;
      const assetType = normalizeAssetType(formData.get("assetType"), file ?? undefined);

      if (!file || !apiKey) {
        return NextResponse.json(
          { error: "file and apiKey are required" },
          { status: 400 }
        );
      }

      if (!groupId) {
        return NextResponse.json(
          { error: "groupId is required. Create an asset group first." },
          { status: 400 }
        );
      }

      const fileId = await uploadToFilesAPI(apiKey, file);
      console.log("[assets] File uploaded to Files API:", fileId);

      const downloadUrl = await getFileDownloadUrl(apiKey, fileId);

      if (!downloadUrl) {
        return NextResponse.json(
          {
            error:
              "CreateAsset는 BytePlus가 접근 가능한 공개 URL이 필요합니다. Files API content endpoint는 인증이 필요할 수 있어 Asset 등록에 쓸 수 없습니다. 공개 HTTPS URL 또는 콘솔에서 만든 asset://를 사용하세요.",
            fileId,
          },
          { status: 502 }
        );
      }

      const { status, data } = await callControlPlaneAPI("CreateAsset", {
        GroupId: groupId,
        URL: downloadUrl,
        AssetType: assetType,
        Name: name || file.name,
      });

      const result = asResult(data);
      if (result.ResponseMetadata.Error) {
        return NextResponse.json(
          {
            error: result.ResponseMetadata.Error.Message,
            code: result.ResponseMetadata.Error.Code,
            fileId,
          },
          { status }
        );
      }

      return NextResponse.json({
        ...result.Result,
        fileId,
      });
    }

    const body = await req.json();
    const { action, ...params } = body;

    if (action === "create_group") {
      const { status, data } = await callControlPlaneAPI(
        "CreateAssetGroup",
        params
      );
      const result = asResult(data);
      if (result.ResponseMetadata.Error) {
        return NextResponse.json(
          {
            error: result.ResponseMetadata.Error.Message,
            code: result.ResponseMetadata.Error.Code,
          },
          { status }
        );
      }
      return NextResponse.json(result.Result);
    }

    if (action === "create_asset") {
      const assetType = normalizeAssetType(params.AssetType ?? params.assetType);
      const assetParams = {
        ...params,
        AssetType: assetType,
      };
      delete (assetParams as Record<string, unknown>).assetType;
      const { status, data } = await callControlPlaneAPI(
        "CreateAsset",
        assetParams
      );
      const result = asResult(data);
      if (result.ResponseMetadata.Error) {
        return NextResponse.json(
          {
            error: result.ResponseMetadata.Error.Message,
            code: result.ResponseMetadata.Error.Code,
          },
          { status }
        );
      }
      return NextResponse.json(result.Result);
    }

    if (action === "delete_asset") {
      const { status, data } = await callControlPlaneAPI("DeleteAsset", {
        Id: params.id,
      });
      const result = asResult(data);
      if (result.ResponseMetadata.Error) {
        return NextResponse.json(
          { error: result.ResponseMetadata.Error.Message },
          { status }
        );
      }
      return NextResponse.json({ success: true });
    }

    if (action === "delete_group") {
      const { status, data } = await callControlPlaneAPI("DeleteAssetGroup", {
        Id: params.id,
      });
      const result = asResult(data);
      if (result.ResponseMetadata.Error) {
        return NextResponse.json(
          { error: result.ResponseMetadata.Error.Message },
          { status }
        );
      }
      return NextResponse.json({ success: true });
    }

    if (action === "get_group") {
      const { status, data } = await callControlPlaneAPI(
        "GetAuthorizationAssetGroup",
        { GroupId: params.groupId }
      );
      const result = asResult(data);
      if (result.ResponseMetadata.Error) {
        return NextResponse.json(
          { error: result.ResponseMetadata.Error.Message },
          { status }
        );
      }
      return NextResponse.json(result.Result);
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    console.error("[assets] Error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
