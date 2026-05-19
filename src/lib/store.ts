import { create } from "zustand";
import { get as idbGet, set as idbSet, del as idbDel } from "idb-keyval";
import {
  type ModelParams,
  type ReferenceAsset,
  type GenerationTask,
  DEFAULT_PARAMS,
} from "./types";

const TASKS_KEY = "sd2_tasks";
const DRAFT_KEY = "sd2_composer_draft";
const REF_DATA_PREFIX = "sd2_ref_data";
const PERSIST_DEBOUNCE_MS = 800;
export const RESULT_VIEW_MODE_KEY = "sd2_result_view_mode";
export const GRID_COLUMNS_KEY = "sd2_grid_columns";
export const USAGE_TRACKER_URL_KEY = "sd2_usage_tracker_url";
export const DEFAULT_GRID_COLUMNS = 5;
export const MIN_GRID_COLUMNS = 2;
export const MAX_GRID_COLUMNS = 7;
const DEMO_VIDEO_URL =
  "https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4";
const TERMINAL_TASK_STATUSES = new Set([
  "succeeded",
  "failed",
  "cancelled",
  "expired",
]);

let persistTimer: ReturnType<typeof setTimeout> | null = null;
let persistDraftTimer: ReturnType<typeof setTimeout> | null = null;

interface ComposerDraft {
  prompt: string;
  references: ReferenceAsset[];
  params: ModelParams;
  updatedAt: number;
}

export type ResultViewMode = "free" | "grid";

export function normalizeResultViewMode(value: string | null): ResultViewMode {
  return value === "grid" ? "grid" : "free";
}

export function normalizeGridColumns(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_GRID_COLUMNS;
  return Math.min(MAX_GRID_COLUMNS, Math.max(MIN_GRID_COLUMNS, Math.round(value)));
}

function isDataUri(value?: string): value is string {
  return typeof value === "string" && value.startsWith("data:");
}

function refDataKey(taskId: string, refId: string, slot: "url" | "preview") {
  return `${REF_DATA_PREFIX}:${taskId}:${refId}:${slot}`;
}

async function stashRefDataUri(
  value: string,
  fallbackKey: string
): Promise<string> {
  await idbSet(fallbackKey, value);
  return fallbackKey;
}

async function restoreRefDataUri(key?: string): Promise<string | undefined> {
  if (!key) return undefined;
  const value = await idbGet<string>(key);
  return typeof value === "string" ? value : undefined;
}

function getTaskReferenceStorageKeys(task: GenerationTask): string[] {
  const keys = new Set<string>();
  task.references?.forEach((ref) => {
    if (ref.urlStorageKey) keys.add(ref.urlStorageKey);
    if (ref.previewStorageKey) keys.add(ref.previewStorageKey);
  });
  return Array.from(keys);
}

function deleteTaskReferenceData(task: GenerationTask) {
  if (typeof window === "undefined") return;
  getTaskReferenceStorageKeys(task).forEach((key) => {
    idbDel(key).catch(() => {});
  });
}

/**
 * Strip heavy base64 payloads from the task JSON before writing task state.
 * The payloads themselves are kept in separate IndexedDB records and linked
 * back through storage keys, so completed task thumbnails survive dev-server
 * restarts without dragging giant strings through every task list render.
 */
async function slimTaskForPersist(task: GenerationTask): Promise<GenerationTask> {
  if (!task.references || task.references.length === 0) return task;
  const refs = await Promise.all(
    task.references.map(async (r) => {
      let next = { ...r };
      let urlStorageKey = r.urlStorageKey;

      if (isDataUri(r.url)) {
        urlStorageKey =
          r.urlStorageKey ?? refDataKey(task.id, r.id, "url");
        await stashRefDataUri(r.url, urlStorageKey);
        next = { ...next, url: "", urlStorageKey };
      }

      if (isDataUri(r.preview)) {
        const previewStorageKey =
          r.preview === r.url && urlStorageKey
            ? urlStorageKey
            : r.previewStorageKey ?? refDataKey(task.id, r.id, "preview");
        if (previewStorageKey !== urlStorageKey) {
          await stashRefDataUri(r.preview, previewStorageKey);
        }
        next = { ...next, preview: undefined, previewStorageKey };
      }

      return next;
    })
  );
  return { ...task, references: refs };
}

