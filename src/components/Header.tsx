"use client";

import { useEffect, useRef, useState } from "react";
import {
  BellRing,
  FlaskConical,
  KeyRound,
  LogOut,
  RotateCcw,
  Settings,
} from "lucide-react";
import { useAppStore } from "@/lib/store";
import {
  GENERATION_CONFIRM_CHANGE_EVENT,
  isGenerationConfirmEnabled,
  setGenerationConfirmEnabled,
} from "@/lib/generationConfirm";
import ThemeToggle from "./ThemeToggle";

function openOnboarding(stage: "intro" | "setup", tutorial = false) {
  window.dispatchEvent(
    new CustomEvent("sd2:open-onboarding", { detail: { stage, tutorial } })
  );
}

export default function Header() {
  const { apiKey, alibabaApiKey, clearApiKey, demoMode, setDemoMode } =
    useAppStore();
  const activeKey = apiKey || alibabaApiKey;
  const masked = activeKey ? `...${activeKey.slice(-6)}` : "";
  const [open, setOpen] = useState(false);
  const [generationConfirmEnabled, setGenerationConfirmEnabledState] =
    useState(true);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const syncGenerationConfirm = () => {
      setGenerationConfirmEnabledState(isGenerationConfirmEnabled());
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
    if (!open) return;
    const close = (event: PointerEvent) => {
      const target = event.target;
      if (target instanceof Node && menuRef.current?.contains(target)) return;
      setOpen(false);
    };
    document.addEventListener("pointerdown", close, true);
    return () => document.removeEventListener("pointerdown", close, true);
  }, [open]);

  const handleSignOut = () => {
    clearApiKey();
    if (typeof window !== "undefined") {
      window.localStorage.removeItem("sd2_browse_mode");
      window.location.reload();
    }
  };

  return (
    <div className="floating-app-controls fixed right-4 top-4 z-50 flex items-center gap-2">
      {masked && (
        <span className="glass-chip hidden rounded-md px-2 py-1 font-mono text-[11px] text-gray-500 sm:inline-flex">
          {masked}
        </span>
      )}
      {demoMode && (
        <span className="floating-status-badge glass-chip hidden h-9 items-center rounded-xl px-3 text-[11px] font-semibold text-amber-600 sm:inline-flex">
          DEMO
        </span>
      )}
      <div ref={menuRef} className="relative">
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          aria-label="App settings"
          aria-expanded={open}
          className={`glass-chip p-2 rounded-lg transition-colors ${
            open ? "text-primary-600" : "text-gray-400 hover:text-gray-600"
          }`}
          title="Settings"
        >
          <Settings className="w-4 h-4" />
        </button>
        {open && (
          <div className="app-settings-menu absolute right-0 top-[calc(100%+0.55rem)] w-64 overflow-hidden rounded-2xl border p-2">
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                openOnboarding("setup");
              }}
              className="app-settings-item"
            >
              <KeyRound className="h-4 w-4" />
              <span>API key 변경</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                openOnboarding("intro", true);
              }}
              className="app-settings-item"
            >
              <RotateCcw className="h-4 w-4" />
              <span>온보딩/튜토리얼 다시보기</span>
            </button>
            <button
              type="button"
              onClick={() => setDemoMode(!demoMode)}
              aria-pressed={demoMode}
              className="app-settings-item"
            >
              <FlaskConical className="h-4 w-4" />
              <span className="flex-1 text-left">데모 모드</span>
              <span
                className={`app-settings-switch ${
                  demoMode ? "app-settings-switch-on" : ""
                }`}
              />
            </button>
            <button
              type="button"
              onClick={() =>
                setGenerationConfirmEnabled(!generationConfirmEnabled)
              }
              aria-pressed={generationConfirmEnabled}
              className="app-settings-item"
            >
              <BellRing className="h-4 w-4" />
              <span className="flex-1 text-left">생성 경고</span>
              <span
                className={`app-settings-switch ${
                  generationConfirmEnabled ? "app-settings-switch-on" : ""
                }`}
              />
            </button>
          </div>
        )}
      </div>
      <ThemeToggle />
      <button
        type="button"
        onClick={handleSignOut}
        className="glass-chip p-2 rounded-lg text-gray-400 hover:text-gray-600 transition-colors"
        title="Sign out"
      >
        <LogOut className="w-4 h-4" />
      </button>
    </div>
  );
}
