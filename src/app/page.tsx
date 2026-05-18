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
  const [tutorialAfterOnboarding, setTutorialAfterOnboarding] = useState(false);
  const [pendingTutorial, setPendingTutorial] = useState(false);

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
      const detail = (event as CustomEvent<{
        stage?: "intro" | "setup";
        tutorial?: boolean;
      }>).detail;
      setOnboardingStage(detail?.stage ?? "intro");
      setTutorialAfterOnboarding(detail?.tutorial === true);
      setShowOnboarding(true);
    };
    window.addEventListener("sd2:open-onboarding", handleOpenOnboarding);
    return () => {
      window.removeEventListener("sd2:open-onboarding", handleOpenOnboarding);
    };
  }, []);

  useEffect(() => {
    if (
      !loaded ||
      showOnboarding ||
      !pendingTutorial ||
      (!apiKey && !alibabaApiKey && !browseMode)
    ) {
      return;
    }
    const timer = window.setTimeout(() => {
      window.dispatchEvent(new Event("sd2:start-tutorial"));
      setPendingTutorial(false);
    }, 520);
    return () => window.clearTimeout(timer);
  }, [
    alibabaApiKey,
    apiKey,
    browseMode,
    loaded,
    pendingTutorial,
    showOnboarding,
  ]);

  const shouldRunFirstTutorial = () =>
    typeof window !== "undefined" &&
    window.localStorage.getItem("sd2_tutorial_seen") !== "1";

  const handleOnboardingComplete = (forceTutorial = false) => {
    setShowOnboarding(false);
    setTutorialAfterOnboarding(false);
    if (forceTutorial || shouldRunFirstTutorial()) {
      setPendingTutorial(true);
    }
  };

  const handleBrowse = (forceTutorial = false) => {
    localStorage.setItem("sd2_browse_mode", "1");
    setBrowseMode(true);
    setShowOnboarding(false);
    setTutorialAfterOnboarding(false);
    if (forceTutorial || shouldRunFirstTutorial()) {
      setPendingTutorial(true);
    }
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
        onBrowse={() => handleBrowse(tutorialAfterOnboarding)}
        onComplete={() => handleOnboardingComplete(tutorialAfterOnboarding)}
      />
    );
  }

  if (!apiKey && !alibabaApiKey && !browseMode) {
    return (
      <Onboarding
        onBrowse={() => handleBrowse(false)}
        onComplete={() => handleOnboardingComplete(false)}
      />
    );
  }

  return <GenerateView />;
}
