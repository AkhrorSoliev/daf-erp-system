import { describe, expect, it } from "vitest";
import { SKIN_BOOT_SCRIPT } from "./skin-boot-script";

/** Runs the inline script against a fake document and returns the attributes it set. */
function run(cookie: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  const doc = {
    cookie,
    documentElement: { setAttribute: (k: string, v: string) => (attrs[k] = v) },
  };
  new Function("document", SKIN_BOOT_SCRIPT)(doc);
  return attrs;
}

const userCookie = (u: unknown) => `user=${encodeURIComponent(JSON.stringify(u))}`;

describe("skin boot script", () => {
  it("sets the skin of the signed-in user before the page is drawn", () => {
    expect(run(userCookie({ id: 1, uiSkin: "ormon" }))).toEqual({ "data-skin": "ormon" });
    expect(run(`a=1; ${userCookie({ uiSkin: "qum" })}; b=2`)).toEqual({ "data-skin": "qum" });
  });

  it("does nothing for the default skin, an unknown one or none", () => {
    expect(run(userCookie({ uiSkin: "daftar" }))).toEqual({});
    expect(run(userCookie({ uiSkin: "neon" }))).toEqual({});
    expect(run(userCookie({ id: 1 }))).toEqual({});
    expect(run(userCookie({ uiSkin: null }))).toEqual({});
  });

  it("does nothing when nobody is signed in or the cookie is damaged", () => {
    expect(run("")).toEqual({});
    expect(run("other=1")).toEqual({});
    expect(run("xuser=%7B%22uiSkin%22%3A%22qum%22%7D")).toEqual({});
    expect(run("user=%7Bnot-json")).toEqual({});
  });
});
