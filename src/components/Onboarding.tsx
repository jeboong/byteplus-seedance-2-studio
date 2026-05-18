"use client";

import { useEffect, useState } from "react";
import { ArrowRight, Eye, KeyRound } from "lucide-react";
import { useAppStore } from "@/lib/store";
import { BackgroundGradientAnimation } from "./BackgroundGradientAnimation";

type ProviderId = "byteplus" | "modelstudio";

const INTRO_HOLD_MS = 2800;

export default function Onboarding({
  onBrowse,
  onComplete,
  initialStage = "intro",
}: {
  onBrowse: () => void;
  onComplete?: () => void;
  initialStage?: "intro" | "setup";
}) {
  const setApiKey = useAppStore((s) => s.setApiKey);
  const setAlibabaApiKey = useAppStore((s) => s.setAlibabaApiKey);
  const [stage, setStage] = useState<"intro" | "setup">(initialStage);
  const [introReady, setIntroReady] = useState(false);
  const [selected, setSelected] = useState<ProviderId[]>(["byteplus"]);
  const [key, setKey] = useState("");
  const [alibabaKey, setAlibabaKey] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    const timer = window.setTimeout(() => setIntroReady(true), INTRO_HOLD_MS);
    return () => window.clearTimeout(timer);
  }, []);

  const toggleProvider = (provider: ProviderId) => {
    setSelected((current) =>
      current.includes(provider)
        ? current.filter((item) => item !== provider)
        : [...current, provider]
    );
    setError("");
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = key.trim();
    const trimmedAlibaba = alibabaKey.trim();

    if (selected.length === 0) {
      setError("사용할 API를 선택해주세요.");
      return;
    }
    if (selected.includes("byteplus") && trimmed.length < 10) {
      setError("BytePlus API Key를 입력해주세요.");
      return;
    }
    if (selected.includes("modelstudio") && trimmedAlibaba.length < 10) {
      setError("ModelStudio API Key를 입력해주세요.");
      return;
    }

    if (selected.includes("byteplus")) setApiKey(trimmed);
    if (selected.includes("modelstudio")) setAlibabaApiKey(trimmedAlibaba);
    localStorage.removeItem("sd2_browse_mode");
    onComplete?.();
  };

  return (
    <main className="onboarding-shell min-h-screen p-5">
      <BackgroundGradientAnimation
        firstColor="255, 255, 255"
        secondColor="90, 128, 190"
        thirdColor="255, 255, 255"
        fourthColor="20, 28, 42"
        fifthColor="8, 10, 14"
        pointerColor="255, 255, 255"
        size="64%"
        blendingValue="screen"
      />

      {stage === "intro" ? (
        <section className="onboarding-intro flex min-h-[calc(100vh-40px)] flex-col items-center justify-center text-center">
          <h1 className="onboarding-type-main text-[clamp(2.7rem,8.4vw,8.5rem)] font-semibold uppercase leading-[0.92] tracking-normal text-gray-900">
            STUDIOFREEWILLUSION STUDIO
          </h1>
          <button
            type="button"
            onClick={() => setStage("setup")}
            className={`onboarding-start-button primary-button mt-12 inline-flex items-center gap-2 rounded-full px-7 py-3 text-sm font-semibold transition-all ${
              introReady ? "opacity-100 translate-y-0" : "pointer-events-none opacity-0 translate-y-2"
            }`}
          >
            시작하기
            <ArrowRight className="h-4 w-4" />
          </button>
        </section>
      ) : (
        <section className="flex min-h-[calc(100vh-40px)] items-center justify-center">
          <div className="onboarding-card glass-panel subtle-glow motion-rise w-full max-w-xl rounded-2xl p-5 sm:p-7">
            <div className="mb-7">
              <p className="mb-3 text-xs uppercase tracking-[0.24em] text-gray-500">
                API setup
              </p>
              <h1 className="text-3xl font-semibold tracking-normal text-gray-900">
                연결할 API 선택
              </h1>
              <p className="mt-2 text-sm text-gray-500">
                선택한 제공자의 입력칸만 표시됩니다.
              </p>
            </div>

            <div className="mb-5">
              <p className="mb-2 text-xs font-medium text-gray-600">
                지원 API Key
              </p>
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => toggleProvider("byteplus")}
                  aria-pressed={selected.includes("byteplus")}
                  className={`provider-chip rounded-xl border px-3 py-3 text-xs font-medium transition-all ${
                    selected.includes("byteplus") ? "provider-chip-active" : ""
                  }`}
                >
                  byteplus
                </button>
                <button
                  type="button"
                  onClick={() => toggleProvider("modelstudio")}
                  aria-pressed={selected.includes("modelstudio")}
                  className={`provider-chip rounded-xl border px-3 py-3 text-xs font-medium transition-all ${
                    selected.includes("modelstudio") ? "provider-chip-active" : ""
                  }`}
                >
                  modelstudio?
                </button>
                <button
                  type="button"
                  disabled
                  className="provider-chip rounded-xl border px-3 py-3 text-xs font-medium opacity-45"
                >
                  coming soon...
                </button>
              </div>
            </div>

            <form onSubmit={handleSubmit} className="space-y-3">
              {selected.includes("byteplus") && (
                <div className="motion-rise">
                  <label
                    htmlFor="apiKey"
                    className="mb-1.5 block text-xs font-medium text-gray-600"
                  >
                    BytePlus
                  </label>
                  <div className="relative">
                    <KeyRound className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                    <input
                      id="apiKey"
                      type="password"
                      value={key}
                      onChange={(e) => {
                        setKey(e.target.value);
                        setError("");
                      }}
                      placeholder="BytePlus API Key"
                      className="glass-control w-full rounded-xl border px-10 py-3 text-sm outline-none transition-all placeholder:text-gray-400 focus:ring-2 focus:ring-primary-400"
                    />
                  </div>
                </div>
              )}

              {selected.includes("modelstudio") && (
                <div className="motion-rise">
                  <label
                    htmlFor="alibabaApiKey"
                    className="mb-1.5 block text-xs font-medium text-gray-600"
                  >
                    ModelStudio
                  </label>
                  <div className="relative">
                    <KeyRound className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                    <input
                      id="alibabaApiKey"
                      type="password"
                      value={alibabaKey}
                      onChange={(e) => {
                        setAlibabaKey(e.target.value);
                        setError("");
                      }}
                      placeholder="ModelStudio API Key"
                      className="glass-control w-full rounded-xl border px-10 py-3 text-sm outline-none transition-all placeholder:text-gray-400 focus:ring-2 focus:ring-primary-400"
                    />
                  </div>
                </div>
              )}

              {error && (
                <p className="rounded-lg border border-red-200 bg-red-50/70 px-3 py-2 text-xs text-red-600">
                  {error}
                </p>
              )}

              <div className="grid gap-2 pt-2 sm:grid-cols-[1fr_auto]">
                <button
                  type="submit"
                  className="primary-button inline-flex items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold transition-all"
                >
                  연결하기
                  <ArrowRight className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={onBrowse}
                  className="glass-chip inline-flex items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-medium text-gray-600 transition-colors hover:text-gray-900"
                >
                  <Eye className="h-4 w-4" />
                  둘러보기
                </button>
              </div>
            </form>
          </div>
        </section>
      )}
    </main>
  );
}
