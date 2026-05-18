"use client";

import { useEffect, useState, useCallback } from "react";
import {
  X,
  Download,
  Copy,
  Check,
  RotateCcw,
  ImageIcon,
  Paperclip,
  UserCheck,
  Film,
  Music,
  Trash2,
  Loader2,
  Ban,
} from "lucide-react";
import { useAppStore } from "@/lib/store";
import { deleteTask } from "@/lib/api";
import { copyTextToClipboard } from "@/lib/clipboard";
import { getRefTags } from "@/lib/refTags";
import { downloadCrossOrigin, isUrlExpired } from "@/lib/downloadVideo";
import {
  getTaskDownloadKey,
  hasDownloadedTask,
  markTaskDownloaded,
  subscribeDownloadedTasks,
} from "@/lib/downloadState";
import { costFromUsage, getModelOption, isAlibabaModel } from "@/lib/types";
import type { GenerationTask, ReferenceAsset } from "@/lib/types";
import GenerationFX from "./GenerationFX";

function taskHasVideoInput(task: GenerationTask): boolean {
  return task.references?.some((r) => r.type === "video") ?? false;
}

function getUsageLabel(task: GenerationTask): string | null {
  if (!task.usage) return null;
  if (typeof task.usage.total_tokens === "number") {
    return `${(task.usage.total_tokens / 1000).toFixed(1)}K`;
  }
  const duration = task.usage.output_video_duration ?? task.usage.duration;
  const sr = task.usage.SR;
  const parts = [
    typeof duration === "number" ? `${duration}s` : null,
    sr ? `${sr}P` : null,
    task.usage.ratio,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(" · ") : null;
}

function ModalGenerationState({
  status,
  modelLabel,
}: {
  status: string;
  modelLabel: string;
}) {
  return (
    <GenerationFX
      label={status === "running" ? "Generating" : status}
      modelLabel={modelLabel}
      className="w-64 h-40 rounded-2xl"
    />
  );
}

function ThumbInline({
  asset,
  tag,
}: {
  asset: ReferenceAsset;
  tag?: string;
}) {
  const isAsset = asset.url?.startsWith("asset://") ?? false;
  const isImage = asset.type === "image";
  const roleLabel =
    asset.role === "first_frame"
      ? "F"
      : asset.role === "last_frame"
      ? "L"
      : "";

  return (
    <div
      className="glass-control relative w-12 h-12 rounded-lg overflow-hidden border flex items-center justify-center shrink-0"
      title={`${tag ? `${tag} · ` : ""}${asset.name} (${asset.role || asset.type})`}
    >
      {isImage && asset.preview && !isAsset ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={asset.preview}
          alt={asset.name}
          className="w-full h-full object-cover"
        />
      ) : isAsset ? (
        <UserCheck className="w-4 h-4 text-green-500" />
      ) : asset.type === "video" ? (
        <Film className="w-4 h-4 text-blue-400" />
      ) : asset.type === "audio" ? (
        <Music className="w-4 h-4 text-purple-400" />
      ) : (
        <ImageIcon className="w-4 h-4 text-gray-400" />
      )}
      {tag && (
        <span className="absolute top-0 left-0 bg-primary-500/90 text-white text-[8px] font-bold px-1 leading-tight rounded-br">
          {tag.replace("@", "")}
        </span>
      )}
      {roleLabel && (
        <span className="absolute bottom-0 right-0 bg-primary-500 text-white text-[8px] font-bold px-1 leading-tight rounded-tl">
          {roleLabel}
        </span>
      )}
    </div>
  );
}

