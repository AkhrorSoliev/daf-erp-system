import { useEffect, useRef } from "react";
import api from "@/lib/api";

export function usePushNotifications() {
  const registered = useRef(false);

  useEffect(() => {
    if (registered.current) return;
    registered.current = true;

    async function register() {
      if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
        console.warn("[Push] Browser does not support push notifications");
        return;
      }

      try {
        const { data } = await api.get("/notifications/vapid-public-key");
        if (!data.key) {
          console.warn("[Push] No VAPID key from server");
          return;
        }

        const registration = await navigator.serviceWorker.register("/sw.js");
        await navigator.serviceWorker.ready;

        // If already subscribed, no need to re-subscribe
        const existing = await registration.pushManager.getSubscription();
        if (existing) {
          console.info("[Push] Already subscribed");
          return;
        }

        console.info("[Push] Current permission:", Notification.permission);

        // If denied, user must manually allow in browser settings
        if (Notification.permission === "denied") {
          console.warn(
            "[Push] Notifications blocked. User must allow in browser settings: " +
            "Chrome → Settings → Privacy → Site Settings → Notifications"
          );
          return;
        }

        const permission = await Notification.requestPermission();
        console.info("[Push] Permission result:", permission);
        if (permission !== "granted") return;

        const subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(data.key) as BufferSource,
        });

        const json = subscription.toJSON();
        if (!json.endpoint || !json.keys) return;

        await api.post("/notifications/push/subscribe", {
          endpoint: json.endpoint,
          p256dh: json.keys.p256dh,
          auth: json.keys.auth,
        });

        console.info("[Push] Successfully subscribed");
      } catch (err) {
        console.error("[Push] Registration failed:", err);
      }
    }

    register();
  }, []);
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
