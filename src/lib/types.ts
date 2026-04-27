export type GenerationMode = "reference" | "first_last_frame";

export type AspectRatio =
  | "adaptive"
  | "16:9"
  | "4:3"
  | "1:1"
  | "3:4"
  | "9:16"
  | "21:9";

export type Resolution = "480p" | "720p" | "1080p";

export type DurationType = "seconds" | "smart";

export type ModelId =
  | "dreamina-seedance-2-0-260128"
  | "dreamina-seedance-2-0-fast-260128";

export interface ModelOption {
  id: ModelId;
  name: string;
  badge?: string;
  supports1080p?: boolean;
  pricing: {
    standard: {
      includeVideoInput: number;
      excludeVideoInput: number;
    };
    p1080?: {
      includeVideoInput: number;
      excludeVideoInput: number;
    };
  };
}

export const MODELS: ModelOption[] = [
  {
    id: "dreamina-seedance-2-0-260128",
    name: "Seedance 2.0",
    badge: "Recommended",
    supports1080p: true,
    pricing: {
      standard: { includeVideoInput: 4.3, excludeVideoInput: 7.0 },
      p1080: { includeVideoInput: 4.7, excludeVideoInput: 7.7 },
    },
  },
  {
    id: "dreamina-seedance-2-0-fast-260128",
    name: "Seedance 2.0 Fast",
    supports1080p: false,
    pricing: {
      standard: { includeVideoInput: 3.3, excludeVideoInput: 5.6 },
    },
  },
];

export interface ModelParams {
  modelId: ModelId;
  mode: GenerationMode;
  ratio: AspectRatio;
  resolution: Resolution;
  durationType: DurationType;
  duration: number;
  outputCount: number;
  generateAudio: boolean;
  watermark: boolean;
  rendering: boolean;
  returnLastFrame: boolean;
  seed: string;
  internetSearch: boolean;
  generationTimeout: number;
}

export interface ReferenceAsset {
  id: string;
  type: "image" | "video" | "audio";
  url: string;
  name: string;
  role: string;
  preview?: string;
  /** True while a video is being uploaded to BytePlus Files API. */
  uploading?: boolean;
}

export interface GenerationTask {
  id: string;
  taskId: string;
  prompt: string;
  status: "pending" | "queued" | "running" | "succeeded" | "failed" | "cancelled" | "expired";
  videoUrl?: string;
  lastFrameUrl?: string;
  error?: string;
  params: ModelParams;
  references?: ReferenceAsset[];
  createdAt: number;
  seed?: number;
  usage?: { completion_tokens: number; total_tokens: number };
  actualDuration?: number;
  actualRatio?: string;
  actualResolution?: string;
}

export const DEFAULT_PARAMS: ModelParams = {
  modelId: "dreamina-seedance-2-0-260128",
  mode: "reference",
  ratio: "16:9",
  resolution: "720p",
  durationType: "seconds",
  duration: 5,
  outputCount: 1,
  generateAudio: true,
  watermark: false,
  rendering: true,
  returnLastFrame: false,
  seed: "",
  internetSearch: false,
  generationTimeout: 48,
};

export const ASPECT_RATIOS: { label: string; value: AspectRatio }[] = [
  { label: "Adaptive", value: "adaptive" },
  { label: "16:9", value: "16:9" },
  { label: "4:3", value: "4:3" },
  { label: "1:1", value: "1:1" },
  { label: "3:4", value: "3:4" },
  { label: "9:16", value: "9:16" },
  { label: "21:9", value: "21:9" },
];

export const RATIO_ICONS: Record<AspectRatio, { w: number; h: number }> = {
  adaptive: { w: 16, h: 12 },
  "21:9": { w: 21, h: 9 },
  "16:9": { w: 16, h: 9 },
  "4:3": { w: 12, h: 9 },
  "1:1": { w: 10, h: 10 },
  "3:4": { w: 9, h: 12 },
  "9:16": { w: 9, h: 16 },
};

const FRAME_RATE = 24;

const OUTPUT_DIMENSIONS: Record<
  Resolution,
  Record<AspectRatio, { width: number; height: number }>
