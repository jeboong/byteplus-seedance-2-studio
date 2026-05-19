"use client";

import {
  useState,
  useCallback,
  useRef,
  useEffect,
  useMemo,
  type CSSProperties,
} from "react";
import {
  Play,
  Image as ImageIcon,
  Film,
  Link2,
  Music,
  Plus,
  Settings2,
  X,
  Volume2,
  VolumeX,
} from "lucide-react";
import { useAppStore, hydrateTasks } from "@/lib/store";
import {
  createGenerationTask,
  getTaskStatus,
  reportUsageOnce,
} from "@/lib/api";
import {
  GENERATION_CONFIRM_CHANGE_EVENT,
  GENERATION_CONFIRM_COUNTDOWN_SECONDS,
  isGenerationConfirmEnabled,
  setGenerationConfirmEnabled,
} from "@/lib/generationConfirm";
import {
  ASPECT_RATIOS,
  RATIO_ICONS,
  estimateCost,
  estimateTokens,
  formatKrw,
  getGenerationReferences,
  getModelOption,
  isAlibabaModel,
  minDurationForModel,
  supportsAspectRatio,
  supportsSmartDuration,
  type AspectRatio,
  type ModelParams as ModelParamsType,
  type Resolution,
} from "@/lib/types";
import { useFileUpload } from "@/lib/useFileUpload";
import { PromptInsertProvider } from "@/lib/usePromptInsert";
import { getRefTags } from "@/lib/refTags";
import Header from "./Header";
import ModelParams from "./ModelParams";
import PromptEditor, { type PromptEditorHandle } from "./PromptEditor";
import VideoResult from "./VideoResult";
import InteractiveTutorial from "./InteractiveTutorial";

function serverTimestampMs(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value)
    ? value * 1000
    : undefined;
}

function readTaskResponseMeta(result: Record<string, unknown>) {
  const error = result.error;
  const errorRecord =
    error && typeof error === "object" ? (error as Record<string, unknown>) : null;

  return {
    sourceModel: typeof result.model === "string" ? result.model : undefined,
    createdAt: serverTimestampMs(result.created_at),
    updatedAt: serverTimestampMs(result.updated_at),
    actualDuration:
      typeof result.duration === "number" ? result.duration : undefined,
    actualFrames: typeof result.frames === "number" ? result.frames : undefined,
    framesPerSecond:
      typeof result.framespersecond === "number"
        ? result.framespersecond
        : undefined,
    generatedAudio:
      typeof result.generate_audio === "boolean"
        ? result.generate_audio
        : undefined,
    actualRatio: typeof result.ratio === "string" ? result.ratio : undefined,
    actualResolution:
      typeof result.resolution === "string" ? result.resolution : undefined,
    safetyIdentifier:
      typeof result.safety_identifier === "string"
        ? result.safety_identifier
        : undefined,
    draft: typeof result.draft === "boolean" ? result.draft : undefined,
    draftTaskId:
      typeof result.draft_task_id === "string"
        ? result.draft_task_id
        : undefined,
    serviceTier:
      typeof result.service_tier === "string" ? result.service_tier : undefined,
    executionExpiresAfter:
      typeof result.execution_expires_after === "number"
        ? result.execution_expires_after
        : undefined,
    errorCode:
      typeof errorRecord?.code === "string" ? errorRecord.code : undefined,
  };
}

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

