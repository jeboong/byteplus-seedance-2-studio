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
import { Image as ImageIcon, Film, Music, UserCheck } from "lucide-react";
import { useAppStore } from "@/lib/store";
import { getRefTags } from "@/lib/refTags";

const TAG_RE = /@(img|vid|aud)\d+/gi;

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
      out.push(
        <span
          key={`c-${i++}`}
          className={
            valid
              ? "bg-primary-100 text-primary-700 rounded font-semibold"
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
    // Match @ followed by alphanumerics at end of `before`.
    const m = /@([A-Za-z0-9]*)$/.exec(before);
    if (!m) {
      setAcOpen(false);
      return;
    }
    const start = cursor - m[0].length;
    // Only trigger when @ starts a new token (start of string or whitespace before)
    const charBefore = start > 0 ? value[start - 1] : " ";
    if (start !== 0 && !/\s/.test(charBefore)) {
      setAcOpen(false);
      return;
    }
    setAcOpen(true);
    setAcQuery(m[1]);
    setAcStart(start);
  }, [value, tagItems.length]);

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
    <div className={`relative ${className}`}>
      {/* Highlight overlay (sits behind the transparent textarea text). */}
      <div
        ref={overlayRef}
        aria-hidden
        className="pointer-events-none absolute inset-0 px-3 py-2 text-sm leading-relaxed text-gray-700 whitespace-pre-wrap break-words overflow-hidden rounded-xl border border-transparent box-border"
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
          // small delay so dropdown click can register before blur closes it
          setTimeout(() => setAcOpen(false), 120);
          onBlur?.();
        }}
        rows={rows}
        placeholder={placeholder}
        spellCheck={false}
        className="prompt-editor-textarea relative w-full px-3 py-2 bg-surface-50 border border-gray-200 rounded-xl text-sm leading-relaxed resize-none focus:outline-none focus:ring-2 focus:ring-primary-400 focus:border-transparent placeholder:text-gray-400 transition-all box-border"
      />

      {acOpen && filtered.length > 0 && (
        <div className="absolute bottom-full mb-1 left-2 z-30 bg-white rounded-xl shadow-lg border border-gray-100 py-1 min-w-[220px] max-h-72 overflow-y-auto">
          <div className="flex items-center justify-between px-3 py-1">
            <p className="text-[10px] text-gray-400 font-medium">
              첨부 태그 ({filtered.length})
            </p>
            <p className="text-[9px] text-gray-300">
              ↑↓ Tab/Enter Esc
            </p>
          </div>
          {filtered.map((item, i) => (
            <button
              key={item.id}
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                acceptAutocomplete(item);
              }}
              onMouseEnter={() => setAcIndex(i)}
              className={`w-full text-left px-3 py-1.5 text-xs flex items-center gap-2 ${
                i === acIndex ? "bg-primary-50" : "hover:bg-gray-50"
              }`}
            >
              {item.type === "image" && item.preview ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={item.preview}
                  alt=""
                  className="w-7 h-7 object-cover rounded shrink-0"
                />
              ) : item.url?.startsWith("asset://") ? (
                <UserCheck className="w-4 h-4 text-green-500 shrink-0" />
              ) : item.type === "video" ? (
                <Film className="w-4 h-4 text-blue-400 shrink-0" />
              ) : item.type === "audio" ? (
                <Music className="w-4 h-4 text-purple-400 shrink-0" />
              ) : (
                <ImageIcon className="w-4 h-4 text-gray-400 shrink-0" />
              )}
              <span className="font-mono text-primary-600 font-semibold">
                {item.tag}
              </span>
              <span className="text-gray-400 truncate flex-1">
                {item.name}
              </span>
              <span className="text-[9px] text-gray-300 uppercase">
                {item.type}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
});

export default PromptEditor;
