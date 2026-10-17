import type { CSSProperties } from "react";
import Image from "next/image";
import { COMPANY } from "@/lib/company";

// The pages of the logo's open book, fanned out from one spine in the bottom
// right corner (a 400×400 box). Each is one stroke, drawn in on load.
const PAGES = [
  "M400 400Q419 246 358 103",
  "M400 400Q399 231 320 82",
  "M400 400Q375 219 276 66",
  "M400 400Q369 248 266 132",
  "M400 400Q345 240 222 124",
  "M400 400Q319 236 176 123",
  "M400 400Q322 266 187 189",
  "M400 400Q297 266 144 195",
  "M400 400Q271 271 99 209",
  "M400 400Q283 298 131 268",
  "M400 400Q260 306 92 288",
  "M400 400Q237 319 54 315",
  "M400 400Q257 341 103 360",
];

/**
 * The brand side of the staff sign-in pages: the logo's navy as a block, the
 * logo itself in white and the pages of its open book as a large fan. A band
 * across the top on a phone, the left column from `lg`. Colours and motion are
 * `.sign-in-cover` in globals.css.
 */
export function SignInCover() {
  return (
    <div className="sign-in-cover relative h-32 shrink-0 overflow-hidden p-5 lg:h-auto lg:p-10">
      <svg
        aria-hidden="true"
        viewBox="0 0 400 400"
        preserveAspectRatio="xMaxYMax meet"
        fill="none"
        strokeWidth={1.2}
        strokeLinecap="round"
        className="sign-in-cover-fan absolute right-0 bottom-0 h-[150%] w-auto lg:h-[80%]"
      >
        {PAGES.map((d, i) => (
          <path
            key={d}
            d={d}
            pathLength={1}
            style={{ "--page": i } as CSSProperties}
          />
        ))}
      </svg>
      <Image
        src="/daf-logo.png"
        alt={COMPANY.tradingName}
        width={1047}
        height={494}
        priority
        className="relative h-10 w-auto brightness-0 invert lg:h-14"
      />
    </div>
  );
}
