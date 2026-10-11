import { describe, expect, it } from "vitest";
import type { TaskEvent, TaskFileView } from "@/hooks/use-tasks";
import {
  VOICE_LIMIT_SEC, fileOfEvent, formatDuration, formatSize, photoFirst, pickVoiceMime, voiceFileName, voiceReducer,
} from "./task-file-rules";

describe("formatSize / formatDuration", () => {
  it("reads like the mockup", () => {
    expect(formatSize(900)).toBe("900 B");
    expect(formatSize(1536)).toBe("1,5 KB");
    expect(formatSize(1258291)).toBe("1,2 MB");
    expect(formatSize(20 * 1024 * 1024)).toBe("20 MB");
    expect(formatDuration(0)).toBe("0:00");
    expect(formatDuration(65)).toBe("1:05");
    expect(formatDuration(180)).toBe("3:00");
  });
});

describe("fileOfEvent", () => {
  const f = { id: "F1" } as TaskFileView;
  it("finds the event's live file, nothing for a deleted or a plain one", () => {
    expect(fileOfEvent([f], { fileId: "F1" } as TaskEvent)).toBe(f);
    expect(fileOfEvent([f], { fileId: "F2" } as TaskEvent)).toBeUndefined();
    expect(fileOfEvent([f], { fileId: null } as TaskEvent)).toBeUndefined();
  });
});

describe("photoFirst", () => {
  it("only a photo task heading to review without a fresh photo", () => {
    expect(photoFirst({ requiresPhoto: true }, "IN_REVIEW", false)).toBe(true);
    expect(photoFirst({ requiresPhoto: true }, "IN_REVIEW", true)).toBe(false);
    expect(photoFirst({ requiresPhoto: true }, "DONE", false)).toBe(false);
    expect(photoFirst({ requiresPhoto: false }, "IN_REVIEW", false)).toBe(false);
  });
});

describe("the voice recorder", () => {
  it("prefers webm, then ogg, else none", () => {
    expect(pickVoiceMime(() => true)).toBe("audio/webm;codecs=opus");
    expect(pickVoiceMime((t) => t.startsWith("audio/ogg"))).toBe("audio/ogg;codecs=opus");
    expect(pickVoiceMime(() => false)).toBeNull();
    expect(voiceFileName("audio/webm;codecs=opus")).toBe("ovozli-xabar.webm");
    expect(voiceFileName("audio/ogg;codecs=opus")).toBe("ovozli-xabar.ogg");
  });
  it("idle → recording → ready → idle; the length is whole seconds, at least 1, at most the limit", () => {
    const blob = new Blob(["x"]);
    const rec = voiceReducer({ kind: "idle" }, { type: "start", at: 1_000 });
    expect(rec).toEqual({ kind: "recording", startedAt: 1_000 });
    expect(voiceReducer(rec, { type: "stop", at: 66_400, blob, url: "blob:1" })).toEqual({ kind: "ready", blob, url: "blob:1", durationSec: 65 });
    expect(voiceReducer(rec, { type: "stop", at: 1_100, blob, url: "blob:1" })).toMatchObject({ durationSec: 1 });
    expect(voiceReducer(rec, { type: "stop", at: 999_000, blob, url: "blob:1" })).toMatchObject({ durationSec: VOICE_LIMIT_SEC });
    expect(voiceReducer({ kind: "ready", blob, url: "blob:1", durationSec: 3 }, { type: "reset" })).toEqual({ kind: "idle" });
  });
  it("ignores a stop that is not ending a recording, and a start while recording", () => {
    const blob = new Blob(["x"]);
    expect(voiceReducer({ kind: "idle" }, { type: "stop", at: 5, blob, url: "u" })).toEqual({ kind: "idle" });
    const rec = { kind: "recording" as const, startedAt: 1 };
    expect(voiceReducer(rec, { type: "start", at: 9 })).toBe(rec);
  });
});
