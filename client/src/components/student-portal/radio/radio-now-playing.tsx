"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { BottomSheet } from "../lumio/bottom-sheet";
import { Badge } from "../lumio/badge";
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  SpeakerHigh,
  SpeakerSlash,
  ArrowClockwise,
  CircleNotch,
  Heart,
  Radio,
  CaretRight,
} from "../lumio/icon";
import { TILE_TONE } from "../lumio/tones";
import { categoryOf } from "@/lib/radio-stations";
import { useRadio } from "../lib/radio-store";
import { LiveBars } from "./live-bars";

/**
 * Expanded player, opened from the dock. Holds everything the dock leaves out:
 * station switching, volume, favourite, and the technical detail a student
 * might want when a stream sounds rough.
 *
 * Volume slider is desktop-only on purpose — iOS ignores `HTMLMediaElement.volume`
 * entirely, so on a phone it would be a control that visibly does nothing. Mute
 * works everywhere, so that stays.
 */
export function RadioNowPlaying() {
  const pathname = usePathname();
  const expanded = useRadio((s) => s.expanded);
  const setExpanded = useRadio((s) => s.setExpanded);
  const status = useRadio((s) => s.status);
  const volume = useRadio((s) => s.volume);
  const muted = useRadio((s) => s.muted);
  const favorites = useRadio((s) => s.favorites);
  const station = useRadio((s) => s.station());
  const toggle = useRadio((s) => s.toggle);
  const next = useRadio((s) => s.next);
  const retry = useRadio((s) => s.retry);
  const setVolume = useRadio((s) => s.setVolume);
  const toggleMute = useRadio((s) => s.toggleMute);
  const toggleFavorite = useRadio((s) => s.toggleFavorite);

  if (!station) return null;

  const category = categoryOf(station.category);
  const Icon = category.icon;
  const playing = status === "playing";
  const loading = status === "loading";
  const failed = status === "error";
  const isFavorite = favorites.includes(station.id);
  const onRadioPage = pathname.startsWith("/portal/radio");

  return (
    <BottomSheet
      open={expanded}
      onOpenChange={setExpanded}
      title="Hozir eshitilmoqda"
    >
      <div className="flex flex-col gap-5 pb-2">
        {/* Identity block */}
        <div className="flex items-center gap-4">
          <span
            className={cn(
              "inline-flex size-[72px] shrink-0 items-center justify-center rounded-feature",
              TILE_TONE[category.tone],
            )}
          >
            <Icon size={36} weight="fill" />
          </span>
          <div className="min-w-0 flex-1">
            <h3 className="truncate font-display text-2xl font-extrabold leading-tight text-ink-900">
              {station.name}
            </h3>
            <p
              className={cn(
                "mt-1 flex items-center gap-1.5 text-sm font-bold",
                failed
                  ? "text-danger"
                  : playing
                    ? "text-coral-600"
                    : "text-ink-500",
              )}
            >
              {playing ? <LiveBars active /> : null}
              {failed
                ? "Ulanib bo'lmadi"
                : loading
                  ? "Ulanmoqda..."
                  : playing
                    ? "Jonli efir"
                    : "To'xtatilgan"}
            </p>
          </div>
          <button
            type="button"
            onClick={() => toggleFavorite(station.id)}
            aria-label={
              isFavorite
                ? "Sevimlilardan olib tashlash"
                : "Sevimlilarga qo'shish"
            }
            aria-pressed={isFavorite}
            className={cn(
              "inline-flex size-11 shrink-0 items-center justify-center rounded-full border transition-colors",
              isFavorite
                ? "border-coral-500/40 bg-coral-500/12 text-coral-600"
                : "border-line bg-surface text-ink-400 hover:bg-tint hover:text-ink-700",
            )}
          >
            <Heart size={22} weight={isFavorite ? "fill" : "bold"} />
          </button>
        </div>

        <p className="text-sm font-semibold leading-relaxed text-ink-600">
          {station.note}
        </p>

        {failed ? (
          <div className="rounded-card border border-danger/25 bg-danger/8 px-4 py-3">
            <p className="text-sm font-bold text-danger">
              Efirga ulanib bo&apos;lmadi.
            </p>
            <p className="mt-1 text-sm font-semibold leading-snug text-ink-600">
              Internet aloqasini tekshiring. Radiostansiya vaqtincha
              o&apos;chirilgan bo&apos;lishi ham mumkin — boshqasini tanlab
              ko&apos;ring.
            </p>
          </div>
        ) : null}

        {/* Transport */}
        <div className="flex items-center justify-center gap-6">
          <button
            type="button"
            onClick={() => next(-1)}
            aria-label="Oldingi stansiya"
            className="inline-flex size-12 items-center justify-center rounded-full text-ink-600 transition-colors hover:bg-tint hover:text-ink-900"
          >
            <SkipBack size={26} weight="fill" />
          </button>

          <button
            type="button"
            onClick={failed ? retry : toggle}
            aria-label={
              failed
                ? "Qayta ulanish"
                : playing || loading
                  ? "To'xtatish"
                  : "Eshitish"
            }
            className="clay-btn inline-flex size-[68px] items-center justify-center rounded-full bg-coral-500 text-white shadow-lumio-pop transition-transform active:scale-95"
          >
            {failed ? (
              <ArrowClockwise size={30} weight="bold" />
            ) : loading ? (
              <CircleNotch size={30} weight="bold" className="animate-spin" />
            ) : playing ? (
              <Pause size={30} weight="fill" />
            ) : (
              <Play size={30} weight="fill" className="ml-1" />
            )}
          </button>

          <button
            type="button"
            onClick={() => next(1)}
            aria-label="Keyingi stansiya"
            className="inline-flex size-12 items-center justify-center rounded-full text-ink-600 transition-colors hover:bg-tint hover:text-ink-900"
          >
            <SkipForward size={26} weight="fill" />
          </button>
        </div>

        {/* Volume — mute everywhere, slider only where the browser honours it. */}
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={toggleMute}
            aria-label={muted ? "Ovozni yoqish" : "Ovozni o'chirish"}
            aria-pressed={muted}
            className={cn(
              "inline-flex size-10 shrink-0 items-center justify-center rounded-full border border-line transition-colors",
              muted
                ? "bg-ink-500/12 text-ink-700"
                : "bg-surface text-ink-500 hover:bg-tint",
            )}
          >
            {muted ? (
              <SpeakerSlash size={20} weight="bold" />
            ) : (
              <SpeakerHigh size={20} weight="bold" />
            )}
          </button>
          <label className="hidden flex-1 items-center lg:flex">
            <span className="sr-only">Ovoz balandligi</span>
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={muted ? 0 : volume}
              onChange={(e) => setVolume(Number(e.target.value))}
              className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-sunk accent-coral-500"
            />
          </label>
          <span className="ml-auto flex items-center gap-1.5 lg:ml-0">
            <Badge tone="neutral" size="sm">
              {station.codec} {station.bitrate}k
            </Badge>
            <Badge tone="neutral" size="sm">
              {station.country === "AT" ? "Avstriya" : "Germaniya"}
            </Badge>
          </span>
        </div>

        {!onRadioPage ? (
          <Link
            href="/portal/radio"
            onClick={() => setExpanded(false)}
            className="flex items-center gap-3 rounded-card border border-line bg-surface px-4 py-3 shadow-lumio-sm transition-colors hover:bg-tint"
          >
            <Radio size={20} weight="bold" className="text-ink-500" />
            <span className="flex-1 font-display text-base font-bold text-ink-900">
              Boshqa stansiya tanlash
            </span>
            <CaretRight size={18} weight="bold" className="text-ink-400" />
          </Link>
        ) : null}
      </div>
    </BottomSheet>
  );
}
