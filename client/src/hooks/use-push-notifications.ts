import { useCallback, useEffect, useRef, useState } from "react";
import api from "@/lib/api";

/**
 * `unsupported` covers both a browser without Web Push (e.g. iPhone Safari
 * outside a home-screen app) and a server without VAPID keys — in neither case
 * is there anything to ask the user for.
 */
export type PushState = "unsupported" | NotificationPermission;

/**
 * Registers this device for push and reports where the permission stands.
 *
 * The browser prompt is NOT opened on mount: Safari and Firefox ignore
 * `requestPermission()` without a user gesture, and Chrome quietly blocks it.
 * `enable()` must be called from a click.
 */
export function usePushNotifications() {
  const [state, setState] = useState<PushState | null>(null);
  const registration = useRef<ServiceWorkerRegistration | null>(null);
  const vapidKey = useRef("");
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    async function init() {
      if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
        setState("unsupported");
        return;
      }
      try {
        const { data } = await api.get("/notifications/vapid-public-key");
        if (!data.key) {
          setState("unsupported");
          return;
        }
        vapidKey.current = data.key;
        registration.current = await navigator.serviceWorker.register("/sw.js");
        await navigator.serviceWorker.ready;
        if (Notification.permission === "granted") {
          await subscribe(registration.current, data.key);
        }
        setState(Notification.permission);
      } catch {
        // Push is non-critical — never nag about something that cannot work
        setState("unsupported");
      }
    }

    init();
  }, []);

  const enable = useCallback(async () => {
    if (!registration.current) return;
    setState(await requestPush(registration.current, vapidKey.current));
  }, []);

  return { state, enable };
}

/** Opens the browser prompt and, on "granted", subscribes this device. */
export async function requestPush(
  registration: ServiceWorkerRegistration,
  vapidKey: string,
): Promise<NotificationPermission> {
  const permission = await Notification.requestPermission();
  if (permission === "granted") {
    try {
      await subscribe(registration, vapidKey);
    } catch {
      // Permission is given; a failed subscribe retries on the next page load
    }
  }
  return permission;
}

async function subscribe(registration: ServiceWorkerRegistration, vapidKey: string) {
  // Already subscribed — the server has this endpoint
  if (await registration.pushManager.getSubscription()) return;

  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(vapidKey) as BufferSource,
  });

  const json = subscription.toJSON();
  if (!json.endpoint || !json.keys) return;

  await api.post("/notifications/push/subscribe", {
    endpoint: json.endpoint,
    p256dh: json.keys.p256dh,
    auth: json.keys.auth,
  });
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}
