"use client";

import {
  useRef,
  useState,
  useEffect,
  useCallback,
  useMemo,
  forwardRef,
  useImperativeHandle,
  type ChangeEvent,
  type ClipboardEvent,
  type CSSProperties,
  type KeyboardEvent,
} from "react";
import { createPortal } from "react-dom";
import { Image as ImageIcon, Film, Music, UserCheck } from "lucide-react";
import { useAppStore } from "@/lib/store";
import { getRefTags } from "@/lib/refTags";

const DROPDOWN_WIDTH = 230;
const DROPDOWN_MAX_HEIGHT = 224;

type TagItem = {
  id: string;
  type: "image" | "video" | "audio";
  name: string;
  url: string;
  preview?: string;
  tag: string;
};

type HighlightPart =
  | { kind: "text"; text: string; key: string }
  | { kind: "tag"; text: string; key: string; type: TagItem["type"] };

function getMentionState(textarea?: HTMLTextAreaElement | null): {
  query: string;
  start: number;
  cursor: number;
} | null {
  if (!textarea) return null;
  const cursor = textarea.selectionStart ?? 0;
  const before = textarea.value.slice(0, cursor);
  const match = /@([A-Za-z0-9]*)$/.exec(before);
  if (!match) return null;

  const start = cursor - match[0].length;
  return { query: match[1], start, cursor };
}

function tagAliases(item: TagItem): string[] {
  const n = item.tag.replace(/^\D+/, "");
  if (item.type === "image") return [item.tag, `@image${n}`];
  if (item.type === "video") return [item.tag, `@video${n}`];
  return [item.tag, `@audio${n}`];
}

function makeHighlightParts(value: string, items: TagItem[]): HighlightPart[] {
  if (!value) return [];
  const aliases = new Map<string, TagItem>();
  items.forEach((item) => {
    tagAliases(item).forEach((alias) => aliases.set(alias.toLowerCase(), item));
  });

  const parts: HighlightPart[] = [];
  const regex = /@(img|image|vid|video|aud|audio)\d+/gi;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(value))) {
    const text = match[0];
    const item = aliases.get(text.toLowerCase());
    if (!item) continue;
    if (match.index > lastIndex) {
      parts.push({
        kind: "text",
        text: value.slice(lastIndex, match.index),
        key: `t-${lastIndex}`,
      });
    }
    parts.push({
      kind: "tag",
      text,
      type: item.type,
      key: `g-${match.index}`,
    });
    lastIndex = match.index + text.length;
  }
  if (lastIndex < value.length) {
    parts.push({
      kind: "text",
      text: value.slice(lastIndex),
      key: `t-${lastIndex}`,
    });
  }
  return parts;
}

function itemMatchesQuery(item: TagItem, query: string): boolean {
  const q = query.toLowerCase();
  if (!q) return true;
  const tag = item.tag.toLowerCase().slice(1);
  const n = tag.replace(/^\D+/, "");
  const aliases =
    item.type === "image"
      ? [`img${n}`, `image${n}`, "img", "image"]
      : item.type === "video"
      ? [`vid${n}`, `video${n}`, "vid", "video"]
      : [`aud${n}`, `audio${n}`, "aud", "audio"];

  return (
    tag.startsWith(q) ||
    aliases.some((alias) => alias.startsWith(q)) ||
    item.name.toLowerCase().includes(q)
  );
}

