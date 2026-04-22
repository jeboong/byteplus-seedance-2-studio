"use client";

import { useState, useCallback, useRef, useEffect } from "react";
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
  Maximize2,
  Paperclip,
  Film,
  Music,
  UserCheck,
} from "lucide-react";
import { useAppStore } from "@/lib/store";
import { deleteTask } from "@/lib/api";
import { getRefTags } from "@/lib/refTags";
import { downloadCrossOrigin, isUrlExpired } from "@/lib/downloadVideo";
import type { GenerationTask, ReferenceAsset } from "@/lib/types";
import TaskDetailModal from "./TaskDetailModal";

type ViewMode = "list" | "grid";

function ReferenceThumb({
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
      className="relative w-8 h-8 rounded-md overflow-hidden border border-gray-200 bg-gray-50 flex items-center justify-center shrink-0"
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
        <UserCheck className="w-3.5 h-3.5 text-green-500" />
      ) : asset.type === "video" ? (
        <Film className="w-3.5 h-3.5 text-blue-400" />
      ) : asset.type === "audio" ? (
        <Music className="w-3.5 h-3.5 text-purple-400" />
      ) : (
        <ImageIcon className="w-3.5 h-3.5 text-gray-400" />
      )}
      {tag && (
        <span className="absolute top-0 left-0 bg-primary-500/90 text-white text-[7px] font-bold px-0.5 leading-tight rounded-br">
          {tag.replace("@", "")}
        </span>
      )}
      {roleLabel && (
        <span className="absolute bottom-0 right-0 bg-primary-500 text-white text-[7px] font-bold px-1 leading-tight rounded-tl">
          {roleLabel}
        </span>
      )}
    </div>
  );
}

/**
 * Hover-to-play video with lazy network activity.
 *
 * 핵심 최적화:
 * 1. preload="none"  → 마운트 시점에 어떤 네트워크 요청도 일으키지 않음.
 * 2. IntersectionObserver → 뷰포트 안에 들어와야만 video 엘리먼트에 src 부여.
 *    뷰포트 밖이면 src를 떼서 브라우저가 버퍼/메타데이터를 해제하게 함.
 * 3. 호버 진입 시점에 비로소 metadata + 재생을 시작.
 *
 * 결과: 카드 100개가 있어도 동시에 100개의 네트워크 요청이 발생하지 않고,
 *      현재 보이는 카드 + 호버한 카드만 데이터를 받는다.
 */
function HoverVideo({
  src,
  className,
}: {
  src: string;
  className?: string;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el || typeof IntersectionObserver === "undefined") {
      setInView(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) setInView(e.isIntersecting);
      },
      { rootMargin: "200px 0px", threshold: 0.01 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const play = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    if (v.preload !== "auto") v.preload = "metadata";
    const p = v.play();
    if (p && typeof p.catch === "function") p.catch(() => {});
  }, []);

  const pause = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    v.pause();
  }, []);

  return (
    <div ref={wrapRef} className="contents">
      {inView ? (
        <video
          ref={videoRef}
          src={src}
          muted
          loop
          playsInline
          preload="none"
          controls
          className={className}
          onMouseEnter={play}
          onMouseLeave={pause}
          onFocus={play}
          onBlur={pause}
        />
      ) : (
        <div
          className={`${className ?? ""} bg-black/40 dark:bg-black/60 flex items-center justify-center`}
          aria-label="video placeholder"
        >
          <Film className="w-6 h-6 text-white/30" />
        </div>
      )}
    </div>
  );
}

