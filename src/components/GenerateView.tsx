"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import {
  Play,
  Settings2,
  ChevronDown,
  ImagePlus,
  GripHorizontal,
} from "lucide-react";
import { useAppStore, hydrateTasks } from "@/lib/store";
import { createGenerationTask, getTaskStatus } from "@/lib/api";
import {
  MODELS,
  estimateCost,
  estimateTokens,
  getModelOption,
  isAlibabaModel,
  minDurationForModel,
  supportsAspectRatio,
  supportsSmartDuration,
  type ModelParams as ModelParamsType,
} from "@/lib/types";
import { useFileUpload } from "@/lib/useFileUpload";
import { PromptInsertProvider } from "@/lib/usePromptInsert";
import Header from "./Header";
import ModelParams from "./ModelParams";
import PromptEditor, { type PromptEditorHandle } from "./PromptEditor";
import ReferenceUpload from "./ReferenceUpload";
import VideoResult from "./VideoResult";

function readContentUrl(
  content: unknown,
  key: "video_url" | "last_frame_url"
): string | undefined {
  if (!content) return undefined;
  if (Array.isArray(content)) {
    for (const item of content) {
      const found = readContentUrl(item, key);
      if (found) return found;
    }
    return undefined;
  }
  if (typeof content !== "object") return undefined;
  const record = content as Record<string, unknown>;
  const value = record[key];
  if (typeof value === "string" && value.length > 0) return value;
  return undefined;
}

function isHappyHorseMediaUrl(url: string): boolean {
  return /^(https?:\/\/|oss:\/\/)/i.test(url);
}