> = {
  "480p": {
    adaptive: { width: 864, height: 496 },
    "16:9": { width: 864, height: 496 },
    "9:16": { width: 864, height: 496 },
    "4:3": { width: 752, height: 560 },
    "3:4": { width: 752, height: 560 },
    "1:1": { width: 640, height: 640 },
    "21:9": { width: 992, height: 432 },
  },
  "720p": {
    adaptive: { width: 1280, height: 720 },
    "16:9": { width: 1280, height: 720 },
    "9:16": { width: 1280, height: 720 },
    "4:3": { width: 1112, height: 834 },
    "3:4": { width: 1112, height: 834 },
    "1:1": { width: 960, height: 960 },
    "21:9": { width: 1470, height: 630 },
  },
  "1080p": {
    adaptive: { width: 1920, height: 1080 },
    "16:9": { width: 1920, height: 1080 },
    "9:16": { width: 1920, height: 1080 },
    "4:3": { width: 1664, height: 1248 },
    "3:4": { width: 1664, height: 1248 },
    "1:1": { width: 1440, height: 1440 },
    "21:9": { width: 2206, height: 946 },
  },
};

const VIDEO_INPUT_MIN_TOKENS: Record<Resolution, Record<number, number>> = {
  "480p": {
    4: 70308,
    5: 90396,
    6: 100440,
    7: 120528,
    8: 140616,
    9: 150660,
    10: 170748,
    11: 190836,
    12: 200880,
    13: 220968,
    14: 241056,
    15: 251100,
  },
  "720p": {
    4: 151200,
    5: 194400,
    6: 216000,
    7: 259200,
    8: 302400,
    9: 324000,
    10: 367200,
    11: 410400,
    12: 432000,
    13: 475200,
    14: 518400,
    15: 540000,
  },
  "1080p": {
    4: 340200,
    5: 437400,
    6: 486000,
    7: 583200,
    8: 680400,
    9: 729000,
    10: 826200,
    11: 923400,
    12: 972000,
    13: 1069200,
    14: 1166400,
    15: 1215000,
  },
};

function getDurationSeconds(params: ModelParams): number {
  return params.durationType === "seconds" ? params.duration : 10;
}

function getOutputTokenEstimate(params: ModelParams): number {
  const dur = getDurationSeconds(params);
  const dim = OUTPUT_DIMENSIONS[params.resolution][params.ratio];
  return Math.round((dim.width * dim.height * FRAME_RATE * dur) / 1024);
}

export function estimateTokens(
  params: ModelParams,
  hasVideoRef = false
): number {
  const dur = params.durationType === "seconds" ? params.duration : 10;
  const outputTokens = getOutputTokenEstimate(params);
  const minForVideoInput =
    VIDEO_INPUT_MIN_TOKENS[params.resolution][dur] ?? outputTokens;
  const tokensPerVideo = hasVideoRef
    ? Math.max(outputTokens, minForVideoInput)
    : outputTokens;
  return Math.round(tokensPerVideo * params.outputCount);
}

export function tokenRatePerMillion(
  params: ModelParams,
  hasVideoRef: boolean
): number {
  const model = MODELS.find((m) => m.id === params.modelId) ?? MODELS[0];
  const pricing =
    params.resolution === "1080p" && model.pricing.p1080
      ? model.pricing.p1080
      : model.pricing.standard;
  return hasVideoRef
    ? pricing.includeVideoInput
    : pricing.excludeVideoInput;
}

export function estimateCost(params: ModelParams, hasVideoRef: boolean): number {
  const ratePerM = tokenRatePerMillion(params, hasVideoRef);
  const tokens = estimateTokens(params, hasVideoRef);
  return Math.round((tokens / 1_000_000) * ratePerM * 1000) / 1000;
}

export function ratePerKTokens(params: ModelParams, hasVideoRef: boolean): number {
  const ratePerM = tokenRatePerMillion(params, hasVideoRef);
  return Math.round((ratePerM / 1000) * 10000) / 10000;
}

export function costFromUsage(
  params: ModelParams,
  hasVideoRef: boolean,
  totalTokens: number
): number {
  const ratePerM = tokenRatePerMillion(params, hasVideoRef);
  return Math.round((totalTokens / 1_000_000) * ratePerM * 1000) / 1000;
}
