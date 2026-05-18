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
  getModelOption,
  isAlibabaModel,
  minDurationForModel,
  supportsAspectRatio,
  supportsSmartDuration,
  type AspectRatio,
  type ModelId,
} from "@/lib/types";

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
      className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full transition-colors ${
        checked ? "bg-primary-500" : "bg-gray-200"
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
  const durationProgress = rangeProgress(params.duration, durationMin, 15);
  const outputProgress = rangeProgress(params.outputCount, 1, 4);
  const canUseSmartDuration = supportsSmartDuration(params.modelId);
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
      duration: Math.max(params.duration, minDurationForModel(modelId)),
      mode: model.provider === "alibaba" ? "reference" : params.mode,
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
    if (isAlibaba && params.mode !== "reference") {
      next.mode = "reference";
    }
    if (Object.keys(next).length > 0) setParams(next);
  }, [
    canUseSmartDuration,
    currentModel.supports1080p,
    currentModel.supports480p,
    durationMin,
    isAlibaba,
    params.duration,
    params.durationType,
    params.mode,
    params.modelId,
    params.ratio,
    params.resolution,
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
      modelId: "dreamina-seedance-2-0-260128",
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
              <button
                onClick={() => setParams({ mode: "text" })}
                className={`settings-mode-tab ${
                  params.mode === "text" ? "settings-mode-tab-active" : ""
                }`}
              >
                Text
              </button>
              <button
                onClick={() => setParams({ mode: "reference" })}
                className={`settings-mode-tab ${
                  params.mode === "reference" ? "settings-mode-tab-active" : ""
                }`}
              >
                Reference
              </button>
              <button
                onClick={() => setParams({ mode: "first_last_frame" })}
                className={`settings-mode-tab ${
                  params.mode === "first_last_frame"
                    ? "settings-mode-tab-active"
                    : ""
                }`}
              >
                Keyframe
              </button>
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
                          <span>DashScope async · 720P/1080P · 3-15s</span>
                        ) : (
                          <>
                            <span>
                              Video input: ${m.pricing.standard.includeVideoInput}/M
                            </span>
                            <span>
                              No video: ${m.pricing.standard.excludeVideoInput}/M
                            </span>
                            {m.pricing.p1080 && (
                              <span>
                                1080p: ${m.pricing.p1080.includeVideoInput}/$
                                {m.pricing.p1080.excludeVideoInput}/M
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
            <button
              onClick={() => setParams({ mode: "text" })}
              className={`param-option py-2 rounded-lg text-xs font-medium transition-all ${
                params.mode === "text"
                  ? "param-choice-selected text-gray-800"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              Text
            </button>
            <button
              onClick={() => setParams({ mode: "reference" })}
              className={`param-option py-2 rounded-lg text-xs font-medium transition-all ${
                params.mode === "reference"
                  ? "param-choice-selected text-gray-800"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              Reference
            </button>
            <button
              onClick={() => setParams({ mode: "first_last_frame" })}
              className={`param-option py-2 rounded-lg text-xs font-medium transition-all ${
                params.mode === "first_last_frame"
                  ? "param-choice-selected text-gray-800"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              First/Last Frame
            </button>
          </div>
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
                return (
                  <button
                    key={r.value}
                    type="button"
                    role="option"
                    aria-selected={active}
                    onClick={() => setParams({ ratio: r.value })}
                    className={`ratio-chip ${active ? "ratio-chip-active" : ""}`}
                  >
                    {ratioLabel(r.value, r.label)}
                  </button>
                );
              })}
            </div>
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
          <div className="param-segmented grid grid-cols-2 gap-1 bg-surface-100 rounded-xl p-1 mb-3">
            <button
              onClick={() => setParams({ durationType: "seconds" })}
              className={`param-option py-2 rounded-lg text-xs font-medium transition-all ${
                params.durationType === "seconds"
                  ? "param-choice-selected text-gray-800"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              Seconds
            </button>
            <button
              onClick={() => setParams({ durationType: "smart" })}
              disabled={!canUseSmartDuration}
              className={`param-option py-2 rounded-lg text-xs font-medium transition-all ${
                params.durationType === "smart"
                  ? "param-choice-selected text-gray-800"
                  : "text-gray-500 hover:text-gray-700"
              } ${!canUseSmartDuration ? "opacity-40 cursor-not-allowed hover:text-gray-500" : ""}`}
            >
              Smart length
            </button>
          </div>
          <div
            className={`flex items-center gap-3 transition-opacity ${
              params.durationType === "smart" ? "opacity-55" : ""
            }`}
          >
            <input
              type="range"
              min={durationMin}
              max={15}
              step={1}
              value={params.duration}
              disabled={params.durationType === "smart"}
              onChange={(e) =>
                setParams({ duration: Number(e.target.value) })
              }
              style={
                { "--range-progress": `${durationProgress}%` } as CSSProperties
              }
              className="range-control flex-1 h-1.5"
            />
            <div className="flex items-center gap-1 bg-surface-100 rounded-lg px-3 py-1.5 min-w-[60px] justify-center">
              <span className="text-sm font-medium text-gray-700">
                {params.durationType === "smart" ? "Auto" : params.duration}
              </span>
              {params.durationType === "seconds" && (
                <span className="text-xs text-gray-400">s</span>
              )}
            </div>
          </div>
        </section>

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
              <span className="text-sm text-gray-700">Return Last Frame</span>
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
                    className="flex-1 accent-primary-500 h-1.5"
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
