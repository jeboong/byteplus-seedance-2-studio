"use client";

import type { CSSProperties } from "react";

interface GenerationFXProps {
  label: string;
  modelLabel: string;
  compact?: boolean;
  className?: string;
}

const CELLS = Array.from({ length: 36 }, (_, i) => i);

export default function GenerationFX({
  label,
  modelLabel,
  compact = false,
  className = "",
}: GenerationFXProps) {
  return (
    <div
      className={`generation-fx ${
        compact ? "generation-fx-compact" : ""
      } ${className}`}
    >
      <div className="generation-grid-shell" aria-hidden>
        <div className="generation-grid">
          {CELLS.map((cell) => (
            <span
              key={cell}
              className="generation-grid-cell"
              style={{ "--i": cell } as CSSProperties}
            />
          ))}
        </div>
        <span className="generation-grid-sweep generation-grid-sweep-a" />
        <span className="generation-grid-sweep generation-grid-sweep-b" />
      </div>
      <div className="generation-fx-copy">
        <span className={compact ? "text-[11px]" : "text-sm"}>{label}</span>
        <span className="text-[10px]">{modelLabel}</span>
      </div>
    </div>
  );
}
