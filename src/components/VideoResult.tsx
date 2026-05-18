"use client";

import {
  useState,
  useCallback,
  useRef,
  useEffect,
} from "react";
import { createPortal } from "react-dom";
import {
  Download,
  Loader2,
  CheckCircle2,
  XCircle,
  Clock,
  RefreshCw,
  X,
  ChevronLeft,
  LayoutList,
  LayoutGrid,
  Ban,
  Timer,
  ImageIcon,
  Check,
  Copy,
  RotateCcw,
  Maximize2,
  Search,
  Paperclip,
  Film,
  Music,
  UserCheck,
} from "lucide-react";
import { useAppStore } from "@/lib/store";
import { deleteTask } from "@/lib/api";
import { getRefTags } from "@/lib/refTags";
import { downloadCrossOrigin, isUrlExpired } from "@/lib/downloadVideo";
import {
  getTaskDownloadKey,
  hasDownloadedTask,
  markTaskDownloaded,
  subscribeDownloadedTasks,
} from "@/lib/downloadState";
import { getModelOption, isAlibabaModel } from "@/lib/types";
import type { GenerationTask, ReferenceAsset } from "@/lib/types";
import GenerationFX from "./GenerationFX";
import TaskDetailModal from "./TaskDetailModal";

type ViewMode = "free" | "grid";

function clampNumber(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function cssAspectRatio(ratio?: string): string {
  switch (ratio) {
    case "21:9":
      return "21 / 9";
    case "4:3":
      return "4 / 3";
    case "1:1":
      return "1 / 1";
    case "3:4":
      return "3 / 4";
    case "9:16":
      return "9 / 16";
    case "16:9":
    default:
      return "16 / 9";
  }
}

function formatElapsedMs(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function taskIsInProgress(task: GenerationTask): boolean {
  return ["pending", "queued", "running"].includes(task.status);
}

function getTaskElapsedLabel(
  task: GenerationTask,
  now = Date.now()
): string | null {
  const end = task.completedAt ?? (taskIsInProgress(task) ? now : undefined);
  if (!end || !task.createdAt) return null;
  return formatElapsedMs(end - task.createdAt);
}

function ReferenceThumb({
  asset,
  tag,
  onOpen,
}: {
  asset: ReferenceAsset;
  tag?: string;
  onOpen?: (asset: ReferenceAsset) => void;
}) {
  const isAsset = asset.url?.startsWith("asset://") ?? false;
  const isImage = asset.type === "image";
  const roleLabel =
    asset.role === "first_frame"
      ? "F"
      : asset.role === "last_frame"
      ? "L"
      : "";
  const tagNumber = tag?.match(/\d+/)?.[0];

  const content = (
    <>
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
      {tagNumber && (
        <span className="task-reference-tag-overlay">
          {tagNumber}
        </span>
      )}
      {roleLabel && (
        <span className="absolute bottom-0 right-0 bg-primary-500 text-white text-[7px] font-bold px-1 leading-tight rounded-tl">
          {roleLabel}
        </span>
      )}
    </>
  );

  const title = `${tag ? `${tag} · ` : ""}${asset.name} (${asset.role || asset.type})`;

  if (onOpen) {
    return (
      <button
        type="button"
        className="task-reference-thumb glass-control relative w-8 h-8 rounded-md overflow-hidden border flex items-center justify-center shrink-0"
        title={`${title} 크게 보기`}
        aria-label={`${title} 크게 보기`}
        data-no-task-click
        onClick={(event) => {
          event.stopPropagation();
          onOpen(asset);
        }}
        onPointerDown={(event) => event.stopPropagation()}
      >
        {content}
      </button>
    );
  }

  return (
    <div
      className="task-reference-thumb glass-control relative w-8 h-8 rounded-md overflow-hidden border flex items-center justify-center shrink-0"
      title={title}
    >
      {content}
    </div>
  );
}

function AttachmentPreviewOverlay({
  asset,
  tag,
  onClose,
}: {
  asset: ReferenceAsset;
  tag?: string;
  onClose: () => void;
}) {
  const source = asset.preview || asset.url;
  const isAsset = source?.startsWith("asset://") ?? false;
  const canShowImage = asset.type === "image" && source && !isAsset;
  const canShowVideo = asset.type === "video" && asset.url && !isAsset;
  const canShowAudio = asset.type === "audio" && asset.url && !isAsset;

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      className="attachment-preview-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="첨부파일 크게 보기"
      data-no-task-click
      data-no-task-drag
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        className="attachment-preview-panel"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <button
          type="button"
          className="attachment-preview-close"
          onClick={onClose}
          aria-label="닫기"
          title="닫기"
        >
          <X className="h-4 w-4" />
        </button>
        <div className="attachment-preview-media">
          {canShowImage ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={source} alt={asset.name} />
          ) : canShowVideo ? (
            <video src={asset.url} controls autoPlay muted playsInline />
          ) : canShowAudio ? (
            <div className="attachment-preview-audio">
              <Music className="h-8 w-8" />
              <audio src={asset.url} controls />
            </div>
          ) : (
            <div className="attachment-preview-empty">
              {asset.type === "video" ? (
                <Film className="h-8 w-8" />
              ) : asset.type === "audio" ? (
                <Music className="h-8 w-8" />
              ) : (
                <ImageIcon className="h-8 w-8" />
              )}
              <span>프리뷰 가능한 로컬 데이터가 없습니다.</span>
            </div>
          )}
        </div>
        <div className="attachment-preview-caption">
          <span>{tag || asset.type}</span>
          <strong>{asset.name}</strong>
        </div>
      </div>
    </div>,
    document.body
  );
}