async function restoreTaskReferences(
  task: GenerationTask
): Promise<GenerationTask> {
  if (!task.references || task.references.length === 0) return task;
  const refs = await Promise.all(
    task.references.map(async (ref) => {
      const restoredUrl = ref.url || (await restoreRefDataUri(ref.urlStorageKey));
      const restoredPreview =
        ref.preview ||
        (await restoreRefDataUri(ref.previewStorageKey)) ||
        (ref.type === "image" ? restoredUrl : undefined);
      return {
        ...ref,
        url: restoredUrl ?? ref.url,
        preview: restoredPreview,
      };
    })
  );
  return { ...task, references: refs };
}

async function persistTasksNow(tasks: GenerationTask[]) {
  const slim = await Promise.all(tasks.map(slimTaskForPersist));
  await idbSet(TASKS_KEY, slim);
}

function persistTasks(tasks: GenerationTask[]) {
  if (typeof window === "undefined") return;
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    persistTasksNow(tasks).catch((err) => {
      console.error("[store] IndexedDB persist failed:", err);
    });
  }, PERSIST_DEBOUNCE_MS);
}

function persistDraft(draft: Omit<ComposerDraft, "updatedAt">) {
  if (typeof window === "undefined") return;
  if (persistDraftTimer) clearTimeout(persistDraftTimer);
  persistDraftTimer = setTimeout(() => {
    idbSet(DRAFT_KEY, { ...draft, updatedAt: Date.now() }).catch((err) => {
      console.error("[store] draft persist failed:", err);
    });
  }, PERSIST_DEBOUNCE_MS);
}

function isDemoTask(task: GenerationTask): boolean {
  const demoVideo =
    typeof task.videoUrl === "string" && task.videoUrl.includes(DEMO_VIDEO_URL);
  const demoPrompt = task.prompt.trim().toLowerCase().startsWith("demo:");
  return (
    task.demo === true ||
    task.taskId.startsWith("demo-") ||
    demoVideo ||
    demoPrompt
  );
}

interface AppState {
  apiKey: string | null;
  setApiKey: (key: string) => void;
  alibabaApiKey: string | null;
  setAlibabaApiKey: (key: string) => void;
  clearApiKey: () => void;
  demoMode: boolean;
  setDemoMode: (enabled: boolean) => void;
  usageTrackerUrl: string;
  setUsageTrackerUrl: (url: string) => void;
  resultViewMode: ResultViewMode;
  setResultViewMode: (mode: ResultViewMode) => void;
  gridColumns: number;
  setGridColumns: (columns: number) => void;

  params: ModelParams;
  setParams: (params: Partial<ModelParams>) => void;
  resetParams: () => void;

  prompt: string;
  setPrompt: (prompt: string) => void;

  references: ReferenceAsset[];
  addReference: (ref: ReferenceAsset) => void;
  updateReference: (id: string, update: Partial<ReferenceAsset>) => void;
  reorderReference: (dragId: string, targetId: string) => void;
  removeReference: (id: string) => void;
  clearReferences: () => void;

  tasks: GenerationTask[];
  tasksHydrated: boolean;
  addTask: (task: GenerationTask) => void;
  updateTask: (id: string, update: Partial<GenerationTask>) => void;
  removeTask: (id: string) => void;
  clearTasks: () => void;
  clearDemoTasks: () => void;

  activeTaskId: string | null;
  setActiveTaskId: (id: string | null) => void;

  loadFromTask: (task: GenerationTask) => void;
}

