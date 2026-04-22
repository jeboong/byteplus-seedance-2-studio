import { create } from "zustand";
import { get as idbGet, set as idbSet, del as idbDel } from "idb-keyval";
import {
  type ModelParams,
  type ReferenceAsset,
  type GenerationTask,
  DEFAULT_PARAMS,
} from "./types";

const TASKS_KEY = "sd2_tasks";
const PERSIST_DEBOUNCE_MS = 800;

let persistTimer: ReturnType<typeof setTimeout> | null = null;

function persistTasks(tasks: GenerationTask[]) {
  if (typeof window === "undefined") return;
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    idbSet(TASKS_KEY, tasks).catch((err) => {
      console.error("[store] IndexedDB persist failed:", err);
    });
  }, PERSIST_DEBOUNCE_MS);
}

interface AppState {
  apiKey: string | null;
  setApiKey: (key: string) => void;
  clearApiKey: () => void;

  params: ModelParams;
  setParams: (params: Partial<ModelParams>) => void;
  resetParams: () => void;

  prompt: string;
  setPrompt: (prompt: string) => void;

  references: ReferenceAsset[];
  addReference: (ref: ReferenceAsset) => void;
  removeReference: (id: string) => void;
  clearReferences: () => void;

  tasks: GenerationTask[];
  tasksHydrated: boolean;
  addTask: (task: GenerationTask) => void;
  updateTask: (id: string, update: Partial<GenerationTask>) => void;
  removeTask: (id: string) => void;
  clearTasks: () => void;

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
  clearApiKey: () => {
    if (typeof window !== "undefined") {
      localStorage.removeItem("ark_api_key");
    }
    set({ apiKey: null });
  },

  params: DEFAULT_PARAMS,
  setParams: (partial) =>
    set((s) => ({ params: { ...s.params, ...partial } })),
  resetParams: () => set({ params: DEFAULT_PARAMS }),

  prompt: "",
  setPrompt: (prompt) => set({ prompt }),

  references: [],
  addReference: (ref) =>
    set((s) => ({ references: [...s.references, ref] })),
  removeReference: (id) =>
    set((s) => ({ references: s.references.filter((r) => r.id !== id) })),
  clearReferences: () => set({ references: [] }),

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
      const next = s.tasks.map((t) =>
        t.id === id ? { ...t, ...update } : t
      );
      persistTasks(next);
      return { tasks: next };
    }),
  removeTask: (id) =>
    set((s) => {
      const next = s.tasks.filter((t) => t.id !== id);
      persistTasks(next);
      return { tasks: next };
    }),
  clearTasks: () => {
    if (typeof window !== "undefined") {
      idbDel(TASKS_KEY).catch(() => {});
    }
    set({ tasks: [] });
  },

  activeTaskId: null,
  setActiveTaskId: (id) => set({ activeTaskId: id }),

  loadFromTask: (task) =>
    set(() => {
      const refs = (task.references || []).map((r) => ({
        ...r,
        id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      }));
      return {
        prompt: task.prompt,
        references: refs,
        params: { ...task.params },
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
      useAppStore.setState({ tasks: saved, tasksHydrated: true });
    } else {
      useAppStore.setState({ tasksHydrated: true });
    }
  } catch (err) {
    console.error("[store] hydrateTasks failed:", err);
    useAppStore.setState({ tasksHydrated: true });
  }
}
