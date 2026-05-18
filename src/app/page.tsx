"use client";

import { useEffect, useState } from "react";
import { useAppStore } from "@/lib/store";
import Onboarding from "@/components/Onboarding";
import GenerateView from "@/components/GenerateView";

export default function Home() {
  const {
    apiKey,
    alibabaApiKey,
    setApiKey,
    setAlibabaApiKey,
    setDemoMode,
  } = useAppStore();
  const [loaded, setLoaded] = useState(false);
  const [browseMode, setBrowseMode] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [onboardingStage, setOnboardingStage] = useState<"intro" | "setup">(
    "intro"
  );

  useEffect(() => {
    const stored = localStorage.getItem("ark_api_key");
    if (stored) {
      setApiKey(stored);
    }
    const storedAlibaba = localStorage.getItem("alibaba_modelstudio_api_key");
    if (storedAlibaba) {
      setAlibabaApiKey(storedAlibaba);
    }
    setBrowseMode(localStorage.getItem("sd2_browse_mode") === "1");
    setDemoMode(localStorage.getItem("sd2_demo_mode") === "1");
    setLoaded(true);
  }, [setApiKey, setAlibabaApiKey, setDemoMode]);

  useEffect(() => {
    const handleOpenOnboarding = (event: Event) => {
      const detail = (event as CustomEvent<{ stage?: "intro" | "setup" }>)
        .detail;
      setOnboardingStage(detail?.stage ?? "intro");
      setShowOnboarding(true);
    };
    window.addEventListener("sd2:open-onboarding", handleOpenOnboarding);
    return () => {
      window.removeEventListener("sd2:open-onboarding", handleOpenOnboarding);
    };
  }, []);

  const handleBrowse = () => {
    localStorage.setItem("sd2_browse_mode", "1");
    setBrowseMode(true);
    setShowOnboarding(false);
  };

  if (!loaded) {
    return (
      <div className="onboarding-shell min-h-screen flex items-center justify-center">
        <div className="glass-chip w-10 h-10 rounded-lg flex items-center justify-center">
          <div className="w-5 h-5 border-2 border-primary-400 border-t-transparent rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  if (showOnboarding) {
    return (
      <Onboarding
        initialStage={onboardingStage}
        onBrowse={handleBrowse}
        onComplete={() => setShowOnboarding(false)}
      />
    );
  }

  if (!apiKey && !alibabaApiKey && !browseMode) {
    return <Onboarding onBrowse={handleBrowse} />;
  }

  return <GenerateView />;
}