export const useAppStore = create<AppState>((set) => ({
  apiKey: null,
  setApiKey: (key) => {
    if (typeof window !== "undefined") {
      localStorage.setItem("ark_api_key", key);
    }
    set({ apiKey: key });
  },
  alibabaApiKey: null,
  setAlibabaApiKey: (key) => {
    if (typeof window !== "undefined") {
      localStorage.setItem("alibaba_modelstudio_api_key", key);
    }
    set({ alibabaApiKey: key });
  },
  clearApiKey: () => {
    if (typeof window !== "undefined") {
      localStorage.removeItem("ark_api_key");
      localStorage.removeItem("alibaba_modelstudio_api_key");
    }
    set({ apiKey: null, alibabaApiKey: null });
  },
  demoMode: false,
  setDemoMode: (enabled) => {
    if (typeof window !== "undefined") {
      localStorage.setItem("sd2_demo_mode", enabled ? "1" : "0");
    }
    set((s) => {
      if (enabled) return { demoMode: enabled };
      const nextTasks = s.tasks.filter((task) => !isDemoTask(task));
      if (nextTasks.length !== s.tasks.length) {
        persistTasks(nextTasks);
      }
      return { demoMode: enabled, tasks: nextTasks };
    });
  },
  usageTrackerUrl: "",
  setUsageTrackerUrl: (url) => {
    const next = url.trim();
    if (typeof window !== "undefined") {
      if (next) {
        localStorage.setItem(USAGE_TRACKER_URL_KEY, next);
      } else {
        localStorage.removeItem(USAGE_TRACKER_URL_KEY);
      }
    }
    set({ usageTrackerUrl: next });
  },
  resultViewMode: "free",
  setResultViewMode: (mode) => {
    if (typeof window !== "undefined") {
      localStorage.setItem(RESULT_VIEW_MODE_KEY, mode);
    }
    set({ resultViewMode: mode });
  },
  gridColumns: DEFAULT_GRID_COLUMNS,
  setGridColumns: (columns) => {
    const next = normalizeGridColumns(columns);
    if (typeof window !== "undefined") {
      localStorage.setItem(GRID_COLUMNS_KEY, String(next));
    }
    set({ gridColumns: next });
  },

  params: DEFAULT_PARAMS,
  setParams: (partial) =>
    set((s) => {
      const params = { ...s.params, ...partial };
      persistDraft({ prompt: s.prompt, references: s.references, params });
      return { params };
    }),
  resetParams: () =>
    set((s) => {
      persistDraft({
        prompt: s.prompt,
        references: s.references,
        params: DEFAULT_PARAMS,
      });
      return { params: DEFAULT_PARAMS };
    }),

  prompt: "",
  setPrompt: (prompt) =>
    set((s) => {
      persistDraft({ prompt, references: s.references, params: s.params });
      return { prompt };
    }),

  references: [],
  addReference: (ref) =>
    set((s) => {
      const references = [...s.references, ref];
      persistDraft({ prompt: s.prompt, references, params: s.params });
      return { references };
    }),
  updateReference: (id, update) =>
    set((s) => {
      const references = s.references.map((r) =>
        r.id === id ? { ...r, ...update } : r
      );
      persistDraft({ prompt: s.prompt, references, params: s.params });
      return { references };
    }),
  reorderReference: (dragId, targetId) =>
    set((s) => {
      if (dragId === targetId) return s;
      const from = s.references.findIndex((r) => r.id === dragId);
      const to = s.references.findIndex((r) => r.id === targetId);
      if (from < 0 || to < 0) return s;
      const next = [...s.references];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      persistDraft({ prompt: s.prompt, references: next, params: s.params });
      return { references: next };
    }),
  removeReference: (id) =>
    set((s) => {
      const references = s.references.filter((r) => r.id !== id);
      persistDraft({ prompt: s.prompt, references, params: s.params });
      return { references };
    }),
  clearReferences: () =>
    set((s) => {
      persistDraft({ prompt: s.prompt, references: [], params: s.params });
      return { references: [] };
    }),

  tasks: [],
  tasksHydrated: false,
  addTask: (task) =>
    set((s) => {
      const next = [task, ...s.tasks];
      persistTasks(next);
      return { tasks: next };
    }),
  updateTask: (id, update) =>
    set((s) => {
      const next = s.tasks.map((t) => {
        if (t.id !== id) return t;
        const shouldStampCompletedAt =
          typeof update.status === "string" &&
          TERMINAL_TASK_STATUSES.has(update.status) &&
          !t.completedAt &&
          update.completedAt === undefined;
        return {
          ...t,
          ...update,
          completedAt: shouldStampCompletedAt
            ? Date.now()
            : update.completedAt ?? t.completedAt,
        };
      });
      persistTasks(next);
      return { tasks: next };
    }),
  removeTask: (id) =>
    set((s) => {
      const removed = s.tasks.find((t) => t.id === id);
      if (removed) deleteTaskReferenceData(removed);
      const next = s.tasks.filter((t) => t.id !== id);
      persistTasks(next);
      return { tasks: next };
    }),
  clearTasks: () => {
    if (typeof window !== "undefined") {
      useAppStore.getState().tasks.forEach(deleteTaskReferenceData);
      idbDel(TASKS_KEY).catch(() => {});
    }
    set({ tasks: [] });
  },
  clearDemoTasks: () =>
    set((s) => {
      const next = s.tasks.filter((task) => !isDemoTask(task));
      if (next.length === s.tasks.length) return {};
      s.tasks
        .filter((task) => isDemoTask(task))
        .forEach(deleteTaskReferenceData);
      persistTasks(next);
      return { tasks: next };
    }),

  activeTaskId: null,
  setActiveTaskId: (id) => set({ activeTaskId: id }),

  loadFromTask: (task) =>
    set(() => {
      const refs = (task.references || []).map((r) => ({
        ...r,
        id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        urlStorageKey: undefined,
        previewStorageKey: undefined,
      }));
      const params = { ...DEFAULT_PARAMS, ...task.params };
      persistDraft({
        prompt: task.prompt,
        references: refs,
        params,
      });
      return {
        prompt: task.prompt,
        references: refs,
        params,
      };
    }),
}));