/**
 * Hover-to-play video with lazy network activity.
 *
 * 핵심 최적화:
 * 1. IntersectionObserver → 뷰포트 안에 들어와야만 video 엘리먼트에 src 부여.
 *    뷰포트 밖이면 src를 떼서 브라우저가 버퍼/메타데이터를 해제하게 함.
 * 2. 실제 레이아웃 박스를 관찰해서 display: contents로 인한 미리보기
 *    누락을 피함.
 *
 * 결과: 카드 100개가 있어도 동시에 100개의 네트워크 요청이 발생하지 않고,
 *      현재 보이는 카드 + 호버한 카드만 데이터를 받는다.
 */
function HoverVideo({
  src,
  compact,
  ratio,
  fill,
  controls = false,
}: {
  src: string;
  compact?: boolean;
  ratio?: string;
  fill?: boolean;
  controls?: boolean;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [inView, setInView] = useState(false);
  const [loadError, setLoadError] = useState(false);

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
    <div
      ref={wrapRef}
      className={`relative w-full bg-black overflow-hidden flex items-center justify-center ${
        fill ? "h-full max-h-none" : compact ? "max-h-[240px]" : "max-h-[480px]"
      }`}
      style={fill ? undefined : { aspectRatio: cssAspectRatio(ratio) }}
    >
      {inView ? (
        <video
          ref={videoRef}
          src={src}
          controls={controls}
          muted={!controls}
          loop={!controls}
          playsInline
          preload={controls ? "auto" : "metadata"}
          className="absolute inset-0 w-full h-full object-cover"
          onMouseEnter={controls ? undefined : play}
          onMouseLeave={controls ? undefined : pause}
          onFocus={controls ? undefined : play}
          onBlur={controls ? undefined : pause}
          onLoadedMetadata={() => setLoadError(false)}
          onError={() => setLoadError(true)}
        />
      ) : (
        <div
          className="absolute inset-0 bg-black/50 dark:bg-black/70 flex items-center justify-center"
          aria-label="video placeholder"
        >
          <Film className="w-6 h-6 text-white/30" />
        </div>
      )}
      {loadError && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-black/80 text-white/70 text-xs px-4 text-center">
          <Film className="w-5 h-5 text-white/40" />
          <span>Preview unavailable</span>
          <a
            href={src}
            target="_blank"
            rel="noopener noreferrer"
            className="text-white/90 underline underline-offset-2"
          >
            Open video URL
          </a>
        </div>
      )}
    </div>
  );
}

function GenerationState({
  label,
  compact,
  neutral,
}: {
  label: string;
  compact?: boolean;
  neutral?: boolean;
}) {
  return (
    <GenerationFX
      label={label}
      compact={compact}
      tone={neutral ? "neutral" : "default"}
      className="h-full w-full"
    />
  );
}

