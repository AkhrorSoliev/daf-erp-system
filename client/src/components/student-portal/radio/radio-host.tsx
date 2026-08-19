"use client";

import { useEffect } from "react";
import { useRadio } from "../lib/radio-store";
import { categoryOf } from "@/lib/radio-stations";

/**
 * Headless companion to the radio store. Rendered once by the portal shell.
 *
 * Two jobs, both of which need to outlive any single screen:
 *  1. Publish the current station to the Media Session API, so the phone's lock
 *     screen, notification shade and headset buttons control playback. Without
 *     this a student who locks their phone loses any way to stop the radio short
 *     of reopening the browser.
 *  2. Cut the stream when the student leaves the portal entirely (logout, or a
 *     jump to an admin route). Audio that keeps playing after its UI is gone is
 *     the single worst failure mode for a background player.
 */
export function RadioHost() {
  const status = useRadio((s) => s.status);
  const stationId = useRadio((s) => s.stationId);
  const hydrate = useRadio((s) => s.hydrate);
  const stop = useRadio((s) => s.stop);

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  // Stop on unmount — the portal shell is gone, so nothing can control playback.
  useEffect(() => stop, [stop]);

  useEffect(() => {
    if (typeof navigator === "undefined" || !("mediaSession" in navigator)) {
      return;
    }
    const session = navigator.mediaSession;

    if (!stationId) {
      session.metadata = null;
      session.playbackState = "none";
      return;
    }

    const station = useRadio.getState().station();
    if (!station) return;

    session.metadata = new MediaMetadata({
      title: station.name,
      artist: categoryOf(station.category).label,
      album: "DAF Zentrum radio",
      artwork: [
        { src: "/daf-logo.png", sizes: "512x512", type: "image/png" },
      ],
    });
    session.playbackState = status === "playing" ? "playing" : "paused";

    const { toggle, next, stop: stopRadio } = useRadio.getState();
    const handlers: [MediaSessionAction, MediaSessionActionHandler][] = [
      ["play", toggle],
      ["pause", toggle],
      ["stop", stopRadio],
      ["previoustrack", () => next(-1)],
      ["nexttrack", () => next(1)],
    ];

    for (const [action, handler] of handlers) {
      try {
        session.setActionHandler(action, handler);
      } catch {
        // Older browsers reject unknown actions; the rest still register.
      }
    }

    return () => {
      for (const [action] of handlers) {
        try {
          session.setActionHandler(action, null);
        } catch {
          // Ignore — teardown of an action the browser never accepted.
        }
      }
    };
  }, [stationId, status]);

  return null;
}
