"use client";

import { useEffect, useState, type CSSProperties } from "react";
import {
  RefreshCw,
  X,
  Dices,
  ChevronDown,
  ChevronUp,
  Layers,
} from "lucide-react";
import { useAppStore } from "@/lib/store";
import {
  ASPECT_RATIOS,
  RATIO_ICONS,
  MODELS,
  formatKrw,
  getModelOption,
  isAlibabaModel,
  isDurationLockedToSmart,
  isRatioLockedToAdaptive,
  maxDurationForModel,
  minDurationForModel,
  supportsAspectRatio,
  supportsMovFormat,
  supportsSmartDuration,
  usdToKrw,
  type AspectRatio,
  type GenerationMode,
  type ModelId,
} from "@/lib/types";

const BYTEPLUS_MODE_OPTIONS: {
  value: GenerationMode;
  label: string;
  shortLabel: string;
}[] = [
  { value: "text", label: "Text", shortLabel: "Text" },
  { value: "reference", label: "Reference", shortLabel: "Reference" },
  { value: "video_edit", label: "Video Edit", shortLabel: "Video Edit" },
  { value: "video_extend", label: "Video Extend", shortLabel: "Extend" },
  { value: "first_last_frame", label: "Start/End Frame", shortLabel: "Keyframe" },
];

