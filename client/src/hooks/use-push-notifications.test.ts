import { afterEach, describe, expect, it, vi } from "vitest";

const post = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api", () => ({ default: { post } }));

import { requestPush } from "./use-push-notifications";

function fakeRegistration() {
  const subscribe = vi.fn(async () => ({
    toJSON: () => ({ endpoint: "https://push.example/abc", keys: { p256dh: "p256", auth: "auth" } }),
  }));
  const registration = {
    pushManager: { getSubscription: vi.fn(async () => null), subscribe },
  } as unknown as ServiceWorkerRegistration;
  return { registration, subscribe };
}

function answerPrompt(permission: NotificationPermission) {
  vi.stubGlobal("Notification", { requestPermission: vi.fn(async () => permission) });
}

afterEach(() => {
  vi.unstubAllGlobals();
  post.mockReset();
});

describe("requestPush", () => {
  it("subscribes the device and sends it to the server when the user allows", async () => {
    answerPrompt("granted");
    const { registration, subscribe } = fakeRegistration();

    expect(await requestPush(registration, "BEl6")).toBe("granted");
    expect(subscribe).toHaveBeenCalledOnce();
    expect(post).toHaveBeenCalledWith("/notifications/push/subscribe", {
      endpoint: "https://push.example/abc",
      p256dh: "p256",
      auth: "auth",
    });
  });

  it.each(["denied", "default"] as const)("does not subscribe when the answer is %s", async (answer) => {
    answerPrompt(answer);
    const { registration, subscribe } = fakeRegistration();

    expect(await requestPush(registration, "BEl6")).toBe(answer);
    expect(subscribe).not.toHaveBeenCalled();
    expect(post).not.toHaveBeenCalled();
  });
});
