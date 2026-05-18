export const GENERATION_CONFIRM_COUNTDOWN_SECONDS = 15;
export const GENERATION_CONFIRM_SKIP_KEY = "sd2_skip_generation_confirm";
export const GENERATION_CONFIRM_CHANGE_EVENT =
  "sd2:generation-confirm-change";

export function isGenerationConfirmEnabled(): boolean {
  if (typeof window === "undefined") return true;
  return window.localStorage.getItem(GENERATION_CONFIRM_SKIP_KEY) !== "1";
}

export function setGenerationConfirmEnabled(enabled: boolean) {
  if (typeof window === "undefined") return;
  if (enabled) {
    window.localStorage.removeItem(GENERATION_CONFIRM_SKIP_KEY);
  } else {
    window.localStorage.setItem(GENERATION_CONFIRM_SKIP_KEY, "1");
  }
  window.dispatchEvent(
    new CustomEvent(GENERATION_CONFIRM_CHANGE_EVENT, {
      detail: { enabled },
    })
  );
}
