"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { Screen, ScreenHeader, FadeIn, Badge } from "./lumio";
import { Play, Pause, CircleNotch, Heart, Broadcast } from "./lumio/icon";
import { TILE_TONE } from "./lumio/tones";
import {
  RADIO_CATEGORIES,
  RADIO_STATIONS,
  STATIONS_BY_ID,
  categoryOf,
  stationsInCategory,
  type RadioCategoryId,
  type RadioStation,
} from "@/lib/radio-stations";
import { useRadio } from "./lib/radio-store";
import { LiveBars } from "./radio/live-bars";

type Filter = "all" | "favorites" | RadioCategoryId;

/**
 * Station browser. Playback itself lives in the portal shell, so this screen is
 * purely a chooser — it starts a station and gets out of the way.
 *
 * Grouped by category rather than presented as one flat list of 26, because the
 * grouping is the actual advice: a learner should know that the speech-heavy
 * news channels teach more German than the pop ones. The `Nutq ko'p` badge
 * carries the same message at the row level.
 */
export function StudentRadioPage() {
  const [filter, setFilter] = useState<Filter>("all");
  const favorites = useRadio((s) => s.favorites);

  const favoriteStations = favorites
    .map((id) => STATIONS_BY_ID.get(id))
    .filter((s): s is RadioStation => Boolean(s));

  const chips: { id: Filter; label: string }[] = [
    { id: "all", label: "Hammasi" },
    ...(favoriteStations.length
      ? [{ id: "favorites" as Filter, label: "Sevimli" }]
      : []),
    ...RADIO_CATEGORIES.map((c) => ({ id: c.id as Filter, label: c.label })),
  ];

  const visibleCategories =
    filter === "all" || filter === "favorites"
      ? RADIO_CATEGORIES
      : RADIO_CATEGORIES.filter((c) => c.id === filter);

  return (
    <Screen>
      <ScreenHeader
        title="Radio"
        subtitle="Jonli efir"
        right={
          <span className="hidden items-center gap-1.5 rounded-pill bg-coral-500/12 px-3 py-1.5 text-xs font-extrabold text-coral-600 sm:inline-flex">
            <Broadcast size={14} weight="fill" />
            {RADIO_STATIONS.length} ta stansiya
          </span>
        }
      />

      <p className="-mt-1 max-w-[62ch] text-sm font-semibold leading-relaxed text-ink-600">
        Germaniya va Avstriyaning jonli radiostansiyalari. Kuniga 15 daqiqa
        tinglash ham quloqni nemis tiliga o&apos;rgatadi — dars qilayotganda
        fonda qoldiring.
      </p>

      {/* Filter chips — horizontal scroller on narrow screens. */}
      <div className="-mx-4 overflow-x-auto px-4 pb-1 sm:-mx-5 sm:px-5 lg:mx-0 lg:px-0">
        <div className="flex w-max gap-2">
          {chips.map((chip) => {
            const active = filter === chip.id;
            return (
              <button
                key={chip.id}
                type="button"
                onClick={() => setFilter(chip.id)}
                aria-pressed={active}
                className={cn(
                  "rounded-pill px-4 py-2 font-display text-sm font-bold transition-colors",
                  active
                    ? "bg-ink-900 text-surface"
                    : "border border-line bg-surface text-ink-600 hover:bg-tint",
                )}
              >
                {chip.label}
              </button>
            );
          })}
        </div>
      </div>

      {filter === "favorites" ? (
        <StationGroup
          heading="Sevimli"
          blurb="Yurak bosgan stansiyalaringiz"
          stations={favoriteStations}
          index={0}
        />
      ) : (
        <>
          {filter === "all" && favoriteStations.length > 0 ? (
            <StationGroup
              heading="Sevimli"
              blurb="Yurak bosgan stansiyalaringiz"
              stations={favoriteStations}
              index={0}
            />
          ) : null}

          {visibleCategories.map((category, i) => (
            <StationGroup
              key={category.id}
              heading={category.label}
              blurb={category.blurb}
              stations={stationsInCategory(category.id)}
              index={i + 1}
            />
          ))}
        </>
      )}
    </Screen>
  );
}

