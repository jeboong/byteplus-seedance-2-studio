import type { GenerationTask } from "./types";

const DOWNLOADED_TASKS_KEY = "sd2_downloaded_tasks";
const DOWNLOAD_EVENT = "sd2:downloaded-tasks-changed";

function readDownloadedKeys(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(DOWNLOADED_TASKS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === "string")
      : [];
  } catch {
    return [];
  }
}

function writeDownloadedKeys(keys: string[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(DOWNLOADED_TASKS_KEY, JSON.stringify(keys));
  window.dispatchEvent(new Event(DOWNLOAD_EVENT));
}

export function getTaskDownloadKey(task: Pick<GenerationTask, "id" | "taskId">) {
  return task.taskId || task.id;
}

export function hasDownloadedTask(key: string): boolean {
  return readDownloadedKeys().includes(key);
}

export function markTaskDownloaded(key: string) {
  const keys = readDownloadedKeys();
  if (keys.includes(key)) return;
  writeDownloadedKeys([...keys, key]);
}

export function subscribeDownloadedTasks(listener: () => void) {
  if (typeof window === "undefined") return () => {};
  const onStorage = (event: StorageEvent) => {
    if (event.key === DOWNLOADED_TASKS_KEY) listener();
  };
  window.addEventListener(DOWNLOAD_EVENT, listener);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(DOWNLOAD_EVENT, listener);
    window.removeEventListener("storage", onStorage);
  };
}
