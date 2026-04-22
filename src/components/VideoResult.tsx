"use client";

import { useState, useCallback, useRef, useEffect, useLayoutEffect } from "react";
import {
  Download,
  Loader2,
  CheckCircle2,
  XCircle,
  Clock,
  RefreshCw,
  LayoutList,
  LayoutGrid,
  Trash2,
  Ban,
  Timer,
  ImageIcon,
  Copy,
  Check,
  RotateCcw,
  ChevronDown,
  ChevronUp,
  Paperclip,
  Film,
  Music,
  UserCheck,
} from "lucide-react";
import { useAppStore } from "@/lib/store";
import { deleteTask } from "@/lib/api";
import type { GenerationTask, ReferenceAsset } from "@/lib/types";

type ViewMode = "list" | "grid";

function ReferenceThumb({ asset }: { asset: ReferenceAsset }) {
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
      className="relative w-8 h-8 rounded-md overflow-hidden border border-gray-200 bg-gray-50 flex items-center justify-center shrink-0"
      title={`${asset.name} (${asset.role || asset.type})`}
    >
      {isImage && asset.preview && !isAsset ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={asset.preview}
          alt={asset.name}
          className="w-full h-full object-cover"
        />
      ) : isAsset ? (
        <UserCheck className="w-3.5 h-3.5 text-green-500" />
      ) : asset.type === "video" ? (
        <Film className="w-3.5 h-3.5 text-blue-400" />
      ) : asset.type === "audio" ? (
        <Music className="w-3.5 h-3.5 text-purple-400" />
      ) : (
        <ImageIcon className="w-3.5 h-3.5 text-gray-400" />
      )}
      {roleLabel && (
        <span className="absolute bottom-0 right-0 bg-primary-500 text-white text-[7px] font-bold px-1 leading-tight rounded-tl">
          {roleLabel}
        </span>
      )}
    </div>
  );
}

