"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { Sparkles, X } from "lucide-react";

type TutorialStep = {
  selector: string;
  title: string;
  body: string;
};

const STEPS: TutorialStep[] = [
  {
    selector: '[data-tour="prompt-editor"]',
    title: "프롬프트 입력",
    body: "여기에 장면을 쓰고 @를 입력하면 첨부한 이미지, 비디오, 오디오를 프롬프트에 연결할 수 있습니다.",
  },
  {
    selector: '[data-tour="composer-mode"]',
    title: "모드 전환",
    body: "Reference, First/Last, Text 모드는 여기서 전환합니다. Keyframe 작업은 First/Last를 선택하면 됩니다.",
  },
  {
    selector: '[data-tour="composer-sound"]',
    title: "사운드",
    body: "Sound 버튼을 눌러 오디오 생성 포함 여부를 바로 켜고 끌 수 있습니다.",
  },
  {
    selector: '[data-tour="composer-settings"]',
    title: "세부 설정",
    body: "모델, 해상도, 비율, 초수 같은 세부 설정은 이 버튼에서 열 수 있습니다.",
  },
  {
    selector: '[data-tour="generate-button"]',
    title: "생성 시작",
    body: "설정과 프롬프트를 확인한 뒤 이 버튼으로 생성 요청을 보냅니다.",
  },
  {
    selector: '[data-tour="view-toggle"]',
    title: "스크롤 / 그리드 전환",
    body: "생성 결과는 스크롤형 보드와 그리드형 보기 사이에서 전환할 수 있습니다.",
  },
  {
    selector: '[data-tour="theme-toggle"]',
    title: "다크모드",
    body: "테마 전환은 여기 있습니다. 기본은 다크모드이고, 필요하면 라이트모드로 바꿀 수 있습니다.",
  },
];

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function getVisibleTarget(selector: string): HTMLElement | null {
  const targets = document.querySelectorAll<HTMLElement>(selector);
  for (let i = 0; i < targets.length; i += 1) {
    const target = targets[i];
    const rect = target.getBoundingClientRect();
    const style = window.getComputedStyle(target);
    if (
      rect.width > 0 &&
      rect.height > 0 &&
      style.display !== "none" &&
      style.visibility !== "hidden"
    ) {
      return target;
    }
  }
  return null;
}

type TargetRect = {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
};