function detectExternalReference(
  value: string
): { type: "image" | "video" | "audio"; role: string } {
  if (/\.(mp4|mov|webm)(\?|#|$)/i.test(value) || value.includes("video")) {
    return { type: "video", role: "reference_video" };
  }
  if (/\.(mp3|wav|ogg|m4a)(\?|#|$)/i.test(value) || value.includes("audio")) {
    return { type: "audio", role: "reference_audio" };
  }
  return { type: "image", role: "reference_image" };
}

type FrameRole = "first_frame" | "last_frame";

const FRAME_SLOT_META: Record<FrameRole, { label: string; shortLabel: string }> = {
  first_frame: { label: "START", shortLabel: "Start" },
  last_frame: { label: "END", shortLabel: "End" },
};

const MAGNET_GRID = 64;
const COMPOSER_INTERACTIVE_SELECTOR =
  'button, input, textarea, select, a, [role="button"], [data-no-composer-drag]';
const BYTEPLUS_MODE_CYCLE: ModelParamsType["mode"][] = [
  "text",
  "reference",
  "first_last_frame",
];
type QuickPanel = "ratio" | "resolution" | "duration";
type QuickPanelPlacement = { left: number; width: number };

const QUICK_PANEL_MAX_WIDTH = 384;
const QUICK_PANEL_EDGE_GUTTER = 8;
const RESOLUTION_OPTIONS = ["480p", "720p", "1080p"] as const;

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

function snapNumber(value: number, step = MAGNET_GRID): number {
  return Math.round(value / step) * step;
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function clipboardFilesFromData(data: DataTransfer | null): File[] {
  if (!data) return [];
  const files = Array.from(data.files ?? []);
  if (files.length > 0) return files;

  const result: File[] = [];
  for (const item of Array.from(data.items ?? [])) {
    if (item.kind !== "file") continue;
    if (!item.type.startsWith("image/")) continue;
    const file = item.getAsFile();
    if (!file) continue;
    result.push(
      file.name
        ? file
        : new File([file], `clipboard-image-${Date.now()}.png`, {
            type: file.type || item.type || "image/png",
          })
    );
  }
  return result;
}

const DEMO_PENDING_MS = 3000;
const DEMO_GENERATING_MS = 10000;

export default function GenerateView() {
  const {
    apiKey,
    alibabaApiKey,
    demoMode,
    prompt,
    setPrompt,
    references,
    params,
    setParams,
    addReference,
    removeReference,
    reorderReference,
    addTask,
    updateTask,
    clearDemoTasks,
  } = useAppStore();
  const [error, setError] = useState("");
  const [paramsOpen, setParamsOpen] = useState(false);
  const [activeQuickPanel, setActiveQuickPanel] = useState<QuickPanel | null>(
    null
  );
  const [quickPanelPlacement, setQuickPanelPlacement] =
    useState<QuickPanelPlacement | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmCountdown, setConfirmCountdown] = useState(
    GENERATION_CONFIRM_COUNTDOWN_SECONDS
  );
  const [skipGenerationConfirm, setSkipGenerationConfirm] = useState(false);
  const [skipConfirmChecked, setSkipConfirmChecked] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const [isReferenceSlotOver, setIsReferenceSlotOver] = useState(false);
  const [promptExpanded, setPromptExpanded] = useState(false);
  const [composerOffset, setComposerOffset] = useState({ x: 0, y: 0 });
  const [composerSize, setComposerSize] = useState<{
    width?: number;
    promptHeight?: number;
  }>({});
  const [draggedFrameRole, setDraggedFrameRole] = useState<FrameRole | null>(
    null
  );
  const [dragOverFrameRole, setDragOverFrameRole] = useState<FrameRole | null>(
    null
  );
  const [draggedReferenceId, setDraggedReferenceId] = useState<string | null>(
    null
  );
  const [dragOverReferenceId, setDragOverReferenceId] = useState<string | null>(
    null
  );
  const [isAttachmentPasteArmed, setIsAttachmentPasteArmed] = useState(false);
  const [isComposerDragging, setIsComposerDragging] = useState(false);
  const [isComposerResizing, setIsComposerResizing] = useState(false);
  const [isComposerSnapping, setIsComposerSnapping] = useState(false);
  const pollingRef = useRef<Record<string, NodeJS.Timeout>>({});
  const promptEditorRef = useRef<PromptEditorHandle>(null);
  const mainRef = useRef<HTMLDivElement>(null);
  const resultsScrollRef = useRef<HTMLDivElement>(null);
  const composerRef = useRef<HTMLDivElement>(null);
  const paramsPopoverRef = useRef<HTMLDivElement>(null);
  const settingsButtonRef = useRef<HTMLButtonElement>(null);
  const quickPanelAnchorRef = useRef<HTMLButtonElement | null>(null);
  const quickPanelCloseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null
  );
  const firstFrameInputRef = useRef<HTMLInputElement>(null);
  const lastFrameInputRef = useRef<HTMLInputElement>(null);
  const referenceFileInputRef = useRef<HTMLInputElement>(null);
  const composerDragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    startOffset: { x: number; y: number };
    active: boolean;
  } | null>(null);
  const composerResizeRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    startWidth: number;
    startPromptHeight: number;
    startOffset: { x: number; y: number };
    lastSize: { width: number; promptHeight: number };
  } | null>(null);
  const framePointerDragRef = useRef<{
    pointerId: number;
    role: FrameRole;
    startX: number;
    startY: number;
    active: boolean;
  } | null>(null);
  const suppressFrameClickRef = useRef(false);
  const suppressComposerClickRef = useRef(false);
  const confirmExecutingRef = useRef(false);
  const skipConfirmCheckedRef = useRef(false);
  const dragCounter = useRef(0);
  const [externalReferenceOpen, setExternalReferenceOpen] = useState(false);
  const [externalReferenceValue, setExternalReferenceValue] = useState("");
  const [externalReferenceError, setExternalReferenceError] = useState("");
  const [tutorialOpen, setTutorialOpen] = useState(false);

  const isExpanded = promptExpanded || isDragOver;

  useEffect(() => {
    if (typeof window === "undefined") return;
    const syncGenerationConfirm = () => {
      setSkipGenerationConfirm(!isGenerationConfirmEnabled());
    };
    syncGenerationConfirm();
    window.addEventListener(
      GENERATION_CONFIRM_CHANGE_EVENT,
      syncGenerationConfirm
    );
    window.addEventListener("storage", syncGenerationConfirm);
    return () => {
      window.removeEventListener(
        GENERATION_CONFIRM_CHANGE_EVENT,
        syncGenerationConfirm
      );
      window.removeEventListener("storage", syncGenerationConfirm);
    };
  }, []);

  useEffect(() => {
    if (window.innerWidth < 900) {
      setParamsOpen(false);
    }
  }, []);

  useEffect(() => {
    const startTutorial = () => {
      setPromptExpanded(true);
      setParamsOpen(false);
      setActiveQuickPanel(null);
      setExternalReferenceOpen(false);
      window.setTimeout(() => setTutorialOpen(true), 320);
    };
    window.addEventListener("sd2:start-tutorial", startTutorial);
    return () => window.removeEventListener("sd2:start-tutorial", startTutorial);
  }, []);

  useEffect(() => {
    if (!paramsOpen && !activeQuickPanel) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setParamsOpen(false);
      setActiveQuickPanel(null);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [activeQuickPanel, paramsOpen]);

  useEffect(() => {
    return () => {
      if (quickPanelCloseTimerRef.current) {
        clearTimeout(quickPanelCloseTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!paramsOpen) return;
    const handleParamsPointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (
        target instanceof Element &&
        target.closest("[data-tutorial-overlay]")
      ) {
        return;
      }
      if (
        paramsPopoverRef.current?.contains(target) ||
        settingsButtonRef.current?.contains(target)
      ) {
        return;
      }
      setParamsOpen(false);
    };
    document.addEventListener("pointerdown", handleParamsPointerDown, true);
    return () => {
      document.removeEventListener(
        "pointerdown",
        handleParamsPointerDown,
        true
      );
    };
  }, [paramsOpen]);

  useEffect(() => {
    if (!confirmOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setConfirmOpen(false);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [confirmOpen]);

  const { upload: uploadFiles, error: dropError, clearError: clearDropError } =
    useFileUpload();

  const uploadComposerFiles = useCallback(
    (files: FileList | File[] | File) => {
      if (!isAlibabaModel(useAppStore.getState().params.modelId)) {
        const currentMode = useAppStore.getState().params.mode;
        if (currentMode === "text") {
          useAppStore.getState().setParams({ mode: "reference" });
        }
      }
      setPromptExpanded(true);
      void uploadFiles(files);
    },
    [uploadFiles]
  );

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
        uploadComposerFiles(files);
      }
    },
    [uploadComposerFiles]
  );

  const handleReferenceSlotDrop = useCallback(
    (event: React.DragEvent<HTMLButtonElement>) => {
      event.preventDefault();
      setIsReferenceSlotOver(false);

      const files = event.dataTransfer.files;
      if (files?.length) {
        uploadComposerFiles(files);
      }
    },
    [uploadComposerFiles]
  );

  const handleReferenceFileChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const files = event.target.files;
      if (files?.length) {
        uploadComposerFiles(files);
        setExternalReferenceOpen(false);
      }
      event.target.value = "";
    },
    [uploadComposerFiles]
  );

  const handleReferenceDragStart = useCallback(
    (id: string, event: React.DragEvent<HTMLDivElement>) => {
      setDraggedReferenceId(id);
      setDragOverReferenceId(null);
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("application/x-reference-id", id);
      event.dataTransfer.setData("text/plain", id);
    },
    []
  );

  const handleReferenceDragEnter = useCallback(
    (id: string, event: React.DragEvent<HTMLDivElement>) => {
      if (!draggedReferenceId || draggedReferenceId === id) return;
      event.preventDefault();
      setDragOverReferenceId(id);
    },
    [draggedReferenceId]
  );

  const handleReferenceAssetDrop = useCallback(
    (targetId: string, event: React.DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      const files = event.dataTransfer.files;
      if (files?.length) {
        uploadComposerFiles(files);
      } else {
        const sourceId =
          event.dataTransfer.getData("application/x-reference-id") ||
          draggedReferenceId;
        if (sourceId && sourceId !== targetId) {
          reorderReference(sourceId, targetId);
        }
      }
      setDraggedReferenceId(null);
      setDragOverReferenceId(null);
    },
    [draggedReferenceId, reorderReference, uploadComposerFiles]
  );

  const clearReferenceDrag = useCallback(() => {
    setDraggedReferenceId(null);
    setDragOverReferenceId(null);
  }, []);

  const handlePaste = useCallback(
    (e: React.ClipboardEvent) => {
      const files = clipboardFilesFromData(e.clipboardData);
      if (files.length > 0) {
        e.preventDefault();
        e.stopPropagation();
        uploadComposerFiles(files);
      }
    },
    [uploadComposerFiles]
  );

  useEffect(() => {
    const handleWindowPaste = (event: ClipboardEvent) => {
      if (!isAttachmentPasteArmed) return;
      const active = document.activeElement;
      if (
        active instanceof HTMLElement &&
        active.closest("[data-prompt-editor-region]")
      ) {
        return;
      }
      const files = clipboardFilesFromData(event.clipboardData);
      if (files.length === 0) return;
      event.preventDefault();
      event.stopPropagation();
      uploadComposerFiles(files);
    };

    window.addEventListener("paste", handleWindowPaste, true);
    return () => {
      window.removeEventListener("paste", handleWindowPaste, true);
    };
  }, [isAttachmentPasteArmed, uploadComposerFiles]);

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

      left = snapNumber(left);
      top = snapNumber(top);

      return clampComposerOffset({
        x: left - baseLeft,
        y: top - baseTop,
      });
    },
    [clampComposerOffset]
  );

  const clampComposerSize = useCallback(
    (size: { width: number; promptHeight: number }) => {
      const host = mainRef.current;
      const hostWidth = host?.clientWidth ?? 960;
      const hostHeight = host?.clientHeight ?? 720;
      const availableWidth = Math.max(280, hostWidth - 48);
      const minWidth = Math.min(360, availableWidth);
      const maxWidth = Math.min(960, availableWidth);
      const maxPromptHeight = Math.max(96, Math.min(420, hostHeight - 260));

      return {
        width: Math.min(maxWidth, Math.max(minWidth, size.width)),
        promptHeight: Math.min(
          maxPromptHeight,
          Math.max(56, size.promptHeight)
        ),
      };
    },
    []
  );

  const handleComposerPointerDown = useCallback(
    (e: React.PointerEvent<HTMLElement>) => {
      if (e.button !== 0) return;
      e.preventDefault();
      e.currentTarget.setPointerCapture(e.pointerId);
      composerDragRef.current = {
        pointerId: e.pointerId,
        startX: e.clientX,
        startY: e.clientY,
        startOffset: composerOffset,
        active: false,
      };
      setIsComposerDragging(true);
      setIsComposerSnapping(false);
    },
    [composerOffset]
  );

  const handleComposerPointerMove = useCallback(
    (e: React.PointerEvent<HTMLElement>) => {
      const drag = composerDragRef.current;
      if (!drag || drag.pointerId !== e.pointerId) return;
      const distance = Math.hypot(e.clientX - drag.startX, e.clientY - drag.startY);
      if (distance > 4) {
        drag.active = true;
      }
      const next = clampComposerOffset({
        x: drag.startOffset.x + e.clientX - drag.startX,
        y: drag.startOffset.y + e.clientY - drag.startY,
      });
      setComposerOffset(next);
    },
    [clampComposerOffset]
  );

  const finishComposerDrag = useCallback(
    (e?: React.PointerEvent<HTMLElement>) => {
      const drag = composerDragRef.current;
      if (!drag) return;
      const distance = e
        ? Math.hypot(e.clientX - drag.startX, e.clientY - drag.startY)
        : 0;
      const didMove = drag.active || distance > 4;
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
      if (didMove) {
        suppressComposerClickRef.current = true;
        window.setTimeout(() => {
          suppressComposerClickRef.current = false;
        }, 120);
      }
    },
    [clampComposerOffset, composerOffset, snapComposerOffset]
  );

  const handleComposerSurfacePointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (e.button !== 0 || isComposerResizing) return;
      const target = e.target;
      if (!(target instanceof HTMLElement)) return;
      if (target.closest(COMPOSER_INTERACTIVE_SELECTOR)) {
        return;
      }
      handleComposerPointerDown(e);
    },
    [handleComposerPointerDown, isComposerResizing]
  );

  const handleComposerClick = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      if (suppressComposerClickRef.current) {
        suppressComposerClickRef.current = false;
        event.preventDefault();
        return;
      }
      const target = event.target;
      if (
        target instanceof HTMLElement &&
        target.closest(COMPOSER_INTERACTIVE_SELECTOR)
      ) {
        return;
      }
      setPromptExpanded(true);
    },
    []
  );

  const handleComposerResizePointerDown = useCallback(
    (e: React.PointerEvent<HTMLButtonElement>) => {
      if (e.button !== 0) return;
      const card = composerRef.current;
      if (!card) return;
      e.preventDefault();
      e.stopPropagation();
      e.currentTarget.setPointerCapture(e.pointerId);

      const textarea = card.querySelector<HTMLTextAreaElement>(
        ".prompt-editor-textarea"
      );
      const rect = card.getBoundingClientRect();
      composerResizeRef.current = {
        pointerId: e.pointerId,
        startX: e.clientX,
        startY: e.clientY,
        startWidth: composerSize.width ?? rect.width,
        startPromptHeight:
          composerSize.promptHeight ?? textarea?.offsetHeight ?? 156,
        startOffset: composerOffset,
        lastSize: {
          width: composerSize.width ?? rect.width,
          promptHeight:
            composerSize.promptHeight ?? textarea?.offsetHeight ?? 156,
        },
      };
      setPromptExpanded(true);
      setIsComposerDragging(false);
      setIsComposerResizing(true);
      setIsComposerSnapping(false);
    },
    [composerOffset, composerSize.promptHeight, composerSize.width]
  );

  const handleComposerResizePointerMove = useCallback(
    (e: React.PointerEvent<HTMLButtonElement>) => {
      const resize = composerResizeRef.current;
      if (!resize || resize.pointerId !== e.pointerId) return;
      const nextSize = clampComposerSize({
        width: resize.startWidth - (e.clientX - resize.startX) * 2,
        promptHeight:
          resize.startPromptHeight + (e.clientY - resize.startY) * 2,
      });
      resize.lastSize = nextSize;
      setComposerSize(nextSize);
      setComposerOffset(
        clampComposerOffset({
          x: resize.startOffset.x,
          y:
            resize.startOffset.y +
            (nextSize.promptHeight - resize.startPromptHeight) / 2,
        })
      );
    },
    [clampComposerOffset, clampComposerSize]
  );

  const finishComposerResize = useCallback(
    (e?: React.PointerEvent<HTMLButtonElement>) => {
      const resize = composerResizeRef.current;
      if (!resize) return;
      if (e) {
        try {
          e.currentTarget.releasePointerCapture(e.pointerId);
        } catch {
          /* pointer capture may already be gone */
        }
      }
      const snappedSize = clampComposerSize({
        width: snapNumber(resize.lastSize.width),
        promptHeight: snapNumber(resize.lastSize.promptHeight),
      });
      composerResizeRef.current = null;
      setIsComposerResizing(false);
      setComposerSize(snappedSize);
      requestAnimationFrame(() => {
        setComposerOffset(
          clampComposerOffset({
            x: resize.startOffset.x,
            y:
              resize.startOffset.y +
              (snappedSize.promptHeight - resize.startPromptHeight) / 2,
          })
        );
      });
    },
    [clampComposerOffset, clampComposerSize]
  );

  const handleFrameUpload = useCallback(
    async (file: File, role: FrameRole) => {
      const existing = useAppStore
        .getState()
        .references.find((ref) => ref.role === role);
      if (existing) removeReference(existing.id);

      const url = await fileToDataUrl(file);
      addReference({
        id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        type: "image",
        url,
        name: file.name,
        role,
        preview: url,
      });
      setPromptExpanded(true);
    },
    [addReference, removeReference]
  );

  const openFramePicker = useCallback((role: FrameRole) => {
    if (role === "first_frame") {
      firstFrameInputRef.current?.click();
    } else {
      lastFrameInputRef.current?.click();
    }
  }, []);

  const removeFrame = useCallback(
    (role: FrameRole) => {
      const existing = references.find((ref) => ref.role === role);
      if (existing) removeReference(existing.id);
    },
    [references, removeReference]
  );

  const moveFrameContent = useCallback(
    (sourceRole: FrameRole, targetRole: FrameRole) => {
      if (sourceRole === targetRole) return;
      useAppStore.setState((state) => {
        const source = state.references.find((ref) => ref.role === sourceRole);
        if (!source) return {};

        const target = state.references.find((ref) => ref.role === targetRole);
        return {
          references: state.references.map((ref) => {
            if (ref.id === source.id) return { ...ref, role: targetRole };
            if (target && ref.id === target.id) {
              return { ...ref, role: sourceRole };
            }
            return ref;
          }),
        };
      });
      setPromptExpanded(true);
    },
    []
  );

  const handleFrameSlotDrop = useCallback(
    (targetRole: FrameRole, event: React.DragEvent<HTMLDivElement>) => {
      event.preventDefault();

      const file = event.dataTransfer.files?.[0];
      if (file) {
        void handleFrameUpload(file, targetRole);
      } else {
        const sourceRole = event.dataTransfer.getData(
          "application/x-frame-role"
        ) as FrameRole;
        if (sourceRole === "first_frame" || sourceRole === "last_frame") {
          moveFrameContent(sourceRole, targetRole);
        }
      }

      setDraggedFrameRole(null);
      setDragOverFrameRole(null);
    },
    [handleFrameUpload, moveFrameContent]
  );

  const handleFramePointerDown = useCallback(
    (role: FrameRole, event: React.PointerEvent<HTMLDivElement>) => {
      if (event.button !== 0) return;
      const target = event.target;
      if (target instanceof HTMLElement && target.closest("button")) return;
      const hasFrame = useAppStore
        .getState()
        .references.some((ref) => ref.role === role);
      if (!hasFrame) return;

      framePointerDragRef.current = {
        pointerId: event.pointerId,
        role,
        startX: event.clientX,
        startY: event.clientY,
        active: false,
      };
      suppressFrameClickRef.current = false;
      event.currentTarget.setPointerCapture(event.pointerId);
    },
    []
  );

  const handleFramePointerMove = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      const drag = framePointerDragRef.current;
      if (!drag || drag.pointerId !== event.pointerId) return;

      const distance = Math.hypot(
        event.clientX - drag.startX,
        event.clientY - drag.startY
      );
      if (distance > 8) {
        drag.active = true;
        suppressFrameClickRef.current = true;
        setDraggedFrameRole(drag.role);
      }

      if (!drag.active) return;

      const target = document
        .elementFromPoint(event.clientX, event.clientY)
        ?.closest<HTMLElement>("[data-frame-role]");
      const role = target?.dataset.frameRole;
      setDragOverFrameRole(
        role === "first_frame" || role === "last_frame" ? role : null
      );
    },
    []
  );

  const finishFramePointerDrag = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      const drag = framePointerDragRef.current;
      if (!drag || drag.pointerId !== event.pointerId) return;

      const target = document
        .elementFromPoint(event.clientX, event.clientY)
        ?.closest<HTMLElement>("[data-frame-role]");
      const role = target?.dataset.frameRole;
      if (
        drag.active &&
        (role === "first_frame" || role === "last_frame")
      ) {
        moveFrameContent(drag.role, role);
      }

      try {
        event.currentTarget.releasePointerCapture(event.pointerId);
      } catch {
        /* pointer capture may already be gone */
      }
      framePointerDragRef.current = null;
      setDraggedFrameRole(null);
      setDragOverFrameRole(null);
      window.setTimeout(() => {
        suppressFrameClickRef.current = false;
      }, 0);
    },
    [moveFrameContent]
  );

  useEffect(() => {
    const handleResize = () => {
      setComposerOffset((offset) => clampComposerOffset(offset));
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [clampComposerOffset]);

  useEffect(() => {
    const resetLayout = () => {
      setComposerOffset({ x: 0, y: 0 });
      setComposerSize({});
      setPromptExpanded(false);
      setExternalReferenceOpen(false);
      setParamsOpen(false);
      setActiveQuickPanel(null);
      setIsComposerDragging(false);
      setIsComposerResizing(false);
      setIsComposerSnapping(true);
      window.setTimeout(() => setIsComposerSnapping(false), 420);
    };
    window.addEventListener("sd2:reset-layout", resetLayout);
    return () => window.removeEventListener("sd2:reset-layout", resetLayout);
  }, []);

  useEffect(() => {
    if (!promptExpanded && !externalReferenceOpen && !paramsOpen && !activeQuickPanel) {
      return;
    }
    const handleOutsidePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (
        target instanceof Element &&
        target.closest("[data-mention-popover], [data-tutorial-overlay]")
      ) {
        return;
      }
      if (
        target instanceof Node &&
        composerRef.current?.contains(target)
      ) {
        return;
      }
      setPromptExpanded(false);
      setExternalReferenceOpen(false);
      setParamsOpen(false);
      setActiveQuickPanel(null);
    };
    document.addEventListener("pointerdown", handleOutsidePointerDown, true);
    return () => {
      document.removeEventListener("pointerdown", handleOutsidePointerDown, true);
    };
  }, [activeQuickPanel, externalReferenceOpen, paramsOpen, promptExpanded]);

  useEffect(() => {
    if (!isExpanded) setActiveQuickPanel(null);
  }, [isExpanded]);

  useEffect(() => {
    if (!isExpanded) return;
    const raf = requestAnimationFrame(() => {
      const card = composerRef.current;
      const textarea = card?.querySelector<HTMLTextAreaElement>(
        ".prompt-editor-textarea"
      );
      if (!card || !textarea) return;

      const currentHeight = composerSize.promptHeight ?? textarea.offsetHeight;
      const desiredHeight = Math.ceil(textarea.scrollHeight + 8);
      if (desiredHeight <= currentHeight + 12) return;

      const rect = card.getBoundingClientRect();
      const next = clampComposerSize({
        width: composerSize.width ?? rect.width,
        promptHeight: desiredHeight,
      });
      setComposerSize((size) => ({
        ...size,
        promptHeight: next.promptHeight,
      }));
    });
    return () => cancelAnimationFrame(raf);
  }, [
    clampComposerSize,
    composerSize.promptHeight,
    composerSize.width,
    isExpanded,
    prompt,
  ]);

  const currentModel = getModelOption(params.modelId);
  const isAlibaba = isAlibabaModel(params.modelId);
  const activeApiKey = isAlibaba ? alibabaApiKey : apiKey;
  const visibleRatios = useMemo(
    () =>
      ASPECT_RATIOS.filter((ratio) =>
        supportsAspectRatio(params.modelId, ratio.value)
      ),
    [params.modelId]
  );
  const selectedRatio =
    visibleRatios.find((ratio) => ratio.value === params.ratio) ??
    visibleRatios[0];
  const availableResolutions = useMemo(
    () =>
      RESOLUTION_OPTIONS.filter((resolution) => {
        if (resolution === "1080p" && currentModel.supports1080p === false) {
          return false;
        }
        if (resolution === "480p" && currentModel.supports480p === false) {
          return false;
        }
        return true;
      }),
    [currentModel.supports1080p, currentModel.supports480p]
  );
  const canAdjustRatio = currentModel.happyHorseMode !== "i2v";
  const activeReferences = useMemo(
    () => getGenerationReferences(params, references),
    [params, references]
  );
  const referenceTags = useMemo(
    () => getRefTags(activeReferences),
    [activeReferences]
  );
  const hasVideoRef = activeReferences.some((r) => r.type === "video");
  const cost = estimateCost(params, hasVideoRef);
  const imageRefs = activeReferences.filter((r) => r.type === "image");
  const unsupportedHappyHorseRefs = isAlibaba
    ? references.filter(
        (r) =>
          r.type !== "image" ||
          r.uploading ||
          !isHappyHorseMediaUrl(r.url)
      )
    : [];
  const happyHorseMode = currentModel.happyHorseMode;
  const uploadPending = activeReferences.some((r) => r.uploading);
  const isFirstLastMode = params.mode === "first_last_frame";
  const isReferenceMode = params.mode === "reference";
  const showReferenceSlot =
    isReferenceMode && (!isAlibaba || happyHorseMode !== "t2v");
  const showExternalReferenceSlot = showReferenceSlot && params.urlAssetAttach;
  const composerModeLabel = isAlibaba
    ? currentModel.happyHorseMode === "t2v"
      ? "Text-to-video"
    : currentModel.happyHorseMode === "i2v"
      ? "Image-to-video"
      : "Reference-to-video"
    : params.mode === "text"
    ? "Text"
    : params.mode === "reference"
    ? "Reference"
    : "Keyframe";
  const composerModeButtonLabel = isAlibaba
    ? composerModeLabel
    : params.mode === "text"
    ? "Text"
    : params.mode === "first_last_frame"
    ? "Start/End"
    : "Reference";
  const composerModelLabel = isAlibaba
    ? "HAPPYHORSE"
    : currentModel.name.toUpperCase();
  const summaryDurationLabel =
    params.durationType === "seconds" ? `${params.duration}초` : "SMART";
  const composerRatioLabel = canAdjustRatio
    ? params.ratio === "adaptive"
      ? "AUTO"
      : params.ratio
    : "SOURCE";
  const confirmSoundLabel =
    !isAlibaba && params.generateAudio ? "사운드 포함" : "사운드 없음";
  const confirmSettingItems = [
    summaryDurationLabel,
    params.resolution,
    composerRatioLabel,
    confirmSoundLabel,
  ];
  const canUseSmartDuration = supportsSmartDuration(params.modelId);
  const durationMin = minDurationForModel(params.modelId);
  const durationProgress = rangeProgress(params.duration, durationMin, 15);
  const referenceFileAccept = isAlibaba
    ? "image/jpeg,image/jpg,image/png,image/bmp,image/webp"
    : "image/*,video/*,audio/*";
  const referenceFileMultiple = !(isAlibaba && happyHorseMode === "i2v");
  const canToggleComposerMode = !isAlibaba;

  useEffect(() => {
    if (activeQuickPanel === "ratio" && !canAdjustRatio) {
      setActiveQuickPanel(null);
    }
  }, [activeQuickPanel, canAdjustRatio]);

  const cycleAspectRatio = useCallback(() => {
    if (!canAdjustRatio || visibleRatios.length <= 1) return;
    const currentIndex = Math.max(
      0,
      visibleRatios.findIndex((ratio) => ratio.value === selectedRatio.value)
    );
    const nextIndex = (currentIndex + 1) % visibleRatios.length;
    setParams({ ratio: visibleRatios[nextIndex].value });
  }, [canAdjustRatio, selectedRatio.value, setParams, visibleRatios]);

  const cycleResolution = useCallback(() => {
    if (availableResolutions.length <= 1) return;
    const currentIndex = Math.max(
      0,
      availableResolutions.indexOf(params.resolution as Resolution)
    );
    const nextIndex = (currentIndex + 1) % availableResolutions.length;
    setParams({ resolution: availableResolutions[nextIndex] });
  }, [availableResolutions, params.resolution, setParams]);

  const toggleComposerMode = useCallback(() => {
    if (isAlibaba) return;
    const currentIndex = Math.max(0, BYTEPLUS_MODE_CYCLE.indexOf(params.mode));
    const nextMode =
      BYTEPLUS_MODE_CYCLE[(currentIndex + 1) % BYTEPLUS_MODE_CYCLE.length];
    setParams({
      mode: nextMode,
    });
    setActiveQuickPanel(null);
    setPromptExpanded(true);
  }, [isAlibaba, params.mode, setParams]);

  const toggleAudio = useCallback(() => {
    if (isAlibaba) return;
    setParams({ generateAudio: !params.generateAudio });
    setActiveQuickPanel(null);
    setPromptExpanded(true);
  }, [isAlibaba, params.generateAudio, setParams]);

  const updateQuickPanelPlacement = useCallback(
    (anchor?: HTMLButtonElement | null) => {
      const nextAnchor = anchor ?? quickPanelAnchorRef.current;
      const host = composerRef.current;

      if (!nextAnchor || !host || typeof window === "undefined") {
        setQuickPanelPlacement(null);
        return;
      }

      quickPanelAnchorRef.current = nextAnchor;

      const hostRect = host.getBoundingClientRect();
      const anchorRect = nextAnchor.getBoundingClientRect();
      const hostWidth = Math.max(
        hostRect.width - QUICK_PANEL_EDGE_GUTTER * 2,
        0
      );
      const viewportWidth = Math.max(window.innerWidth - 32, 0);
      const width = Math.min(
        QUICK_PANEL_MAX_WIDTH,
        viewportWidth,
        hostWidth || QUICK_PANEL_MAX_WIDTH
      );
      const anchorCenter =
        anchorRect.left - hostRect.left + anchorRect.width / 2;
      const minLeft = QUICK_PANEL_EDGE_GUTTER;
      const maxLeft = Math.max(
        minLeft,
        hostRect.width - width - QUICK_PANEL_EDGE_GUTTER
      );
      const left = Math.min(
        Math.max(anchorCenter - width / 2, minLeft),
        maxLeft
      );

      setQuickPanelPlacement({
        left: Math.round(left),
        width: Math.round(width),
      });
    },
    []
  );

  useEffect(() => {
    if (!activeQuickPanel) {
      quickPanelAnchorRef.current = null;
      setQuickPanelPlacement(null);
      return;
    }

    updateQuickPanelPlacement();
  }, [
    activeQuickPanel,
    composerOffset.x,
    composerOffset.y,
    composerSize.promptHeight,
    composerSize.width,
    isExpanded,
    updateQuickPanelPlacement,
  ]);

  useEffect(() => {
    if (!activeQuickPanel) return;
    const refreshQuickPanelPlacement = () => updateQuickPanelPlacement();
    window.addEventListener("resize", refreshQuickPanelPlacement);
    window.addEventListener("scroll", refreshQuickPanelPlacement, true);
    return () => {
      window.removeEventListener("resize", refreshQuickPanelPlacement);
      window.removeEventListener("scroll", refreshQuickPanelPlacement, true);
    };
  }, [activeQuickPanel, updateQuickPanelPlacement]);

  const cancelQuickPanelClose = useCallback(() => {
    if (!quickPanelCloseTimerRef.current) return;
    clearTimeout(quickPanelCloseTimerRef.current);
    quickPanelCloseTimerRef.current = null;
  }, []);

  const scheduleQuickPanelClose = useCallback(() => {
    if (quickPanelCloseTimerRef.current) {
      clearTimeout(quickPanelCloseTimerRef.current);
    }
    quickPanelCloseTimerRef.current = setTimeout(() => {
      setActiveQuickPanel(null);
      quickPanelCloseTimerRef.current = null;
    }, 260);
  }, []);

  const openQuickPanel = useCallback(
    (panel: QuickPanel, anchor?: HTMLButtonElement | null) => {
      if (!isExpanded) return;
      cancelQuickPanelClose();
      setParamsOpen(false);
      updateQuickPanelPlacement(anchor);
      setActiveQuickPanel(panel);
    },
    [cancelQuickPanelClose, isExpanded, updateQuickPanelPlacement]
  );

  const handleRatioQuickClick = useCallback(
    (anchor?: HTMLButtonElement | null) => {
      if (activeQuickPanel === "ratio") {
        updateQuickPanelPlacement(anchor);
        cycleAspectRatio();
        return;
      }
      openQuickPanel("ratio", anchor);
    },
    [
      activeQuickPanel,
      cycleAspectRatio,
      openQuickPanel,
      updateQuickPanelPlacement,
    ]
  );

  const handleResolutionQuickClick = useCallback(
    (anchor?: HTMLButtonElement | null) => {
      if (activeQuickPanel === "resolution") {
        updateQuickPanelPlacement(anchor);
        cycleResolution();
        return;
      }
      openQuickPanel("resolution", anchor);
    },
    [
      activeQuickPanel,
      cycleResolution,
      openQuickPanel,
      updateQuickPanelPlacement,
    ]
  );

  const handleDurationQuickClick = useCallback(
    (anchor?: HTMLButtonElement | null) => {
      openQuickPanel("duration", anchor);
    },
    [openQuickPanel]
  );

  const handleExternalReferenceSubmit = useCallback(() => {
    const value = externalReferenceValue.trim();
    if (!value) {
      setExternalReferenceError("URL 또는 asset:// 값을 입력하세요.");
      return;
    }
    if (!/^(https?:\/\/|asset:\/\/|oss:\/\/)/i.test(value)) {
      setExternalReferenceError("https://, oss://, asset:// 형식만 지원합니다.");
      return;
    }
    if (isAlibaba && !isHappyHorseMediaUrl(value)) {
      setExternalReferenceError("HappyHorse는 HTTP(S) 또는 oss:// 이미지 URL만 지원합니다.");
      return;
    }
    if (isAlibaba && happyHorseMode === "r2v" && references.length >= 9) {
      setExternalReferenceError("HappyHorse R2V는 이미지 최대 9개까지 지원합니다.");
      return;
    }
    if (isAlibaba && happyHorseMode === "i2v") {
      references.forEach((ref) => removeReference(ref.id));
    }

    const inferred = isAlibaba
      ? {
          type: "image" as const,
          role: happyHorseMode === "i2v" ? "first_frame" : "reference_image",
        }
      : detectExternalReference(value);

    addReference({
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      type: inferred.type,
      url: value,
      name: value.startsWith("asset://")
        ? value.replace("asset://", "")
        : value.split("/").pop() || "external-reference",
      role: inferred.role,
      preview:
        inferred.type === "image" && !value.startsWith("asset://")
          ? value
          : undefined,
    });
    setExternalReferenceValue("");
    setExternalReferenceError("");
    setExternalReferenceOpen(false);
  }, [
    addReference,
    externalReferenceValue,
    happyHorseMode,
    isAlibaba,
    references,
    removeReference,
  ]);

  useEffect(() => {
    const raf = requestAnimationFrame(() => {
      setComposerOffset((offset) => clampComposerOffset(offset));
    });
    return () => cancelAnimationFrame(raf);
  }, [
    activeQuickPanel,
    clampComposerOffset,
    externalReferenceOpen,
    isExpanded,
    paramsOpen,
    showReferenceSlot,
  ]);

  useEffect(() => {
    if (!showReferenceSlot) {
      setIsReferenceSlotOver(false);
      setExternalReferenceOpen(false);
    }
  }, [showReferenceSlot]);

  useEffect(() => {
    if (!showExternalReferenceSlot) {
      setExternalReferenceOpen(false);
      setExternalReferenceError("");
    }
  }, [showExternalReferenceSlot]);

  const hasFirstFrame = activeReferences.some((r) => r.role === "first_frame");
  const hasLastFrame = activeReferences.some((r) => r.role === "last_frame");
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
  const generateIssue = !demoMode && !activeApiKey
    ? isAlibaba
      ? "Alibaba ModelStudio API Key를 입력하세요."
      : "BytePlus Ark API Key를 입력하세요."
    : promptRequired && !prompt.trim()
    ? "프롬프트를 입력하세요."
    : lastOnlyError && !isAlibaba
    ? "Start frame 이미지를 첨부하세요. (End frame만으로는 생성 불가)"
    : noFramesError && !isAlibaba
    ? "Start frame 이미지를 먼저 첨부하세요."
    : uploadPending
    ? "파일 업로드가 끝난 뒤 생성할 수 있습니다."
    : happyHorseI2vError
    ? "HappyHorse I2V는 첫 프레임 이미지 1개만 지원합니다. 로컬 첨부 또는 HTTP(S)/oss:// URL을 사용하세요."
    : happyHorseR2vError
    ? "HappyHorse R2V는 레퍼런스 이미지 1~9개만 지원합니다. 로컬 첨부 또는 HTTP(S)/oss:// URL을 사용하세요."
    : happyHorseRatioError
    ? "HappyHorse는 16:9, 9:16, 1:1, 4:3, 3:4 비율만 지원합니다."
    : "";
  const pollTask = useCallback(
    (localId: string, taskId: string, taskParams: ModelParamsType) => {
      if (taskId.startsWith("demo-")) return;
      const key = isAlibabaModel(taskParams.modelId)
        ? useAppStore.getState().alibabaApiKey
        : useAppStore.getState().apiKey;
      if (!key) return;

      const poll = async () => {
        try {
          const liveTask = useAppStore
            .getState()
            .tasks.find((task) => task.id === localId);
          if (
            !liveTask ||
            !["pending", "queued", "running"].includes(liveTask.status)
          ) {
            if (pollingRef.current[localId]) {
              clearInterval(pollingRef.current[localId]);
              delete pollingRef.current[localId];
            }
            return;
          }
          const result = await getTaskStatus(key, taskId, taskParams.modelId);
          const responseMeta = readTaskResponseMeta(
            result as Record<string, unknown>
          );
          const status = result.status;

          if (status === "succeeded") {
            const videoUrl = readContentUrl(result.content, "video_url");
            const lastFrameUrl = readContentUrl(result.content, "last_frame_url");
            updateTask(localId, {
              ...responseMeta,
              status: "succeeded",
              videoUrl,
              lastFrameUrl,
              seed: result.seed,
              usage: result.usage,
            });
            if (!isAlibabaModel(taskParams.modelId)) {
              void reportUsageOnce(taskId, result.usage);
            }
            if (pollingRef.current[localId]) {
              clearInterval(pollingRef.current[localId]);
              delete pollingRef.current[localId];
            }
          } else if (status === "failed") {
            updateTask(localId, {
              ...responseMeta,
              status: "failed",
              error: result.error?.message || "Generation failed",
            });
            if (pollingRef.current[localId]) {
              clearInterval(pollingRef.current[localId]);
              delete pollingRef.current[localId];
            }
          } else if (status === "cancelled" || status === "expired") {
            updateTask(localId, {
              ...responseMeta,
              status: status as "cancelled" | "expired",
              error: status === "expired" ? "Task expired" : "Task cancelled",
            });
            if (pollingRef.current[localId]) {
              clearInterval(pollingRef.current[localId]);
              delete pollingRef.current[localId];
            }
          } else {
            updateTask(localId, {
              ...responseMeta,
              status: status === "queued" ? "queued" : "running",
            });
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
    if (!demoMode) clearDemoTasks();
  }, [clearDemoTasks, demoMode, tasks.length]);

  useEffect(() => {
    tasks.forEach((t) => {
      if (
        (t.status === "pending" || t.status === "queued" || t.status === "running") &&
        t.taskId &&
        !t.demo &&
        !t.taskId.startsWith("demo-") &&
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

  const performGenerate = useCallback(async () => {
    if (generateIssue || (!demoMode && !activeApiKey)) {
      setError(generateIssue || "API Key를 입력하세요.");
      return;
    }
    setError("");

    const count = params.outputCount || 1;
    const singleParams = { ...params, outputCount: 1 };
    const trimmedPrompt = prompt.trim();

    const snapshotRefs = activeReferences.map((r) => ({ ...r }));

    const localIds: string[] = [];
    for (let i = 0; i < count; i++) {
      const localId = `local-${Date.now()}-${i}`;
      localIds.push(localId);
      addTask({
        id: localId,
        taskId: demoMode ? `demo-${localId}` : "",
        demo: demoMode,
        prompt: trimmedPrompt,
        status: "pending",
        params: singleParams,
        references: snapshotRefs,
        createdAt: Date.now(),
      });
    }
    window.setTimeout(() => {
      resultsScrollRef.current?.scrollTo({ top: 0, behavior: "smooth" });
    }, 0);

    if (demoMode) {
      const demoVideoUrl =
        "https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4";
      localIds.forEach((localId) => {
        window.setTimeout(() => {
          updateTask(localId, {
            taskId: `demo-${localId}`,
            status: "running",
          });
        }, DEMO_PENDING_MS);
        window.setTimeout(() => {
          const demoTokens = estimateTokens(
            singleParams,
            snapshotRefs.some((r) => r.type === "video")
          );
          const demoUsage = {
            total_tokens: demoTokens,
            completion_tokens: demoTokens,
            output_video_duration:
              singleParams.durationType === "seconds"
                ? singleParams.duration
                : 5,
            video_count: 1,
            SR: singleParams.resolution.replace("p", ""),
            ratio:
              singleParams.ratio === "adaptive" ? "16:9" : singleParams.ratio,
          };
          updateTask(localId, {
            status: "succeeded",
            videoUrl: demoVideoUrl,
            seed: Math.floor(Math.random() * 2147483647),
            actualDuration:
              singleParams.durationType === "seconds"
                ? singleParams.duration
                : 5,
            actualRatio:
              singleParams.ratio === "adaptive" ? "16:9" : singleParams.ratio,
            actualResolution: singleParams.resolution,
            usage: demoUsage,
          });
        }, DEMO_PENDING_MS + DEMO_GENERATING_MS);
      });
      return;
    }

    const key = activeApiKey;
    if (!key) return;

    for (const localId of localIds) {
      createGenerationTask(key, trimmedPrompt, activeReferences, singleParams)
        .then((result) => {
          const initialStatus =
            result.status === "pending" || result.status === "queued"
              ? result.status
              : "queued";
          updateTask(localId, { taskId: result.id, status: initialStatus });
          pollTask(localId, result.id, singleParams);
        })
        .catch((e) => {
          const msg = e instanceof Error ? e.message : "Unknown error";
          updateTask(localId, { status: "failed", error: msg });
        });
    }
  }, [
    activeApiKey,
    demoMode,
    prompt,
    generateIssue,
    activeReferences,
    params,
    addTask,
    updateTask,
    pollTask,
  ]);

  const executeConfirmedGenerate = useCallback(() => {
    if (confirmExecutingRef.current) return;
    confirmExecutingRef.current = true;
    if (skipConfirmCheckedRef.current) {
      setGenerationConfirmEnabled(false);
      setSkipGenerationConfirm(true);
    }
    setConfirmOpen(false);
    setConfirmCountdown(GENERATION_CONFIRM_COUNTDOWN_SECONDS);
    void performGenerate().finally(() => {
      confirmExecutingRef.current = false;
    });
  }, [performGenerate]);

  useEffect(() => {
    if (!confirmOpen) return;
    setConfirmCountdown(GENERATION_CONFIRM_COUNTDOWN_SECONDS);
    const timer = window.setInterval(() => {
      setConfirmCountdown((current) => {
        if (current <= 1) {
          window.clearInterval(timer);
          window.setTimeout(() => executeConfirmedGenerate(), 0);
          return 0;
        }
        return current - 1;
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [confirmOpen, executeConfirmedGenerate]);

  const handleGenerate = useCallback(() => {
    if (generateIssue || (!demoMode && !activeApiKey)) {
      setError(generateIssue || "API Key를 입력하세요.");
      return;
    }
    if (skipGenerationConfirm) {
      void performGenerate();
      return;
    }
    setError("");
    setParamsOpen(false);
    setActiveQuickPanel(null);
    setSkipConfirmChecked(false);
    skipConfirmCheckedRef.current = false;
    confirmExecutingRef.current = false;
    setConfirmCountdown(GENERATION_CONFIRM_COUNTDOWN_SECONDS);
    setConfirmOpen(true);
  }, [
    activeApiKey,
    demoMode,
    generateIssue,
    performGenerate,
    skipGenerationConfirm,
  ]);

  return (
    <div className="app-shell h-screen flex flex-col">
      <Header />

      <div className="flex-1 flex overflow-hidden relative">
        {/* Main Content */}
        <div
          ref={mainRef}
          className="flex-1 flex flex-col overflow-hidden relative"
        >
          {/* Results Area */}
          <div
            ref={resultsScrollRef}
            className="flex-1 overflow-y-auto p-5 pt-28 pb-52 scrollbar-thin"
          >
            <VideoResult />
          </div>

          {/* Floating Input Area */}
          <PromptInsertProvider insert={insertAtCursor}>
          <div
            ref={composerRef}
            className={`composer-dock absolute z-20 pointer-events-none ${
              isExpanded ? "composer-dock-expanded" : "composer-dock-collapsed"
            }`}
            style={{
              left: "50%",
              bottom: "clamp(24px, 5vh, 52px)",
              width: isExpanded && composerSize.width
                ? `${composerSize.width}px`
                : isExpanded
                ? "min(calc(100% - 48px), 56rem)"
                : "min(calc(100% - 72px), 38rem)",
              transform: `translate(calc(-50% + ${composerOffset.x}px), ${composerOffset.y}px)`,
              transition: isComposerResizing
                ? "none"
                : isComposerDragging
                ? "transform 90ms cubic-bezier(0.22, 1, 0.36, 1)"
                : isComposerSnapping
                ? "transform 460ms cubic-bezier(0.2, 0.9, 0.18, 1.08), width 320ms cubic-bezier(0.2, 0.8, 0.2, 1)"
                : "transform 260ms cubic-bezier(0.2, 0.8, 0.2, 1), width 320ms cubic-bezier(0.2, 0.8, 0.2, 1)",
              willChange: "transform, width",
            }}
          >
            {showReferenceSlot && (
              <div
                className="reference-slots pointer-events-auto absolute left-0 z-50 flex items-end gap-3"
                style={{ bottom: "calc(100% + 1.1rem)" }}
                data-no-composer-drag
                onPointerEnter={() => setIsAttachmentPasteArmed(true)}
                onPointerLeave={() => setIsAttachmentPasteArmed(false)}
                onFocusCapture={() => setIsAttachmentPasteArmed(true)}
                onBlurCapture={(event) => {
                  if (
                    event.relatedTarget instanceof Node &&
                    event.currentTarget.contains(event.relatedTarget)
                  ) {
                    return;
                  }
                  setIsAttachmentPasteArmed(false);
                }}
              >
                {activeReferences.map((ref) => {
                  const previewUrl =
                    ref.preview ??
                    (ref.type === "image" && !ref.url.startsWith("asset://")
                      ? ref.url
                      : undefined);
                  const tag = referenceTags[ref.id];

                  return (
                    <div
                      key={ref.id}
                      draggable={!ref.uploading}
                      onDragStart={(event) =>
                        handleReferenceDragStart(ref.id, event)
                      }
                      onDragEnter={(event) =>
                        handleReferenceDragEnter(ref.id, event)
                      }
                      onDragOver={(event) => {
                        event.preventDefault();
                        event.dataTransfer.dropEffect = event.dataTransfer
                          .files?.length
                          ? "copy"
                          : "move";
                      }}
                      onDrop={(event) =>
                        handleReferenceAssetDrop(ref.id, event)
                      }
                      onDragEnd={clearReferenceDrag}
                      className={`reference-slot-card reference-attached-slot group relative flex h-24 w-24 cursor-grab flex-col items-center justify-center overflow-hidden rounded-2xl border p-3 text-center transition-all active:cursor-grabbing ${
                        draggedReferenceId === ref.id ? "opacity-45" : ""
                      } ${
                        dragOverReferenceId === ref.id
                          ? "reference-slot-card-over"
                          : ""
                      }`}
                      title={`${tag ?? ""} ${ref.name}`.trim()}
                    >
                      {previewUrl ? (
                        <img
                          src={previewUrl}
                          alt=""
                          draggable={false}
                          className="absolute inset-0 h-full w-full object-cover"
                        />
                      ) : (
                        <div className="reference-attached-icon relative z-10 flex h-11 w-11 items-center justify-center rounded-full">
                          {ref.type === "video" ? (
                            <Film className="h-5 w-5" />
                          ) : ref.type === "audio" ? (
                            <Music className="h-5 w-5" />
                          ) : (
                            <ImageIcon className="h-5 w-5" />
                          )}
                        </div>
                      )}
                      <div className="reference-attached-scrim absolute inset-x-0 bottom-0 top-1/2 z-10" />
                      {ref.uploading && (
                        <span className="reference-uploading-badge absolute left-2 top-2 z-20 rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.08em]">
                          Uploading
                        </span>
                      )}
                      {tag ? (
                        <button
                          type="button"
                          draggable={false}
                          data-no-composer-drag
                          onMouseDown={(event) => event.stopPropagation()}
                          onClick={(event) => {
                            event.preventDefault();
                            event.stopPropagation();
                            insertAtCursor(` ${tag} `);
                            setPromptExpanded(true);
                          }}
                          className="reference-attached-tag absolute bottom-2 left-2 right-2 z-20 truncate text-[10px] font-black uppercase leading-none tracking-[0.08em]"
                          title={`${tag} 프롬프트에 삽입`}
                          aria-label={`${tag} 프롬프트에 삽입`}
                        >
                          {tag}
                        </button>
                      ) : (
                        <span className="reference-attached-tag absolute bottom-2 left-2 right-2 z-20 truncate text-[10px] font-black uppercase leading-none tracking-[0.08em]">
                          {ref.name}
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          removeReference(ref.id);
                        }}
                        onMouseDown={(event) => event.stopPropagation()}
                        className="reference-attached-remove absolute right-2 top-2 z-30 inline-flex h-6 w-6 items-center justify-center rounded-full transition-colors"
                        title={`${ref.name} 제거`}
                        aria-label={`${ref.name} 제거`}
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  );
                })}

                <button
                  type="button"
                  onClick={() => referenceFileInputRef.current?.click()}
                  onDragEnter={(event) => {
                    event.preventDefault();
                    setIsReferenceSlotOver(true);
                  }}
                  onDragOver={(event) => {
                    event.preventDefault();
                    event.dataTransfer.dropEffect = "copy";
                    setIsReferenceSlotOver(true);
                  }}
                  onDragLeave={() => setIsReferenceSlotOver(false)}
                  onDrop={handleReferenceSlotDrop}
                  className={`reference-slot-card reference-file-slot group relative flex h-24 w-24 flex-col items-center justify-center overflow-hidden rounded-2xl border p-3 text-center transition-all ${
                    isReferenceSlotOver ? "reference-slot-card-over" : ""
                  }`}
                  title="파일 첨부"
                >
                  <div className="reference-slot-scrim absolute inset-0" />
                  <div className="reference-slot-plus relative z-10 flex h-10 w-10 items-center justify-center rounded-full">
                    <Plus className="h-6 w-6" />
                  </div>
                  <span className="reference-slot-label absolute bottom-3 left-0 right-0 z-10 block text-xs font-black uppercase leading-none tracking-[0.08em]">
                    FILE
                  </span>
                </button>

                {showExternalReferenceSlot && (
                  <button
                    type="button"
                    onClick={() => {
                      setExternalReferenceError("");
                      setExternalReferenceOpen((open) => !open);
                    }}
                    className="reference-slot-card reference-external-slot group relative flex h-24 w-24 flex-col items-center justify-center gap-2 overflow-hidden rounded-2xl border p-3 text-center transition-all"
                    title="URL 또는 asset:// 첨부"
                  >
                    <Link2 className="relative z-10 h-5 w-5" />
                    <span className="relative z-10 text-[11px] font-black uppercase leading-tight tracking-[0.08em]">
                      URL
                      <br />
                      ASSET
                    </span>
                  </button>
                )}

                <input
                  ref={referenceFileInputRef}
                  type="file"
                  accept={referenceFileAccept}
                  multiple={referenceFileMultiple}
                  className="hidden"
                  onChange={handleReferenceFileChange}
                />

                {showExternalReferenceSlot && externalReferenceOpen && (
                  <div className="reference-external-popover absolute bottom-0 left-[13.4rem] z-50 w-[min(22rem,calc(100vw-3rem))] rounded-2xl border p-3">
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <p className="text-xs font-semibold">URL / asset://</p>
                      <button
                        type="button"
                        onClick={() => setExternalReferenceOpen(false)}
                        className="reference-external-close inline-flex h-7 w-7 items-center justify-center rounded-lg"
                        aria-label="닫기"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    <div className="flex gap-2">
                      <input
                        value={externalReferenceValue}
                        onChange={(event) => {
                          setExternalReferenceValue(event.target.value);
                          setExternalReferenceError("");
                        }}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") {
                            event.preventDefault();
                            handleExternalReferenceSubmit();
                          }
                        }}
                        placeholder="https://... 또는 asset://..."
                        className="reference-external-input min-w-0 flex-1 rounded-xl border px-3 py-2 text-xs outline-none"
                        autoFocus
                      />
                      <button
                        type="button"
                        onClick={handleExternalReferenceSubmit}
                        className="reference-external-submit rounded-xl px-3 py-2 text-xs font-semibold"
                      >
                        Add
                      </button>
                    </div>
                    {externalReferenceError && (
                      <p className="mt-2 text-[11px] text-red-400">
                        {externalReferenceError}
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}
            {isFirstLastMode && !isAlibaba && (
              <div
                className="keyframe-slots pointer-events-auto absolute left-0 z-50 flex items-end gap-3"
                style={{ bottom: "calc(100% + 1.1rem)" }}
                data-no-composer-drag
                onPointerEnter={() => setIsAttachmentPasteArmed(true)}
                onPointerLeave={() => setIsAttachmentPasteArmed(false)}
                onFocusCapture={() => setIsAttachmentPasteArmed(true)}
                onBlurCapture={(event) => {
                  if (
                    event.relatedTarget instanceof Node &&
                    event.currentTarget.contains(event.relatedTarget)
                  ) {
                    return;
                  }
                  setIsAttachmentPasteArmed(false);
                }}
              >
                {(["first_frame", "last_frame"] as const).map((role) => {
                  const frame = activeReferences.find((ref) => ref.role === role);
                  const meta = FRAME_SLOT_META[role];

                  return (
                    <div
                      key={role}
                      role="button"
                      tabIndex={0}
                      draggable={Boolean(frame)}
                      data-frame-role={role}
                      onClick={() => {
                        if (suppressFrameClickRef.current) {
                          suppressFrameClickRef.current = false;
                          return;
                        }
                        openFramePicker(role);
                      }}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          openFramePicker(role);
                        }
                      }}
                      onPointerDown={(event) =>
                        handleFramePointerDown(role, event)
                      }
                      onPointerMove={handleFramePointerMove}
                      onPointerUp={finishFramePointerDrag}
                      onPointerCancel={finishFramePointerDrag}
                      onDragStart={(event) => {
                        if (!frame) {
                          event.preventDefault();
                          return;
                        }
                        setDraggedFrameRole(role);
                        event.dataTransfer.effectAllowed = "move";
                        event.dataTransfer.setData(
                          "application/x-frame-role",
                          role
                        );
                      }}
                      onDragEnter={(event) => {
                        event.preventDefault();
                        setDragOverFrameRole(role);
                      }}
                      onDragOver={(event) => {
                        event.preventDefault();
                        event.dataTransfer.dropEffect =
                          event.dataTransfer.files?.length ? "copy" : "move";
                      }}
                      onDrop={(event) => handleFrameSlotDrop(role, event)}
                      onDragEnd={() => {
                        setDraggedFrameRole(null);
                        setDragOverFrameRole(null);
                      }}
                      className={`keyframe-slot-card group relative flex h-24 w-24 cursor-grab flex-col items-center justify-center overflow-hidden rounded-2xl border p-3 text-center transition-all active:cursor-grabbing ${
                        draggedFrameRole === role ? "opacity-45" : ""
                      } ${
                        dragOverFrameRole === role
                          ? "keyframe-slot-card-over"
                          : ""
                      }`}
                      title={
                        frame
                          ? `${meta.label} · 드래그해서 프레임 역할 이동`
                          : `${meta.label} 이미지 추가`
                      }
                    >
                      {frame?.preview && (
                        <img
                          src={frame.preview}
                          alt=""
                          draggable={false}
                          className="absolute inset-0 h-full w-full object-cover opacity-75"
                        />
                      )}
                      <div className="keyframe-slot-scrim absolute inset-0" />
                      {!frame && (
                        <>
                          <div className="keyframe-slot-plus relative z-10 flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white/12 text-white shadow-[inset_0_1px_0_rgb(255_255_255_/_0.18)]">
                            <Plus className="h-6 w-6 shrink-0" />
                          </div>
                          <span className="keyframe-slot-label absolute bottom-3 left-0 right-0 z-10 text-[11px] font-black uppercase leading-none tracking-[0.08em] text-white/55">
                            {meta.label}
                          </span>
                        </>
                      )}
                      {frame && (
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            removeFrame(role);
                          }}
                          onMouseDown={(event) => event.stopPropagation()}
                          className="absolute right-2 top-2 z-20 inline-flex h-6 w-6 items-center justify-center rounded-full bg-black/55 text-white/80 transition-colors hover:bg-black/80 hover:text-white"
                          title={`${meta.shortLabel} frame 제거`}
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  );
                })}
                <input
                  ref={firstFrameInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="hidden"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) void handleFrameUpload(file, "first_frame");
                    event.target.value = "";
                  }}
                />
                <input
                  ref={lastFrameInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="hidden"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) void handleFrameUpload(file, "last_frame");
                    event.target.value = "";
                  }}
                />
              </div>
            )}
            <div className="pointer-events-auto">
              <div
                className="composer-shell glass-card subtle-glow relative cursor-move rounded-2xl border border-white/60 overflow-hidden transition-[border-color,box-shadow] duration-200"
                onPointerDown={handleComposerSurfacePointerDown}
                onPointerMove={handleComposerPointerMove}
                onPointerUp={finishComposerDrag}
                onPointerCancel={finishComposerDrag}
                onClick={handleComposerClick}
                onDragEnter={handleDragEnter}
                onDragLeave={handleDragLeave}
                onDragOver={handleDragOver}
                onDrop={handleDrop}
              >
                {/* Prompt Input */}
                <div
                  className="px-4 py-2"
                  data-tour="prompt-editor"
                  data-prompt-editor-region
                  onPointerDown={() => {
                    setParamsOpen(false);
                    setActiveQuickPanel(null);
                  }}
                >
                  <PromptEditor
                    ref={promptEditorRef}
                    value={prompt}
                    onChange={handlePromptChange}
                    onPaste={handlePaste}
                    onFocus={() => {
                      setPromptExpanded(true);
                      setParamsOpen(false);
                      setActiveQuickPanel(null);
                    }}
                    onBlur={() => {}}
                    rows={1}
                    className={
                      `${isExpanded
                        ? "prompt-editor-expanded"
                        : "prompt-editor-collapsed"} ${
                        isExpanded && composerSize.promptHeight
                          ? "prompt-editor-resized"
                          : ""
                      }`
                    }
                    style={
                      isExpanded && composerSize.promptHeight
                        ? ({
                            "--prompt-editor-height": `${composerSize.promptHeight}px`,
                          } as CSSProperties)
                        : undefined
                    }
                    placeholder={
                      isExpanded
                        ? isAlibaba
                          ? currentModel.happyHorseMode === "r2v"
                            ? "Describe the scene with attached character references..."
                            : currentModel.happyHorseMode === "i2v"
                            ? "Describe motion from the attached image..."
                            : "Describe the video you want to create..."
                          : params.mode === "text"
                          ? "Describe the video you want to create..."
                          : params.mode === "first_last_frame"
                          ? "Describe camera or action in the scene..."
                          : "Describe your scene with visual references..."
                        : isAlibaba
                        ? "Describe the video..."
                        : params.mode === "text"
                        ? "Describe the video you want to create..."
                        : params.mode === "first_last_frame"
                        ? "Describe camera or action in the scene..."
                        : "Describe your scene with visual references..."
                    }
                  />
                </div>

                {error && (
                  <div
                    className="mx-4 mb-2 p-2 bg-red-50 border border-red-200 rounded-lg text-xs text-red-600"
                    data-no-composer-drag
                  >
                    {error}
                  </div>
                )}

                {dropError && (
                  <div
                    className="mx-4 mb-2 p-2 bg-orange-50 border border-orange-200 rounded-lg text-[11px] text-orange-700 flex items-start gap-1.5"
                    data-no-composer-drag
                  >
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
                <div
                  className="px-4 pb-3 flex items-center justify-between gap-3"
                >
                  <div className="composer-control-strip scrollbar-thin flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto overflow-y-hidden text-[11px] text-gray-500">
                    {isExpanded ? (
                      <>
                        <button
                          type="button"
                          onClick={toggleComposerMode}
                          disabled={!canToggleComposerMode}
                          data-tour="composer-mode"
                          data-no-composer-drag
                          className={`composer-action-chip composer-mode-chip ${
                            canToggleComposerMode
                              ? "composer-action-chip-active"
                              : ""
                          }`}
                          title={
                            canToggleComposerMode
                              ? "Reference / Start-End Frame 전환"
                              : composerModeLabel
                          }
                        >
                          {composerModeButtonLabel}
                        </button>
                        {!isAlibaba && (
                          <button
                            type="button"
                            onClick={toggleAudio}
                            data-tour="composer-sound"
                            data-no-composer-drag
                            className={`composer-action-chip composer-sound-chip ${
                              params.generateAudio ? "composer-action-chip-active" : ""
                            }`}
                            title={params.generateAudio ? "Sound 끄기" : "Sound 켜기"}
                            aria-pressed={params.generateAudio}
                          >
                            {params.generateAudio ? (
                              <Volume2 className="h-3.5 w-3.5" />
                            ) : (
                              <VolumeX className="h-3.5 w-3.5" />
                            )}
                            <span>Sound</span>
                          </button>
                        )}
                        <button
                          type="button"
                          onMouseEnter={(event) =>
                            openQuickPanel("ratio", event.currentTarget)
                          }
                          onMouseLeave={scheduleQuickPanelClose}
                          onFocus={(event) =>
                            openQuickPanel("ratio", event.currentTarget)
                          }
                          onClick={(event) =>
                            handleRatioQuickClick(event.currentTarget)
                          }
                          disabled={!canAdjustRatio}
                          data-no-composer-drag
                          aria-pressed={activeQuickPanel === "ratio"}
                          className={`composer-action-chip composer-ratio-chip ${
                            activeQuickPanel === "ratio"
                              ? "composer-action-chip-active"
                              : ""
                          }`}
                          title={
                            canAdjustRatio
                              ? "Aspect Ratio"
                              : "소스 이미지 비율을 사용합니다."
                          }
                        >
                          {composerRatioLabel}
                        </button>
                        <button
                          type="button"
                          onMouseEnter={(event) =>
                            openQuickPanel("resolution", event.currentTarget)
                          }
                          onMouseLeave={scheduleQuickPanelClose}
                          onFocus={(event) =>
                            openQuickPanel("resolution", event.currentTarget)
                          }
                          onClick={(event) =>
                            handleResolutionQuickClick(event.currentTarget)
                          }
                          data-no-composer-drag
                          aria-pressed={activeQuickPanel === "resolution"}
                          className={`composer-action-chip composer-resolution-chip ${
                            activeQuickPanel === "resolution"
                              ? "composer-action-chip-active"
                              : ""
                          }`}
                          title="Resolution"
                        >
                          {params.resolution}
                        </button>
                        <button
                          type="button"
                          onMouseEnter={(event) =>
                            openQuickPanel("duration", event.currentTarget)
                          }
                          onMouseLeave={scheduleQuickPanelClose}
                          onFocus={(event) =>
                            openQuickPanel("duration", event.currentTarget)
                          }
                          onClick={(event) =>
                            handleDurationQuickClick(event.currentTarget)
                          }
                          data-no-composer-drag
                          aria-pressed={activeQuickPanel === "duration"}
                          className={`composer-action-chip composer-duration-chip ${
                            activeQuickPanel === "duration"
                              ? "composer-action-chip-active"
                              : ""
                          }`}
                          title="Video Duration"
                        >
                          {summaryDurationLabel}
                        </button>
                      </>
                    ) : (
                      <div
                        className="composer-status-strip flex min-w-0 items-center gap-1.5 overflow-hidden"
                        data-no-composer-drag
                      >
                        <span className="truncate">{composerModeButtonLabel}</span>
                        {!isAlibaba && (
                          <>
                            <span className="composer-status-separator" />
                            <span className="truncate">
                              {params.generateAudio ? "Sound" : "Muted"}
                            </span>
                          </>
                        )}
                        <span className="composer-status-separator" />
                        <span className="truncate">{composerRatioLabel}</span>
                        <span className="composer-status-separator" />
                        <span className="truncate">{params.resolution}</span>
                        <span className="composer-status-separator" />
                        <span className="truncate">{summaryDurationLabel}</span>
                      </div>
                    )}
                  </div>

                  <div className="ml-2 flex shrink-0 items-center justify-end gap-2">
                    <span className="hidden min-w-0 shrink truncate text-[10px] text-gray-400 xl:inline">
                      {isAlibaba
                        ? "ModelStudio usage"
                        : `~${(estimateTokens(params, hasVideoRef) / 1000).toFixed(0)}K tokens · ${formatKrw(cost)}`}
                    </span>
                    <button
                      ref={settingsButtonRef}
                      type="button"
                      data-tour="composer-settings"
                      onClick={() => {
                        setActiveQuickPanel(null);
                        setParamsOpen((open) => !open);
                      }}
                      className="composer-settings-summary glass-chip flex min-w-0 max-w-[min(30vw,13rem)] items-center gap-1.5 rounded-xl px-3 py-2 text-[11px] font-semibold tracking-[0.08em] text-gray-500 transition-colors hover:text-gray-800"
                      title="Generation settings"
                    >
                      <span className="truncate">{composerModelLabel}</span>
                      <Settings2 className="h-3.5 w-3.5 shrink-0 text-gray-400" />
                    </button>
                    <button
                      type="button"
                      onClick={handleGenerate}
                      disabled={generateDisabled}
                      data-tour="generate-button"
                      title={generateDisabled ? "파일 업로드가 끝난 뒤 생성할 수 있습니다." : "Generate"}
                      className="composer-generate-button primary-button shrink-0 disabled:bg-gray-200 disabled:text-gray-300 text-white transition-all disabled:shadow-none"
                    >
                      <Play className="w-4 h-4" />
                    </button>
                  </div>
                </div>

              </div>
              {activeQuickPanel && isExpanded && (
                <div
                  className="composer-settings-popover composer-quick-popover pointer-events-auto absolute left-0 z-50"
                  style={{
                    bottom: "3.55rem",
                    left: quickPanelPlacement
                      ? `${quickPanelPlacement.left}px`
                      : `${QUICK_PANEL_EDGE_GUTTER}px`,
                    width: quickPanelPlacement
                      ? `${quickPanelPlacement.width}px`
                      : "min(calc(100% - 1rem), 24rem)",
                  }}
                  data-no-composer-drag
                  onMouseEnter={cancelQuickPanelClose}
                  onMouseLeave={scheduleQuickPanelClose}
                  onFocus={cancelQuickPanelClose}
                  onPointerDown={(event) => event.stopPropagation()}
                >
                  <div className="model-settings-composer composer-quick-panel glass-panel rounded-[1.35rem] border p-4">
                    {activeQuickPanel === "ratio" ? (
                      <section>
                        <label className="block text-xs font-medium text-gray-500 mb-2">
                          Aspect Ratio
                        </label>
                        <div className="ratio-picker glass-control rounded-2xl border p-3">
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
                                {ratioLabel(
                                  selectedRatio.value,
                                  selectedRatio.label
                                )}
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
                            {visibleRatios.map((ratio) => {
                              const active = params.ratio === ratio.value;
                              return (
                                <button
                                  key={ratio.value}
                                  type="button"
                                  role="option"
                                  aria-selected={active}
                                  onClick={() =>
                                    setParams({ ratio: ratio.value })
                                  }
                                  className={`ratio-chip ${
                                    active ? "ratio-chip-active" : ""
                                  }`}
                                >
                                  {ratioLabel(ratio.value, ratio.label)}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      </section>
                    ) : activeQuickPanel === "resolution" ? (
                      <section>
                        <label className="block text-xs font-medium text-gray-500 mb-2">
                          Resolution
                        </label>
                        <div className="param-segmented grid grid-cols-3 gap-1 bg-surface-100 rounded-xl p-1">
                          {RESOLUTION_OPTIONS.map((res) => {
                            const disabled =
                              (res === "1080p" &&
                                currentModel.supports1080p === false) ||
                              (res === "480p" &&
                                currentModel.supports480p === false);
                            return (
                              <button
                                key={res}
                                type="button"
                                onClick={() => {
                                  if (!disabled) setParams({ resolution: res });
                                }}
                                disabled={disabled}
                                title={
                                  disabled
                                    ? "현재 모델에서 지원하지 않는 해상도입니다."
                                    : res
                                }
                                className={`param-option relative rounded-lg py-2 text-xs font-medium transition-all ${
                                  params.resolution === res
                                    ? "param-choice-selected text-gray-800"
                                    : "text-gray-500 hover:text-gray-700"
                                } ${
                                  disabled
                                    ? "cursor-not-allowed opacity-40 hover:text-gray-500"
                                    : ""
                                }`}
                              >
                                {res}
                              </button>
                            );
                          })}
                        </div>
                      </section>
                    ) : (
                      <section>
                        <label className="block text-xs font-medium text-gray-500 mb-2">
                          Video Duration
                        </label>
                        <div className="flex items-center gap-3">
                          <input
                            type="range"
                            min={durationMin}
                            max={15}
                            step={1}
                            value={params.duration}
                            disabled={params.durationType === "smart"}
                            onChange={(event) =>
                              setParams({
                                duration: Number(event.target.value),
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
                              params.durationType === "smart"
                                ? "range-control-auto"
                                : ""
                            }`}
                          />
                          <div className="duration-control-group flex items-center gap-2">
                            <div
                              className={`duration-value-chip flex min-w-[60px] items-center justify-center gap-1 rounded-lg bg-surface-100 px-3 py-1.5 ${
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
                                    params.durationType === "smart"
                                      ? "seconds"
                                      : "smart",
                                })
                              }
                              disabled={!canUseSmartDuration}
                              className={`duration-auto-button rounded-lg px-3 py-1.5 text-xs font-bold tracking-[0.08em] transition-all ${
                                params.durationType === "smart"
                                  ? "duration-auto-button-active"
                                  : ""
                              } ${
                                !canUseSmartDuration
                                  ? "cursor-not-allowed opacity-40"
                                  : ""
                              }`}
                              title={
                                canUseSmartDuration
                                  ? "Smart length"
                                  : "현재 모델에서는 Smart length를 지원하지 않습니다."
                              }
                            >
                              AUTO
                            </button>
                          </div>
                        </div>
                      </section>
                    )}
                  </div>
                </div>
              )}
              {paramsOpen && (
                <div
                  ref={paramsPopoverRef}
                  className="composer-settings-popover pointer-events-auto absolute right-0 z-50"
                  style={{ bottom: "3.55rem" }}
                  data-no-composer-drag
                  onPointerDown={(event) => event.stopPropagation()}
                >
                  <ModelParams
                    onClose={() => setParamsOpen(false)}
                    variant="composer"
                  />
                </div>
              )}
              <button
                type="button"
                aria-label="프롬프트 입력칸 크기 조절"
                title="프롬프트 입력칸 크기 조절"
                data-no-composer-drag
                onPointerDown={handleComposerResizePointerDown}
                onPointerMove={handleComposerResizePointerMove}
                onPointerUp={finishComposerResize}
                onPointerCancel={finishComposerResize}
                className={`composer-resize-handle absolute bottom-2 left-2 z-40 h-4 w-4 transition-opacity ${
                  isExpanded
                    ? "composer-resize-handle-visible pointer-events-auto"
                    : "composer-resize-handle-hidden"
                } ${
                  isComposerResizing ? "composer-resize-handle-active" : ""
                }`}
              />
            </div>
          </div>
          </PromptInsertProvider>
          {confirmOpen && (
            <div
              className="generation-confirm-overlay"
              role="dialog"
              aria-modal="true"
              aria-label="생성 확인"
              onMouseDown={(event) => {
                if (event.target === event.currentTarget) {
                  setConfirmOpen(false);
                }
              }}
            >
              <div
                className="generation-confirm-card"
                onMouseDown={(event) => event.stopPropagation()}
              >
                <p className="generation-confirm-kicker">Confirm generation</p>
                <h2>이대로 생성 하시겠습니까?</h2>
                <div className="generation-confirm-summary">
                  <div className="generation-confirm-summary-model">
                    <strong>{composerModelLabel}</strong>
                  </div>
                  <div className="generation-confirm-summary-settings">
                    {confirmSettingItems.map((item, index) => (
                      <span
                        key={`${item}-${index}`}
                        className="generation-confirm-setting-pill"
                      >
                        {item}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="generation-confirm-prompt">
                  <label>Prompt</label>
                  <div>{prompt.trim() || "(no prompt)"}</div>
                </div>
                <label className="generation-confirm-check">
                  <input
                    type="checkbox"
                    checked={skipConfirmChecked}
                    onChange={(event) => {
                      skipConfirmCheckedRef.current = event.target.checked;
                      setSkipConfirmChecked(event.target.checked);
                    }}
                  />
                  <span>다음부터는 경고 스킵하기</span>
                </label>
                <div className="generation-confirm-actions">
                  <button
                    type="button"
                    className="generation-confirm-button generation-confirm-cancel"
                    onClick={() => setConfirmOpen(false)}
                  >
                    취소
                  </button>
                  <button
                    type="button"
                    className="generation-confirm-button generation-confirm-primary"
                    onClick={executeConfirmedGenerate}
                  >
                    바로 생성{" "}
                    <span>({confirmCountdown}초)</span>
                  </button>
                </div>
              </div>
            </div>
          )}
          <InteractiveTutorial
            open={tutorialOpen}
            onClose={() => {
              setTutorialOpen(false);
              window.localStorage.setItem("sd2_tutorial_seen", "1");
            }}
          />
        </div>
      </div>
    </div>
  );
}
