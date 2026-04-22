"use client";

import {
  useRef,
  useState,
  useEffect,
  useCallback,
  useMemo,
  forwardRef,
  useImperativeHandle,
  type ReactNode,
  type ChangeEvent,
  type ClipboardEvent,
  type KeyboardEvent,
} from "react";
import { createPortal } from "react-dom";
import { Image as ImageIcon, Film, Music, UserCheck } from "lucide-react";
import { useAppStore } from "@/lib/store";
import { getRefTags } from "@/lib/refTags";

const DROPDOWN_WIDTH = 230;
const DROPDOWN_MAX_HEIGHT = 224; // tailwind max-h-56

const TAG_RE = /@(img|vid|aud)\d+/gi;

/**
 * Compute (x, y) of the caret at `position` within a textarea, relative to
 * the textarea's border-box top-left. Uses a hidden mirror element that
 * inherits all text-affecting styles, so the position matches what the
 * browser will render.
 */
function getCaretCoordinates(
  textarea: HTMLTextAreaElement,
  position: number
): { top: number; left: number; height: number } {
  const style = window.getComputedStyle(textarea);
  const div = document.createElement("div");

  const props = [
    "direction",
    "boxSizing",
    "width",
    "height",
    "overflowX",
    "overflowY",
    "borderTopWidth",
    "borderRightWidth",
    "borderBottomWidth",
    "borderLeftWidth",
    "borderStyle",
    "paddingTop",
    "paddingRight",
    "paddingBottom",
    "paddingLeft",
    "fontStyle",
    "fontVariant",
    "fontWeight",
    "fontStretch",
    "fontSize",
    "fontSizeAdjust",
    "lineHeight",
    "fontFamily",
    "textAlign",
    "textTransform",
    "textIndent",
    "textDecoration",
    "letterSpacing",
    "wordSpacing",
    "tabSize",
  ];

  div.style.position = "absolute";
  div.style.visibility = "hidden";
  div.style.top = "0";
  div.style.left = "-9999px";
  div.style.whiteSpace = "pre-wrap";
  div.style.wordWrap = "break-word";

  for (const prop of props) {
    const cssProp = prop.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`);
    div.style.setProperty(cssProp, style.getPropertyValue(cssProp));
  }

  div.textContent = textarea.value.substring(0, position);
  const span = document.createElement("span");
  span.textContent = textarea.value.substring(position) || ".";
  div.appendChild(span);

  document.body.appendChild(div);
  const top = span.offsetTop;
  const left = span.offsetLeft;
  const height =
    parseFloat(style.lineHeight) || parseFloat(style.fontSize) * 1.2;
  document.body.removeChild(div);

  return { top, left, height };
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
  const taRef = useRef<HTMLTextAreaElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);

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
  const validTags = useMemo(() => {
    const s = new Set<string>();
    Object.values(tagsById).forEach((t) => s.add(t.toLowerCase()));
    return s;
  }, [tagsById]);

  /* ───────────── Imperative API ───────────── */
  useImperativeHandle(
    outerRef,
    () => ({
      focus: () => taRef.current?.focus(),
      insertAtCursor: (text: string) => {
        const ta = taRef.current;
        if (!ta) {
          onChange(value + text);
          return;
        }
        const start = ta.selectionStart ?? value.length;
        const end = ta.selectionEnd ?? start;
        const next = value.slice(0, start) + text + value.slice(end);
        onChange(next);
        requestAnimationFrame(() => {
          ta.focus();
          const pos = start + text.length;
          ta.setSelectionRange(pos, pos);
        });
      },
    }),
    [value, onChange]
  );

  /* ───────────── Overlay highlighting ─────────────
   * NOTE: chips MUST NOT add horizontal padding/border, otherwise the rendered
   * width would diverge from the textarea text width and the caret/selection
   * would visually drift. We rely purely on background + color.
   */
  const overlay: ReactNode[] = useMemo(() => {
    const out: ReactNode[] = [];
    let lastIdx = 0;
    let m: RegExpExecArray | null;
    let i = 0;
    TAG_RE.lastIndex = 0;
    while ((m = TAG_RE.exec(value)) !== null) {
      if (m.index > lastIdx) {
        out.push(<span key={`t-${i++}`}>{value.slice(lastIdx, m.index)}</span>);
      }
      const tag = m[0].toLowerCase();
      const valid = validTags.has(tag);
      // CRITICAL: do NOT change font-weight, font-family, letter-spacing, or
      // anything that affects glyph advance width. The textarea always renders
      // text at the inherited weight; if the overlay's chip uses bold, glyphs
      // become wider than the textarea expects and the caret drifts after each
      // chip. Highlight purely with background + color.
      out.push(
        <span
          key={`c-${i++}`}
          className={
            valid
              ? "bg-primary-100 text-primary-700 rounded"
              : "bg-amber-100 text-amber-700 rounded line-through"
          }
        >
          {m[0]}
        </span>
      );
      lastIdx = m.index + m[0].length;
    }
    if (lastIdx < value.length) {
      out.push(<span key={`t-${i++}`}>{value.slice(lastIdx)}</span>);
    }
    out.push(<span key="end">&#8203;</span>);
    return out;
  }, [value, validTags]);

  const handleScroll = useCallback(() => {
    if (overlayRef.current && taRef.current) {
      overlayRef.current.scrollTop = taRef.current.scrollTop;
      overlayRef.current.scrollLeft = taRef.current.scrollLeft;
    }
  }, []);

  /* ───────────── Autocomplete dropdown ───────────── */
  const [acOpen, setAcOpen] = useState(false);
  const [acQuery, setAcQuery] = useState("");
  const [acStart, setAcStart] = useState(-1);
  const [acIndex, setAcIndex] = useState(0);
  const [acPos, setAcPos] = useState<{
    left: number;
    top: number;
    flipDown: boolean;
  }>({ left: 0, top: 0, flipDown: false });

  // Portal target — null on SSR, document.body once mounted on client.
  const [portalEl, setPortalEl] = useState<HTMLElement | null>(null);
  useEffect(() => {
    setPortalEl(document.body);
  }, []);

  const filtered = useMemo(() => {
    if (tagItems.length === 0) return [];
    const q = acQuery.toLowerCase();
    if (!q) return tagItems;
    return tagItems.filter(
      (t) =>
        t.tag.toLowerCase().slice(1).startsWith(q) ||
        t.name.toLowerCase().includes(q)
    );
  }, [tagItems, acQuery]);

  useEffect(() => {
    if (!acOpen) return;
    setAcIndex((i) => Math.min(i, Math.max(0, filtered.length - 1)));
  }, [acOpen, filtered.length]);

  const checkAutocomplete = useCallback(() => {
    const ta = taRef.current;
    if (!ta || tagItems.length === 0) {
      setAcOpen(false);
      return;
    }
    const cursor = ta.selectionStart ?? 0;
    const before = value.slice(0, cursor);
    const m = /@([A-Za-z0-9]*)$/.exec(before);
    if (!m) {
      setAcOpen(false);
      return;
    }
    const start = cursor - m[0].length;
    const charBefore = start > 0 ? value[start - 1] : " ";
    if (start !== 0 && !/\s/.test(charBefore)) {
      setAcOpen(false);
      return;
    }

    // Anchor dropdown to the @ glyph (caret position before user typed @).
    // Use viewport coordinates so portal-rendered dropdown is positioned with
    // `position: fixed` and is unaffected by parent overflow:hidden.
    const coords = getCaretCoordinates(ta, start);
    const rect = ta.getBoundingClientRect();
    const caretX = rect.left + coords.left - ta.scrollLeft;
    const caretTop = rect.top + coords.top - ta.scrollTop;
    const caretBottom = caretTop + coords.height;

    const spaceAbove = caretTop;
    const spaceBelow = window.innerHeight - caretBottom;
    // Prefer above (input is usually near the bottom of the screen). Flip to
    // below only when there clearly isn't room above.
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
    setAcQuery(m[1]);
    setAcStart(start);
  }, [value, tagItems.length]);

  // Close dropdown on scroll/resize so it doesn't drift away from the caret.
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
      const ta = taRef.current;
      if (!ta || acStart < 0) return;
      const cursor = ta.selectionStart ?? 0;
      const head = value.slice(0, acStart);
      const tail = value.slice(cursor);
      const insertion = `${item.tag}${tail.startsWith(" ") ? "" : " "}`;
      const next = head + insertion + tail;
      onChange(next);
      const newPos = head.length + insertion.length;
      requestAnimationFrame(() => {
        ta.focus();
        ta.setSelectionRange(newPos, newPos);
      });
      setAcOpen(false);
    },
    [acStart, value, onChange]
  );

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (acOpen && filtered.length > 0) {
        if (e.key === "ArrowDown") {
          e.preventDefault();
          setAcIndex((i) => (i + 1) % filtered.length);
          return;
        }
        if (e.key === "ArrowUp") {
          e.preventDefault();
          setAcIndex(
            (i) => (i - 1 + filtered.length) % filtered.length
          );
          return;
        }
        if (e.key === "Tab" || e.key === "Enter") {
          e.preventDefault();
          acceptAutocomplete(filtered[acIndex]);
          return;
        }
        if (e.key === "Escape") {
          e.preventDefault();
          setAcOpen(false);
          return;
        }
      }
    },
    [acOpen, filtered, acIndex, acceptAutocomplete]
  );

  const handleChange = useCallback(
    (e: ChangeEvent<HTMLTextAreaElement>) => {
      onChange(e.target.value);
      requestAnimationFrame(checkAutocomplete);
    },
    [onChange, checkAutocomplete]
  );

  const handleClick = useCallback(() => {
    requestAnimationFrame(checkAutocomplete);
  }, [checkAutocomplete]);

  const handleKeyUp = useCallback(() => {
    requestAnimationFrame(checkAutocomplete);
  }, [checkAutocomplete]);

  return (
    <div
      className={`relative bg-surface-50 border border-gray-200 rounded-xl focus-within:ring-2 focus-within:ring-primary-400 focus-within:border-transparent transition-all ${className}`}
    >
      {/* Highlight overlay sits behind the transparent textarea text.
       * Padding/border MUST match the textarea exactly for caret alignment. */}
      <div
        ref={overlayRef}
        aria-hidden
        className="pointer-events-none absolute inset-0 px-3 py-2 text-sm leading-relaxed text-gray-700 whitespace-pre-wrap break-words overflow-hidden box-border"
      >
        {overlay}
      </div>

      <textarea
        ref={taRef}
        value={value}
        onChange={handleChange}
        onPaste={onPaste}
        onScroll={handleScroll}
        onKeyDown={handleKeyDown}
        onKeyUp={handleKeyUp}
        onClick={handleClick}
        onFocus={onFocus}
        onBlur={() => {
          setTimeout(() => setAcOpen(false), 120);
          onBlur?.();
        }}
        rows={rows}
        placeholder={placeholder}
        spellCheck={false}
        // `font: inherit` keeps glyph metrics in sync with the overlay so the
        // caret sits exactly on the rendered text baseline.
        style={{ font: "inherit" }}
        className="prompt-editor-textarea relative w-full px-3 py-2 bg-transparent border-0 text-sm leading-relaxed resize-none focus:outline-none focus:ring-0 placeholder:text-gray-400 box-border"
      />

      {portalEl &&
        acOpen &&
        filtered.length > 0 &&
        createPortal(
          <div
            className="fixed z-[60] bg-white rounded-lg shadow-xl border border-gray-100 py-0.5 max-h-56 overflow-y-auto"
            style={{
              left: acPos.left,
              top: acPos.top,
              width: DROPDOWN_WIDTH,
              transform: acPos.flipDown ? undefined : "translateY(-100%)",
            }}
            // Prevent textarea blur when interacting with the dropdown.
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
                className={`w-full text-left px-2 py-1 text-[11px] flex items-center gap-1.5 ${
                  i === acIndex ? "bg-primary-50" : "hover:bg-gray-50"
                }`}
              >
                {item.type === "image" && item.preview ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
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