/**
 * Hydration: load tasks from IndexedDB once on client.
 * Also migrates legacy LocalStorage data (sd2_tasks) → IndexedDB,
 * then clears LocalStorage to free quota.
 */
export async function hydrateTasks(): Promise<void> {
  if (typeof window === "undefined") return;
  if (useAppStore.getState().tasksHydrated) return;

  try {
    let saved = await idbGet<GenerationTask[]>(TASKS_KEY);

    if (!saved) {
      const legacy = localStorage.getItem(TASKS_KEY);
      if (legacy) {
        try {
          const parsed = JSON.parse(legacy);
          if (Array.isArray(parsed)) {
            saved = parsed;
            await idbSet(TASKS_KEY, parsed);
          }
        } catch {
          /* corrupt legacy data — ignore */
        }
        try {
          localStorage.removeItem(TASKS_KEY);
        } catch {
          /* ignore */
        }
      }
    }

    if (Array.isArray(saved)) {
      saved = await Promise.all(saved.map(restoreTaskReferences));
      const demoMode = localStorage.getItem("sd2_demo_mode") === "1";
      if (!demoMode) {
        const filtered = saved.filter((task) => !isDemoTask(task));
        if (filtered.length !== saved.length) {
          saved
            .filter((task) => isDemoTask(task))
            .forEach(deleteTaskReferenceData);
          saved = filtered;
          await persistTasksNow(filtered);
        }
      }
      useAppStore.setState({ tasks: saved, tasksHydrated: true });
    } else {
      useAppStore.setState({ tasksHydrated: true });
    }

    const draft = await idbGet<ComposerDraft>(DRAFT_KEY);
    const current = useAppStore.getState();
    if (
      draft &&
      typeof draft.prompt === "string" &&
      Array.isArray(draft.references) &&
      !current.prompt &&
      current.references.length === 0
    ) {
      useAppStore.setState({
        prompt: draft.prompt,
        references: draft.references,
        params: { ...DEFAULT_PARAMS, ...draft.params },
      });
    }
  } catch (err) {
    console.error("[store] hydrateTasks failed:", err);
    useAppStore.setState({ tasksHydrated: true });
  }
}
