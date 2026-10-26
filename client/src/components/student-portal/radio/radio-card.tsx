"use client";

import Link from "next/link";
import { CaretRight } from "@phosphor-icons/react";
import { useT } from "@/i18n/use-t";
import { Radio } from "../lumio/icon";
import { IconTile } from "../lumio/icon-tile";
import { useRadio } from "../lib/radio-store";
import { LiveBars } from "./live-bars";

/**
 * The way into the German live radio from Bosh sahifa and Ta'lim. Radio is for
 * listening while studying, so it sits where the student studies instead of a
 * "Ko'proq" row. While a station plays the card shows it (the docked mini
 * player carries the controls); otherwise it says what Radio is for.
 */
export function RadioCard() {
  const t = useT();
  const status = useRadio((s) => s.status);
  const station = useRadio((s) => s.station());
  const playing = station !== null && status === "playing";

  return (
    <Link
      href="/portal/radio"
      className="flex items-center gap-3.5 rounded-card border border-line bg-surface p-4 shadow-lumio-card transition-colors hover:bg-tint"
    >
      <IconTile icon={<Radio weight="bold" />} tone="coral" size="lg" />
      <span className="min-w-0 flex-1">
        <span className="block font-display text-lg font-bold text-ink-900">
          {t("Radio")}
        </span>
        {playing ? (
          <span className="flex items-center gap-2 text-sm font-semibold text-coral-600 dark:text-coral-400">
            <LiveBars active />
            {/* A station's name is data: it is drawn as it is, never translated. */}
            <span className="truncate">{station.name}</span>
          </span>
        ) : (
          <span className="block text-sm font-semibold leading-snug text-ink-500">
            {t("Nemis tilini fonda tinglang")}
          </span>
        )}
      </span>
      <CaretRight size={20} weight="bold" className="shrink-0 text-ink-400" />
    </Link>
  );
}
