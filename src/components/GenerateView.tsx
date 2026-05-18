"use client";

import {
  useState,
  useCallback,
  useRef,
  useEffect,
  type CSSProperties,
} from "react";
import {
  Play,
  ChevronDown,
  ImagePlus,
  GripHorizontal,
  Link2,
  Plus,
  X,
} from "lucide-react";
import { useAppStore, hydrateTasks } from "@/lib/store";
import { createGenerationTask, getTaskStatus } from "@/lib/api";
import {
  estimateCost,
  estimateTokens,
  getModelOption,
  isAlibabaModel,
  supportsAspectRatio,
  type ModelParams as ModelParamsType,
} from "@/lib/types";
import { useFileUpload } from "@/lib/useFileUpload";
import { PromptInsertProvider } from "@/lib/usePromptInsert";
import Header from "./Header";
import ModelParams from "./ModelParams";
import PromptEditor, { type PromptEditorHandle } from "./PromptEditor";
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
  first_frame: { label: "START FRAME", shortLabel: "First" },
  last_frame: { label: "END FRAME", shortLabel: "Last" },
};

const MAGNET_GRID = 64;

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
    addTask,
    updateTask,
    clearDemoTasks,
  } = useAppStore();
  const [error, setError] = useState("");
  const [paramsOpen, setParamsOpen] = useState(false);
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
  const [isComposerDragging, setIsComposerDragging] = useState(false);
  const [isComposerResizing, setIsComposerResizing] = useState(false);
  const [isComposerSnapping, setIsComposerSnapping] = useState(false);
  const pollingRef = useRef<Record<string, NodeJS.Timeout>>({});
  const promptEditorRef = useRef<PromptEditorHandle>(null);
  const mainRef = useRef<HTMLDivElement>(null);
  const resultsScrollRef = useRef<HTMLDivElement>(null);
  const composerRef = useRef<HTMLDivElement>(null);
  const firstFrameInputRef = useRef<HTMLInputElement>(null);
  const lastFrameInputRef = useRef<HTMLInputElement>(null);
  const referenceFileInputRef = useRef<HTMLInputElement>(null);
  const composerDragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    startOffset: { x: number; y: number };
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
  const dragCounter = useRef(0);
  const [externalReferenceOpen, setExternalReferenceOpen] = useState(false);
  const [externalReferenceValue, setExternalReferenceValue] = useState("");
  const [externalReferenceError, setExternalReferenceError] = useState("");

  const isExpanded = promptExpanded || isDragOver;

  useEffect(() => {
    if (window.innerWidth < 900) {
      setParamsOpen(false);
    }
  }, []);

  useEffect(() => {
    if (!paramsOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setParamsOpen(false);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [paramsOpen]);

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

  const handleReferenceSlotDrop = useCallback(
    (event: React.DragEvent<HTMLButtonElement>) => {
      event.preventDefault();
      setIsReferenceSlotOver(false);

      const files = event.dataTransfer.files;
      if (files?.length) {
        uploadFiles(files);
      }
    },
    [uploadFiles]
  );

  const handleReferenceFileChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const files = event.target.files;
      if (files?.length) {
        uploadFiles(files);
        setExternalReferenceOpen(false);
      }
      event.target.value = "";
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

  const handleComposerSurfacePointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (e.button !== 0 || isComposerResizing) return;
      const target = e.target;
      if (!(target instanceof HTMLElement)) return;
      if (
        target.closest(
          'button, input, textarea, select, a, [role="button"], [data-no-composer-drag]'
        )
      ) {
        return;
      }
      handleComposerPointerDown(e);
    },
    [handleComposerPointerDown, isComposerResizing]
  );

  const handleComposerClick = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      const target = event.target;
      if (
        target instanceof HTMLElement &&
        target.closest(
          'button, input, textarea, select, a, [role="button"], [data-no-composer-drag]'
        )
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
      setIsComposerDragging(false);
      setIsComposerResizing(false);
      setIsComposerSnapping(true);
      window.setTimeout(() => setIsComposerSnapping(false), 420);
    };
    window.addEventListener("sd2:reset-layout", resetLayout);
    return () => window.removeEventListener("sd2:reset-layout", resetLayout);
  }, []);

  useEffect(() => {
    if (!promptExpanded && !externalReferenceOpen && !paramsOpen) return;
    const handleOutsidePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (
        target instanceof Node &&
        composerRef.current?.contains(target)
      ) {
        return;
      }
      setPromptExpanded(false);
      setExternalReferenceOpen(false);
      setParamsOpen(false);
    };
    document.addEventListener("pointerdown", handleOutsidePointerDown, true);
    return () => {
      document.removeEventListener("pointerdown", handleOutsidePointerDown, true);
    };
  }, [externalReferenceOpen, paramsOpen, promptExpanded]);

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
  const isFirstLastMode = params.mode === "first_last_frame";
  const showReferenceSlot =
    !isFirstLastMode && (!isAlibaba || happyHorseMode !== "t2v");
  const primaryReference =
    references.find((ref) => ref.preview || ref.type === "image") ??
    references[0];
  const referencePreviewUrl =
    primaryReference?.preview ??
    (primaryReference?.type === "image" ? primaryReference.url : undefined);
  const composerModeLabel = isAlibaba
    ? currentModel.happyHorseMode === "t2v"
      ? "Text-to-video"
      : currentModel.happyHorseMode === "i2v"
      ? "Image-to-video"
      : "Reference-to-video"
    : params.mode === "reference"
    ? "Reference"
    : "Keyframe";
  const summaryModeLabel = isAlibaba
    ? currentModel.happyHorseMode === "t2v"
      ? "TEXT"
      : currentModel.happyHorseMode === "i2v"
      ? "IMAGE"
      : "REFERENCE"
    : params.mode === "first_last_frame"
    ? "KEYFRAME"
    : "REFERENCE";
  const summaryModelLabel = isAlibaba ? "HappyHorse" : currentModel.name;
  const summaryRatioLabel =
    currentModel.happyHorseMode === "i2v"
      ? "SOURCE"
      : params.ratio === "adaptive"
      ? "AUTO"
      : params.ratio;
  const composerSummary = [
    summaryModeLabel,
    "VIDEO",
    summaryModelLabel,
    summaryRatioLabel,
  ].join(" · ");
  const referenceFileAccept = isAlibaba
    ? "image/jpeg,image/jpg,image/png,image/bmp,image/webp"
    : "image/*,video/*,audio/*";
  const referenceFileMultiple = !(isAlibaba && happyHorseMode === "i2v");

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
  }, [clampComposerOffset, externalReferenceOpen, isExpanded, paramsOpen, showReferenceSlot]);

  useEffect(() => {
    if (!showReferenceSlot) {
      setIsReferenceSlotOver(false);
      setExternalReferenceOpen(false);
    }
  }, [showReferenceSlot]);

  const hasFirstFrame = references.some((r) => r.role === "first_frame");
  const hasLastFrame = references.some((r) => r.role === "last_frame");
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
    if (!demoMode) clearDemoTasks();
  }, [clearDemoTasks, demoMode, tasks.length]);

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
    if (generateIssue || (!demoMode && !activeApiKey)) {
      setError(generateIssue || "API Key를 입력하세요.");
      return;
    }
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
      localIds.forEach((localId, index) => {
        window.setTimeout(() => {
          updateTask(localId, {
            taskId: `demo-${localId}`,
            status: "running",
          });
        }, 500 + index * 180);
        window.setTimeout(() => {
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
            usage: {
              total_tokens: 108000,
              output_video_duration:
                singleParams.durationType === "seconds"
                  ? singleParams.duration
                  : 5,
              video_count: 1,
              SR: singleParams.resolution.replace("p", ""),
              ratio:
                singleParams.ratio === "adaptive" ? "16:9" : singleParams.ratio,
            },
          });
        }, 1800 + index * 320);
      });
      return;
    }

    const key = activeApiKey;
    if (!key) return;

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
    demoMode,
    prompt,
    generateIssue,
    references,
    params,
    addTask,
    updateTask,
    pollTask,
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
              >
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
                  } ${primaryReference ? "reference-slot-card-filled" : ""}`}
                  title="파일 첨부"
                >
                  {referencePreviewUrl && (
                    <img
                      src={referencePreviewUrl}
                      alt=""
                      draggable={false}
                      className="absolute inset-0 h-full w-full object-cover opacity-75"
                    />
                  )}
                  <div className="reference-slot-scrim absolute inset-0" />
                  <div className="reference-slot-plus relative z-10 flex h-10 w-10 items-center justify-center rounded-full">
                    <Plus className="h-6 w-6" />
                  </div>
                  <span className="reference-slot-label absolute bottom-3 left-0 right-0 z-10 block text-xs font-black uppercase leading-none tracking-[0.08em]">
                    FILE
                  </span>
                </button>

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

                <input
                  ref={referenceFileInputRef}
                  type="file"
                  accept={referenceFileAccept}
                  multiple={referenceFileMultiple}
                  className="hidden"
                  onChange={handleReferenceFileChange}
                />

                {externalReferenceOpen && (
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
              >
                {(["first_frame", "last_frame"] as const).map((role) => {
                  const frame = references.find((ref) => ref.role === role);
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
                      className={`keyframe-slot-card group relative flex h-24 w-24 cursor-grab flex-col items-center justify-center gap-2 overflow-hidden rounded-2xl border p-3 text-center transition-all active:cursor-grabbing ${
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
                      <div className="keyframe-slot-plus relative z-10 flex h-9 w-9 items-center justify-center rounded-full bg-white/12 text-white shadow-[inset_0_1px_0_rgb(255_255_255_/_0.18)]">
                        <Plus className="h-6 w-6" />
                      </div>
                      <span className="relative z-10 whitespace-pre-line text-xs font-black uppercase leading-tight tracking-[0.06em] text-white/82">
                        {meta.label.replace(" ", "\n")}
                      </span>
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
            <button
              type="button"
              aria-label="프롬프트 창 이동"
              onPointerDown={handleComposerPointerDown}
              onPointerMove={handleComposerPointerMove}
              onPointerUp={finishComposerDrag}
              onPointerCancel={finishComposerDrag}
              className={`glass-chip absolute -top-8 left-1/2 z-30 -translate-x-1/2 pointer-events-auto h-5 w-11 rounded-full flex items-center justify-center text-gray-400 hover:text-primary-600 hover:border-primary-200 cursor-grab active:cursor-grabbing transition-colors ${
                isComposerDragging ? "text-primary-600 border-primary-300" : ""
              }`}
              title="프롬프트 창 이동"
            >
              <GripHorizontal className="w-3.5 h-3.5" />
            </button>
            <div className="pointer-events-auto">
              <div
                className={`composer-shell glass-card subtle-glow relative cursor-move rounded-2xl border overflow-hidden transition-[border-color,box-shadow] duration-200 ${
                  isDragOver
                    ? "border-primary-400 ring-2 ring-primary-200"
                    : "border-white/60"
                }`}
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
                {isDragOver && (
                  <div className="glass-popover absolute inset-0 z-10 flex flex-col items-center justify-center bg-primary-50/90 pointer-events-none rounded-2xl border-2 border-dashed border-primary-400">
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

                {/* Prompt Input */}
                <div className="px-4 py-2" data-prompt-editor-region>
                  <PromptEditor
                    ref={promptEditorRef}
                    value={prompt}
                    onChange={handlePromptChange}
                    onPaste={handlePaste}
                    onFocus={() => setPromptExpanded(true)}
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
                          : params.mode === "first_last_frame"
                          ? "Describe camera or action in the scene..."
                          : "Describe your scene with visual references..."
                        : isAlibaba
                        ? "Describe the video..."
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
                  data-no-composer-drag
                >
                  {isExpanded ? (
                    <div className="flex min-w-0 items-center gap-1.5 text-[11px] text-gray-500 flex-wrap">
                      <span className="glass-chip flex items-center gap-1 px-2 py-1 text-primary-600 rounded-lg font-medium text-[11px]">
                        {composerModeLabel}
                      </span>

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
                  ) : (
                    <div aria-hidden="true" />
                  )}

                  <div className="flex min-w-0 items-center gap-2 shrink-0 ml-2">
                    <span className="hidden text-[10px] text-gray-400 sm:inline">
                      {isAlibaba
                        ? "DashScope usage"
                        : `~${(estimateTokens(params, hasVideoRef) / 1000).toFixed(0)}K tokens · $${cost.toFixed(3)}`}
                    </span>
                    <button
                      type="button"
                      onClick={() => setParamsOpen((open) => !open)}
                      className="composer-settings-summary glass-chip flex max-w-[min(54vw,24rem)] items-center gap-1.5 rounded-xl px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-gray-500 transition-colors hover:text-gray-800"
                      title="Generation settings"
                    >
                      <span className="truncate">{composerSummary}</span>
                      <ChevronDown className="h-3.5 w-3.5 shrink-0 text-gray-400" />
                    </button>
                    <button
                      type="button"
                      onClick={handleGenerate}
                      disabled={generateDisabled}
                      title={generateDisabled ? "파일 업로드가 끝난 뒤 생성할 수 있습니다." : "Generate"}
                      className="composer-generate-button primary-button shrink-0 disabled:bg-gray-200 disabled:text-gray-300 text-white transition-all disabled:shadow-none"
                    >
                      <Play className="w-4 h-4" />
                    </button>
                  </div>
                </div>

              </div>
              {paramsOpen && (
                <div
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
        </div>
      </div>
    </div>
  );
}