export default function TaskDetailModal({
  task,
  onClose,
}: {
  task: GenerationTask;
  onClose: () => void;
}) {
  const { apiKey, alibabaApiKey, removeTask, loadFromTask } = useAppStore();
  const [copiedPrompt, setCopiedPrompt] = useState(false);
  const [copiedSeed, setCopiedSeed] = useState(false);
  const [reused, setReused] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const downloadKey = getTaskDownloadKey(task);
  const [downloaded, setDownloaded] = useState(false);

  const expired = isUrlExpired(task.createdAt);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    const sync = () => setDownloaded(hasDownloadedTask(downloadKey));
    sync();
    return subscribeDownloadedTasks(sync);
  }, [downloadKey]);

  const tags = task.references ? getRefTags(task.references) : {};
  const isFinished = task.status === "succeeded" && task.videoUrl && !expired;
  const isGenerating = ["pending", "queued", "running"].includes(task.status);
  const isAlibaba = isAlibabaModel(task.params.modelId);
  const taskModel = getModelOption(task.params.modelId);
  const taskApiKey = isAlibaba ? alibabaApiKey : apiKey;
  const actualCost =
    typeof task.usage?.total_tokens === "number" && task.usage.total_tokens > 0
      ? costFromUsage(task.params, taskHasVideoInput(task), task.usage.total_tokens)
      : null;
  const usageLabel = getUsageLabel(task);

  const handleDownload = useCallback(async () => {
    if (!task.videoUrl || downloading || downloaded) return;
    setDownloading(true);
    try {
      await downloadCrossOrigin(
        task.videoUrl,
        `seedance-${task.taskId || task.id}.mp4`
      );
      markTaskDownloaded(downloadKey);
      setDownloaded(true);
    } finally {
      setDownloading(false);
    }
  }, [
    downloaded,
    downloadKey,
    task.videoUrl,
    task.taskId,
    task.id,
    downloading,
  ]);
  const canDelete = ["succeeded", "failed", "cancelled", "expired"].includes(
    task.status
  );

  const copyPrompt = useCallback(async () => {
    if (!task.prompt) return;
    await copyTextToClipboard(task.prompt);
    setCopiedPrompt(true);
    setTimeout(() => setCopiedPrompt(false), 1500);
  }, [task.prompt]);

  const copySeed = useCallback(async () => {
    if (task.seed === undefined) return;
    await copyTextToClipboard(String(task.seed));
    setCopiedSeed(true);
    setTimeout(() => setCopiedSeed(false), 1500);
  }, [task.seed]);

  const handleReuse = useCallback(() => {
    loadFromTask(task);
    setReused(true);
    setTimeout(() => setReused(false), 1500);
  }, [loadFromTask, task]);

  const handleDelete = useCallback(async () => {
    if (!taskApiKey || !task.taskId) {
      removeTask(task.id);
      onClose();
      return;
    }
    setDeleting(true);
    try {
      await deleteTask(taskApiKey, task.taskId, task.params.modelId);
    } catch {
      /* even if API delete fails, remove locally */
    }
    removeTask(task.id);
    setDeleting(false);
    onClose();
  }, [taskApiKey, task.taskId, task.id, task.params.modelId, removeTask, onClose]);

  return (
    <div className="task-detail-overlay fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0"
        onClick={onClose}
        aria-label="Close"
      />
      <div className="task-detail-shell relative w-full max-w-5xl max-h-[90vh] overflow-hidden rounded-2xl flex flex-col md:flex-row">
        {/* Close */}
        <button
          onClick={onClose}
          className="task-modal-close absolute right-3 top-3 z-20 flex h-9 w-9 items-center justify-center rounded-full border text-gray-500 transition-colors hover:text-gray-800"
          title="닫기 (Esc)"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Left: video / status */}
        <div className="task-detail-video-pane md:w-2/3 flex items-center justify-center min-h-[280px]">
          {isFinished ? (
            <video
              src={task.videoUrl}
              controls
              autoPlay
              loop
              preload="metadata"
              className="w-full max-h-[90vh] object-contain"
            />
          ) : isGenerating ? (
            <ModalGenerationState status={task.status} modelLabel={taskModel.name} />
          ) : (
            <div className="text-white/70 text-sm flex flex-col items-center gap-2 py-12">
              <Loader2
                className={`w-6 h-6 ${
                  task.status === "running" ? "animate-spin" : ""
                }`}
              />
              <span className="capitalize">
                {expired && task.status === "succeeded" ? "expired" : task.status}
              </span>
              {expired && task.status === "succeeded" && (
                <p className="text-orange-300 text-xs max-w-xs text-center">
                  비디오 URL이 만료되었습니다 (24시간 한정).
                </p>
              )}
              {task.error && (
                <p className="text-red-300 text-xs max-w-xs text-center">
                  {task.error}
                </p>
              )}
            </div>
          )}
        </div>

        {/* Right: details */}
        <div className="task-detail-side md:w-1/3 flex flex-col overflow-y-auto">
          <div className="task-detail-header task-detail-section p-4 pr-16">
            <div className="min-w-0">
              <div className="flex min-w-0 items-center gap-2">
                <h3 className="shrink-0 text-sm font-semibold text-gray-800">
                  Task Detail
                </h3>
                <span
                  className={`task-detail-status text-[10px] font-medium px-2 py-0.5 rounded-full ${
                    task.status === "succeeded"
                      ? "bg-green-50 text-green-600"
                      : task.status === "failed"
                      ? "bg-red-50 text-red-600"
                      : task.status === "running"
                      ? "bg-primary-50 text-primary-600"
                      : "bg-gray-50 text-gray-500"
                  }`}
                  title={task.status}
                >
                  {task.status}
                </span>
              </div>
              <p className="text-[10px] text-gray-400 mt-0.5">
                {new Date(task.createdAt).toLocaleString()}
              </p>
            </div>
          </div>

          {/* Prompt */}
          <div className="p-4 border-b border-white/50">
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-[11px] font-medium text-gray-500 uppercase tracking-wide">
                Prompt
              </label>
              <button
                onClick={copyPrompt}
                className={`task-icon-button ${
                  copiedPrompt
                    ? "task-icon-button-success"
                    : ""
                }`}
                title="프롬프트 복사"
                aria-label="프롬프트 복사"
              >
                {copiedPrompt ? (
                  <Check className="w-3.5 h-3.5" />
                ) : (
                  <Copy className="w-3.5 h-3.5" />
                )}
              </button>
            </div>
            <button
              type="button"
              onClick={copyPrompt}
              className={`task-detail-prompt-card w-full text-left text-xs whitespace-pre-wrap break-words leading-relaxed rounded-xl p-3 max-h-48 overflow-y-auto ${
                copiedPrompt ? "task-detail-prompt-copied" : ""
              }`}
              title="클릭해서 프롬프트 복사"
            >
              {task.prompt || (
                <span className="text-gray-400 italic">(no prompt)</span>
              )}
            </button>
          </div>

          {/* References */}
          {task.references && task.references.length > 0 && (
            <div className="task-detail-section p-4">
              <label className="text-[11px] font-medium text-gray-500 uppercase tracking-wide flex items-center gap-1 mb-2">
                <Paperclip className="w-3 h-3" />
                References ({task.references.length})
              </label>
              <div className="flex items-center gap-2 flex-wrap">
                {task.references.map((r) => (
                  <ThumbInline key={r.id} asset={r} tag={tags[r.id]} />
                ))}
              </div>
            </div>
          )}

          {/* Settings */}
          <div className="task-detail-section p-4">
            <label className="text-[11px] font-medium text-gray-500 uppercase tracking-wide block mb-2">
              Settings
            </label>
            <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-[11px]">
              <dt className="text-gray-400">Model</dt>
              <dd className="text-gray-700 truncate" title={task.params.modelId}>
                {taskModel.name}
              </dd>

              <dt className="text-gray-400">Mode</dt>
              <dd className="text-gray-700">
                {task.params.mode === "first_last_frame"
                  ? "First & Last"
                  : "Reference"}
              </dd>

              <dt className="text-gray-400">Resolution</dt>
              <dd className="text-gray-700">
                {task.actualResolution || task.params.resolution}
              </dd>

              <dt className="text-gray-400">Ratio</dt>
              <dd className="text-gray-700">
                {task.actualRatio || task.params.ratio}
              </dd>

              <dt className="text-gray-400">Duration</dt>
              <dd className="text-gray-700">
                {task.actualDuration
                  ? `${task.actualDuration}s`
                  : task.params.durationType === "seconds"
                  ? `${task.params.duration}s`
                  : "Smart"}
              </dd>

              <dt className="text-gray-400">Audio</dt>
              <dd className="text-gray-700">
                {task.params.generateAudio ? "On" : "Off"}
              </dd>

              <dt className="text-gray-400">Watermark</dt>
              <dd className="text-gray-700">
                {task.params.watermark ? "On" : "Off"}
              </dd>

              {task.seed !== undefined && (
                <>
                  <dt className="text-gray-400">Seed</dt>
                  <dd>
                    <button
                      onClick={copySeed}
                      className="inline-flex items-center gap-0.5 text-gray-700 hover:text-primary-600 transition-colors"
                      title="Copy seed"
                    >
                      {task.seed}
                      {copiedSeed ? (
                        <Check className="w-2.5 h-2.5 text-green-500 ml-0.5" />
                      ) : (
                        <Copy className="w-2.5 h-2.5 ml-0.5" />
                      )}
                    </button>
                  </dd>
                </>
              )}

              {usageLabel && (
                <>
                  <dt className="text-gray-400">
                    {typeof task.usage?.total_tokens === "number" ? "Tokens" : "Usage"}
                  </dt>
                  <dd className="text-gray-700">
                    {usageLabel}
                  </dd>
                  {actualCost !== null && (
                    <>
                      <dt className="text-gray-400">Cost</dt>
                      <dd className="text-gray-700">
                        ${actualCost.toFixed(3)}
                      </dd>
                    </>
                  )}
                </>
              )}
            </dl>
          </div>

          {/* Actions */}
          <div className="task-detail-actions p-4 mt-auto space-y-2">
            <div className="task-detail-action-row flex items-center justify-between gap-2">
              <div className="flex min-w-[2.65rem] items-center justify-start">
                {canDelete && (
                  <button
                    onClick={handleDelete}
                    disabled={deleting}
                    className="task-detail-action-button task-detail-action-danger disabled:opacity-50"
                    title="Delete"
                    aria-label="Delete"
                  >
                    {deleting ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Trash2 className="w-4 h-4" />
                    )}
                  </button>
                )}
              </div>

              <div className="flex items-center justify-end gap-2">
                <button
                  onClick={handleReuse}
                  className={`task-detail-action-button ${
                    reused
                      ? "task-detail-action-success"
                      : ""
                  }`}
                  title="Reuse"
                  aria-label="Reuse"
                >
                  {reused ? (
                    <Check className="w-4 h-4" />
                  ) : (
                    <RotateCcw className="w-4 h-4" />
                  )}
                </button>

                {isFinished && task.lastFrameUrl && (
                  <a
                    href={task.lastFrameUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="task-detail-action-button"
                    title="Last frame"
                    aria-label="Last frame"
                  >
                    <ImageIcon className="w-4 h-4" />
                  </a>
                )}

                {isFinished && (
                  <button
                    onClick={handleDownload}
                    disabled={downloading || downloaded}
                    className={`task-detail-action-button ${
                      downloaded ? "task-detail-action-success" : "task-detail-action-primary"
                    } disabled:opacity-75`}
                    title={
                      downloaded
                        ? "이미 다운로드된 작업입니다"
                        : "한 번만 fetch하고 즉시 메모리 해제"
                    }
                    aria-label={downloaded ? "다운로드됨" : "다운로드"}
                  >
                    {downloading ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : downloaded ? (
                      <Check className="w-4 h-4" />
                    ) : (
                      <Download className="w-4 h-4" />
                    )}
                  </button>
                )}

                {task.status === "queued" && !isAlibaba && (
                  <button
                    onClick={async () => {
                      if (!taskApiKey || !task.taskId) return;
                      setDeleting(true);
                      try {
                        await deleteTask(taskApiKey, task.taskId, task.params.modelId);
                        useAppStore
                          .getState()
                          .updateTask(task.id, { status: "cancelled" });
                      } catch {
                        /* ignore */
                      }
                      setDeleting(false);
                    }}
                    disabled={deleting}
                    className="task-detail-action-button text-orange-500"
                    title="Cancel"
                    aria-label="Cancel"
                  >
                    <Ban className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
