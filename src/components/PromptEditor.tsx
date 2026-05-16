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
  type KeyboardEvent,
} from "react";
import { createPortal } from "react-dom";
import { Image as ImageIcon, Film, Music, UserCheck } from "lucide-react";
import { useAppStore } from "@/lib/store";
import { getRefTags } from "@/lib/refTags";

const DROPDOWN_WIDTH = 230;
const DROPDOWN_MAX_HEIGHT = 224;

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
  },
  outerRef
) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const references = useAppStore((s) => s.references);
  const tagsById = useMemo(() => getRefTags(references), [references]);
  const tagItems = useMemo(
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

  useEffect(() => {
    setPortalEl(document.body);
  }, []);

  const filtered = useMemo(() => {
    if (tagItems.length === 0) return [];
    const q = acQuery.toLowerCase();
    if (!q) return tagItems;
    return tagItems.filter(
      (item) =>
        item.tag.toLowerCase().slice(1).startsWith(q) ||
        item.name.toLowerCase().includes(q)
    );
  }, [tagItems, acQuery]);

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

    const currentValue = textarea.value;
    const cursor = textarea.selectionStart ?? 0;
    const before = currentValue.slice(0, cursor);
    const match = /@([A-Za-z0-9]*)$/.exec(before);
    if (!match) {
      setAcOpen(false);
      return;
    }

    const start = cursor - match[0].length;
    const charBefore = start > 0 ? currentValue[start - 1] : " ";
    if (start !== 0 && !/\s/.test(charBefore)) {
      setAcOpen(false);
      return;
    }

    const coords = getCaretCoordinates(textarea, start);
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
    setAcQuery(match[1]);
    setAcStart(start);
  }, [tagItems.length]);

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
    (item: (typeof tagItems)[number]) => {
      const textarea = textareaRef.current;
      if (!textarea || acStart < 0) return;
      const currentValue = textarea.value;
      const cursor = textarea.selectionStart ?? 0;
      const head = currentValue.slice(0, acStart);
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
      onChange(e.target.value);
      requestAnimationFrame(() => {
        placeAutocomplete();
        requestAnimationFrame(placeAutocomplete);
      });
    },
    [onChange, placeAutocomplete]
  );

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "@" && !acOpen) {
        requestAnimationFrame(placeAutocomplete);
        return;
      }
      if (!acOpen || filtered.length === 0) return;
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setAcIndex((i) => (i + 1) % filtered.length);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setAcIndex((i) => (i - 1 + filtered.length) % filtered.length);
      } else if (e.key === "Tab" || e.key === "Enter") {
        e.preventDefault();
        acceptAutocomplete(filtered[acIndex]);
      } else if (e.key === "Escape") {
        e.preventDefault();
        setAcOpen(false);
      }
    },
    [acceptAutocomplete, acIndex, acOpen, filtered, placeAutocomplete]
  );

  const refreshAutocomplete = useCallback(() => {
    requestAnimationFrame(placeAutocomplete);
  }, [placeAutocomplete]);

  return (
    <div
      className={`prompt-editor-shell relative bg-surface-50 border border-gray-200 rounded-xl text-sm leading-relaxed text-gray-700 focus-within:ring-2 focus-within:ring-primary-400 focus-within:border-transparent transition-all ${className}`}
    >
      <textarea
        ref={textareaRef}
        value={value}
        onChange={handleChange}
        onPaste={onPaste}
        onKeyDown={handleKeyDown}
        onKeyUp={refreshAutocomplete}
        onClick={refreshAutocomplete}
        onFocus={onFocus}
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
            className="mention-popover fixed z-[1000] bg-white rounded-lg shadow-xl border border-gray-100 py-1 max-h-56 overflow-y-auto"
            style={{
              left: acPos.left,
              top: acPos.top,
              width: DROPDOWN_WIDTH,
              transform: acPos.flipDown ? undefined : "translateY(-100%)",
            }}
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
