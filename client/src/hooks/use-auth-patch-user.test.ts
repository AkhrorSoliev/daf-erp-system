import { beforeEach, describe, expect, it } from "vitest";
import { useAuth, type AuthUser } from "./use-auth";

const user = { id: 1, firstName: "Ali", lastName: "Valiyev", uiSkin: null } as unknown as AuthUser;

describe("useAuth.patchUser", () => {
  beforeEach(() => useAuth.setState({ user: null, token: null }));

  it("merges the patch into the signed-in user", () => {
    useAuth.setState({ user });
    useAuth.getState().patchUser({ uiSkin: "ormon" });
    expect(useAuth.getState().user).toMatchObject({ id: 1, firstName: "Ali", uiSkin: "ormon" });
  });

  it("does nothing when nobody is signed in", () => {
    useAuth.getState().patchUser({ uiSkin: "ormon" });
    expect(useAuth.getState().user).toBeNull();
  });
});
