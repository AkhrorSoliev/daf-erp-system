import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  USERNAME_RE,
  normalizeUsername,
  validateUsername,
} from "./chat-username-rules";

describe("validateUsername", () => {
  it("accepts 5 and 32 characters, rejects 4 and 33", () => {
    expect(validateUsername("a".repeat(5))).toBeNull();
    expect(validateUsername("a".repeat(32))).toBeNull();
    expect(validateUsername("a".repeat(4))).toMatch(/Kamida 5/);
    expect(validateUsername("a".repeat(33))).toMatch(/Ko.pi bilan 32/);
  });
  it("normalises case, spaces and one leading @", () => {
    expect(normalizeUsername("  @Madina_01 ")).toBe("madina_01");
    expect(validateUsername("@Madina_01")).toBeNull();
    expect(validateUsername("@@madina")).toMatch(/lotin harf/);
  });
  it("must start with a letter", () => {
    expect(validateUsername("1madina")).toMatch(/Harf bilan/);
    expect(validateUsername("_madina")).toMatch(/Harf bilan/);
  });
  it("allows only latin letters, digits and _", () => {
    expect(validateUsername("madina-x")).toMatch(/lotin harf/);
    expect(validateUsername("madina x")).toMatch(/lotin harf/);
    expect(validateUsername("madinä_x")).toMatch(/lotin harf/);
  });
  it("uses the given translator", () => {
    expect(validateUsername("ab", (s) => `T:${s}`)).toMatch(/^T:/);
  });
});

describe("server mirror", () => {
  it("has the same regex source as the server rules", () => {
    const src = readFileSync(
      resolve(process.cwd(), "../server/src/chat/username/chat-username.rules.ts"),
      "utf8",
    );
    expect(src).toContain(`const USERNAME = ${USERNAME_RE.toString()};`);
  });
});
