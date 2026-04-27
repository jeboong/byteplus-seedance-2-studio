"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import {
  Play,
  Settings2,
  ChevronDown,
  ImagePlus,
} from "lucide-react";
import { useAppStore, hydrateTasks } from "@/lib/store";
import { createGenerationTask, getTaskStatus } from "@/lib/api";
import { estimateCost, estimateTokens } from "@/lib/types";
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

export default function GenerateView() {
  const {
    apiKey,
    prompt,
    setPrompt,
    references,
    params,
    addTask,
    updateTask,
  } = useAppStore();
  const [error, setError] = useState("");
  const [paramsOpen, setParamsOpen] = useState(true);
  const [modeDropdown, setModeDropdown] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const pollingRef = useRef<Record<string, NodeJS.Timeout>>({});
  const promptEditorRef = useRef<PromptEditorHandle>(null);
  const dragCounter = useRef(0);

  // Collapse the input card by default; expand on hover, focus, drag-in,
  // when the user already has attached references, or when the textarea
  // already has content.
  const isExpanded =
    isHovered ||
    isFocused ||
    isDragOver ||
    references.length > 0 ||
    prompt.length > 0;

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

  const hasVideoRef = references.some((r) => r.type === "video");
  const cost = estimateCost(params, hasVideoRef);

  const hasFirstFrame = references.some((r) => r.role === "first_frame");
  const hasLastFrame = references.some((r) => r.role === "last_frame");
  const isFirstLastMode = params.mode === "first_last_frame";
  const lastOnlyError = isFirstLastMode && hasLastFrame && !hasFirstFrame;
  const noFramesError = isFirstLastMode && !hasFirstFrame && !hasLastFrame;
  const generateDisabled =
    !prompt.trim() ||
    lastOnlyError ||
    noFramesError;
  const generateDisabledReason = lastOnlyError
    ? "First frame 이미지를 첨부하세요. (Last frame만으로는 생성 불가)"
    : noFramesError
    ? "First frame 이미지를 먼저 첨부하세요."
    : "";

  const pollTask = useCallback(
    (localId: string, taskId: string) => {
      if (!apiKey) return;

      const poll = async () => {
        try {
          const result = await getTaskStatus(apiKey, taskId);
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
    [apiKey, updateTask]
  );

  const { tasks } = useAppStore();

  useEffect(() => {
    tasks.forEach((t) => {
      if (
        (t.status === "pending" || t.status === "queued" || t.status === "running") &&
        t.taskId &&
        !pollingRef.current[t.id]
      ) {
        pollTask(t.id, t.taskId);
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
    if (!apiKey || !prompt.trim()) return;
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
      createGenerationTask(apiKey, trimmedPrompt, references, singleParams)
        .then((result) => {
          updateTask(localId, { taskId: result.id, status: "running" });
          pollTask(localId, result.id);
        })
        .catch((e) => {
          const msg = e instanceof Error ? e.message : "Unknown error";
          updateTask(localId, { status: "failed", error: msg });
        });
    }
  }, [apiKey, prompt, references, params, addTask, updateTask, pollTask]);

  return (
    <div className="h-screen flex flex-col bg-surface-50">
      <Header
        onToggleParams={() => setParamsOpen(!paramsOpen)}
        paramsOpen={paramsOpen}
      />

      <div className="flex-1 flex overflow-hidden">
        {/* Main Content */}
        <div className="flex-1 flex flex-col overflow-hidden relative">
          {/* Results Area */}
          <div className="flex-1 overflow-y-auto p-5 pb-52 scrollbar-thin">
            <VideoResult />
          </div>

          {/* Floating Input Area */}
          <PromptInsertProvider insert={insertAtCursor}>
          <div className="absolute bottom-0 left-0 right-0 flex justify-center pb-5 px-6 pointer-events-none">
            <div className="w-full max-w-2xl pointer-events-auto">
              <div
                className={`relative bg-white rounded-2xl shadow-xl shadow-gray-200/60 border overflow-hidden transition-all duration-200 ${
                  isDragOver
                    ? "border-primary-400 ring-2 ring-primary-200"
                    : "border-gray-100"
                }`}
                onMouseEnter={() => setIsHovered(true)}
                onMouseLeave={() => setIsHovered(false)}
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
                      이미지 / 비디오 / 오디오 (다중 파일 지원)
                    </p>
                  </div>
                )}

                {/* Reference Upload — animated collapse */}
                <div
                  className={`overflow-hidden transition-all duration-200 ease-out ${
                    isExpanded
                      ? "max-h-72 opacity-100 px-4 pt-3"
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
                    onChange={setPrompt}
                    onPaste={handlePaste}
                    onFocus={() => setIsFocused(true)}
                    onBlur={() => setIsFocused(false)}
                    rows={isExpanded ? 2 : 1}
                    placeholder={
                      isExpanded
                        ? params.mode === "first_last_frame"
                          ? "Describe the motion you want between the first and last frames..."
                          : "프롬프트를 입력하세요. @를 입력하면 첨부 자산 자동완성이 뜹니다 (Tab/Enter 선택). @img1·@vid1·@aud1 등은 자동으로 칩으로 표시됩니다."
                        : "프롬프트 입력 / @로 첨부 태그 / 마우스 올리면 첨부 패널 열기..."
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

                {generateDisabledReason && (
                  <div className="mx-4 mb-2 p-2 bg-amber-50 border border-amber-200 rounded-lg text-[11px] text-amber-700">
                    {generateDisabledReason}
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
                        {params.mode === "reference"
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
                              Generation mode
                            </p>
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
                    {params.generateAudio && (
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
                      ~{(estimateTokens(params, hasVideoRef) / 1000).toFixed(0)}K tokens · ${cost.toFixed(3)}
                    </span>
                    <button
                      onClick={handleGenerate}
                      disabled={generateDisabled}
                      title={generateDisabledReason || "Generate"}
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