function TaskCard({
  task,
  compact,
  onOpenDetail,
}: {
  task: GenerationTask;
  compact?: boolean;
  onOpenDetail: () => void;
}) {
  const { apiKey, removeTask, loadFromTask } = useAppStore();
  const [copiedSeed, setCopiedSeed] = useState(false);
  const [copiedPrompt, setCopiedPrompt] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [reused, setReused] = useState(false);
  const [downloading, setDownloading] = useState(false);

  const expired = isUrlExpired(task.createdAt);

  const handleDownload = useCallback(
    async (e: React.MouseEvent<HTMLButtonElement>) => {
      e.preventDefault();
      if (!task.videoUrl || downloading) return;
      setDownloading(true);
      const fname = `seedance-${task.taskId || task.id}.mp4`;
      await downloadCrossOrigin(task.videoUrl, fname);
      setDownloading(false);
    },
    [task.videoUrl, task.taskId, task.id, downloading]
  );

  const handleReuse = useCallback(() => {
    loadFromTask(task);
    setReused(true);
    if (typeof window !== "undefined") {
      window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" });
    }
    setTimeout(() => setReused(false), 1500);
  }, [loadFromTask, task]);

  const handleCopyPrompt = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(task.prompt);
      setCopiedPrompt(true);
      setTimeout(() => setCopiedPrompt(false), 1500);
    } catch {
      /* clipboard unavailable */
    }
  }, [task.prompt]);

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

  const effectiveStatus =
    task.status === "succeeded" && expired ? "expired" : task.status;
  const cfg = statusConfig[effectiveStatus] || statusConfig.failed;
  const Icon = cfg.icon;
  const isFinished = task.status === "succeeded" && task.videoUrl && !expired;
  const canDelete = ["succeeded", "failed", "cancelled", "expired"].includes(
    task.status
  );
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
      /* ignore — still remove locally */
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
      /* ignore */
    }
    setDeleting(false);
  }, [apiKey, task.taskId, task.id]);

  const copySeed = () => {
    if (task.seed !== undefined) {
      navigator.clipboard.writeText(String(task.seed));
      setCopiedSeed(true);
      setTimeout(() => setCopiedSeed(false), 1500);
    }
  };

  return (
    <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden shadow-sm h-full flex flex-col">
      {isFinished && task.videoUrl ? (
        <div className="bg-black overflow-hidden flex-shrink-0 relative group">
          <HoverVideo
            src={task.videoUrl}
            className={`w-full object-contain mx-auto ${
              compact ? "max-h-[240px]" : "max-h-[480px]"
            }`}
          />
          <div className="pointer-events-none absolute top-2 left-2 bg-black/60 text-white text-[10px] px-1.5 py-0.5 rounded opacity-100 group-hover:opacity-0 transition-opacity">
            Hover to play
          </div>
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
          {effectiveStatus === "expired" && task.status === "succeeded" && (
            <p className="text-[10px] text-orange-500/80 max-w-xs text-center mt-1 px-4">
              비디오 URL이 만료되었습니다 (24시간). 새로 생성해 주세요.
            </p>
          )}
        </div>
      )}

      <div className={`${compact ? "px-3 py-2" : "px-4 py-3"} flex-1`}>
        <div className="flex items-start gap-1.5">
          <p
            className={`flex-1 text-gray-600 leading-relaxed whitespace-pre-wrap break-words ${
              compact ? "text-[11px] line-clamp-1" : "text-xs line-clamp-2"
            }`}
          >
            {task.prompt}
          </p>
          <button
            onClick={onOpenDetail}
            className="shrink-0 p-0.5 -mt-0.5 text-gray-400 hover:text-primary-600 hover:bg-primary-50 rounded transition-colors"
            title="상세보기 (영상 + 프롬프트 + 설정)"
          >
            <Maximize2 className={compact ? "w-3 h-3" : "w-3.5 h-3.5"} />
          </button>
        </div>

        {!compact && task.references && task.references.length > 0 && (() => {
          const tags = getRefTags(task.references);
          return (
            <div className="mt-2 flex items-center gap-1.5 flex-wrap">
              <Paperclip className="w-3 h-3 text-gray-300" />
              {task.references.map((r) => (
                <ReferenceThumb key={r.id} asset={r} tag={tags[r.id]} />
              ))}
            </div>
          );
        })()}

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
                  {copiedSeed ? (
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
              onClick={handleCopyPrompt}
              className={`inline-flex items-center gap-0.5 border rounded-lg font-medium transition-colors ${
                copiedPrompt
                  ? "border-green-300 bg-green-50 text-green-600"
                  : "border-gray-200 text-gray-500 hover:bg-gray-50 hover:text-gray-700"
              } ${
                compact
                  ? "px-1.5 py-0.5 text-[9px]"
                  : "px-2 py-0.5 text-[10px]"
              }`}
              title="프롬프트 복사"
            >
              {copiedPrompt ? (
                <Check className={compact ? "w-2.5 h-2.5" : "w-3 h-3"} />
              ) : (
                <Copy className={compact ? "w-2.5 h-2.5" : "w-3 h-3"} />
              )}
              {!compact && (copiedPrompt ? "Copied" : "Copy")}
            </button>
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
              <button
                onClick={handleDownload}
                disabled={downloading}
                className={`inline-flex items-center gap-1 bg-primary-500 text-white rounded-lg font-medium hover:bg-primary-600 transition-colors disabled:opacity-60 ${
                  compact
                    ? "px-2 py-0.5 text-[10px]"
                    : "px-2.5 py-1 text-[11px]"
                }`}
                title="비디오 다운로드 (한 번만 fetch, 즉시 메모리 해제)"
              >
                {downloading ? (
                  <Loader2
                    className={`${compact ? "w-2.5 h-2.5" : "w-3 h-3"} animate-spin`}
                  />
                ) : (
                  <Download className={compact ? "w-2.5 h-2.5" : "w-3 h-3"} />
                )}
                {compact
                  ? downloading
                    ? "..."
                    : "DL"
                  : downloading
                  ? "Saving"
                  : "Download"}
              </button>
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
  const [detailTaskId, setDetailTaskId] = useState<string | null>(null);

  const detailTask =
    detailTaskId !== null
      ? tasks.find((t) => t.id === detailTaskId) ?? null
      : null;

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
              <TaskCard
                task={task}
                onOpenDetail={() => setDetailTaskId(task.id)}
              />
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-5 gap-3">
          {tasks.map((task) => (
            <TaskCard
              key={task.id}
              task={task}
              compact
              onOpenDetail={() => setDetailTaskId(task.id)}
            />
          ))}
        </div>
      )}

      {detailTask && (
        <TaskDetailModal
          task={detailTask}
          onClose={() => setDetailTaskId(null)}
        />
      )}
    </div>
  );
}
