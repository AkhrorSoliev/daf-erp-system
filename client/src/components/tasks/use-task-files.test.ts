import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { get, post, del, toastError, appendEvent } = vi.hoisted(() => ({
  get: vi.fn(), post: vi.fn(), del: vi.fn(), toastError: vi.fn(), appendEvent: vi.fn(),
}));
vi.mock("@/lib/api", () => ({ default: { get, post, delete: del } }));
vi.mock("react-hot-toast", () => ({ default: { error: toastError } }));
vi.mock("@/hooks/use-tasks", () => ({ useTasks: { getState: () => ({ appendEvent }) }, tasksText: (source: string) => source }));

import { FILE_URL_REFRESH_MS, MAX_FILE_BYTES, MAX_VOICE_BYTES } from "./task-file-rules";
import { useTaskFiles } from "./use-task-files";

const list = { data: { data: [], hasFreshPhoto: false, enabled: true } };
const blobOf = (size: number) => ({ size }) as Blob;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-11T08:00:00Z"));
  get.mockReset(); post.mockReset(); toastError.mockReset(); appendEvent.mockReset();
  get.mockResolvedValue(list);
  useTaskFiles.setState({ enabled: null, taskId: null, files: [], hasFreshPhoto: false, uploading: 0, loadedAt: 0 });
});
afterEach(() => vi.useRealTimers());

describe("upload guards", () => {
  it("refuses a file over 20 MB without a request", async () => {
    expect(await useTaskFiles.getState().upload("T1", blobOf(MAX_FILE_BYTES + 1), "a.pdf")).toBe(false);
    expect(post).not.toHaveBeenCalled();
    expect(toastError).toHaveBeenCalledWith("Fayl hajmi 20 MB dan oshmasligi kerak");
  });

  it("refuses a voice note over 2 MB (it carries a length) but not a document of that size", async () => {
    expect(await useTaskFiles.getState().upload("T1", blobOf(MAX_VOICE_BYTES + 1), "v.webm", 120)).toBe(false);
    expect(post).not.toHaveBeenCalled();
    expect(toastError).toHaveBeenCalledWith("Ovozli xabar 2 MB dan oshmasligi kerak");

    post.mockResolvedValue({ data: { event: { id: "E1" } } });
    expect(await useTaskFiles.getState().upload("T1", new Blob([new Uint8Array(8)]), "a.pdf")).toBe(true);
  });

  it("always sends the UTF-8 name first, then the length, then the file", async () => {
    post.mockResolvedValue({ data: { event: { id: "E1" } } });
    await useTaskFiles.getState().upload("T1", new Blob(["x"]), "ovozli-xabar.webm", 7);
    const form = post.mock.calls[0][1] as FormData;
    expect([...form.keys()]).toEqual(["name", "durationSec", "file"]);
    expect(form.get("name")).toBe("ovozli-xabar.webm");
    expect(form.get("durationSec")).toBe("7");
    expect(appendEvent).toHaveBeenCalledWith("T1", { id: "E1" });
  });
});

describe("ensureFresh", () => {
  it("does not read again while the links are young", async () => {
    await useTaskFiles.getState().load("T1");
    get.mockClear();
    vi.advanceTimersByTime(FILE_URL_REFRESH_MS - 1000);
    expect(await useTaskFiles.getState().ensureFresh("T1")).toBe(true);
    expect(get).not.toHaveBeenCalled();
  });

  it("re-reads once they are old, and says true when that worked", async () => {
    await useTaskFiles.getState().load("T1");
    get.mockClear();
    vi.advanceTimersByTime(FILE_URL_REFRESH_MS + 1000);
    expect(await useTaskFiles.getState().ensureFresh("T1")).toBe(true);
    expect(get).toHaveBeenCalledTimes(1);
  });

  it("says false with a toast when the re-read fails", async () => {
    await useTaskFiles.getState().load("T1");
    vi.advanceTimersByTime(FILE_URL_REFRESH_MS + 1000);
    get.mockRejectedValue(new Error("offline"));
    expect(await useTaskFiles.getState().ensureFresh("T1")).toBe(false);
    expect(toastError).toHaveBeenCalledWith("Fayl havolasini yangilab bo'lmadi. Qayta urinib ko'ring.");
  });

  it("reads the list of another task even when the shown one is young", async () => {
    await useTaskFiles.getState().load("T1");
    get.mockClear();
    expect(await useTaskFiles.getState().ensureFresh("T2")).toBe(true);
    expect(get).toHaveBeenCalledWith("/tasks/T2/files");
  });
});
