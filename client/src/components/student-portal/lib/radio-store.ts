import { create } from "zustand";
import {
  RADIO_STATIONS,
  STATIONS_BY_ID,
  type RadioStation,
} from "@/lib/radio-stations";

/**
 * Live-radio playback state for the student portal.
 *
 * The `<audio>` element is created once at module scope, not inside a
 * component. React owns *when* the portal shows a player; it must never own the
 * element itself, because remounting an element mid-stream restarts the
 * connection — which is exactly what happens on every route change if the
 * element lives in a page. Keeping it outside React is what makes playback
 * survive navigation between `/portal/*` screens.
 *
 * Nothing is proxied through our backend: the browser connects straight to the
 * broadcaster's stream. We only ship the list of URLs.
 */

export type RadioStatus = "idle" | "loading" | "playing" | "error";

const FAVORITES_KEY = "daf.radio.favorites";
const VOLUME_KEY = "daf.radio.volume";
/** Live streams stall; give each one a few silent retries before showing an error. */
const MAX_RETRIES = 3;

let audio: HTMLAudioElement | null = null;
let retries = 0;
let retryTimer: ReturnType<typeof setTimeout> | null = null;

function readStored<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    return raw === null ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback;
  }
}

function writeStored(key: string, value: unknown) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Private-mode quota errors are not worth surfacing over a volume setting.
  }
}

/**
 * A live stream has no meaningful position, so a reconnect has to be a brand-new
 * request. Some CDNs happily replay a cached, already-dead response for the same
 * URL, so each attempt gets a throwaway query param.
 */
function withCacheBuster(url: string, attempt: number) {
  if (attempt === 0) return url;
  return url + (url.includes("?") ? "&" : "?") + "_r=" + attempt;
}

function clearRetry() {
  if (retryTimer) {
    clearTimeout(retryTimer);
    retryTimer = null;
  }
}

interface RadioState {
  stationId: string | null;
  status: RadioStatus;
  volume: number;
  muted: boolean;
  favorites: string[];
  /** True while the expanded now-playing sheet is open. */
  expanded: boolean;

  station: () => RadioStation | null;
  play: (station: RadioStation) => void;
  toggle: () => void;
  stop: () => void;
  retry: () => void;
  next: (direction: 1 | -1) => void;
  setVolume: (value: number) => void;
  toggleMute: () => void;
  toggleFavorite: (id: string) => void;
  setExpanded: (open: boolean) => void;
  /** Restores volume + favorites from localStorage. Called once on mount. */
  hydrate: () => void;
}

export const useRadio = create<RadioState>((set, get) => {
  /** Lazily builds the singleton element and wires its lifecycle to the store. */
  function ensureAudio(): HTMLAudioElement {
    if (audio) return audio;

    const el = new Audio();
    el.preload = "none";
    // Live radio is unbuffered and long-running; letting the browser treat it as
    // media (rather than a file) is what enables OS-level playback controls.
    el.crossOrigin = null;
    el.volume = get().volume;
    el.muted = get().muted;

    el.addEventListener("playing", () => {
      retries = 0;
      set({ status: "playing" });
    });
    el.addEventListener("waiting", () => set({ status: "loading" }));
    el.addEventListener("pause", () => {
      // A pause we didn't ask for (OS interruption) still reads as idle.
      if (get().status !== "error") set({ status: "idle" });
    });

    const fail = () => {
      const { stationId } = get();
      if (!stationId) return;
      const station = STATIONS_BY_ID.get(stationId);
      if (!station) return;

      if (retries < MAX_RETRIES) {
        retries += 1;
        set({ status: "loading" });
        clearRetry();
        // Back off a little so a broadcaster restarting its encoder has time.
        retryTimer = setTimeout(() => {
          el.src = withCacheBuster(station.url, retries);
          el.load();
          void el.play().catch(() => set({ status: "error" }));
        }, 700 * retries);
      } else {
        set({ status: "error" });
      }
    };

    el.addEventListener("error", fail);
    el.addEventListener("stalled", fail);
    el.addEventListener("ended", fail);

    audio = el;
    return el;
  }

  return {
    stationId: null,
    status: "idle",
    volume: 0.85,
    muted: false,
    favorites: [],
    expanded: false,

    station: () => {
      const id = get().stationId;
      return id ? (STATIONS_BY_ID.get(id) ?? null) : null;
    },

    play: (station) => {
      const el = ensureAudio();
      const switching = get().stationId !== station.id;

      clearRetry();
      retries = 0;

      if (switching) {
        el.src = station.url;
        set({ stationId: station.id });
      }

      set({ status: "loading" });
      void el.play().catch(() => {
        // Autoplay rejection or an immediately dead stream. Either way the user
        // needs a visible way back in, so surface it rather than spinning.
        set({ status: "error" });
      });
    },

    toggle: () => {
      const { status, stationId } = get();
      const station = stationId ? STATIONS_BY_ID.get(stationId) : null;
      if (!station) return;
      if (status === "playing" || status === "loading") {
        clearRetry();
        ensureAudio().pause();
        set({ status: "idle" });
      } else {
        get().play(station);
      }
    },

    stop: () => {
      clearRetry();
      retries = 0;
      if (audio) {
        audio.pause();
        // Drops the socket. Without this the browser keeps pulling the stream.
        audio.removeAttribute("src");
        audio.load();
      }
      set({ stationId: null, status: "idle", expanded: false });
    },

    retry: () => {
      const station = get().station();
      if (station) get().play(station);
    },

    next: (direction) => {
      const current = get().stationId;
      const index = RADIO_STATIONS.findIndex((s) => s.id === current);
      if (index < 0) return;
      const size = RADIO_STATIONS.length;
      const target = RADIO_STATIONS[(index + direction + size) % size];
      get().play(target);
    },

    setVolume: (value) => {
      const volume = Math.min(1, Math.max(0, value));
      if (audio) {
        audio.volume = volume;
        audio.muted = false;
      }
      writeStored(VOLUME_KEY, volume);
      set({ volume, muted: false });
    },

    toggleMute: () => {
      const muted = !get().muted;
      if (audio) audio.muted = muted;
      set({ muted });
    },

    toggleFavorite: (id) => {
      const favorites = get().favorites.includes(id)
        ? get().favorites.filter((f) => f !== id)
        : [...get().favorites, id];
      writeStored(FAVORITES_KEY, favorites);
      set({ favorites });
    },

    setExpanded: (open) => set({ expanded: open }),

    hydrate: () => {
      const favorites = readStored<string[]>(FAVORITES_KEY, []).filter((id) =>
        STATIONS_BY_ID.has(id),
      );
      const volume = readStored<number>(VOLUME_KEY, 0.85);
      if (audio) audio.volume = volume;
      set({ favorites, volume });
    },
  };
});
