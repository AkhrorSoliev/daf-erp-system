import { AxiosError } from "axios";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("react-hot-toast", () => ({ default: { error: vi.fn() } }));

import api from "./api";
import { usePermissions } from "@/hooks/use-permissions";

// Every request is refused with a 403, as a blocked account's are
// (`JwtAuthGuard.assertNotBlocked`, on every route that is not public).
api.defaults.adapter = (config) =>
  Promise.reject(
    new AxiosError("Forbidden", "ERR_BAD_REQUEST", config, null, {
      status: 403,
      statusText: "Forbidden",
      headers: {},
      config,
      data: { message: "Hisobingiz bloklangan" },
    }),
  );

const settle = () => new Promise((resolve) => setTimeout(resolve, 20));

describe("the 403 re-read of the capability list", () => {
  const refresh = vi.fn(async () => undefined);

  beforeEach(() => {
    refresh.mockClear();
    usePermissions.setState({ refresh });
  });

  it("runs after a 403 on an ordinary route", async () => {
    await api.get("/students").catch(() => undefined);
    await vi.waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
  });

  it("does not run after a 403 on the list's own request, so the reads cannot loop", async () => {
    // The control above proves the hook fires in this setup, so silence here
    // is the guard and not a hook that never runs.
    await api.get("/students").catch(() => undefined);
    await vi.waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
    refresh.mockClear();

    await api.get("/permissions/me").catch(() => undefined);
    await settle();

    expect(refresh).not.toHaveBeenCalled();
  });
});