function InlineTaskDetails({
  task,
}: {
  task: GenerationTask;
}) {
  const [promptCopied, setPromptCopied] = useState(false);
  const taskModel = getModelOption(task.params.modelId);
  const actualDuration =
    task.actualDuration ??
    (task.params.durationType === "seconds" ? task.params.duration : null);
  const usageTokens =
    task.usage?.total_tokens ?? task.usage?.completion_tokens ?? null;
  const modeLabel =
    task.params.mode === "text"
      ? "Text"
      : task.params.mode === "first_last_frame"
      ? "First/Last"
      : "Reference";
  const copyPrompt = useCallback(async () => {
    const text = task.prompt || "";
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setPromptCopied(true);
      window.setTimeout(() => setPromptCopied(false), 1200);
    } catch {
      setPromptCopied(false);
    }
  }, [task.prompt]);

  return (
    <div className="task-inline-details" data-no-task-click>
      <section className="task-inline-block task-inline-prompt">
        <div className="task-inline-label-row">
          <div className="task-inline-label">Prompt</div>
          <button
            type="button"
            className={`task-inline-copy-button ${
              promptCopied ? "task-inline-copy-button-done" : ""
            }`}
            onClick={copyPrompt}
            disabled={!task.prompt}
            title="프롬프트 복사"
            aria-label="프롬프트 복사"
          >
            {promptCopied ? (
              <Check className="h-3.5 w-3.5" />
            ) : (
              <Copy className="h-3.5 w-3.5" />
            )}
          </button>
        </div>
        <p>{task.prompt || "(no prompt)"}</p>
      </section>

      <section className="task-inline-block">
        <div className="task-inline-label">Details</div>
        <dl className="task-inline-dl">
          <dt>Model</dt>
          <dd>{task.sourceModel || taskModel.name}</dd>
          <dt>Mode</dt>
          <dd>{modeLabel}</dd>
          <dt>Duration</dt>
          <dd>
            {actualDuration
              ? `${actualDuration}s`
              : typeof task.actualFrames === "number"
              ? `${task.actualFrames} frames`
              : "Auto"}
          </dd>
          {typeof task.framesPerSecond === "number" && (
            <>
              <dt>FPS</dt>
              <dd>{task.framesPerSecond}</dd>
            </>
          )}
          <dt>Ratio</dt>
          <dd>{task.actualRatio || task.params.ratio}</dd>
          <dt>Resolution</dt>
          <dd>{task.actualResolution || task.params.resolution}</dd>
          {typeof task.generatedAudio === "boolean" && (
            <>
              <dt>Audio</dt>
              <dd>{task.generatedAudio ? "On" : "Off"}</dd>
            </>
          )}
          {getTaskElapsedLabel(task) && (
            <>
              <dt>Elapsed</dt>
              <dd>{getTaskElapsedLabel(task)}</dd>
            </>
          )}
          {task.serviceTier && (
            <>
              <dt>Tier</dt>
              <dd>{task.serviceTier}</dd>
            </>
          )}
          <dt>Status</dt>
          <dd>{task.status}</dd>
          {typeof task.seed === "number" && (
            <>
              <dt>Seed</dt>
              <dd>{task.seed}</dd>
            </>
          )}
          {typeof usageTokens === "number" && (
            <>
              <dt>Tokens</dt>
              <dd>{usageTokens.toLocaleString()}</dd>
            </>
          )}
        </dl>
      </section>
    </div>
  );
}

