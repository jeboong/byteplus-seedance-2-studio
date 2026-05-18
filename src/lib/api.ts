import {
  getModelOption,
  isAlibabaModel,
  type ModelId,
  type ModelParams,
  type ReferenceAsset,
} from "./types";
import { expandPromptTags, getRefTags } from "./refTags";

function isDashScopeMediaUrl(url: string): boolean {
  return /^(https?:\/\/|oss:\/\/)/i.test(url);
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

function apiError(data: unknown, fallback: string): string {
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

const USAGE_REPORTED_TASKS_KEY = "sd2_usage_reported_tasks";

function getReportedUsageTasks(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = window.localStorage.getItem(USAGE_REPORTED_TASKS_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(parsed) ? parsed.filter(Boolean) : []);
  } catch {
    return new Set();
  }
}

function markUsageTaskReported(taskId: string) {
  if (typeof window === "undefined") return;
  const tasks = getReportedUsageTasks();
  tasks.add(taskId);
  const compact = Array.from(tasks).slice(-1000);
  window.localStorage.setItem(
    USAGE_REPORTED_TASKS_KEY,
    JSON.stringify(compact)
  );
}

function hasUsageTaskReported(taskId: string): boolean {
  return getReportedUsageTasks().has(taskId);
}

function expandHappyHorseReferenceTags(
  prompt: string,
  references: ReferenceAsset[]
): string {
  const tags = getRefTags(references);
  let next = prompt;
  references.forEach((ref, index) => {
    const tag = tags[ref.id];
    if (!tag) return;
    next = next.replace(
      new RegExp(tag.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi"),
      `character${index + 1}`
    );
  });
  return next;
}

function buildHappyHorsePayload(
  prompt: string,
  references: ReferenceAsset[],
  params: ModelParams
) {
  const model = getModelOption(params.modelId);
  const duration = params.durationType === "seconds" ? params.duration : 5;
  const resolution = params.resolution === "1080p" ? "1080P" : "720P";
  const parameters: Record<string, unknown> = {
    resolution,
    duration,
    watermark: params.watermark,
  };

  if (params.seed.trim() !== "") {
    parameters.seed = parseInt(params.seed, 10);
  }

  const input: Record<string, unknown> = {
    prompt: expandHappyHorseReferenceTags(prompt, references),
  };

  if (model.happyHorseMode === "t2v") {
    if (params.ratio !== "adaptive" && params.ratio !== "21:9") {
      parameters.ratio = params.ratio;
    }
  } else if (model.happyHorseMode === "i2v") {
    const firstFrame =
      references.find((r) => r.role === "first_frame" && r.type === "image") ??
      references.find((r) => r.type === "image");
    if (!firstFrame || !isDashScopeMediaUrl(firstFrame.url)) {
      throw new Error("HappyHorse I2V는 공개 HTTP(S) 또는 임시 OSS 첫 프레임 이미지 URL 1개가 필요합니다.");
    }
    input.media = [{ type: "first_frame", url: firstFrame.url }];
  } else if (model.happyHorseMode === "r2v") {
    const refs = references.filter((r) => r.type === "image");
    if (refs.length < 1 || refs.length > 9) {
      throw new Error("HappyHorse R2V는 공개 HTTP(S) 레퍼런스 이미지 URL 1~9개가 필요합니다.");
    }
    const invalid = refs.find((r) => !isDashScopeMediaUrl(r.url));
    if (invalid) {
      throw new Error(`HappyHorse R2V는 공개 HTTP(S) 또는 임시 OSS 이미지만 보낼 수 있습니다: ${invalid.name}`);
    }
    input.media = refs.map((ref) => ({
      type: "reference_image",
      url: ref.url,
    }));
    if (params.ratio !== "adaptive" && params.ratio !== "21:9") {
      parameters.ratio = params.ratio;
    }
  }

  return {
    provider: "alibaba",
    model: params.modelId,
    input,
    parameters,
  };
}

export function buildPayload(
  prompt: string,
  references: ReferenceAsset[],
  params: ModelParams
) {
  if (isAlibabaModel(params.modelId)) {
    return buildHappyHorsePayload(prompt, references, params);
  }

  // BytePlus recommends "[Image 1]xxx, [Image 2]xxx" natural-language refs.
  // We let users author with friendly @img1 / @vid1 / @aud1 tags in the UI
  // and expand them here just before sending the request.
  const activeReferences = params.mode === "text" ? [] : references;
  const expandedPrompt =
    params.mode === "text" ? prompt : expandPromptTags(prompt);

  const content: Record<string, unknown>[] = [
    { type: "text", text: expandedPrompt },
  ];

  for (const ref of activeReferences) {
    if (ref.uploading || !ref.url) {
      throw new Error(`파일 업로드가 아직 끝나지 않았습니다: ${ref.name}`);
    }
    if (ref.url.startsWith("data:") && ref.type === "video") {
      throw new Error(
        `이전 방식의 로컬 첨부가 남아 있습니다. ${ref.name}을 삭제한 뒤 다시 첨부하세요.`
      );
    }
    if (ref.type === "image") {
      content.push({
        type: "image_url",
        image_url: { url: ref.url },
        role: ref.role || "reference_image",
      });
    } else if (ref.type === "video") {
      content.push({
        type: "video_url",
        video_url: { url: ref.url },
        role: ref.role || "reference_video",
      });
    } else if (ref.type === "audio") {
      content.push({
        type: "audio_url",
        audio_url: { url: ref.url },
        role: ref.role || "reference_audio",
      });
    }
  }

  const body: Record<string, unknown> = {
    model: params.modelId,
    content,
    generate_audio: params.generateAudio,
    watermark: params.watermark,
    ratio: params.ratio,
  };

  if (params.durationType === "seconds") {
    body.duration = params.duration;
  } else {
    body.duration = -1;
  }

  if (params.resolution) {
    body.resolution = params.resolution;
  }

  if (params.seed && params.seed.trim() !== "") {
    body.seed = parseInt(params.seed, 10);
  }

  if (params.returnLastFrame) {
    body.return_last_frame = true;
  }

  if (params.generationTimeout) {
    body.execution_expires_after = params.generationTimeout * 3600;
  }

  return body;
}

export async function createGenerationTask(
  apiKey: string,
  prompt: string,
  references: ReferenceAsset[],
  params: ModelParams
) {
  const payload = buildPayload(prompt, references, params);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10 * 60 * 1000);

  const res = await fetch("/api/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ apiKey, ...payload }),
    signal: controller.signal,
  });

  clearTimeout(timer);

  const data = await readApiResponse(res);
  if (!res.ok) throw new Error(apiError(data, `API Error: ${res.status}`));
  if (isAlibabaModel(params.modelId)) {
    const output = data.output ?? {};
    return {
      ...data,
      id: output.task_id,
      status: output.task_status,
    };
  }
  return data;
}