function TaskCard({
  task,
  compact,
}: {
  task: GenerationTask;
  compact?: boolean;
}) {
  const { apiKey, removeTask, loadFromTask } = useAppStore();
  const [copied, setCopied] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [isClamped, setIsClamped] = useState(false);
  const [reused, setReused] = useState(false);
  const promptRef = useRef<HTMLParagraphElement>(null);

  useLayoutEffect(() => {
    const el = promptRef.current;
    if (!el || expanded) return;
    setIsClamped(el.scrollHeight > el.clientHeight + 1);
  }, [task.prompt, compact, expanded]);

  useEffect(() => {
    if (!reused) return;
    const t = setTimeout(() => setReused(false), 1500);
    return () => clearTimeout(t);
  }, [reused]);

  const handleReuse = useCallback(() => {
    loadFromTask(task);
    setReused(true);
    if (typeof window !== "undefined") {
      window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" });
    }
  }, [loadFromTask, task]);

  const statusConfig = {
    pending: {
      icon: Clock,
      color: "text-amber-500",
      bg: "bg-amber-50",
      label: "Pending",
    },
    queued: {
      icon: Clock,
      color: "text-amber-500",
      bg: "bg-amber-50",
      label: "Queued",
    },
    running: {
      icon: Loader2,
      color: "text-primary-500",
      bg: "bg-surface-100",
      label: "Generating...",
    },
    succeeded: {
      icon: CheckCircle2,
      color: "text-green-500",
      bg: "bg-green-50",
      label: "Complete",
    },
    failed: {
      icon: XCircle,
      color: "text-red-500",
      bg: "bg-red-50/60",
      label: "Failed",
    },
    cancelled: {
      icon: Ban,
      color: "text-gray-500",
      bg: "bg-gray-50",
      label: "Cancelled",
    },
    expired: {
      icon: Timer,
      color: "text-orange-500",
      bg: "bg-orange-50",
      label: "Expired",
    },
  };

  const cfg = statusConfig[task.status] || statusConfig.failed;
  const Icon = cfg.icon;
  const isFinished = task.status === "succeeded" && task.videoUrl;
  const canDelete = ["succeeded", "failed", "cancelled", "expired"].includes(task.status);
  const canCancel = task.status === "queued";

  const handleDelete = useCallback(async () => {
    if (!apiKey || !task.taskId) {
      removeTask(task.id);
      return;
    }
    setDeleting(true);
    try {
      await deleteTask(apiKey, task.taskId);
    } catch {
      // Even if API delete fails, remove from local state
    }
    removeTask(task.id);
    setDeleting(false);
  }, [apiKey, task.taskId, task.id, removeTask]);

  const handleCancel = useCallback(async () => {
    if (!apiKey || !task.taskId) return;
    setDeleting(true);
    try {
      await deleteTask(apiKey, task.taskId);
      useAppStore.getState().updateTask(task.id, { status: "cancelled" });
    } catch {
      // Ignore
    }
    setDeleting(false);
  }, [apiKey, task.taskId, task.id]);

  const copySeed = () => {
    if (task.seed !== undefined) {
      navigator.clipboard.writeText(String(task.seed));
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  };

  return (
    <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden shadow-sm h-full flex flex-col">
      {isFinished ? (
        <div className="bg-black overflow-hidden flex-shrink-0">
          <video
            src={task.videoUrl}
            controls
            autoPlay
            loop
            className={`w-full object-contain mx-auto ${
              compact ? "max-h-[240px]" : "max-h-[480px]"
            }`}
          />
        </div>
      ) : (
        <div
          className={`${cfg.bg} flex flex-col items-center justify-center gap-2 flex-shrink-0 ${
            compact ? "py-12" : "py-20"
          }`}
        >
          <Icon
            className={`${compact ? "w-6 h-6" : "w-7 h-7"} ${cfg.color} ${
              task.status === "running" ? "animate-spin" : ""
            }`}
          />
          <span
            className={`${compact ? "text-xs" : "text-sm"} font-medium ${
              cfg.color
            }`}
          >
            {cfg.label}
          </span>
          {task.status === "running" && (
            <div
              className={`${
                compact ? "w-20" : "w-32"
              } h-1.5 bg-gray-200 rounded-full overflow-hidden mt-1`}
            >
              <div className="h-full bg-primary-400 rounded-full animate-pulse w-2/3" />
            </div>
          )}
          {task.error && (
            <p className="text-xs text-red-500 max-w-xs text-center mt-1 px-4">
              {task.error}
            </p>
          )}
        </div>
      )}

      <div className={`${compact ? "px-3 py-2" : "px-4 py-3"} flex-1`}>
        <div className="flex items-start gap-1.5">
          <p
            ref={promptRef}
            className={`flex-1 text-gray-600 leading-relaxed whitespace-pre-wrap break-words ${
              expanded
                ? compact
                  ? "text-[11px]"
                  : "text-xs"
                : compact
                ? "text-[11px] line-clamp-1"
                : "text-xs line-clamp-2"
            }`}
          >
            {task.prompt}
          </p>
          {(isClamped || expanded) && (
            <button
              onClick={() => setExpanded((v) => !v)}
              className="shrink-0 p-0.5 -mt-0.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded transition-colors"
              title={expanded ? "접기" : "프롬프트 전체 보기"}
            >
              {expanded ? (
                <ChevronUp className={compact ? "w-3 h-3" : "w-3.5 h-3.5"} />
              ) : (
                <ChevronDown className={compact ? "w-3 h-3" : "w-3.5 h-3.5"} />
              )}
            </button>
          )}
        </div>

        {!compact && task.references && task.references.length > 0 && (
          <div className="mt-2 flex items-center gap-1.5 flex-wrap">
            <Paperclip className="w-3 h-3 text-gray-300" />
            {task.references.map((r) => (
              <ReferenceThumb key={r.id} asset={r} />
            ))}
          </div>
        )}

        <div
          className={`${
            compact ? "mt-1.5" : "mt-2"
          } flex items-center justify-between`}
        >
          <div
            className={`flex items-center gap-1.5 flex-wrap ${
              compact ? "text-[9px]" : "text-[10px]"
            } text-gray-400`}
          >
            <span>{task.actualResolution || task.params.resolution}</span>
            <span>·</span>
            <span>{task.actualRatio || task.params.ratio}</span>
            <span>·</span>
            <span>
              {task.actualDuration
                ? `${task.actualDuration}s`
                : task.params.durationType === "seconds"
                ? `${task.params.duration}s`
                : "auto"}
            </span>
            {task.seed !== undefined && !compact && (
              <>
                <span>·</span>
                <button
                  onClick={copySeed}
                  className="inline-flex items-center gap-0.5 hover:text-gray-600 transition-colors"
                  title="Copy seed"
                >
                  seed:{task.seed}
                  {copied ? (
                    <Check className="w-2.5 h-2.5 text-green-500" />
                  ) : (
                    <Copy className="w-2.5 h-2.5" />
                  )}
                </button>
              </>
            )}
            {task.usage && !compact && (
              <>
                <span>·</span>
                <span>{(task.usage.total_tokens / 1000).toFixed(1)}K tokens</span>
              </>
            )}
            {!compact && (
              <>
                <span>·</span>
                <span>{new Date(task.createdAt).toLocaleTimeString()}</span>
              </>
            )}
          </div>

          <div className="flex items-center gap-1.5 shrink-0 ml-2">
            <button
              onClick={handleReuse}
              className={`inline-flex items-center gap-0.5 border rounded-lg font-medium transition-colors ${
                reused
                  ? "border-green-300 bg-green-50 text-green-600"
                  : "border-gray-200 text-gray-500 hover:bg-primary-50 hover:border-primary-200 hover:text-primary-600"
              } ${
                compact
                  ? "px-1.5 py-0.5 text-[9px]"
                  : "px-2 py-0.5 text-[10px]"
              }`}
              title="이 작업의 프롬프트·첨부·설정을 다시 불러오기"
            >
              {reused ? (
                <Check className={compact ? "w-2.5 h-2.5" : "w-3 h-3"} />
              ) : (
                <RotateCcw className={compact ? "w-2.5 h-2.5" : "w-3 h-3"} />
              )}
              {!compact && (reused ? "Loaded" : "Reuse")}
            </button>
            {isFinished && task.lastFrameUrl && (
              <a
                href={task.lastFrameUrl}
                target="_blank"
                rel="noopener noreferrer"
                className={`inline-flex items-center gap-0.5 border border-gray-200 text-gray-500 rounded-lg font-medium hover:bg-gray-50 transition-colors ${
                  compact
                    ? "px-1.5 py-0.5 text-[9px]"
                    : "px-2 py-0.5 text-[10px]"
                }`}
                title="Last frame"
              >
                <ImageIcon className={compact ? "w-2.5 h-2.5" : "w-3 h-3"} />
              </a>
            )}
            {isFinished && (
              <a
                href={task.videoUrl}
                target="_blank"
                rel="noopener noreferrer"
                download
                className={`inline-flex items-center gap-1 bg-primary-500 text-white rounded-lg font-medium hover:bg-primary-600 transition-colors ${
                  compact
                    ? "px-2 py-0.5 text-[10px]"
                    : "px-2.5 py-1 text-[11px]"
                }`}
              >
                <Download className={compact ? "w-2.5 h-2.5" : "w-3 h-3"} />
                {compact ? "DL" : "Download"}
              </a>
            )}
            {canCancel && (
              <button
                onClick={handleCancel}
                disabled={deleting}
                className={`inline-flex items-center gap-1 border border-orange-200 text-orange-500 rounded-lg font-medium hover:bg-orange-50 transition-colors ${
                  compact
                    ? "px-1.5 py-0.5 text-[9px]"
                    : "px-2 py-0.5 text-[10px]"
                }`}
                title="Cancel task"
              >
                <Ban className="w-3 h-3" />
                {!compact && "Cancel"}
              </button>
            )}
            {canDelete && (
              <button
                onClick={handleDelete}
                disabled={deleting}
                className={`inline-flex items-center gap-0.5 text-gray-400 hover:text-red-500 transition-colors ${
                  compact ? "p-0.5" : "p-1"
                }`}
                title="Delete task"
              >
                {deleting ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : (
                  <Trash2 className="w-3 h-3" />
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function ViewToggle({
  mode,
  onChange,
}: {
  mode: ViewMode;
  onChange: (m: ViewMode) => void;
}) {
  return (
    <div className="inline-flex items-center bg-surface-100 rounded-lg p-0.5">
      <button
        onClick={() => onChange("list")}
        className={`p-1.5 rounded-md transition-colors ${
          mode === "list"
            ? "bg-white shadow-sm text-gray-700"
            : "text-gray-400 hover:text-gray-500"
        }`}
      >
        <LayoutList className="w-4 h-4" />
      </button>
      <button
        onClick={() => onChange("grid")}
        className={`p-1.5 rounded-md transition-colors ${
          mode === "grid"
            ? "bg-white shadow-sm text-gray-700"
            : "text-gray-400 hover:text-gray-500"
        }`}
      >
        <LayoutGrid className="w-4 h-4" />
      </button>
    </div>
  );
}

export default function VideoResult() {
  const { tasks, clearTasks } = useAppStore();
  const [viewMode, setViewMode] = useState<ViewMode>("list");

  if (tasks.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <div className="w-14 h-14 rounded-2xl bg-surface-100 flex items-center justify-center mx-auto mb-3">
            <RefreshCw className="w-5 h-5 text-gray-300" />
          </div>
          <p className="text-sm text-gray-400 mb-1">No generations yet</p>
          <p className="text-xs text-gray-300">
            프롬프트를 입력하고 Generate를 클릭하세요
          </p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-3">
        <span className="text-xs text-gray-400">{tasks.length} tasks</span>
        <div className="flex items-center gap-2">
          {tasks.length > 0 && (
            <button
              onClick={clearTasks}
              className="text-[10px] text-gray-400 hover:text-red-500 transition-colors px-2 py-1 rounded-lg hover:bg-red-50"
            >
              Clear all
            </button>
          )}
          <ViewToggle mode={viewMode} onChange={setViewMode} />
        </div>
      </div>

      {viewMode === "list" ? (
        <div className="flex flex-col items-center gap-4">
          {tasks.map((task) => (
            <div key={task.id} className="w-full max-w-2xl">
              <TaskCard task={task} />
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-5 gap-3">
          {tasks.map((task) => (
            <TaskCard key={task.id} task={task} compact />
          ))}
        </div>
      )}
    </div>
  );
}