export default function GenerateView() {
  const {
    apiKey,
    alibabaApiKey,
    prompt,
    setPrompt,
    references,
    params,
    setParams,
    addTask,
    updateTask,
  } = useAppStore();
  const [error, setError] = useState("");
  const [paramsOpen, setParamsOpen] = useState(true);
  const [modeDropdown, setModeDropdown] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const [promptExpanded, setPromptExpanded] = useState(false);
  const [composerOffset, setComposerOffset] = useState({ x: 0, y: 0 });
  const [isComposerDragging, setIsComposerDragging] = useState(false);
  const [isComposerSnapping, setIsComposerSnapping] = useState(false);
  const pollingRef = useRef<Record<string, NodeJS.Timeout>>({});
  const promptEditorRef = useRef<PromptEditorHandle>(null);
  const mainRef = useRef<HTMLDivElement>(null);
  const composerRef = useRef<HTMLDivElement>(null);
  const composerDragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    startOffset: { x: number; y: number };
  } | null>(null);
  const dragCounter = useRef(0);

  const isExpanded = promptExpanded || isDragOver;

  const { upload: uploadFiles, error: dropError, clearError: clearDropError } =
    useFileUpload();

  const insertAtCursor = useCallback((text: string) => {
    if (promptEditorRef.current) {
      promptEditorRef.current.insertAtCursor(text);
    } else {
      const current = useAppStore.getState().prompt;
      useAppStore.getState().setPrompt(current + text);
    }
  }, []);

  const handlePromptChange = useCallback(
    (next: string) => {
      setPrompt(next);
      if (error) setError("");
    },
    [error, setPrompt]
  );

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    if (!e.dataTransfer.types.includes("Files")) return;
    e.preventDefault();
    dragCounter.current += 1;
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    if (!e.dataTransfer.types.includes("Files")) return;
    e.preventDefault();
    dragCounter.current -= 1;
    if (dragCounter.current <= 0) {
      dragCounter.current = 0;
      setIsDragOver(false);
    }
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    if (!e.dataTransfer.types.includes("Files")) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      if (!e.dataTransfer.types.includes("Files")) return;
      e.preventDefault();
      dragCounter.current = 0;
      setIsDragOver(false);
      const files = e.dataTransfer.files;
      if (files?.length) {
        uploadFiles(files);
      }
    },
    [uploadFiles]
  );

  const handlePaste = useCallback(
    (e: React.ClipboardEvent) => {
      const files = e.clipboardData?.files;
      if (files && files.length > 0) {
        e.preventDefault();
        uploadFiles(files);
      }
    },
    [uploadFiles]
  );

  const clampComposerOffset = useCallback((offset: { x: number; y: number }) => {
    const host = mainRef.current;
    const card = composerRef.current;
    if (!host || !card) return offset;

    const margin = 16;
    const hostWidth = host.clientWidth;
    const hostHeight = host.clientHeight;
    const cardWidth = card.offsetWidth;
    const cardHeight = card.offsetHeight;
    const baseLeft = (hostWidth - cardWidth) / 2;
    const baseTop = hostHeight - 20 - cardHeight;
    const maxLeft = Math.max(margin, hostWidth - cardWidth - margin);
    const maxTop = Math.max(margin, hostHeight - cardHeight - margin);
    const left = Math.min(maxLeft, Math.max(margin, baseLeft + offset.x));
    const top = Math.min(maxTop, Math.max(margin, baseTop + offset.y));

    return {
      x: left - baseLeft,
      y: top - baseTop,
    };
  }, []);

  const snapComposerOffset = useCallback(
    (offset: { x: number; y: number }) => {
      const host = mainRef.current;
      const card = composerRef.current;
      if (!host || !card) return offset;

      const margin = 18;
      const snapDistance = 72;
      const hostWidth = host.clientWidth;
      const hostHeight = host.clientHeight;
      const cardWidth = card.offsetWidth;
      const cardHeight = card.offsetHeight;
      const baseLeft = (hostWidth - cardWidth) / 2;
      const baseTop = hostHeight - 20 - cardHeight;
      let left = baseLeft + offset.x;
      let top = baseTop + offset.y;
      const rightGap = hostWidth - (left + cardWidth);
      const bottomGap = hostHeight - (top + cardHeight);

      if (left <= margin + snapDistance) {
        left = margin;
      } else if (rightGap <= margin + snapDistance) {
        left = hostWidth - cardWidth - margin;
      }

      if (top <= margin + snapDistance) {
        top = margin;
      } else if (bottomGap <= margin + snapDistance) {
        top = hostHeight - cardHeight - margin;
      }

      return clampComposerOffset({
        x: left - baseLeft,
        y: top - baseTop,
      });
    },
    [clampComposerOffset]
  );

  const handleComposerPointerDown = useCallback(
    (e: React.PointerEvent<HTMLButtonElement>) => {
      if (e.button !== 0) return;
      e.preventDefault();
      e.currentTarget.setPointerCapture(e.pointerId);
      composerDragRef.current = {
        pointerId: e.pointerId,
        startX: e.clientX,
        startY: e.clientY,
        startOffset: composerOffset,
      };
      setPromptExpanded(true);
      setIsComposerDragging(true);
      setIsComposerSnapping(false);
    },
    [composerOffset]
  );

  const handleComposerPointerMove = useCallback(
    (e: React.PointerEvent<HTMLButtonElement>) => {
      const drag = composerDragRef.current;
      if (!drag || drag.pointerId !== e.pointerId) return;
      const next = clampComposerOffset({
        x: drag.startOffset.x + e.clientX - drag.startX,
        y: drag.startOffset.y + e.clientY - drag.startY,
      });
      setComposerOffset(next);
    },
    [clampComposerOffset]
  );

  const finishComposerDrag = useCallback(
    (e?: React.PointerEvent<HTMLButtonElement>) => {
      const drag = composerDragRef.current;
      if (!drag) return;
      const finalOffset = e
        ? clampComposerOffset({
            x: drag.startOffset.x + e.clientX - drag.startX,
            y: drag.startOffset.y + e.clientY - drag.startY,
          })
        : composerOffset;
      if (e) {
        try {
          e.currentTarget.releasePointerCapture(e.pointerId);
        } catch {
          /* pointer capture may already be gone */
        }
      }
      composerDragRef.current = null;
      setIsComposerDragging(false);
      setIsComposerSnapping(true);
      setComposerOffset(snapComposerOffset(finalOffset));
    },
    [clampComposerOffset, composerOffset, snapComposerOffset]
  );

  useEffect(() => {
    const handleResize = () => {
      setComposerOffset((offset) => clampComposerOffset(offset));
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [clampComposerOffset]);

  useEffect(() => {
    if (!promptExpanded) return;
    const handleOutsidePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (
        target instanceof Node &&
        composerRef.current?.contains(target)
      ) {
        return;
      }
      setPromptExpanded(false);
    };
    document.addEventListener("pointerdown", handleOutsidePointerDown, true);
    return () => {
      document.removeEventListener("pointerdown", handleOutsidePointerDown, true);
    };
  }, [promptExpanded]);

  const currentModel = getModelOption(params.modelId);
  const isAlibaba = isAlibabaModel(params.modelId);
  const activeApiKey = isAlibaba ? alibabaApiKey : apiKey;
  const hasVideoRef = references.some((r) => r.type === "video");
  const cost = estimateCost(params, hasVideoRef);
  const imageRefs = references.filter((r) => r.type === "image");
  const unsupportedHappyHorseRefs = isAlibaba
    ? references.filter(
        (r) =>
          r.type !== "image" ||
          r.uploading ||
          !isHappyHorseMediaUrl(r.url)
      )
    : [];
  const happyHorseMode = currentModel.happyHorseMode;
  const uploadPending = references.some((r) => r.uploading);
  const showReferences = isExpanded || references.length > 0 || uploadPending;

  useEffect(() => {
    const raf = requestAnimationFrame(() => {
      setComposerOffset((offset) => clampComposerOffset(offset));
    });
    return () => cancelAnimationFrame(raf);
  }, [clampComposerOffset, isExpanded, paramsOpen, showReferences]);

  const hasFirstFrame = references.some((r) => r.role === "first_frame");
  const hasLastFrame = references.some((r) => r.role === "last_frame");
  const isFirstLastMode = params.mode === "first_last_frame";
  const lastOnlyError = isFirstLastMode && hasLastFrame && !hasFirstFrame;
  const noFramesError = isFirstLastMode && !hasFirstFrame && !hasLastFrame;
  const happyHorseI2vError =
    happyHorseMode === "i2v" &&
    (imageRefs.length !== 1 || unsupportedHappyHorseRefs.length > 0);
  const happyHorseR2vError =
    happyHorseMode === "r2v" &&
    (imageRefs.length < 1 ||
      imageRefs.length > 9 ||
      unsupportedHappyHorseRefs.length > 0);
  const happyHorseRatioError =
    isAlibaba &&
    happyHorseMode !== "i2v" &&
    !supportsAspectRatio(params.modelId, params.ratio);
  const promptRequired = happyHorseMode !== "i2v";
  const generateDisabled = uploadPending;
  const generateIssue = !activeApiKey
    ? isAlibaba
      ? "Alibaba ModelStudio API Key를 입력하세요."
      : "BytePlus Ark API Key를 입력하세요."
    : promptRequired && !prompt.trim()
    ? "프롬프트를 입력하세요."
    : lastOnlyError && !isAlibaba
    ? "First frame 이미지를 첨부하세요. (Last frame만으로는 생성 불가)"
    : noFramesError && !isAlibaba
    ? "First frame 이미지를 먼저 첨부하세요."
    : uploadPending
    ? "파일 업로드가 끝난 뒤 생성할 수 있습니다."
    : happyHorseI2vError
    ? "HappyHorse I2V는 첫 프레임 이미지 1개만 지원합니다. 로컬 첨부 또는 HTTP(S)/oss:// URL을 사용하세요."
    : happyHorseR2vError
    ? "HappyHorse R2V는 레퍼런스 이미지 1~9개만 지원합니다. 로컬 첨부 또는 HTTP(S)/oss:// URL을 사용하세요."
    : happyHorseRatioError
    ? "HappyHorse는 16:9, 9:16, 1:1, 4:3, 3:4 비율만 지원합니다."
    : "";
  const happyHorseModels = MODELS.filter((m) => m.provider === "alibaba");

  const selectHappyHorseModel = useCallback(
    (modelId: ModelParamsType["modelId"]) => {
      setParams({
        modelId,
        resolution:
          getModelOption(modelId).supports1080p === false &&
          params.resolution === "1080p"
            ? "720p"
            : params.resolution,
        ratio: supportsAspectRatio(modelId, params.ratio)
          ? params.ratio
          : "16:9",
        durationType: supportsSmartDuration(modelId)
          ? params.durationType
          : "seconds",
        duration: Math.max(params.duration, minDurationForModel(modelId)),
        mode: "reference",
      });
      setModeDropdown(false);
    },
    [
      params.duration,
      params.durationType,
      params.ratio,
      params.resolution,
      setParams,
    ]
  );

  const pollTask = useCallback(
    (localId: string, taskId: string, taskParams: ModelParamsType) => {
      const key = isAlibabaModel(taskParams.modelId)
        ? useAppStore.getState().alibabaApiKey
        : useAppStore.getState().apiKey;
      if (!key) return;

      const poll = async () => {
        try {
          const result = await getTaskStatus(key, taskId, taskParams.modelId);
          const status = result.status;

          if (status === "succeeded") {
            const videoUrl = readContentUrl(result.content, "video_url");
            const lastFrameUrl = readContentUrl(result.content, "last_frame_url");
            updateTask(localId, {
              status: "succeeded",
              videoUrl,
              lastFrameUrl,
              seed: result.seed,
              usage: result.usage,
              actualDuration: result.duration,
              actualRatio: result.ratio,
              actualResolution: result.resolution,
            });
            if (pollingRef.current[localId]) {
              clearInterval(pollingRef.current[localId]);
              delete pollingRef.current[localId];
            }
          } else if (status === "failed") {
            updateTask(localId, {
              status: "failed",
              error: result.error?.message || "Generation failed",
            });
            if (pollingRef.current[localId]) {
              clearInterval(pollingRef.current[localId]);
              delete pollingRef.current[localId];
            }
          } else if (status === "cancelled" || status === "expired") {
            updateTask(localId, {
              status: status as "cancelled" | "expired",
              error: status === "expired" ? "Task expired" : "Task cancelled",
            });
            if (pollingRef.current[localId]) {
              clearInterval(pollingRef.current[localId]);
              delete pollingRef.current[localId];
            }
          } else {
            updateTask(localId, { status: status === "queued" ? "queued" : "running" });
          }
        } catch (e) {
          const msg = e instanceof Error ? e.message : "Polling error";
          updateTask(localId, { status: "failed", error: msg });
          if (pollingRef.current[localId]) {
            clearInterval(pollingRef.current[localId]);
            delete pollingRef.current[localId];
          }
        }
      };

      poll();
      pollingRef.current[localId] = setInterval(poll, 10000);
    },
    [updateTask]
  );

  const { tasks } = useAppStore();

  useEffect(() => {
    tasks.forEach((t) => {
      if (
        (t.status === "pending" || t.status === "queued" || t.status === "running") &&
        t.taskId &&
        !pollingRef.current[t.id]
      ) {
        pollTask(t.id, t.taskId, t.params);
      }
    });
  }, [tasks, pollTask]);

  useEffect(() => {
    hydrateTasks();
    return () => {
      Object.values(pollingRef.current).forEach(clearInterval);
    };
  }, []);

  const handleGenerate = useCallback(async () => {
    if (generateIssue || !activeApiKey) {
      setError(generateIssue || "API Key를 입력하세요.");
      return;
    }
    const key = activeApiKey;
    setError("");

    const count = params.outputCount || 1;
    const singleParams = { ...params, outputCount: 1 };
    const trimmedPrompt = prompt.trim();

    const snapshotRefs = references.map((r) => ({ ...r }));

    const localIds: string[] = [];
    for (let i = 0; i < count; i++) {
      const localId = `local-${Date.now()}-${i}`;
      localIds.push(localId);
      addTask({
        id: localId,
        taskId: "",
        prompt: trimmedPrompt,
        status: "pending",
        params: singleParams,
        references: snapshotRefs,
        createdAt: Date.now(),
      });
    }

    for (const localId of localIds) {
      createGenerationTask(key, trimmedPrompt, references, singleParams)
        .then((result) => {
          updateTask(localId, { taskId: result.id, status: "running" });
          pollTask(localId, result.id, singleParams);
        })
        .catch((e) => {
          const msg = e instanceof Error ? e.message : "Unknown error";
          updateTask(localId, { status: "failed", error: msg });
        });
    }
  }, [
    activeApiKey,
    prompt,
    generateIssue,
    references,
    params,
    addTask,
    updateTask,
    pollTask,
  ]);

  return (
    <div className="app-shell h-screen flex flex-col bg-surface-50">
      <Header
        onToggleParams={() => setParamsOpen(!paramsOpen)}
        paramsOpen={paramsOpen}
      />

      <div className="flex-1 flex overflow-hidden">
        {/* Main Content */}
        <div
          ref={mainRef}
          className="flex-1 flex flex-col overflow-hidden relative"
        >
          {/* Results Area */}
          <div className="flex-1 overflow-y-auto p-5 pb-52 scrollbar-thin">
            <VideoResult />
          </div>

          {/* Floating Input Area */}
          <PromptInsertProvider insert={insertAtCursor}>
          <div
            ref={composerRef}
            className="absolute z-20 pointer-events-none"
            style={{
              left: "50%",
              bottom: 20,
              width: isExpanded
                ? "min(calc(100% - 48px), 56rem)"
                : "min(calc(100% - 48px), 42rem)",
              transform: `translate(calc(-50% + ${composerOffset.x}px), ${composerOffset.y}px)`,
              transition: isComposerDragging
                ? "width 320ms cubic-bezier(0.2, 0.8, 0.2, 1)"
                : isComposerSnapping
                ? "transform 460ms cubic-bezier(0.2, 0.9, 0.18, 1.08), width 320ms cubic-bezier(0.2, 0.8, 0.2, 1)"
                : "transform 260ms cubic-bezier(0.2, 0.8, 0.2, 1), width 320ms cubic-bezier(0.2, 0.8, 0.2, 1)",
            }}
          >
            <button
              type="button"
              aria-label="프롬프트 창 이동"
              onPointerDown={handleComposerPointerDown}
              onPointerMove={handleComposerPointerMove}
              onPointerUp={finishComposerDrag}
              onPointerCancel={finishComposerDrag}
              className={`absolute -top-8 left-1/2 z-30 -translate-x-1/2 pointer-events-auto h-5 w-11 rounded-full border border-gray-200 bg-surface-100 shadow-sm flex items-center justify-center text-gray-400 hover:text-primary-600 hover:border-primary-200 hover:bg-primary-50 cursor-grab active:cursor-grabbing transition-colors ${
                isComposerDragging ? "text-primary-600 border-primary-300 bg-primary-50" : ""
              }`}
              title="프롬프트 창 이동"
            >
              <GripHorizontal className="w-3.5 h-3.5" />
            </button>
            <div className="pointer-events-auto">
              <div
                className={`composer-shell relative bg-white rounded-2xl shadow-xl shadow-gray-200/60 border overflow-hidden transition-[border-color,box-shadow] duration-200 ${
                  isDragOver
                    ? "border-primary-400 ring-2 ring-primary-200"
                    : "border-gray-100"
                }`}
                onClick={() => setPromptExpanded(true)}
                onDragEnter={handleDragEnter}
                onDragLeave={handleDragLeave}
                onDragOver={handleDragOver}
                onDrop={handleDrop}
              >
                {isDragOver && (
                  <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-primary-50/95 pointer-events-none rounded-2xl border-2 border-dashed border-primary-400">
                    <ImagePlus className="w-7 h-7 text-primary-500 mb-1" />
                    <p className="text-sm font-medium text-primary-600">
                      여기에 파일을 놓아 첨부
                    </p>
                    <p className="text-[10px] text-primary-500 mt-0.5">
                      {isAlibaba
                        ? "이미지 10MB 이하 · 임시 OSS 업로드"
                        : "이미지 / 비디오 / 오디오 (다중 파일 지원)"}
                    </p>
                  </div>
                )}

                {/* Reference Upload — animated collapse */}
                <div
                  className={`overflow-hidden transition-all duration-300 ease-[cubic-bezier(0.2,0.8,0.2,1)] ${
                    showReferences
                      ? "max-h-80 opacity-100 px-4 pt-4"
                      : "max-h-0 opacity-0 px-4 pt-0"
                  }`}
                >
                  <ReferenceUpload />
                </div>

                {/* Prompt Input */}
                <div className="px-4 py-2">
                  <PromptEditor
                    ref={promptEditorRef}
                    value={prompt}
                    onChange={handlePromptChange}
                    onPaste={handlePaste}
                    onFocus={() => setPromptExpanded(true)}
                    onBlur={() => {}}
                    rows={1}
                    className={
                      isExpanded
                        ? "prompt-editor-expanded"
                        : "prompt-editor-collapsed"
                    }
                    placeholder={
                      isExpanded
                        ? isAlibaba
                          ? currentModel.happyHorseMode === "r2v"
                            ? "프롬프트에서 @img1 태그를 쓰면 character1로 변환됩니다. 이미지 1~9개를 첨부하세요."
                            : currentModel.happyHorseMode === "i2v"
                            ? "첫 프레임 이미지를 기준으로 움직임을 설명하세요. 프롬프트는 선택사항입니다."
                            : "HappyHorse text-to-video 프롬프트를 입력하세요..."
                          : params.mode === "first_last_frame"
                          ? "Describe the motion you want between the first and last frames..."
                          : "프롬프트를 입력하세요. @를 입력하면 첨부 자산 자동완성이 뜹니다 (Tab/Enter 선택). @img1·@vid1·@aud1 등은 자동으로 칩으로 표시됩니다."
                        : isAlibaba
                        ? "HappyHorse 프롬프트 / 클릭하면 크게 열림"
                        : "프롬프트 입력 / @로 첨부 태그 / 클릭하면 크게 열림..."
                    }
                  />
                </div>

                {error && (
                  <div className="mx-4 mb-2 p-2 bg-red-50 border border-red-200 rounded-lg text-xs text-red-600">
                    {error}
                  </div>
                )}

                {dropError && (
                  <div className="mx-4 mb-2 p-2 bg-orange-50 border border-orange-200 rounded-lg text-[11px] text-orange-700 flex items-start gap-1.5">
                    <span className="flex-1">{dropError}</span>
                    <button
                      onClick={clearDropError}
                      className="text-orange-400 hover:text-orange-600 shrink-0"
                    >
                      ✕
                    </button>
                  </div>
                )}

                {/* Bottom Bar */}
                <div className="px-4 pb-3 flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-[11px] text-gray-500 flex-wrap">
                    {/* Mode Dropdown */}
                    <div className="relative">
                      <button
                        className="flex items-center gap-1 px-2 py-1 bg-primary-50 text-primary-600 rounded-lg font-medium text-[11px] hover:bg-primary-100 transition-colors"
                        onClick={() => setModeDropdown(!modeDropdown)}
                      >
                        <Settings2 className="w-3 h-3" />
                        {isAlibaba
                          ? currentModel.happyHorseMode === "t2v"
                            ? "Text-to-video"
                            : currentModel.happyHorseMode === "i2v"
                            ? "Image-to-video"
                            : "Reference-to-video"
                          : params.mode === "reference"
                          ? "Reference"
                          : "First&Last Frame"}
                        <ChevronDown className="w-3 h-3" />
                      </button>
                      {modeDropdown && (
                        <>
                          <div
                            className="fixed inset-0 z-10"
                            onClick={() => setModeDropdown(false)}
                          />
                          <div className="absolute bottom-full mb-1 left-0 bg-white rounded-xl shadow-lg border border-gray-100 py-1 z-20 min-w-[200px]">
                            <p className="px-3 py-1.5 text-[10px] text-gray-400 font-medium">
                              {isAlibaba ? "HappyHorse model" : "Generation mode"}
                            </p>
                            {isAlibaba ? (
                              happyHorseModels.map((model) => (
                                <button
                                  key={model.id}
                                  className={`w-full text-left px-3 py-2 text-xs hover:bg-gray-50 flex items-center justify-between gap-2 ${
                                    params.modelId === model.id
                                      ? "text-primary-600 bg-primary-50"
                                      : "text-gray-700"
                                  }`}
                                  onClick={() => selectHappyHorseModel(model.id)}
                                >
                                  <span>
                                    {model.happyHorseMode === "t2v"
                                      ? "Text-to-video"
                                      : model.happyHorseMode === "i2v"
                                      ? "Image-to-video"
                                      : "Reference-to-video"}
                                  </span>
                                  {params.modelId === model.id && (
                                    <span className="text-primary-500">&#10003;</span>
                                  )}
                                </button>
                              ))
                            ) : (
                              <>
                                <button
                                  className={`w-full text-left px-3 py-2 text-xs hover:bg-gray-50 flex items-center gap-2 ${
                                    params.mode === "reference"
                                      ? "text-primary-600 bg-primary-50"
                                      : "text-gray-700"
                                  }`}
                                  onClick={() => {
                                    useAppStore.getState().setParams({ mode: "reference" });
                                    setModeDropdown(false);
                                  }}
                                >
                                  Reference generation
                                  {params.mode === "reference" && (
                                    <span className="text-primary-500">&#10003;</span>
                                  )}
                                </button>
                                <button
                                  className={`w-full text-left px-3 py-2 text-xs hover:bg-gray-50 flex items-center gap-2 ${
                                    params.mode === "first_last_frame"
                                      ? "text-primary-600 bg-primary-50"
                                      : "text-gray-700"
                                  }`}
                                  onClick={() => {
                                    useAppStore.getState().setParams({ mode: "first_last_frame" });
                                    setModeDropdown(false);
                                  }}
                                >
                                  First&last frame
                                  {params.mode === "first_last_frame" && (
                                    <span className="text-primary-500">&#10003;</span>
                                  )}
                                </button>
                              </>
                            )}
                          </div>
                        </>
                      )}
                    </div>

                    <span className="text-gray-300">|</span>
                    <span>{params.ratio === "adaptive" ? "Auto" : params.ratio}</span>
                    <span className="text-gray-300">|</span>
                    <span>{params.resolution}</span>
                    <span className="text-gray-300">|</span>
                    <span>
                      {params.durationType === "seconds"
                        ? `${params.duration}s`
                        : "Smart"}
                    </span>
                    <span className="text-gray-300">|</span>
                    <span>{params.outputCount} videos</span>
                    {params.generateAudio && !isAlibaba && (
                      <>
                        <span className="text-gray-300">|</span>
                        <span className="px-1.5 py-0.5 border border-primary-300 text-primary-600 rounded font-medium text-[10px]">
                          Sound
                        </span>
                      </>
                    )}
                  </div>

                  <div className="flex items-center gap-2 shrink-0 ml-2">
                    <span className="text-[10px] text-gray-400">
                      {isAlibaba
                        ? "DashScope usage"
                        : `~${(estimateTokens(params, hasVideoRef) / 1000).toFixed(0)}K tokens · $${cost.toFixed(3)}`}
                    </span>
                    <button
                      onClick={handleGenerate}
                      disabled={generateDisabled}
                      title={generateDisabled ? "파일 업로드가 끝난 뒤 생성할 수 있습니다." : "Generate"}
                      className="p-2 bg-primary-500 hover:bg-primary-600 disabled:bg-gray-200 disabled:text-gray-300 text-white rounded-xl transition-colors"
                    >
                      <Play className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
          </PromptInsertProvider>
        </div>

        {/* Params Panel */}
        {paramsOpen && <ModelParams onClose={() => setParamsOpen(false)} />}
      </div>
    </div>
  );
}