function TaskCard({
  task,
  compact,
  onOpenDetail,
  expanded = false,
  onToggleExpand,
  selectionMode = false,
  selected = false,
  onToggleSelect,
}: {
  task: GenerationTask;
  compact?: boolean;
  onOpenDetail: () => void;
  expanded?: boolean;
  onToggleExpand?: () => void;
  selectionMode?: boolean;
  selected?: boolean;
  onToggleSelect?: () => void;
}) {
  const { apiKey, alibabaApiKey, removeTask, loadFromTask } = useAppStore();
  const [deleting, setDeleting] = useState(false);
  const [reused, setReused] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [deleteMenu, setDeleteMenu] = useState<{
    x: number;
    y: number;
  } | null>(null);
  const [previewAsset, setPreviewAsset] = useState<ReferenceAsset | null>(null);
  const mediaRef = useRef<HTMLDivElement>(null);
  const downloadKey = getTaskDownloadKey(task);
  const [downloaded, setDownloaded] = useState(false);

  const expired = isUrlExpired(task.createdAt);

  useEffect(() => {
    const sync = () => setDownloaded(hasDownloadedTask(downloadKey));
    sync();
    return subscribeDownloadedTasks(sync);
  }, [downloadKey]);

  useEffect(() => {
    if (!deleteMenu) return;
    const close = () => setDeleteMenu(null);
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    window.addEventListener("pointerdown", close);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointerdown", close);
      window.removeEventListener("keydown", onKey);
    };
  }, [deleteMenu]);

  const handleDownload = useCallback(
    async (e: React.MouseEvent<HTMLButtonElement>) => {
      e.preventDefault();
      e.stopPropagation();
      if (!task.videoUrl || downloading || downloaded) return;
      setDownloading(true);
      const fname = `seedance-${task.taskId || task.id}.mp4`;
      try {
        await downloadCrossOrigin(task.videoUrl, fname);
        markTaskDownloaded(downloadKey);
        setDownloaded(true);
      } finally {
        setDownloading(false);
      }
    },
    [downloadKey, downloaded, task.videoUrl, task.taskId, task.id, downloading]
  );

  const handleReuse = useCallback(() => {
    loadFromTask(task);
    setReused(true);
    if (typeof window !== "undefined") {
      window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" });
    }
    setTimeout(() => setReused(false), 1500);
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

  const effectiveStatus =
    task.status === "succeeded" && expired ? "expired" : task.status;
  const cfg = statusConfig[effectiveStatus] || statusConfig.failed;
  const Icon = cfg.icon;
  const isFinished = task.status === "succeeded" && task.videoUrl && !expired;
  const canDelete = ["succeeded", "failed", "cancelled", "expired"].includes(
    task.status
  );
  const isAlibaba = isAlibabaModel(task.params.modelId);
  const taskApiKey = isAlibaba ? alibabaApiKey : apiKey;
  const canCancel =
    !isAlibaba &&
    !task.demo &&
    Boolean(task.taskId) &&
    (task.status === "pending" || task.status === "queued");
  const isGenerating = ["pending", "queued", "running"].includes(task.status);
  const taskModel = getModelOption(task.params.modelId);
  const canExpandMedia = Boolean(isFinished);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!isGenerating) return;
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [isGenerating]);

  const generationElapsedLabel = getTaskElapsedLabel(task, now);

  const handleFullscreen = useCallback(
    (event: React.MouseEvent<HTMLButtonElement>) => {
      event.stopPropagation();
      const video = mediaRef.current?.querySelector("video");
      const target = video ?? mediaRef.current;
      if (!target) return;

      if (video) {
        video.controls = true;
        const removeControls = () => {
          if (!document.fullscreenElement) {
            if (!expanded) video.controls = false;
            document.removeEventListener("fullscreenchange", removeControls);
          }
        };
        document.addEventListener("fullscreenchange", removeControls);
        const playPromise = video.play();
        if (playPromise && typeof playPromise.catch === "function") {
          playPromise.catch(() => {});
        }
      }

      const requestFullscreen =
        target.requestFullscreen ??
        (
          target as HTMLElement & {
            webkitRequestFullscreen?: () => Promise<void> | void;
          }
        ).webkitRequestFullscreen;
      if (requestFullscreen) {
        void requestFullscreen.call(target);
      } else if (task.videoUrl) {
        window.open(task.videoUrl, "_blank", "noopener,noreferrer");
      }
    },
    [expanded, task.videoUrl]
  );

  const handleDelete = useCallback(async () => {
    setDeleteMenu(null);
    if (!taskApiKey || !task.taskId) {
      removeTask(task.id);
      return;
    }
    setDeleting(true);
    try {
      await deleteTask(taskApiKey, task.taskId, task.params.modelId);
    } catch {
      /* ignore — still remove locally */
    }
    removeTask(task.id);
    setDeleting(false);
  }, [taskApiKey, task.taskId, task.id, task.params.modelId, removeTask]);

  const openDeleteMenu = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      if (!canDelete) return;
      const target = event.target;
      if (
        target instanceof HTMLElement &&
        target.closest("button,a,input,textarea,select,video,[data-no-task-drag]")
      ) {
        return;
      }
      event.preventDefault();
      const rect = event.currentTarget.getBoundingClientRect();
      setDeleteMenu({
        x: clampNumber(event.clientX - rect.left, 12, Math.max(12, rect.width - 132)),
        y: clampNumber(event.clientY - rect.top, 12, Math.max(12, rect.height - 48)),
      });
    },
    [canDelete]
  );

  const handleCancel = useCallback(async () => {
    if (!taskApiKey || !task.taskId) return;
    setDeleting(true);
    try {
      await deleteTask(taskApiKey, task.taskId, task.params.modelId);
      useAppStore.getState().updateTask(task.id, {
        status: "cancelled",
        error: "Task cancelled",
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Cancel request failed";
      useAppStore.getState().updateTask(task.id, { error: message });
    }
    setDeleting(false);
  }, [taskApiKey, task.taskId, task.id, task.params.modelId]);

  const openDetailFromBody = useCallback(
    (event: React.MouseEvent<HTMLElement>) => {
      const target = event.target;
      if (
        target instanceof HTMLElement &&
        target.closest("button,a,input,textarea,select,video,[data-no-task-click]")
      ) {
        return;
      }
      event.stopPropagation();
      if (selectionMode) {
        onToggleSelect?.();
        return;
      }
      if (compact) {
        onOpenDetail();
      } else {
        onToggleExpand?.();
      }
    },
    [compact, onOpenDetail, onToggleExpand, onToggleSelect, selectionMode]
  );

  const openDetailFromMedia = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      const target = event.target;
      if (
        target instanceof HTMLElement &&
        target.closest("button,a,input,textarea,select,[data-no-task-click]")
      ) {
        return;
      }
      event.stopPropagation();
      if (selectionMode) {
        onToggleSelect?.();
        return;
      }
      if (compact) {
        onOpenDetail();
      } else if (!expanded) {
        onToggleExpand?.();
      }
    },
    [
      compact,
      expanded,
      onOpenDetail,
      onToggleExpand,
      onToggleSelect,
      selectionMode,
    ]
  );

  const handleCardSelectClick = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      if (!selectionMode) return;
      const target = event.target;
      if (
        target instanceof HTMLElement &&
        target.closest("button,a,input,textarea,select,video,[data-no-task-click]")
      ) {
        return;
      }
      event.stopPropagation();
      onToggleSelect?.();
    },
    [onToggleSelect, selectionMode]
  );

  return (
    <div
      data-task-card
      data-task-card-id={task.id}
      className={`task-card task-card-status-${effectiveStatus} ${
        isFinished ? "task-card-finished" : ""
      } rounded-2xl border overflow-hidden h-full flex flex-col ${
        expanded ? "task-card-expanded" : ""
      } ${selectionMode ? "task-card-selectable" : ""} ${
        selected ? "task-card-selected" : ""
      }`}
      onContextMenu={openDeleteMenu}
      onClick={handleCardSelectClick}
    >
      {selectionMode && (
        <button
          type="button"
          data-no-task-drag
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => {
            event.stopPropagation();
            onToggleSelect?.();
          }}
          className="task-select-check"
          title="선택"
          aria-label={selected ? "선택 해제" : "선택"}
          aria-pressed={selected}
        >
          {selected && <Check className="h-3.5 w-3.5" />}
        </button>
      )}
      {canExpandMedia && (
        <button
          data-no-task-drag
          onPointerDown={(event) => event.stopPropagation()}
          onClick={handleFullscreen}
          className="task-icon-button task-detail-button task-card-detail-floating"
          title="전체화면 보기"
          aria-label="전체화면 보기"
        >
          <Maximize2 className={compact ? "w-3 h-3" : "w-3.5 h-3.5"} />
        </button>
      )}
      {deleteMenu && canDelete && (
        <div
          className="task-context-menu"
          style={{ left: `${deleteMenu.x}px`, top: `${deleteMenu.y}px` }}
          data-no-task-drag
          onPointerDown={(event) => event.stopPropagation()}
        >
          <button
            type="button"
            onClick={handleDelete}
            disabled={deleting}
            className="task-context-menu-item"
          >
            {deleting ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <XCircle className="h-3.5 w-3.5" />
            )}
            <span>Remove</span>
          </button>
        </div>
      )}
      {isFinished && task.videoUrl ? (
        <div
          ref={mediaRef}
          className="task-card-media bg-black overflow-hidden flex-shrink-0 relative group cursor-pointer"
          data-no-task-drag
          onClick={openDetailFromMedia}
          title={compact ? "상세보기" : expanded ? undefined : "상세보기"}
        >
          <HoverVideo
            src={task.videoUrl}
            compact={compact}
            fill
            controls={expanded && !compact}
            ratio={task.actualRatio || task.params.ratio}
          />
        </div>
      ) : isGenerating ? (
        <div className="task-card-media task-card-media-generating overflow-hidden flex-shrink-0 relative">
          <GenerationState
            compact={compact}
            label={cfg.label}
            neutral={task.status === "pending"}
          />
          {generationElapsedLabel && (
            <div className="task-generation-elapsed" aria-label="생성 경과 시간">
              {generationElapsedLabel}
            </div>
          )}
          {canCancel && (
            <button
              type="button"
              onClick={handleCancel}
              disabled={deleting}
              className="task-generation-cancel-button"
              title="대기 중인 생성 요청 취소"
              aria-label="대기 중인 생성 요청 취소"
            >
              {deleting ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Ban className="h-3 w-3" />
              )}
              <span>생성 취소</span>
            </button>
          )}
        </div>
      ) : (
        <div className="task-card-media task-card-media-status flex flex-col items-center justify-center gap-2 flex-shrink-0">
          <Icon
            className={`${compact ? "w-6 h-6" : "w-7 h-7"} ${cfg.color}`}
          />
          <span
            className={`${compact ? "text-xs" : "text-sm"} font-medium ${
              cfg.color
            }`}
          >
            {cfg.label}
          </span>
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
          {task.status === "failed" && (
            <button
              type="button"
              onClick={handleDelete}
              disabled={deleting}
              className="task-status-delete-button"
              title="실패한 요청 삭제"
              aria-label="실패한 요청 삭제"
            >
              {deleting ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <XCircle className="h-3.5 w-3.5" />
              )}
              <span>삭제</span>
            </button>
          )}
        </div>
      )}

      <div
        className={`${compact ? "px-3 py-2" : "px-4 py-2"} task-card-body flex-none cursor-pointer`}
        data-no-task-drag
        onClick={openDetailFromBody}
        title="상세보기"
      >
        <div className="flex items-start gap-1.5">
          <p
            className={`flex-1 text-gray-600 leading-relaxed whitespace-pre-wrap break-words ${
              compact ? "text-[11px] line-clamp-1" : "text-xs line-clamp-1"
            }`}
          >
            {task.prompt}
          </p>
        </div>

        {!compact && task.references && task.references.length > 0 && (() => {
          const tags = getRefTags(task.references);
          return (
            <div
              className="task-reference-row mt-2 flex items-center gap-1.5 flex-wrap"
              data-no-task-click
            >
              <Paperclip className="w-3 h-3 text-gray-300" />
              {task.references.map((r) => (
                <ReferenceThumb
                  key={r.id}
                  asset={r}
                  tag={tags[r.id]}
                  onOpen={setPreviewAsset}
                />
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
            {!compact && <span>·</span>}
            {!compact && <span>{taskModel.name}</span>}
            {generationElapsedLabel && (
              <>
                <span>·</span>
                <span>생성 {generationElapsedLabel}</span>
              </>
            )}
          </div>

          <div
            className="task-card-actions flex items-center gap-1.5 shrink-0 ml-2"
            data-no-task-click
            onClick={(event) => event.stopPropagation()}
            onPointerDown={(event) => event.stopPropagation()}
          >
            <button
              onClick={(event) => {
                event.stopPropagation();
                if (compact) {
                  onOpenDetail();
                } else {
                  onToggleExpand?.();
                }
              }}
              className="task-icon-button"
              title="상세보기"
              aria-label="상세보기"
            >
              <Search className={compact ? "w-2.5 h-2.5" : "w-3 h-3"} />
            </button>
            <button
              onClick={handleReuse}
              className={`task-icon-button ${
                reused
                  ? "task-icon-button-success"
                  : ""
              }`}
              title="이 작업의 프롬프트·첨부·설정을 다시 불러오기"
              aria-label="Reuse"
            >
              {reused ? (
                <Check className={compact ? "w-2.5 h-2.5" : "w-3 h-3"} />
              ) : (
                <RotateCcw className={compact ? "w-2.5 h-2.5" : "w-3 h-3"} />
              )}
            </button>
            {isFinished && task.lastFrameUrl && (
              <a
                href={task.lastFrameUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="task-icon-button"
                title="Last frame"
                aria-label="Last frame"
              >
                <ImageIcon className={compact ? "w-2.5 h-2.5" : "w-3 h-3"} />
              </a>
            )}
            {isFinished && (
              <button
                onClick={handleDownload}
                disabled={downloading || downloaded}
                className={`task-icon-button ${
                  downloaded ? "task-icon-button-success" : "task-icon-button-primary"
                } disabled:opacity-75`}
                title={
                  downloaded
                    ? "이미 다운로드된 작업입니다"
                    : "비디오 다운로드 (한 번만 fetch, 즉시 메모리 해제)"
                }
                aria-label={downloaded ? "다운로드됨" : "다운로드"}
              >
                {downloading ? (
                  <Loader2
                    className={`${compact ? "w-2.5 h-2.5" : "w-3 h-3"} animate-spin`}
                  />
                ) : downloaded ? (
                  <Check className={compact ? "w-2.5 h-2.5" : "w-3 h-3"} />
                ) : (
                  <Download className={compact ? "w-2.5 h-2.5" : "w-3 h-3"} />
                )}
              </button>
            )}
          </div>
        </div>
      </div>
      {expanded && !compact && (
        <InlineTaskDetails task={task} />
      )}
      {previewAsset && (
        <AttachmentPreviewOverlay
          asset={previewAsset}
          tag={task.references ? getRefTags(task.references)[previewAsset.id] : undefined}
          onClose={() => setPreviewAsset(null)}
        />
      )}
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
    <div
      className="view-toggle inline-flex items-center rounded-lg p-0.5"
      data-tour="view-toggle"
    >
      <button
        onClick={() => onChange("free")}
        title="Free board"
        className={`p-1.5 rounded-md transition-colors ${
          mode === "free"
            ? "view-toggle-selected text-gray-700"
            : "text-gray-400 hover:text-gray-500"
        }`}
      >
        <LayoutList className="w-4 h-4" />
      </button>
      <button
        onClick={() => onChange("grid")}
        title="Grid mode"
        className={`p-1.5 rounded-md transition-colors ${
          mode === "grid"
            ? "view-toggle-selected text-gray-700"
            : "text-gray-400 hover:text-gray-500"
        }`}
      >
        <LayoutGrid className="w-4 h-4" />
      </button>
    </div>
  );
}

export default function VideoResult() {
  const { tasks, clearTasks, removeTask } = useAppStore();
  const [viewMode, setViewMode] = useState<ViewMode>("free");
  const [detailTaskId, setDetailTaskId] = useState<string | null>(null);
  const [taskActionsOpen, setTaskActionsOpen] = useState(false);
  const [deleteAllConfirm, setDeleteAllConfirm] = useState(false);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedTaskIds, setSelectedTaskIds] = useState<Set<string>>(
    () => new Set()
  );
  const [expandedTaskId, setExpandedTaskId] = useState<string | null>(null);

  const detailTask =
    detailTaskId !== null
      ? tasks.find((t) => t.id === detailTaskId) ?? null
      : null;

  useEffect(() => {
    setSelectedTaskIds((current) => {
      if (current.size === 0) return current;
      const liveIds = new Set(tasks.map((task) => task.id));
      let changed = false;
      const next = new Set<string>();
      current.forEach((id) => {
        if (liveIds.has(id)) {
          next.add(id);
        } else {
          changed = true;
        }
      });
      return changed ? next : current;
    });
  }, [tasks]);

  useEffect(() => {
    if (tasks.length > 0) return;
    setTaskActionsOpen(false);
    setDeleteAllConfirm(false);
    setSelectionMode(false);
    setSelectedTaskIds(new Set());
  }, [tasks.length]);

  useEffect(() => {
    if (!expandedTaskId || viewMode !== "free") return;
    const closeOnOutsidePointer = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (
        target.closest("[data-task-card]") ||
        target.closest(".attachment-preview-overlay")
      ) {
        return;
      }
      setExpandedTaskId(null);
    };
    window.addEventListener("pointerdown", closeOnOutsidePointer, true);
    return () => {
      window.removeEventListener("pointerdown", closeOnOutsidePointer, true);
    };
  }, [expandedTaskId, viewMode]);

  const closeTaskActions = useCallback(() => {
    setTaskActionsOpen(false);
    setDeleteAllConfirm(false);
    setSelectionMode(false);
    setSelectedTaskIds(new Set());
  }, []);

  const toggleTaskSelection = useCallback((id: string) => {
    setDeleteAllConfirm(false);
    setSelectedTaskIds((current) => {
      const next = new Set(current);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const handleSelectionDelete = useCallback(() => {
    setDeleteAllConfirm(false);
    if (!selectionMode) {
      setSelectionMode(true);
      setSelectedTaskIds(new Set());
      return;
    }

    if (selectedTaskIds.size === 0) return;
    selectedTaskIds.forEach((id) => removeTask(id));
    setSelectionMode(false);
    setSelectedTaskIds(new Set());
    setTaskActionsOpen(false);
  }, [removeTask, selectedTaskIds, selectionMode]);

  const handleDeleteAll = useCallback(() => {
    if (!deleteAllConfirm) {
      setSelectionMode(false);
      setSelectedTaskIds(new Set());
      setDeleteAllConfirm(true);
      return;
    }

    clearTasks();
    setTaskActionsOpen(false);
    setDeleteAllConfirm(false);
    setSelectionMode(false);
    setSelectedTaskIds(new Set());
  }, [clearTasks, deleteAllConfirm]);

  return (
    <div>
      <div className="results-toolbar flex items-center gap-2">
        <div
          className={`task-action-split view-toggle inline-flex h-8 items-center rounded-lg p-0.5 ${
            taskActionsOpen ? "task-action-split-open" : ""
          }`}
        >
          {taskActionsOpen ? (
            <>
              <button
                type="button"
                onClick={closeTaskActions}
                className="task-action-split-button"
                title="작업 관리 접기"
                aria-label="작업 관리 접기"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <span className="task-action-split-divider" aria-hidden />
              <button
                type="button"
                onClick={handleSelectionDelete}
                disabled={selectionMode && selectedTaskIds.size === 0}
                className={`task-action-split-text-button ${
                  selectionMode ? "task-action-split-selected" : ""
                }`}
                title={
                  selectionMode
                    ? selectedTaskIds.size > 0
                      ? `${selectedTaskIds.size}개 선택 삭제`
                      : "삭제할 작업을 선택하세요"
                    : "선택삭제"
                }
                aria-label="선택삭제"
              >
                {selectionMode && selectedTaskIds.size > 0
                  ? `선택삭제 ${selectedTaskIds.size}`
                  : "선택삭제"}
              </button>
              <span className="task-action-split-divider" aria-hidden />
              <button
                type="button"
                onClick={handleDeleteAll}
                className={`task-action-split-text-button task-action-split-danger ${
                  deleteAllConfirm ? "task-action-split-confirm" : ""
                }`}
                title="기록 전체 삭제"
                aria-label="기록 전체 삭제"
              >
                {deleteAllConfirm ? "확인" : "전체삭제"}
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => {
                setTaskActionsOpen(true);
                setDeleteAllConfirm(false);
              }}
              className="task-action-split-button"
              title="작업 관리"
              aria-label="작업 관리 열기"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        <ViewToggle mode={viewMode} onChange={setViewMode} />
      </div>
      <div className="results-task-count glass-chip">
        {tasks.length} tasks
      </div>

      {tasks.length === 0 ? (
        <div className="flex min-h-[38vh] items-center justify-center">
          <div className="glass-panel motion-rise rounded-2xl px-8 py-7 text-center subtle-glow">
            <div className="glass-chip w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-3">
              <RefreshCw className="w-5 h-5 text-gray-300" />
            </div>
            <p className="text-sm text-gray-400 mb-1">No generations yet</p>
            <p className="text-xs text-gray-300">
              프롬프트를 입력하고 Generate를 클릭하세요
            </p>
          </div>
        </div>
      ) : viewMode === "free" ? (
        <div
          className="task-list-board free-board relative mx-auto flex w-full max-w-5xl flex-col gap-8"
        >
          {tasks.map((task) => (
            <TaskCard
              key={task.id}
              task={task}
              expanded={expandedTaskId === task.id}
              onToggleExpand={() =>
                setExpandedTaskId((current) =>
                  current === task.id ? null : task.id
                )
              }
              selectionMode={selectionMode}
              selected={selectedTaskIds.has(task.id)}
              onToggleSelect={() => toggleTaskSelection(task.id)}
              onOpenDetail={() =>
                setExpandedTaskId((current) =>
                  current === task.id ? null : task.id
                )
              }
            />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-5">
          {tasks.map((task) => (
            <TaskCard
              key={task.id}
              task={task}
              compact
              expanded={false}
              onToggleExpand={() =>
                setExpandedTaskId((current) =>
                  current === task.id ? null : task.id
                )
              }
              selectionMode={selectionMode}
              selected={selectedTaskIds.has(task.id)}
              onToggleSelect={() => toggleTaskSelection(task.id)}
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