function StationGroup({
  heading,
  blurb,
  stations,
  index,
}: {
  heading: string;
  blurb: string;
  stations: RadioStation[];
  index: number;
}) {
  if (!stations.length) return null;
  return (
    <FadeIn index={index} className="flex flex-col gap-2.5">
      <div className="px-1">
        <h2 className="font-display text-lg font-extrabold text-ink-900">
          {heading}
        </h2>
        <p className="mt-0.5 text-xs font-bold leading-snug text-ink-500">
          {blurb}
        </p>
      </div>
      {/* Two columns once the shell widens, otherwise a single row is ~1000px
          of empty middle with the favourite button stranded at the far edge. */}
      <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
        {stations.map((station) => (
          <StationRow key={station.id} station={station} />
        ))}
      </div>
    </FadeIn>
  );
}

function StationRow({ station }: { station: RadioStation }) {
  const stationId = useRadio((s) => s.stationId);
  const status = useRadio((s) => s.status);
  const favorites = useRadio((s) => s.favorites);
  const play = useRadio((s) => s.play);
  const toggle = useRadio((s) => s.toggle);
  const toggleFavorite = useRadio((s) => s.toggleFavorite);

  const current = stationId === station.id;
  const playing = current && status === "playing";
  const loading = current && status === "loading";
  const failed = current && status === "error";
  const isFavorite = favorites.includes(station.id);

  const category = categoryOf(station.category);
  const Icon = category.icon;

  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-card border bg-surface py-3 pl-3 pr-3 transition-colors",
        current
          ? "border-coral-500/40 shadow-lumio-card"
          : "border-line shadow-lumio-sm",
      )}
    >
      <button
        type="button"
        onClick={() => (current ? toggle() : play(station))}
        aria-label={
          playing
            ? `${station.name} — to'xtatish`
            : `${station.name} — eshitish`
        }
        className={cn(
          "group relative inline-flex size-12 shrink-0 items-center justify-center rounded-card transition-transform active:scale-95",
          current ? "bg-coral-500 text-white" : TILE_TONE[category.tone],
        )}
      >
        {loading ? (
          <CircleNotch size={22} weight="bold" className="animate-spin" />
        ) : playing ? (
          <Pause size={22} weight="fill" />
        ) : current ? (
          <Play size={22} weight="fill" className="ml-0.5" />
        ) : (
          // An idle row wears its category glyph, so the list reads as a
          // catalogue rather than a wall of identical play buttons. Pointer
          // devices get the play affordance on hover; touch devices tap the
          // tile directly, which is already the same target.
          <>
            <Icon
              size={22}
              weight="fill"
              className="transition-opacity duration-150 group-hover:opacity-0"
            />
            <Play
              size={22}
              weight="fill"
              className="absolute ml-0.5 opacity-0 transition-opacity duration-150 group-hover:opacity-100"
            />
          </>
        )}
      </button>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <h3 className="truncate font-display text-base font-bold text-ink-900">
            {station.name}
          </h3>
          {station.talk ? (
            <Badge tone="sky" size="sm" className="shrink-0">
              Nutq ko&apos;p
            </Badge>
          ) : null}
        </div>
        <p
          className={cn(
            "mt-0.5 flex items-start gap-1.5 text-xs font-semibold leading-snug",
            failed
              ? "text-danger"
              : playing
                ? "font-bold text-coral-600"
                : "text-ink-500",
          )}
        >
          {playing ? <LiveBars active className="mt-px shrink-0" /> : null}
          {/* The note is a full sentence; clipping it mid-word (as `truncate`
              did) left every row ending in a stub. Two lines fit it. */}
          <span className="line-clamp-2">
            {failed
              ? "Ulanib bo'lmadi"
              : loading
                ? "Ulanmoqda..."
                : playing
                  ? "Jonli efir"
                  : station.note}
          </span>
        </p>
      </div>

      <button
        type="button"
        onClick={() => toggleFavorite(station.id)}
        aria-label={
          isFavorite ? "Sevimlilardan olib tashlash" : "Sevimlilarga qo'shish"
        }
        aria-pressed={isFavorite}
        className={cn(
          "inline-flex size-9 shrink-0 items-center justify-center rounded-full transition-colors",
          isFavorite
            ? "text-coral-500 hover:bg-coral-500/10"
            : "text-ink-300 hover:bg-tint hover:text-ink-500",
        )}
      >
        <Heart size={19} weight={isFavorite ? "fill" : "bold"} />
      </button>
    </div>
  );
}
