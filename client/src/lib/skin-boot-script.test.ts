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
/** A signed-in browser: the session cookie the middleware needs, then the user cookie. */
const signedIn = (u: unknown) => `token=abc; ${userCookie(u)}`;

describe("skin boot script", () => {
  it("sets the skin of the signed-in user before the page is drawn", () => {
    expect(run(signedIn({ id: 1, uiSkin: "ormon" }))).toEqual({ "data-skin": "ormon" });
    expect(run(`a=1; token=abc; ${userCookie({ uiSkin: "qum" })}; b=2`)).toEqual({ "data-skin": "qum" });
  });

  it("does nothing for the default skin, an unknown one or none", () => {
    expect(run(signedIn({ uiSkin: "daftar" }))).toEqual({});
    expect(run(signedIn({ uiSkin: "neon" }))).toEqual({});
    expect(run(signedIn({ id: 1 }))).toEqual({});
    expect(run(signedIn({ uiSkin: null }))).toEqual({});
  });

  it("does nothing when nobody is signed in or the cookie is damaged", () => {
    expect(run("")).toEqual({});
    expect(run("other=1")).toEqual({});
    expect(run("token=abc; xuser=%7B%22uiSkin%22%3A%22qum%22%7D")).toEqual({});
    expect(run("token=abc; user=%7Bnot-json")).toEqual({});
  });

  it("does nothing without a session cookie, even when a user cookie carries a skin", () => {
    expect(run(userCookie({ uiSkin: "ormon" }))).toEqual({});
    expect(run(`xtoken=abc; ${userCookie({ uiSkin: "ormon" })}`)).toEqual({});
    expect(run(`mytoken=abc; ${userCookie({ uiSkin: "ormon" })}`)).toEqual({});
  });

  it("counts a refresh token alone as signed in", () => {
    expect(run(`refreshToken=abc; ${userCookie({ uiSkin: "gilos" })}`)).toEqual({ "data-skin": "gilos" });
  });
});