function Toggle({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`param-toggle relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full transition-colors ${
        checked ? "param-toggle-checked" : "param-toggle-idle"
      }`}
    >
      <span
        className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-sm ring-0 transition-transform mt-0.5 ${
          checked ? "translate-x-[22px]" : "translate-x-0.5"
        }`}
      />
    </button>
  );
}

function RatioPreview({ ratio }: { ratio: AspectRatio }) {
  const dim = RATIO_ICONS[ratio];
  const scale = 62 / Math.max(dim.w, dim.h);
  const w = Math.round(dim.w * scale);
  const h = Math.round(dim.h * scale);
  return (
    <div className="ratio-preview flex h-16 w-24 items-center justify-center rounded-xl border">
      <div
        className={`ratio-preview-frame rounded-md border ${
          ratio === "adaptive" ? "ratio-preview-adaptive" : ""
        }`}
        style={{ width: w, height: h }}
      />
    </div>
  );
}

function rangeProgress(value: number, min: number, max: number) {
  if (max <= min) return 100;
  return ((value - min) / (max - min)) * 100;
}

function ratioDescription(ratio: AspectRatio) {
  if (ratio === "adaptive") return "Source-aware canvas";
  if (ratio === "1:1") return "Square";
  if (ratio === "9:16" || ratio === "3:4") return "Portrait";
  if (ratio === "21:9") return "Cinematic wide";
  return "Landscape";
}

function ratioLabel(value: AspectRatio, fallback?: string) {
  return value === "adaptive" ? "Auto" : fallback ?? value;
}

export default function ModelParams({
  onClose,
  variant = "dialog",
}: {
  onClose?: () => void;
  variant?: "panel" | "dialog" | "composer";
}) {
  const {
    params,
    setParams,
    resetParams,
  } = useAppStore();
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [modelDropdown, setModelDropdown] = useState(false);

  const currentModel = getModelOption(params.modelId);
  const isAlibaba = isAlibabaModel(params.modelId);
  const durationMin = minDurationForModel(params.modelId);
  const durationMax = maxDurationForModel(params.modelId);
  const durationProgress = rangeProgress(params.duration, durationMin, durationMax);
  const outputProgress = rangeProgress(params.outputCount, 1, 4);
  const timeoutProgress = rangeProgress(params.generationTimeout, 1, 72);
  const canUseSmartDuration = supportsSmartDuration(params.modelId);
  const canUseMov = supportsMovFormat(params.modelId);
  const ratioLocked = isRatioLockedToAdaptive(params);
  const durationLocked = isDurationLockedToSmart(params);
  const visibleRatios = ASPECT_RATIOS.filter((r) =>
    supportsAspectRatio(params.modelId, r.value)
  );
  const selectedRatio =
    visibleRatios.find((r) => r.value === params.ratio) ?? visibleRatios[0];
  const selectableModels = MODELS.filter((m) => m.provider === "byteplus");
  const happyHorseModels = MODELS.filter((m) => m.provider === "alibaba");
  const isDialog = variant === "dialog";
  const isComposer = variant === "composer";

  const selectModel = (modelId: ModelId) => {
    const model = getModelOption(modelId);
    setParams({
      modelId,
      resolution:
        (model.supports1080p === false && params.resolution === "1080p") ||
        (model.supports480p === false && params.resolution === "480p")
          ? "720p"
          : params.resolution,
      ratio: supportsAspectRatio(modelId, params.ratio)
        ? params.ratio
        : "16:9",
      durationType: supportsSmartDuration(modelId)
        ? params.durationType
        : "seconds",
      duration: Math.min(
        maxDurationForModel(modelId),
        Math.max(params.duration, minDurationForModel(modelId))
      ),
      mode: model.provider === "alibaba" ? "reference" : params.mode,
      videoFormat: supportsMovFormat(modelId) ? params.videoFormat : "mp4",
    });
  };

  useEffect(() => {
    const next: Partial<typeof params> = {};
    if (params.resolution === "1080p" && currentModel.supports1080p === false) {
      next.resolution = "720p";
    }
    if (params.resolution === "480p" && currentModel.supports480p === false) {
      next.resolution = "720p";
    }
    if (!supportsAspectRatio(params.modelId, params.ratio)) {
      next.ratio = "16:9";
    }
    if (!canUseSmartDuration && params.durationType === "smart") {
      next.durationType = "seconds";
    }
    if (params.duration < durationMin) {
      next.duration = durationMin;
    }
    if (params.duration > durationMax) {
      next.duration = durationMax;
    }
    if (isAlibaba && params.mode !== "reference") {
      next.mode = "reference";
    }
    if (!canUseMov && params.videoFormat === "mov") {
      next.videoFormat = "mp4";
    }
    // Seedance 2.5 task-type constraints (see BytePlus docs).
    if (ratioLocked && params.ratio !== "adaptive") {
      next.ratio = "adaptive";
    }
    if (durationLocked && params.durationType !== "smart") {
      next.durationType = "smart";
    }
    if (Object.keys(next).length > 0) setParams(next);
  }, [
    canUseMov,
    canUseSmartDuration,
    currentModel.supports1080p,
    currentModel.supports480p,
    durationLocked,
    durationMax,
    durationMin,
    isAlibaba,
    params.duration,
    params.durationType,
    params.mode,
    params.modelId,
    params.ratio,
    params.resolution,
    params.videoFormat,
    ratioLocked,
    setParams,
  ]);

  const randomSeed = () => {
    setParams({ seed: String(Math.floor(Math.random() * 2147483647)) });
  };

  const cycleAspectRatio = () => {
    if (visibleRatios.length <= 1) return;
    const currentIndex = Math.max(
      0,
      visibleRatios.findIndex((ratio) => ratio.value === selectedRatio.value)
    );
    const nextIndex = (currentIndex + 1) % visibleRatios.length;
    setParams({ ratio: visibleRatios[nextIndex].value });
  };

  useEffect(() => {
    if (!isAlibaba) return;
    setParams({
      modelId: "dreamina-seedance-2-5-260628",
      mode: "reference",
    });
  }, [isAlibaba, setParams]);

  return (
    <div
      className={
        isComposer
          ? "model-settings-composer glass-panel flex max-h-[min(74vh,560px)] w-[min(92vw,25.5rem)] flex-col overflow-hidden rounded-[1.65rem] border"
          : isDialog
          ? "model-settings-dialog glass-panel flex max-h-[min(82vh,760px)] w-[min(92vw,720px)] flex-col overflow-hidden rounded-[2rem] border"
          : "param-panel glass-panel w-80 border-l border-white/50 flex flex-col h-full overflow-y-auto scrollbar-thin"
      }
    >
      {!isComposer && (
        <div
          className={`param-panel-header flex items-center justify-between border-b border-white/50 ${
            isDialog ? "px-6 py-5" : "sticky top-0 z-10 px-5 py-4"
          }`}
        >
          <div>
            <h2 className="text-sm font-semibold text-gray-800">
              Generation Settings
            </h2>
            {isDialog && (
              <p className="mt-1 text-xs text-gray-400">
                현재 페이지의 생성 옵션을 조정합니다.
              </p>
            )}
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={resetParams}
              className="glass-chip p-1.5 rounded-lg text-gray-400 hover:text-gray-600 transition-colors"
              title="Reset"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
            {onClose && (
              <button
                onClick={onClose}
                className="glass-chip p-1.5 rounded-lg text-gray-400 hover:text-gray-600 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      )}

      {isDialog && (
        <div className={`settings-mode-tabs border-white/40 ${
          isComposer ? "px-4 pb-3 pt-4" : "border-b px-5 py-4"
        }`}>
          {!isAlibaba ? (
            <div className="grid grid-cols-3 gap-2">
              {BYTEPLUS_MODE_OPTIONS.map((mode) => (
                <button
                  key={mode.value}
                  onClick={() => setParams({ mode: mode.value })}
                  className={`settings-mode-tab ${
                    params.mode === mode.value ? "settings-mode-tab-active" : ""
                  }`}
                >
                  {mode.shortLabel}
                </button>
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-2">
              {happyHorseModels.map((model) => (
                <button
                  key={model.id}
                  onClick={() => selectModel(model.id)}
                  className={`settings-mode-tab ${
                    params.modelId === model.id
                      ? "settings-mode-tab-active"
                      : ""
                  }`}
                >
                  {model.happyHorseMode === "t2v"
                    ? "Text"
                    : model.happyHorseMode === "i2v"
                    ? "Image"
                    : "Reference"}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      <div
        className={`flex-1 space-y-6 overflow-y-auto scrollbar-thin ${
          isComposer ? "px-4 pb-4 pt-5" : isDialog ? "p-5 sm:p-6" : "p-5"
        }`}
      >
        {/* Model Selector */}
        <section>
          <label className="block text-xs font-medium text-gray-500 mb-2">
            Model
          </label>
          <div className="relative">
            <button
              onClick={() => setModelDropdown(!modelDropdown)}
              className="glass-control w-full flex items-center justify-between gap-2 px-3 py-2.5 border rounded-xl text-sm hover:border-gray-300 transition-colors"
            >
              <div className="flex items-center gap-2">
                <Layers className="w-4 h-4 text-primary-500" />
                <div className="text-left">
                  <p className="text-xs font-medium text-gray-800">
                    {currentModel.name}
                  </p>
                  <p className="text-[10px] text-gray-400">
                    {currentModel.provider === "alibaba"
                      ? "Alibaba ModelStudio"
                      : "BytePlus ModelArk"}
                  </p>
                </div>
              </div>
              <ChevronDown className="w-4 h-4 text-gray-400" />
            </button>
            {modelDropdown && (
              <>
                <div
                  className="fixed inset-0 z-10"
                  onClick={() => setModelDropdown(false)}
                />
                <div className="glass-popover absolute top-full mt-1 left-0 right-0 rounded-xl py-1 z-20 overflow-hidden">
                  {selectableModels.map((m) => (
                    <button
                      key={m.id}
                      className={`w-full text-left px-3 py-2.5 hover:bg-white/40 ${
                        params.modelId === m.id ? "bg-primary-50" : ""
                      }`}
                      onClick={() => {
                        selectModel(m.id);
                        setModelDropdown(false);
                      }}
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-xs font-medium text-gray-800">
                            {m.name}
                          </p>
                          <p className="text-[10px] text-gray-400">
                            {m.provider === "alibaba"
                              ? `Alibaba · ${m.id}`
                              : m.id}
                          </p>
                        </div>
                      </div>
                      <div className="mt-1 flex gap-3 text-[10px] text-gray-400">
                        {m.provider === "alibaba" ? (
                          <span>ModelStudio async · 720P/1080P · 3-15s</span>
                        ) : (
                          <>
                            <span>
                              Video input: {formatKrw(usdToKrw(m.pricing.standard.includeVideoInput))}/M
                            </span>
                            <span>
                              No video: {formatKrw(usdToKrw(m.pricing.standard.excludeVideoInput))}/M
                            </span>
                            {m.pricing.p1080 && (
                              <span>
                                1080p: {formatKrw(usdToKrw(m.pricing.p1080.includeVideoInput))}/
                                {formatKrw(usdToKrw(m.pricing.p1080.excludeVideoInput))}/M
                              </span>
                            )}
                          </>
                        )}
                      </div>
                    </button>
                  ))}
                  <button
                    type="button"
                    disabled
                    className="w-full cursor-not-allowed px-3 py-2.5 text-left opacity-55"
                    title="Coming soon"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-xs font-medium text-gray-800">
                          HappyHorse
                        </p>
                        <p className="text-[10px] text-gray-400">
                          Alibaba ModelStudio
                        </p>
                      </div>
                      <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-gray-400">
                        Coming soon
                      </span>
                    </div>
                  </button>
                </div>
              </>
            )}
          </div>
        </section>

        {/* Mode */}
        {!isDialog && !isAlibaba ? (
        <section>
          <label className="block text-xs font-medium text-gray-500 mb-2">
            Mode
          </label>
          <div className="param-segmented grid grid-cols-3 gap-1 bg-surface-100 rounded-xl p-1">
            {BYTEPLUS_MODE_OPTIONS.map((mode) => (
              <button
                key={mode.value}
                onClick={() => setParams({ mode: mode.value })}
                className={`param-option py-2 rounded-lg text-[11px] font-medium transition-all ${
                  params.mode === mode.value
                    ? "param-choice-selected text-gray-800"
                    : "text-gray-500 hover:text-gray-700"
                }`}
              >
                {mode.shortLabel}
              </button>
            ))}
          </div>
          {(params.mode === "video_edit" || params.mode === "video_extend") && (
            <p className="mt-2 text-[11px] text-gray-400">
              {params.mode === "video_edit"
                ? "편집할 비디오를 첨부하고 프롬프트에 편집 지시(add/remove/replace 등)를 포함하세요. 출력은 원본 비율·길이를 유지합니다."
                : "확장할 비디오를 첨부하고 프롬프트에 extend/continue 지시를 포함하세요. 출력은 원본 비율을 유지합니다."}
            </p>
          )}
        </section>
        ) : !isDialog ? (
          <section>
            <label className="block text-xs font-medium text-gray-500 mb-2">
              HappyHorse Mode
            </label>
            <div className="param-segmented grid grid-cols-3 gap-1 bg-surface-100 rounded-xl p-1">
              {happyHorseModels.map((model) => (
                <button
                  key={model.id}
                  onClick={() => selectModel(model.id)}
                  className={`param-option py-2 rounded-lg text-[11px] font-medium transition-all ${
                    params.modelId === model.id
                      ? "param-choice-selected text-gray-800"
                      : "text-gray-500 hover:text-gray-700"
                  }`}
                >
                  {model.happyHorseMode === "t2v"
                    ? "Text"
                    : model.happyHorseMode === "i2v"
                    ? "Image"
                    : "Reference"}
                </button>
              ))}
            </div>
          </section>
        ) : null}

        {/* Aspect Ratio */}
        {currentModel.happyHorseMode !== "i2v" && (
        <section>
          <label className="block text-xs font-medium text-gray-500 mb-2">
            Aspect Ratio
          </label>
          <div
            className="ratio-picker glass-control rounded-2xl border p-3"
          >
            <div className="mb-3 flex items-center gap-3">
              <button
                type="button"
                onClick={cycleAspectRatio}
                className="ratio-preview-button"
                title="클릭해서 다음 비율"
                aria-label="다음 비율로 변경"
              >
                <RatioPreview ratio={selectedRatio.value} />
              </button>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-gray-800">
                  {ratioLabel(selectedRatio.value, selectedRatio.label)}
                </p>
                <p className="mt-0.5 text-[11px] text-gray-400">
                  {ratioDescription(selectedRatio.value)}
                </p>
              </div>
            </div>
            <div
              className="ratio-chip-row"
              role="listbox"
              aria-label="Aspect Ratio"
            >
              {visibleRatios.map((r) => {
                const active = params.ratio === r.value;
                const disabled = ratioLocked && r.value !== "adaptive";
                return (
                  <button
                    key={r.value}
                    type="button"
                    role="option"
                    aria-selected={active}
                    disabled={disabled}
                    onClick={() => {
                      if (!disabled) setParams({ ratio: r.value });
                    }}
                    title={
                      disabled
                        ? "이 모드에서는 소스 비율(Auto)만 지원합니다."
                        : undefined
                    }
                    className={`ratio-chip ${active ? "ratio-chip-active" : ""} ${
                      disabled ? "cursor-not-allowed opacity-40" : ""
                    }`}
                  >
                    {ratioLabel(r.value, r.label)}
                  </button>
                );
              })}
            </div>
            {ratioLocked && (
              <p className="mt-2 text-[11px] text-gray-400">
                Seedance 2.5의 편집·확장·키프레임 작업은 소스 비율을 그대로
                따릅니다 (ratio: adaptive 고정).
              </p>
            )}
          </div>
        </section>
        )}

        {/* Resolution */}
        <section>
          <label className="block text-xs font-medium text-gray-500 mb-2">
            Resolution
          </label>
          <div className="param-segmented grid grid-cols-3 gap-1 bg-surface-100 rounded-xl p-1">
            {(["480p", "720p", "1080p"] as const).map((res) => {
              const disabled =
                (res === "1080p" && currentModel.supports1080p === false) ||
                (res === "480p" && currentModel.supports480p === false);
              return (
                <button
                  key={res}
                  onClick={() => {
                    if (!disabled) setParams({ resolution: res });
                  }}
                  disabled={disabled}
                  title={disabled ? "현재 모델에서 지원하지 않는 해상도입니다." : res}
                  className={`param-option relative py-2 rounded-lg text-xs font-medium transition-all ${
                    params.resolution === res
                      ? "param-choice-selected text-gray-800"
                      : "text-gray-500 hover:text-gray-700"
                  } ${disabled ? "opacity-40 cursor-not-allowed hover:text-gray-500" : ""}`}
                >
                  {res}
                </button>
              );
            })}
          </div>
        </section>

        {/* Video Duration */}
        <section>
          <label className="block text-xs font-medium text-gray-500 mb-2">
            Video Duration
          </label>
          <div className="flex items-center gap-3">
            <input
              type="range"
              min={durationMin}
              max={durationMax}
              step={1}
              value={params.duration}
              disabled={params.durationType === "smart" || durationLocked}
              onChange={(e) =>
                setParams({
                  duration: Number(e.target.value),
                  durationType: "seconds",
                })
              }
              style={
                {
                  "--range-progress":
                    params.durationType === "smart"
                      ? "0%"
                      : `${durationProgress}%`,
                } as CSSProperties
              }
              className={`range-control flex-1 h-1.5 ${
                params.durationType === "smart" ? "range-control-auto" : ""
              }`}
            />
            <div className="duration-control-group flex items-center gap-2">
              <div
                className={`duration-value-chip flex items-center gap-1 bg-surface-100 rounded-lg px-3 py-1.5 min-w-[60px] justify-center ${
                  params.durationType === "smart"
                    ? "duration-value-chip-auto"
                    : ""
                }`}
              >
                <span className="text-sm font-medium text-gray-700">
                  {params.duration}
                </span>
                <span className="text-xs text-gray-400">s</span>
              </div>
              <button
                type="button"
                onClick={() =>
                  setParams({
                    durationType:
                      params.durationType === "smart" ? "seconds" : "smart",
                  })
                }
                disabled={!canUseSmartDuration || durationLocked}
                className={`duration-auto-button rounded-lg px-3 py-1.5 text-xs font-bold tracking-[0.08em] transition-all ${
                  params.durationType === "smart"
                    ? "duration-auto-button-active"
                    : ""
                } ${
                  !canUseSmartDuration || durationLocked
                    ? "cursor-not-allowed opacity-40"
                    : ""
                }`}
                title={
                  durationLocked
                    ? "Video Edit 작업은 원본 길이를 따릅니다 (duration: -1 고정)."
                    : canUseSmartDuration
                    ? "Smart length"
                    : "현재 모델에서는 Smart length를 지원하지 않습니다."
                }
              >
                AUTO
              </button>
            </div>
          </div>
          {durationLocked && (
            <p className="mt-2 text-[11px] text-gray-400">
              Seedance 2.5 Video Edit는 출력 길이가 원본 비디오와 동일하게
              유지됩니다 (duration: -1 고정).
            </p>
          )}
        </section>

        {/* Video Format */}
        {!isAlibaba && (
        <section>
          <label className="block text-xs font-medium text-gray-500 mb-2">
            Video Format
          </label>
          <div className="param-segmented grid grid-cols-2 gap-1 bg-surface-100 rounded-xl p-1">
            {(["mp4", "mov"] as const).map((format) => {
              const disabled = format === "mov" && !canUseMov;
              return (
                <button
                  key={format}
                  onClick={() => {
                    if (!disabled) setParams({ videoFormat: format });
                  }}
                  disabled={disabled}
                  title={
                    disabled
                      ? "MOV 출력은 Seedance 2.5에서만 지원합니다."
                      : format === "mov"
                      ? "H.264 + yuv444p + PCM. 색 재현이 중요한 편집/합성용."
                      : "호환성이 가장 좋은 기본 포맷"
                  }
                  className={`param-option relative py-2 rounded-lg text-xs font-medium uppercase transition-all ${
                    params.videoFormat === format
                      ? "param-choice-selected text-gray-800"
                      : "text-gray-500 hover:text-gray-700"
                  } ${disabled ? "opacity-40 cursor-not-allowed hover:text-gray-500" : ""}`}
                >
                  {format}
                </button>
              );
            })}
          </div>
        </section>
        )}

        {/* Output Count */}
        <section>
          <label className="block text-xs font-medium text-gray-500 mb-2">
            Output Count
          </label>
          <div className="flex items-center gap-3">
            <input
              type="range"
              min={1}
              max={4}
              step={1}
              value={params.outputCount}
              onChange={(e) =>
                setParams({ outputCount: Number(e.target.value) })
              }
              style={
                { "--range-progress": `${outputProgress}%` } as CSSProperties
              }
              className="range-control flex-1 h-1.5"
            />
            <div className="flex items-center gap-1 bg-surface-100 rounded-lg px-3 py-1.5 min-w-[75px] justify-center">
              <span className="text-sm font-medium text-gray-700">
                {params.outputCount}
              </span>
              <span className="text-xs text-gray-400">items</span>
            </div>
          </div>
        </section>

        {/* Toggles */}
        <section className="space-y-4">
          {!isAlibaba && (
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-700">Audio Output</span>
              <Toggle
                checked={params.generateAudio}
                onChange={(v) => setParams({ generateAudio: v })}
              />
            </div>
          )}
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-700">Watermark</span>
            <Toggle
              checked={params.watermark}
              onChange={(v) => setParams({ watermark: v })}
            />
          </div>
          {!isAlibaba && (
          <div className="flex items-center justify-between">
            <div>
              <span className="text-sm text-gray-700">Return End Frame</span>
              <p className="text-[11px] text-gray-400 mt-0.5">
                Returns the last frame as PNG for chaining consecutive videos.
              </p>
            </div>
            <Toggle
              checked={params.returnLastFrame}
              onChange={(v) => setParams({ returnLastFrame: v })}
            />
          </div>
          )}
          <div className="flex items-center justify-between">
            <div>
              <span className="text-sm text-gray-700">URL / Asset Attach</span>
              <p className="text-[11px] text-gray-400 mt-0.5">
                Show the URL / asset:// attachment slot in the composer.
              </p>
            </div>
            <Toggle
              checked={params.urlAssetAttach}
              onChange={(v) => setParams({ urlAssetAttach: v })}
            />
          </div>
        </section>

        <hr className="border-white/50" />

        {/* Seed */}
        <section>
          <label className="block text-xs font-medium text-gray-500 mb-2">
            Seed
          </label>
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={params.seed}
              onChange={(e) => setParams({ seed: e.target.value })}
              placeholder="Leave empty for random"
              className="glass-control flex-1 px-3 py-2 border border-white/60 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-400 focus:border-transparent"
            />
            <button
              onClick={randomSeed}
              className="glass-chip p-2 rounded-xl text-gray-400 hover:text-gray-600 transition-colors"
              title="Random seed"
            >
              <Dices className="w-4 h-4" />
            </button>
          </div>
          <p className="text-[11px] text-gray-400 mt-1">
            A fixed value can reproduce the same result. Leave empty to
            randomize each run.
          </p>
        </section>

        {/* Advanced */}
        <section className="border-t border-white/50 pt-4">
          <button
            onClick={() => setAdvancedOpen(!advancedOpen)}
            className="flex items-center justify-between w-full text-sm font-medium text-gray-700"
          >
            Advanced parameter settings
            {advancedOpen ? (
              <ChevronUp className="w-4 h-4 text-gray-400" />
            ) : (
              <ChevronDown className="w-4 h-4 text-gray-400" />
            )}
          </button>
          {advancedOpen && (
            <div className="mt-4 space-y-4">
              {!isAlibaba && (
              <div>
                <label className="block text-sm text-gray-700 mb-2">
                  Generation timeout
                </label>
                <div className="flex items-center gap-3">
                  <input
                    type="range"
                    min={1}
                    max={72}
                    step={1}
                    value={params.generationTimeout}
                    onChange={(e) =>
                      setParams({
                        generationTimeout: Number(e.target.value),
                      })
                    }
                    style={
                      {
                        "--range-progress": `${timeoutProgress}%`,
                      } as CSSProperties
                    }
                    className="range-control flex-1 h-1.5"
                  />
                  <div className="flex items-center gap-1 bg-surface-100 rounded-lg px-3 py-1.5 min-w-[75px] justify-center">
                    <span className="text-sm font-medium text-gray-700">
                      {params.generationTimeout}
                    </span>
                    <span className="text-xs text-gray-400">hour</span>
                  </div>
                </div>
              </div>
              )}
              {isAlibaba && (
                <p className="text-[11px] text-gray-400">
                  HappyHorse 작업 조회 ID와 결과 URL은 문서 기준 24시간 동안 유효합니다.
                </p>
              )}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