export default function InteractiveTutorial({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [index, setIndex] = useState(0);
  const [rect, setRect] = useState<TargetRect | null>(null);
  const rafRef = useRef<number | null>(null);
  const step = STEPS[index];

  const getTarget = useCallback(() => {
    if (!step) return null;
    return getVisibleTarget(step.selector);
  }, [step]);

  const findAvailableIndex = useCallback(
    (start: number, direction: 1 | -1) => {
      for (
        let i = start;
        direction > 0 ? i < STEPS.length : i >= 0;
        i += direction
      ) {
        if (getVisibleTarget(STEPS[i].selector)) return i;
      }
      return null;
    },
    []
  );

  const goNext = useCallback(() => {
    setIndex((current) => {
      const next = findAvailableIndex(current + 1, 1);
      return next ?? current;
    });
  }, [findAvailableIndex]);

  const goPrevious = useCallback(() => {
    setIndex((current) => {
      const previous = findAvailableIndex(current - 1, -1);
      return previous ?? current;
    });
  }, [findAvailableIndex]);

  const measure = useCallback(() => {
    if (!open || !step) return;
    const target = getTarget();
    if (!target) {
      setRect(null);
      return;
    }
    const next = target.getBoundingClientRect();
    if (next.width <= 0 || next.height <= 0) {
      setRect(null);
      return;
    }
    setRect({
      left: next.left,
      top: next.top,
      right: next.right,
      bottom: next.bottom,
      width: next.width,
      height: next.height,
    });
  }, [getTarget, open, step]);

  const scheduleMeasure = useCallback(() => {
    if (rafRef.current !== null) {
      window.cancelAnimationFrame(rafRef.current);
    }
    rafRef.current = window.requestAnimationFrame(() => {
      rafRef.current = null;
      measure();
    });
  }, [measure]);

  useEffect(() => {
    if (!open) return;
    setIndex(0);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const target = getTarget();
    target?.scrollIntoView({ block: "center", inline: "center", behavior: "smooth" });
    scheduleMeasure();
    const timers = [90, 260, 520].map((delay) =>
      window.setTimeout(scheduleMeasure, delay)
    );
    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, [getTarget, index, open, scheduleMeasure]);

  useEffect(() => {
    if (!open) return;
    window.addEventListener("resize", scheduleMeasure);
    window.addEventListener("scroll", scheduleMeasure, true);
    return () => {
      window.removeEventListener("resize", scheduleMeasure);
      window.removeEventListener("scroll", scheduleMeasure, true);
      if (rafRef.current !== null) {
        window.cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [open, scheduleMeasure]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
      if (event.key === "ArrowRight" || event.key === "Enter") {
        const next = findAvailableIndex(index + 1, 1);
        if (next === null) onClose();
        else setIndex(next);
      }
      if (event.key === "ArrowLeft") {
        goPrevious();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [findAvailableIndex, goPrevious, index, onClose, open]);

  const highlightStyle = useMemo<CSSProperties | undefined>(() => {
    if (!rect) return undefined;
    const pad = 12;
    const left = clamp(rect.left - pad, 12, window.innerWidth - 24);
    const top = clamp(rect.top - pad, 12, window.innerHeight - 24);
    const width = Math.min(rect.width + pad * 2, window.innerWidth - left - 12);
    const height = Math.min(rect.height + pad * 2, window.innerHeight - top - 12);
    return {
      left,
      top,
      width,
      height,
    };
  }, [rect]);

  const hazePanels = useMemo<CSSProperties[] | null>(() => {
    if (!highlightStyle) return null;
    const left = Number(highlightStyle.left);
    const top = Number(highlightStyle.top);
    const width = Number(highlightStyle.width);
    const height = Number(highlightStyle.height);
    const right = left + width;
    const bottom = top + height;
    return [
      { left: 0, top: 0, width: "100vw", height: top },
      { left: 0, top, width: left, height },
      { left: right, top, right: 0, height },
      { left: 0, top: bottom, width: "100vw", bottom: 0 },
    ];
  }, [highlightStyle]);

  const cardStyle = useMemo<CSSProperties>(() => {
    if (!rect) {
      return {
        left: "50%",
        top: "50%",
        transform: "translate(-50%, -50%)",
      };
    }
    const width = Math.min(384, window.innerWidth - 32);
    const height = 245;
    const gap = 22;
    const preferRight = rect.right + width + gap < window.innerWidth;
    const preferLeft = rect.left - width - gap > 0;
    const left = preferRight
      ? rect.right + gap
      : preferLeft
      ? rect.left - width - gap
      : clamp(rect.left + rect.width / 2 - width / 2, 16, window.innerWidth - width - 16);
    const hasSideSpace = preferRight || preferLeft;
    const belowTop = rect.bottom + gap;
    const aboveTop = rect.top - height - gap;
    const top = hasSideSpace
      ? clamp(rect.top + rect.height / 2 - height / 2, 16, window.innerHeight - height - 16)
      : belowTop + height < window.innerHeight
      ? belowTop
      : clamp(aboveTop, 16, window.innerHeight - height - 16);
    return { left, top, width };
  }, [rect]);

  if (!open || !step) return null;

  const previousAvailableIndex = findAvailableIndex(index - 1, -1);
  const nextAvailableIndex = findAvailableIndex(index + 1, 1);
  const isLast = nextAvailableIndex === null;

  return (
    <div
      className="tutorial-overlay"
      role="dialog"
      aria-modal="true"
      data-tutorial-overlay
    >
      {hazePanels ? (
        hazePanels.map((style, i) => (
          <div key={i} className="tutorial-haze-pane" style={style} />
        ))
      ) : (
        <div className="tutorial-haze-full" />
      )}
      {highlightStyle && (
        <div className="tutorial-highlight" style={highlightStyle} />
      )}
      <div className="tutorial-card" style={cardStyle}>
        <div className="tutorial-card-top">
          <span className="tutorial-badge">
            <Sparkles className="h-3.5 w-3.5" />
            Guide {index + 1}/{STEPS.length}
          </span>
          <button
            type="button"
            className="tutorial-close"
            onClick={onClose}
            aria-label="튜토리얼 닫기"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <h2>{step.title}</h2>
        <p>{step.body}</p>
        <div className="tutorial-progress" aria-hidden>
          {STEPS.map((item, i) => (
            <span
              key={item.selector}
              className={i <= index ? "tutorial-progress-dot-active" : ""}
            />
          ))}
        </div>
        <div className="tutorial-actions">
          <button
            type="button"
            className="tutorial-button tutorial-button-ghost"
            disabled={previousAvailableIndex === null}
            onClick={goPrevious}
          >
            이전
          </button>
          <button
            type="button"
            className="tutorial-button tutorial-button-primary"
            onClick={() => {
              if (isLast) {
                onClose();
              } else {
                goNext();
              }
            }}
          >
            {isLast ? "끝내기" : "다음"}
          </button>
        </div>
      </div>
    </div>
  );
}
