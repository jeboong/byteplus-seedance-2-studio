import type { ModelParams, ReferenceAsset } from "./types";

export function buildPayload(
  prompt: string,
  references: ReferenceAsset[],
  params: ModelParams
) {
  const content: Record<string, unknown>[] = [
    { type: "text", text: prompt },
  ];

  for (const ref of references) {
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

  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `API Error: ${res.status}`);
  return data;
}

export async function getTaskStatus(apiKey: string, taskId: string) {
  const res = await fetch(`/api/task/${taskId}`, {
    headers: { "x-api-key": apiKey },
  });

  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `API Error: ${res.status}`);
  return data;
}

export async function deleteTask(apiKey: string, taskId: string) {
  const res = await fetch(`/api/task/${taskId}`, {
    method: "DELETE",
    headers: { "x-api-key": apiKey },
  });

  if (res.status === 204) return { success: true };
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `API Error: ${res.status}`);
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

  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `API Error: ${res.status}`);
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

  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `Upload failed: ${res.status}`);
  return data;
}

/* ── Asset Library API (Control-plane, uses AK/SK server-side) ── */

export async function listAssetGroups(ownership = "SelfUploaded") {
  const res = await fetch(
    `/api/assets?action=list_groups&ownership=${encodeURIComponent(ownership)}`
  );
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `API Error: ${res.status}`);
  return data;
}

export async function createAssetGroup(name: string) {
  const res = await fetch("/api/assets", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "create_group", Name: name }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `API Error: ${res.status}`);
  return data;
}

export async function createAssetFromUrl(
  groupId: string,
  url: string,
  name: string
) {
  const res = await fetch("/api/assets", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action: "create_asset",
      GroupId: groupId,
      URL: url,
      Name: name,
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `API Error: ${res.status}`);
  return data;
}

export async function createAssetFromFile(
  apiKey: string,
  groupId: string,
  file: File
) {
  const form = new FormData();
  form.append("file", file);
  form.append("apiKey", apiKey);
  form.append("groupId", groupId);
  form.append("name", file.name);

  const res = await fetch("/api/assets", {
    method: "POST",
    body: form,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `API Error: ${res.status}`);
  return data;
}

export async function getAsset(assetId: string) {
  const res = await fetch(
    `/api/assets?action=get_asset&id=${encodeURIComponent(assetId)}`
  );
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `API Error: ${res.status}`);
  return data;
}

export async function deleteAsset(assetId: string) {
  const res = await fetch("/api/assets", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "delete_asset", id: assetId }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `API Error: ${res.status}`);
  return data;
}

export async function getAssetGroup(groupId: string) {
  const res = await fetch("/api/assets", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "get_group", groupId }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `API Error: ${res.status}`);
  return data;
}
