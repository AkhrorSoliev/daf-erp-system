import { describe, expect, it } from "vitest";
import { parseChatQuery } from "./chat-search-model";

describe("parseChatQuery", () => {
  it("is empty for blank or one character", () => {
    expect(parseChatQuery("   ")).toEqual({ kind: "empty" });
    expect(parseChatQuery("a")).toEqual({ kind: "empty" });
  });
  it("is a name search from two characters, trimmed", () => {
    expect(parseChatQuery("  Ma ")).toEqual({ kind: "name", q: "Ma" });
  });
  it("reads @username lowercased without the @", () => {
    expect(parseChatQuery(" @Madina_01 ")).toEqual({
      kind: "username",
      username: "madina_01",
    });
  });
  it("rejects a username the server would refuse", () => {
    expect(parseChatQuery("@")).toEqual({ kind: "invalid" });
    expect(parseChatQuery("@abc")).toEqual({ kind: "invalid" });
    expect(parseChatQuery("@1madina")).toEqual({ kind: "invalid" });
    expect(parseChatQuery("@madina-x")).toEqual({ kind: "invalid" });
    expect(parseChatQuery("@" + "a".repeat(33))).toEqual({ kind: "invalid" });
  });
});
