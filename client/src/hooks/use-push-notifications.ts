import { useEffect, useRef } from "react";
import api from "@/lib/api";

export function usePushNotifications() {
  const registered = useRef(false);

  useEffect(() => {
    if (registered.current) return;
    registered.current = true;

    async function register() {
      // Check browser support
      if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;

      try {
        // Get VAPID public key from server
        const { data } = await api.get("/notifications/vapid-public-key");
        if (!data.key) return;

        // Register service worker
        const registration = await navigator.serviceWorker.register("/sw.js");
        await navigator.serviceWorker.ready;

        // Check/request notification permission
        const permission = await Notification.requestPermission();
        if (permission !== "granted") return;

        // Subscribe to push
        const subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(data.key) as BufferSource,
        });

        const json = subscription.toJSON();
        if (!json.endpoint || !json.keys) return;

        // Send subscription to backend
        await api.post("/notifications/push/subscribe", {
          endpoint: json.endpoint,
          p256dh: json.keys.p256dh,
          auth: json.keys.auth,
        });
      } catch {
        // Push registration is optional — don't block app
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
