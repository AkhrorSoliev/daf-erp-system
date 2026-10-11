import { create } from "zustand";
import axios from "axios";
import toast from "react-hot-toast";
import api from "@/lib/api";
import { getErrorMessage } from "@/lib/get-error-message";
import { useTasks, type TaskEvent, type TaskFileView } from "@/hooks/use-tasks";
import { FILE_TOO_BIG, FILE_URL_REFRESH_MS, MAX_FILE_BYTES, MAX_VOICE_BYTES, URL_REFRESH_FAILED, VOICE_TOO_BIG } from "./task-file-rules";

interface TaskFilesState {
  /** `GET /tasks/config` → `filesEnabled`; null until known (every file control stays hidden). */
  enabled: boolean | null;
  /** Whose list `files` is: a list never shows under another task. */
  taskId: string | null;
  files: TaskFileView[];
  hasFreshPhoto: boolean;
  uploading: number;
  /** When `files` was read (ms); the links in it die 10 minutes later. */
  loadedAt: number;
  loadConfig: () => Promise<void>;
  load: (taskId: string) => Promise<void>;
  /** Re-reads the list when its links are about to expire (or belong to another task); call before opening or downloading a file. false = the links could not be renewed (toast shown): do not open or download. */
  ensureFresh: (taskId: string) => Promise<boolean>;
  upload: (taskId: string, file: Blob, name: string, durationSec?: number) => Promise<boolean>;
  remove: (taskId: string, fileId: string) => Promise<boolean>;
}

// A newer load makes an older answer stale.
let lastLoad = 0;

/**
 * The open task's files (ADR-0086). URLs are presigned for 10 minutes, so the
 * drawer re-reads every 8 (`FILE_URL_REFRESH_MS`) and after every change. The
 * browser never fetches them: <img>, <audio> and links only (no CORS rule).
 */
export const useTaskFiles = create<TaskFilesState>((set, get) => ({
  enabled: null, taskId: null, files: [], hasFreshPhoto: false, uploading: 0, loadedAt: 0,

  loadConfig: async () => {
    if (get().enabled !== null) return;
    try {
      const { data } = await api.get<{ filesEnabled: boolean }>("/tasks/config");
      set({ enabled: data.filesEnabled });
    } catch {
      // Stays null: no file controls; the next drawer asks again.
    }
  },

  load: async (taskId) => {
    const req = ++lastLoad;
    if (get().taskId !== taskId) set({ taskId, files: [], hasFreshPhoto: false, loadedAt: 0 });
    try {
      const { data } = await api.get<{ data: TaskFileView[]; hasFreshPhoto: boolean; enabled?: boolean }>(`/tasks/${taskId}/files`);
      if (req !== lastLoad) return;
      set({ taskId, files: data.data, hasFreshPhoto: data.hasFreshPhoto, loadedAt: Date.now(), ...(typeof data.enabled === "boolean" ? { enabled: data.enabled } : {}) });
    } catch {
      // The drawer keeps what it shows; the task's own load reports a lost task.
    }
  },

  ensureFresh: async (taskId) => {
    const isFresh = () => get().taskId === taskId && Date.now() - get().loadedAt < FILE_URL_REFRESH_MS;
    if (isFresh()) return true;
    await get().load(taskId);
    if (isFresh()) return true;
    toast.error(URL_REFRESH_FAILED);
    return false;
  },

  upload: async (taskId, file, name, durationSec) => {
    if (file.size > MAX_FILE_BYTES) { toast.error(FILE_TOO_BIG); return false; }
    // A voice note (it carries a length) is capped by size too.
    if (durationSec !== undefined && file.size > MAX_VOICE_BYTES) { toast.error(VOICE_TOO_BIG); return false; }
    const form = new FormData();
    // Text parts first: the server reads them with the file. `name` carries the UTF-8
    // original name, because multer decodes the file part's own filename as latin1.
    form.append("name", name);
    if (durationSec !== undefined) form.append("durationSec", String(durationSec));
    form.append("file", file, name);
    set((s) => ({ uploading: s.uploading + 1 }));
    try {
      const { data } = await api.post<{ event: TaskEvent }>(`/tasks/${taskId}/files`, form);
      useTasks.getState().appendEvent(taskId, data.event);
      await get().load(taskId);
      return true;
    } catch (error) {
      const tooBig = axios.isAxiosError(error) && error.response?.status === 413;
      toast.error(tooBig ? FILE_TOO_BIG : getErrorMessage(error, "Faylni yuklashda xatolik yuz berdi"));
      return false;
    } finally {
      set((s) => ({ uploading: s.uploading - 1 }));
    }
  },

  remove: async (taskId, fileId) => {
    try {
      const { data } = await api.delete<{ event: TaskEvent }>(`/tasks/${taskId}/files/${fileId}`);
      useTasks.getState().appendEvent(taskId, data.event);
      await get().load(taskId);
      return true;
    } catch (error) {
      toast.error(getErrorMessage(error, "Faylni o'chirishda xatolik yuz berdi"));
      return false;
    }
  },
}));
