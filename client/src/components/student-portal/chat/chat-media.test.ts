import { readFileSync } from "fs";
import { join } from "path";
import { describe, expect, it } from "vitest";
import {
  CHAT_IMAGE_MIMES,
  IMAGE_MAX_BYTES,
  VOICE_MAX_BYTES,
  VOICE_MAX_SEC,
  checkImage,
  formatDuration,
  voiceMime,
} from "./chat-media";

const SERVER = join(__dirname, "../../../../../server/src/chat");
const read = (f: string) => readFileSync(join(SERVER, f), "utf8");

describe("mirrors the server limits", () => {
  const rules = read("media/chat-file-rules.ts");
  it("image and voice numbers", () => {
    expect(rules).toContain("MAX_CHAT_IMAGE_BYTES = 5 * 1024 * 1024");
    expect(rules).toContain("MAX_CHAT_VOICE_BYTES = 2 * 1024 * 1024");
    expect(rules).toContain(`MAX_CHAT_VOICE_SECONDS = ${VOICE_MAX_SEC}`);
    expect(IMAGE_MAX_BYTES).toBe(5 * 1024 * 1024);
    expect(VOICE_MAX_BYTES).toBe(2 * 1024 * 1024);
  });
  it("message length", () => {
    expect(read("chat.constants.ts")).toContain("MESSAGE_MAX = 2000");
  });
  it("image types are the ones the server sniffs", () => {
    const task = readFileSync(
      join(SERVER, "../tasks/task-file-rules.ts"),
      "utf8",
    );
    for (const m of CHAT_IMAGE_MIMES) expect(task).toContain(`'${m}'`);
  });
});

describe("checkImage", () => {
  const f = (type: string, size: number) =>
    ({ type, size }) as unknown as File;
  it("accepts jpeg/png/webp up to the limit", () => {
    expect(checkImage(f("image/jpeg", IMAGE_MAX_BYTES))).toBeNull();
    expect(checkImage(f("image/png", 10))).toBeNull();
    expect(checkImage(f("image/webp", 10))).toBeNull();
  });
  it("refuses other types and big files", () => {
    expect(checkImage(f("image/gif", 10))).toMatch(/JPG, PNG, WebP/);
    expect(checkImage(f("application/pdf", 10))).not.toBeNull();
    expect(checkImage(f("image/png", IMAGE_MAX_BYTES + 1))).toMatch(/5 MB/);
  });
  it("uses the translator", () => {
    expect(checkImage(f("image/gif", 1), (s) => `T:${s}`)).toMatch(/^T:/);
  });
});

describe("voiceMime", () => {
  it("prefers webm opus, then ogg opus, else null", () => {
    expect(voiceMime(() => true)).toBe("audio/webm;codecs=opus");
    expect(voiceMime((m) => m.startsWith("audio/ogg"))).toBe(
      "audio/ogg;codecs=opus",
    );
    expect(voiceMime(() => false)).toBeNull();
  });
});

describe("formatDuration", () => {
  it("m:ss", () => {
    expect(formatDuration(7)).toBe("0:07");
    expect(formatDuration(120)).toBe("2:00");
    expect(formatDuration(65.4)).toBe("1:05");
    expect(formatDuration(-3)).toBe("0:00");
  });
});
