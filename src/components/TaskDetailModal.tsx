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
import { getRefTags } from "@/lib/refTags";
import { downloadCrossOrigin, isUrlExpired } from "@/lib/downloadVideo";
import type { GenerationTask, ReferenceAsset } from "@/lib/types";

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
      className="relative w-12 h-12 rounded-lg overflow-hidden border border-gray-200 bg-gray-50 flex items-center justify-center shrink-0"
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
  const { apiKey, removeTask, loadFromTask } = useAppStore();
  const [copiedPrompt, setCopiedPrompt] = useState(false);
  const [copiedSeed, setCopiedSeed] = useState(false);
  const [reused, setReused] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [downloading, setDownloading] = useState(false);

  const expired = isUrlExpired(task.createdAt);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const tags = task.references ? getRefTags(task.references) : {};
  const isFinished = task.status === "succeeded" && task.videoUrl && !expired;

  const handleDownload = useCallback(async () => {
    if (!task.videoUrl || downloading) return;
    setDownloading(true);
    await downloadCrossOrigin(
      task.videoUrl,
      `seedance-${task.taskId || task.id}.mp4`
    );
    setDownloading(false);
  }, [task.videoUrl, task.taskId, task.id, downloading]);
  const canDelete = ["succeeded", "failed", "cancelled", "expired"].includes(
    task.status
  );

  const copyPrompt = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(task.prompt);
      setCopiedPrompt(true);
      setTimeout(() => setCopiedPrompt(false), 1500);
    } catch {
      /* clipboard not available */
    }
  }, [task.prompt]);

  const copySeed = useCallback(async () => {
    if (task.seed === undefined) return;
    try {
      await navigator.clipboard.writeText(String(task.seed));
      setCopiedSeed(true);
      setTimeout(() => setCopiedSeed(false), 1500);
    } catch {
      /* clipboard not available */
    }
  }, [task.seed]);

  const handleReuse = useCallback(() => {
    loadFromTask(task);
    setReused(true);
    setTimeout(() => setReused(false), 1500);
  }, [loadFromTask, task]);

  const handleDelete = useCallback(async () => {
    if (!apiKey || !task.taskId) {
      removeTask(task.id);
      onClose();
      return;
    }
    setDeleting(true);
    try {
      await deleteTask(apiKey, task.taskId);
    } catch {
      /* even if API delete fails, remove locally */
    }
    removeTask(task.id);
    setDeleting(false);
    onClose();
  }, [apiKey, task.taskId, task.id, removeTask, onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60">
      <div
        className="absolute inset-0"
        onClick={onClose}
        aria-label="Close"
      />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[90vh] overflow-hidden flex flex-col md:flex-row">
        {/* Close */}
        <button
          onClick={onClose}
          className="absolute top-3 right-3 z-10 p-1.5 bg-white/90 hover:bg-white rounded-full shadow-md text-gray-500 hover:text-gray-800 transition-colors"
          title="닫기 (Esc)"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Left: video / status */}
        <div className="md:w-2/3 bg-black flex items-center justify-center min-h-[280px]">
          {isFinished ? (
            <video
              src={task.videoUrl}
              controls
              autoPlay
              loop
              preload="metadata"
              className="w-full max-h-[90vh] object-contain"
            />
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
        <div className="md:w-1/3 flex flex-col overflow-y-auto">
          <div className="p-4 border-b border-gray-100 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-gray-800">Task Detail</h3>
              <p className="text-[10px] text-gray-400 mt-0.5">
                {new Date(task.createdAt).toLocaleString()}
              </p>
            </div>
            <span
              className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${
                task.status === "succeeded"
                  ? "bg-green-50 text-green-600"
                  : task.status === "failed"
                  ? "bg-red-50 text-red-600"
                  : task.status === "running"
                  ? "bg-primary-50 text-primary-600"
                  : "bg-gray-50 text-gray-500"
              }`}
            >
              {task.status}
            </span>
          </div>

          {/* Prompt */}
          <div className="p-4 border-b border-gray-100">
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-[11px] font-medium text-gray-500 uppercase tracking-wide">
                Prompt
              </label>
              <button
                onClick={copyPrompt}
                className={`inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-md border transition-colors ${
                  copiedPrompt
                    ? "border-green-300 bg-green-50 text-green-600"
                    : "border-gray-200 text-gray-500 hover:bg-gray-50 hover:text-gray-700"
                }`}
                title="프롬프트 복사"
              >
                {copiedPrompt ? (
                  <>
                    <Check className="w-2.5 h-2.5" />
                    Copied
                  </>
                ) : (
                  <>
                    <Copy className="w-2.5 h-2.5" />
                    Copy
                  </>
                )}
              </button>
            </div>
            <div className="text-xs text-gray-700 whitespace-pre-wrap break-words leading-relaxed bg-gray-50 rounded-lg p-2.5 max-h-48 overflow-y-auto">
              {task.prompt || (
                <span className="text-gray-400 italic">(no prompt)</span>
              )}
            </div>
          </div>

          {/* References */}
          {task.references && task.references.length > 0 && (
            <div className="p-4 border-b border-gray-100">
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
          <div className="p-4 border-b border-gray-100">
            <label className="text-[11px] font-medium text-gray-500 uppercase tracking-wide block mb-2">
              Settings
            </label>
            <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-[11px]">
              <dt className="text-gray-400">Model</dt>
              <dd className="text-gray-700 truncate" title={task.params.modelId}>
                {task.params.modelId.includes("fast") ? "2.0 Fast" : "2.0"}
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

              {task.usage && (
                <>
                  <dt className="text-gray-400">Tokens</dt>
                  <dd className="text-gray-700">
                    {(task.usage.total_tokens / 1000).toFixed(1)}K
                  </dd>
                </>
              )}
            </dl>
          </div>

          {/* Actions */}
          <div className="p-4 mt-auto space-y-2 bg-gray-50/50">
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={handleReuse}
                className={`inline-flex items-center justify-center gap-1 px-3 py-2 rounded-lg text-xs font-medium border transition-colors ${
                  reused
                    ? "border-green-300 bg-green-50 text-green-600"
                    : "border-gray-200 text-gray-600 hover:bg-primary-50 hover:border-primary-200 hover:text-primary-600"
                }`}
              >
                {reused ? (
                  <Check className="w-3.5 h-3.5" />
                ) : (
                  <RotateCcw className="w-3.5 h-3.5" />
                )}
                {reused ? "Loaded" : "Reuse"}
              </button>

              {isFinished && task.lastFrameUrl && (
                <a
                  href={task.lastFrameUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center gap-1 px-3 py-2 rounded-lg text-xs font-medium border border-gray-200 text-gray-600 hover:bg-gray-100 transition-colors"
                  title="Last frame"
                >
                  <ImageIcon className="w-3.5 h-3.5" />
                  Last Frame
                </a>
              )}
            </div>

            {isFinished && (
              <button
                onClick={handleDownload}
                disabled={downloading}
                className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-lg text-xs font-medium bg-primary-500 hover:bg-primary-600 text-white transition-colors disabled:opacity-60"
                title="한 번만 fetch하고 즉시 메모리 해제"
              >
                {downloading ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Download className="w-3.5 h-3.5" />
                )}
                {downloading ? "Saving..." : "Download Video"}
              </button>
            )}

            {canDelete && (
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="w-full inline-flex items-center justify-center gap-1 px-3 py-2 rounded-lg text-xs font-medium border border-gray-200 text-gray-400 hover:bg-red-50 hover:border-red-200 hover:text-red-500 transition-colors disabled:opacity-50"
              >
                {deleting ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Trash2 className="w-3.5 h-3.5" />
                )}
                Delete
              </button>
            )}

            {task.status === "queued" && (
              <button
                onClick={async () => {
                  if (!apiKey || !task.taskId) return;
                  setDeleting(true);
                  try {
                    await deleteTask(apiKey, task.taskId);
                    useAppStore
                      .getState()
                      .updateTask(task.id, { status: "cancelled" });
                  } catch {
                    /* ignore */
                  }
                  setDeleting(false);
                }}
                disabled={deleting}
                className="w-full inline-flex items-center justify-center gap-1 px-3 py-2 rounded-lg text-xs font-medium border border-orange-200 text-orange-500 hover:bg-orange-50 transition-colors"
              >
                <Ban className="w-3.5 h-3.5" />
                Cancel
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