export async function getTaskStatus(apiKey: string, taskId: string, modelId?: ModelId) {
  const res = await fetch(`/api/task/${taskId}`, {
    headers: {
      "x-api-key": apiKey,
      ...(modelId ? { "x-model-id": modelId } : {}),
    },
  });

  const data = await readApiResponse(res);
  if (!res.ok) throw new Error(apiError(data, `API Error: ${res.status}`));
  return data;
}

export async function reportUsageOnce(
  taskId: string,
  usage?: {
    completion_tokens?: number;
    total_tokens?: number;
  }
) {
  const totalTokens = usage?.total_tokens;
  if (
    !taskId ||
    typeof totalTokens !== "number" ||
    !Number.isFinite(totalTokens) ||
    totalTokens <= 0 ||
    hasUsageTaskReported(taskId)
  ) {
    return;
  }

  try {
    const res = await fetch("/api/usage-report", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        task_id: taskId,
        total_tokens: totalTokens,
        completion_tokens: usage?.completion_tokens,
        timestamp: Date.now(),
      }),
    });
    const data = await readApiResponse(res);
    if (res.ok && (data as Record<string, unknown>).ok !== false) {
      markUsageTaskReported(taskId);
    } else {
      console.warn(
        "[usage-report] Tracker rejected usage report:",
        apiError(data, `HTTP ${res.status}`)
      );
    }
  } catch (error) {
    console.warn("[usage-report] Tracker POST failed:", error);
  }
}

export async function deleteTask(apiKey: string, taskId: string, modelId?: ModelId) {
  const res = await fetch(`/api/task/${taskId}`, {
    method: "DELETE",
    headers: {
      "x-api-key": apiKey,
      ...(modelId ? { "x-model-id": modelId } : {}),
    },
  });

  if (res.status === 204) return { success: true };
  const data = await readApiResponse(res);
  if (!res.ok) throw new Error(apiError(data, `API Error: ${res.status}`));
  return data;
}