function getCaretCoordinates(
  textarea: HTMLTextAreaElement,
  position: number
): { top: number; left: number; height: number } {
  const style = window.getComputedStyle(textarea);
  const mirror = document.createElement("div");
  const props = [
    "boxSizing",
    "width",
    "borderTopWidth",
    "borderRightWidth",
    "borderBottomWidth",
    "borderLeftWidth",
    "paddingTop",
    "paddingRight",
    "paddingBottom",
    "paddingLeft",
    "fontStyle",
    "fontVariant",
    "fontWeight",
    "fontStretch",
    "fontSize",
    "lineHeight",
    "fontFamily",
    "letterSpacing",
    "wordSpacing",
    "tabSize",
    "textIndent",
    "textTransform",
    "textAlign",
  ];

  mirror.style.position = "absolute";
  mirror.style.visibility = "hidden";
  mirror.style.left = "-9999px";
  mirror.style.top = "0";
  mirror.style.whiteSpace = "pre-wrap";
  mirror.style.overflowWrap = "break-word";

  for (const prop of props) {
    const cssProp = prop.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`);
    mirror.style.setProperty(cssProp, style.getPropertyValue(cssProp));
  }

  mirror.textContent = textarea.value.slice(0, position);
  const marker = document.createElement("span");
  marker.textContent = textarea.value.slice(position, position + 1) || ".";
  mirror.appendChild(marker);
  document.body.appendChild(mirror);

  const result = {
    top: marker.offsetTop,
    left: marker.offsetLeft,
    height: parseFloat(style.lineHeight) || parseFloat(style.fontSize) * 1.2,
  };
  document.body.removeChild(mirror);
  return result;
}

export interface PromptEditorHandle {
  focus: () => void;
  insertAtCursor: (text: string) => void;
}

interface Props {
  value: string;
  onChange: (v: string) => void;
  onPaste?: (e: ClipboardEvent<HTMLTextAreaElement>) => void;
  onFocus?: () => void;
  onBlur?: () => void;
  rows?: number;
  placeholder?: string;
  className?: string;
  style?: CSSProperties;
}

const PromptEditor = forwardRef<PromptEditorHandle, Props>(function PromptEditor(
  {
    value,
    onChange,
    onPaste,
    onFocus,
    onBlur,
    rows = 2,
    placeholder,
    className = "",
    style,
  },
  outerRef
) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const references = useAppStore((s) => s.references);
  const tagsById = useMemo(() => getRefTags(references), [references]);
  const tagItems = useMemo<TagItem[]>(
    () =>
      references.map((r) => ({
        id: r.id,
        type: r.type,
        name: r.name,
        url: r.url,
        preview: r.preview,
        tag: tagsById[r.id],
      })),
    [references, tagsById]
  );

  const [acOpen, setAcOpen] = useState(false);
  const [acQuery, setAcQuery] = useState("");
  const [acStart, setAcStart] = useState(-1);
  const [acIndex, setAcIndex] = useState(0);
  const [portalEl, setPortalEl] = useState<HTMLElement | null>(null);
  const [acPos, setAcPos] = useState({
    left: 0,
    top: 0,
    flipDown: false,
  });
  const [scrollOffset, setScrollOffset] = useState({ left: 0, top: 0 });

  useEffect(() => {
    setPortalEl(document.body);
  }, []);

  const filtered = useMemo(() => {
    if (tagItems.length === 0) return [];
    return tagItems.filter((item) => itemMatchesQuery(item, acQuery));
  }, [tagItems, acQuery]);
  const highlightParts = useMemo(
    () => makeHighlightParts(value, tagItems),
    [tagItems, value]
  );

  useEffect(() => {
    if (!acOpen) return;
    setAcIndex((i) => Math.min(i, Math.max(0, filtered.length - 1)));
  }, [acOpen, filtered.length]);

  const placeAutocomplete = useCallback(() => {
    const textarea = textareaRef.current;
    if (!textarea || tagItems.length === 0) {
      setAcOpen(false);
      return;
    }

    const mention = getMentionState(textarea);
    if (!mention) {
      setAcOpen(false);
      return;
    }

    const coords = getCaretCoordinates(textarea, mention.start);
    const rect = textarea.getBoundingClientRect();
    const caretX = rect.left + coords.left - textarea.scrollLeft;
    const caretTop = rect.top + coords.top - textarea.scrollTop;
    const caretBottom = caretTop + coords.height;
    const spaceAbove = caretTop;
    const spaceBelow = window.innerHeight - caretBottom;
    const flipDown =
      spaceAbove < DROPDOWN_MAX_HEIGHT && spaceBelow > spaceAbove;
    const left = Math.max(
      8,
      Math.min(window.innerWidth - DROPDOWN_WIDTH - 8, caretX)
    );

    setAcPos({
      left,
      top: flipDown ? caretBottom + 4 : caretTop - 4,
      flipDown,
    });
    setAcOpen(true);
    setAcQuery(mention.query);
    setAcStart(mention.start);
  }, [tagItems.length]);

  const queueAutocompletePlacement = useCallback(() => {
    requestAnimationFrame(() => {
      placeAutocomplete();
      window.setTimeout(placeAutocomplete, 0);
    });
  }, [placeAutocomplete]);

  const syncAutocomplete = useCallback(
    (textarea?: HTMLTextAreaElement | null) => {
      if (tagItems.length === 0) {
        setAcOpen(false);
        return;
      }
      if (!textarea) {
        setAcOpen(false);
        return;
      }
      const mention = getMentionState(textarea);
      if (!mention) {
        setAcOpen(false);
        return;
      }
      const hasMatch = tagItems.some((item) =>
        itemMatchesQuery(item, mention.query)
      );
      if (!hasMatch) {
        setAcOpen(false);
        return;
      }
      const coords = getCaretCoordinates(textarea, mention.start);
      const rect = textarea.getBoundingClientRect();
      const caretX = rect.left + coords.left - textarea.scrollLeft;
      const caretTop = rect.top + coords.top - textarea.scrollTop;
      const caretBottom = caretTop + coords.height;
      const spaceAbove = caretTop;
      const spaceBelow = window.innerHeight - caretBottom;
      const flipDown =
        spaceAbove < DROPDOWN_MAX_HEIGHT && spaceBelow > spaceAbove;
      const left = Math.max(
        8,
        Math.min(window.innerWidth - DROPDOWN_WIDTH - 8, caretX)
      );

      setAcPos({
        left,
        top: flipDown ? caretBottom + 4 : caretTop - 4,
        flipDown,
      });
      setAcOpen(true);
      setAcQuery(mention.query);
      setAcStart(mention.start);
    },
    [tagItems]
  );

  useEffect(() => {
    if (!acOpen) return;
    const close = () => setAcOpen(false);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [acOpen]);

  const acceptAutocomplete = useCallback(
    (item: TagItem, replacementStart = acStart, replacementEnd?: number) => {
      const textarea = textareaRef.current;
      if (!textarea || replacementStart < 0) return;
      const currentValue = textarea.value;
      const cursor = replacementEnd ?? textarea.selectionStart ?? 0;
      const head = currentValue.slice(0, replacementStart);
      const tail = currentValue.slice(cursor);
      const insertion = `${item.tag}${tail.startsWith(" ") ? "" : " "}`;
      const next = head + insertion + tail;
      const nextPos = head.length + insertion.length;
      onChange(next);
      setAcOpen(false);
      requestAnimationFrame(() => {
        textarea.focus();
        textarea.setSelectionRange(nextPos, nextPos);
      });
    },
    [acStart, onChange]
  );

  useImperativeHandle(
    outerRef,
    () => ({
      focus: () => textareaRef.current?.focus(),
      insertAtCursor: (text: string) => {
        const textarea = textareaRef.current;
        if (!textarea) {
          onChange(value + text);
          return;
        }
        const start = textarea.selectionStart ?? value.length;
        const end = textarea.selectionEnd ?? start;
        const next = value.slice(0, start) + text + value.slice(end);
        const nextPos = start + text.length;
        onChange(next);
        requestAnimationFrame(() => {
          textarea.focus();
          textarea.setSelectionRange(nextPos, nextPos);
        });
      },
    }),
    [onChange, value]
  );

  const handleChange = useCallback(
    (e: ChangeEvent<HTMLTextAreaElement>) => {
      const textarea = e.currentTarget;
      onChange(e.target.value);
      syncAutocomplete(textarea);
      requestAnimationFrame(() => syncAutocomplete(textarea));
    },
    [onChange, syncAutocomplete]
  );

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      const textarea = e.currentTarget;
      if (e.key === "@" && !acOpen) {
        requestAnimationFrame(() => syncAutocomplete(textarea));
        window.setTimeout(() => syncAutocomplete(textarea), 0);
        return;
      }
      const mention = getMentionState(textarea);
      const mentionMatches = mention
        ? tagItems.filter((item) =>
          itemMatchesQuery(item, mention.query)
        )
        : [];

      if (!acOpen && mention && mentionMatches.length > 0) {
        if (e.key === "ArrowDown" || e.key === "ArrowUp") {
          e.preventDefault();
          setAcIndex(e.key === "ArrowUp" ? mentionMatches.length - 1 : 0);
          syncAutocomplete(textarea);
          return;
        }
        if (e.key === "Tab" || e.key === "Enter") {
          e.preventDefault();
          acceptAutocomplete(mentionMatches[0], mention.start, mention.cursor);
          return;
        }
      }

      const activeMatches = mentionMatches.length > 0 ? mentionMatches : filtered;
      if (!acOpen || activeMatches.length === 0) return;
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setAcIndex((i) => (i + 1) % activeMatches.length);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setAcIndex((i) => (i - 1 + activeMatches.length) % activeMatches.length);
      } else if (e.key === "Tab" || e.key === "Enter") {
        e.preventDefault();
        const safeIndex = Math.min(acIndex, activeMatches.length - 1);
        const selected = activeMatches[safeIndex] ?? activeMatches[0];
        if (mention) {
          acceptAutocomplete(selected, mention.start, mention.cursor);
        } else {
          acceptAutocomplete(selected);
        }
      } else if (e.key === "Escape") {
        e.preventDefault();
        setAcOpen(false);
      }
    },
    [
      acceptAutocomplete,
      acIndex,
      acOpen,
      filtered,
      queueAutocompletePlacement,
      syncAutocomplete,
      tagItems,
    ]
  );

  const refreshAutocomplete = useCallback(() => {
    queueAutocompletePlacement();
  }, [queueAutocompletePlacement]);

  return (
    <div
      className={`prompt-editor-shell relative border rounded-xl text-sm leading-relaxed text-gray-700 focus-within:ring-2 focus-within:ring-primary-400 focus-within:border-transparent transition-all ${className}`}
      style={style}
    >
      <div className="prompt-tag-highlight-layer" aria-hidden>
        <div
          className="prompt-tag-highlight-text"
          style={{
            transform: `translate(${-scrollOffset.left}px, ${-scrollOffset.top}px)`,
          }}
        >
          {highlightParts.map((part) =>
            part.kind === "tag" ? (
              <span
                key={part.key}
                className={`prompt-tag-highlight prompt-tag-highlight-${part.type}`}
              >
                {part.text}
              </span>
            ) : (
              <span key={part.key}>{part.text}</span>
            )
          )}
        </div>
      </div>
      <textarea
        ref={textareaRef}
        value={value}
        onChange={handleChange}
        onPaste={onPaste}
        onKeyDown={handleKeyDown}
        onKeyUp={refreshAutocomplete}
        onClick={refreshAutocomplete}
        onScroll={(event) =>
          setScrollOffset({
            left: event.currentTarget.scrollLeft,
            top: event.currentTarget.scrollTop,
          })
        }
        onFocus={() => {
          onFocus?.();
          queueAutocompletePlacement();
        }}
        onBlur={() => {
          setTimeout(() => setAcOpen(false), 120);
          onBlur?.();
        }}
        rows={rows}
        placeholder={placeholder}
        spellCheck={false}
        className="prompt-editor-textarea block w-full px-3 py-2 bg-transparent border-0 resize-none whitespace-pre-wrap break-words focus:outline-none focus:ring-0 placeholder:text-gray-400 text-gray-700"
      />

      {portalEl &&
        acOpen &&
        filtered.length > 0 &&
        createPortal(
          <div
            className="mention-popover fixed z-[1000] rounded-lg border py-1 max-h-56 overflow-y-auto"
            data-mention-popover
            style={{
              left: acPos.left,
              top: acPos.top,
              width: DROPDOWN_WIDTH,
              transform: acPos.flipDown ? undefined : "translateY(-100%)",
            }}
            onPointerDown={(e) => e.preventDefault()}
            onMouseDown={(e) => e.preventDefault()}
          >
            {filtered.map((item, i) => (
              <button
                key={item.id}
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  acceptAutocomplete(item);
                }}
                onMouseEnter={() => setAcIndex(i)}
                className={`mention-option w-full text-left px-2.5 py-1.5 text-[11px] flex items-center gap-1.5 ${
                  i === acIndex ? "mention-option-active bg-primary-50" : "hover:bg-gray-50"
                }`}
              >
                {item.type === "image" && item.preview ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={item.preview}
                    alt=""
                    className="w-5 h-5 object-cover rounded shrink-0"
                  />
                ) : item.url?.startsWith("asset://") ? (
                  <UserCheck className="w-3.5 h-3.5 text-green-500 shrink-0" />
                ) : item.type === "video" ? (
                  <Film className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                ) : item.type === "audio" ? (
                  <Music className="w-3.5 h-3.5 text-purple-400 shrink-0" />
                ) : (
                  <ImageIcon className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                )}
                <span className="font-mono text-primary-600 font-semibold">
                  {item.tag}
                </span>
                <span className="text-gray-400 truncate flex-1 text-[10px]">
                  {item.name}
                </span>
              </button>
            ))}
          </div>,
          portalEl
        )}
    </div>
  );
});

export default PromptEditor;
