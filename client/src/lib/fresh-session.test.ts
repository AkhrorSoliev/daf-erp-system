import { describe, expect, it } from "vitest";
import { freshSessionFrom } from "./fresh-session";

const user = { id: 7, firstName: "Ali" };

describe("freshSessionFrom", () => {
  it("returns the pair the API handed back", () => {
    expect(
      freshSessionFrom({
        message: "ok",
        accessToken: "a",
        refreshToken: "r",
        user,
      }),
    ).toEqual({ accessToken: "a", refreshToken: "r", user });
  });

  it("returns null for a message-only response (an API from before ADR-0030)", () => {
    expect(freshSessionFrom({ message: "ok" })).toBeNull();
  });

  it("returns null when part of the session is missing", () => {
    expect(freshSessionFrom({ accessToken: "a", user })).toBeNull();
    expect(
      freshSessionFrom({ accessToken: "a", refreshToken: "r" }),
    ).toBeNull();
  });

  it("returns null for no body at all", () => {
    expect(freshSessionFrom(undefined)).toBeNull();
    expect(freshSessionFrom("ok")).toBeNull();
  });
});