export async function listTasks(
  apiKey: string,
  filters?: {
    status?: string;
    page_num?: number;
    page_size?: number;
  }
) {
  const params = new URLSearchParams();
  if (filters?.status) params.set("filter.status", filters.status);
  if (filters?.page_num) params.set("page_num", String(filters.page_num));
  if (filters?.page_size) params.set("page_size", String(filters.page_size));

  const qs = params.toString();
  const res = await fetch(`/api/tasks${qs ? `?${qs}` : ""}`, {
    headers: { "x-api-key": apiKey },
  });

  const data = await readApiResponse(res);
  if (!res.ok) throw new Error(apiError(data, `API Error: ${res.status}`));
  return data;
}

/* ── Files API (data-plane, returns file_id + download URL) ── */

export async function uploadFile(
  apiKey: string,
  file: File
): Promise<{ fileId: string; url: string; bytes: number; mime_type?: string }> {
  const form = new FormData();
  form.append("file", file);
  form.append("apiKey", apiKey);

  const res = await fetch("/api/upload", {
    method: "POST",
    body: form,
  });

  const data = await readApiResponse(res);
  if (!res.ok) throw new Error(apiError(data, `Upload failed: ${res.status}`));
  return data;
}

export async function uploadAlibabaFile(
  apiKey: string,
  file: File,
  modelId: ModelId
): Promise<{ url: string; bytes: number; filename: string; expiresInSeconds?: number }> {
  const form = new FormData();
  form.append("file", file);
  form.append("apiKey", apiKey);
  form.append("model", modelId);

  const res = await fetch("/api/alibaba-upload", {
    method: "POST",
    body: form,
  });

  const data = await readApiResponse(res);
  if (!res.ok) throw new Error(apiError(data, `Upload failed: ${res.status}`));
  return data;
}

/* ── Asset Library API (Control-plane, uses AK/SK server-side) ── */

export async function listAssetGroups(ownership = "SelfUploaded") {
  const res = await fetch(
    `/api/assets?action=list_groups&ownership=${encodeURIComponent(ownership)}`
  );
  const data = await readApiResponse(res);
  if (!res.ok) throw new Error(apiError(data, `API Error: ${res.status}`));
  return data;
}

export async function createAssetGroup(name: string) {
  const res = await fetch("/api/assets", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "create_group", Name: name }),
  });
  const data = await readApiResponse(res);
  if (!res.ok) throw new Error(apiError(data, `API Error: ${res.status}`));
  return data;
}

export async function createAssetFromUrl(
  groupId: string,
  url: string,
  name: string,
  assetType: "image" | "video" | "audio" = "image"
) {
  const res = await fetch("/api/assets", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action: "create_asset",
      GroupId: groupId,
      URL: url,
      Name: name,
      AssetType: assetType,
    }),
  });
  const data = await readApiResponse(res);
  if (!res.ok) throw new Error(apiError(data, `API Error: ${res.status}`));
  return data;
}

export async function createAssetFromFile(
  apiKey: string,
  groupId: string,
  file: File,
  assetType: "image" | "video" | "audio" = "image"
) {
  const form = new FormData();
  form.append("file", file);
  form.append("apiKey", apiKey);
  form.append("groupId", groupId);
  form.append("name", file.name);
  form.append("assetType", assetType);

  const res = await fetch("/api/assets", {
    method: "POST",
    body: form,
  });
  const data = await readApiResponse(res);
  if (!res.ok) throw new Error(apiError(data, `API Error: ${res.status}`));
  return data;
}

export async function getAsset(assetId: string) {
  const res = await fetch(
    `/api/assets?action=get_asset&id=${encodeURIComponent(assetId)}`
  );
  const data = await readApiResponse(res);
  if (!res.ok) throw new Error(apiError(data, `API Error: ${res.status}`));
  return data;
}

export async function deleteAsset(assetId: string) {
  const res = await fetch("/api/assets", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "delete_asset", id: assetId }),
  });
  const data = await readApiResponse(res);
  if (!res.ok) throw new Error(apiError(data, `API Error: ${res.status}`));
  return data;
}

export async function getAssetGroup(groupId: string) {
  const res = await fetch("/api/assets", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "get_group", groupId }),
  });
  const data = await readApiResponse(res);
  if (!res.ok) throw new Error(apiError(data, `API Error: ${res.status}`));
  return data;
}
