import type { CSSProperties } from "react";
import Image from "next/image";
import { COMPANY } from "@/lib/company";

// The pages of the logo's open book, fanned out from one spine in the bottom
// right corner (a 400×400 box). Each page is one stroke.
//
// The numbers are the page's own ritual of sway, fixed here rather than drawn
// at random on render (that would not match between the server and the
// browser): two slow back-and-forth sways of different length and strength
// (`da`/`amp`, `db`/`ampb`, in seconds and degrees) and where in its cycle
// each starts (`ra`, `rb`, negative seconds). Fifteen-odd different lengths
// never line up, so the fan does not visibly repeat. Motion is `.sign-in-fan`
// in globals.css.
const PAGES = [
  { d: "M400 400Q419 246 358 103", da: 7, ra: -4.3, amp: 1.2, db: 12.8, rb: -6.4, ampb: 0.4 },
  { d: "M400 400Q399 231 320 82", da: 6.6, ra: -5.2, amp: 1.2, db: 10.7, rb: -10.6, ampb: 1.1 },
  { d: "M400 400Q375 219 276 66", da: 8.7, ra: -8.3, amp: 1.9, db: 12.2, rb: -10.5, ampb: 0.8 },
  { d: "M400 400Q369 248 266 132", da: 9, ra: -4.6, amp: 0.9, db: 15.8, rb: -3.9, ampb: 0.7 },
  { d: "M400 400Q345 240 222 124", da: 8.4, ra: -2.9, amp: 1.4, db: 15.7, rb: -15.2, ampb: 1 },
  { d: "M400 400Q319 236 176 123", da: 8.6, ra: -5.6, amp: 1.8, db: 11.4, rb: -4.2, ampb: 0.9 },
  { d: "M400 400Q322 266 187 189", da: 7.4, ra: -4.6, amp: 0.8, db: 12.3, rb: -10, ampb: 0.9 },
  { d: "M400 400Q297 266 144 195", da: 9.3, ra: -5.5, amp: 0.9, db: 11.3, rb: -0.8, ampb: 0.8 },
  { d: "M400 400Q271 271 99 209", da: 9, ra: -3.6, amp: 1, db: 16.1, rb: -1.6, ampb: 0.7 },
  { d: "M400 400Q283 298 131 268", da: 8.4, ra: -0.8, amp: 1.1, db: 11.6, rb: -2.9, ampb: 0.9 },
  { d: "M400 400Q260 306 92 288", da: 8.3, ra: -6, amp: 1, db: 12.1, rb: -3.1, ampb: 0.4 },
  { d: "M400 400Q237 319 54 315", da: 8.9, ra: -1.9, amp: 1.4, db: 16, rb: -3.8, ampb: 0.6 },
  { d: "M400 400Q257 341 103 360", da: 8.2, ra: -0.6, amp: 1.9, db: 12.3, rb: -11.2, ampb: 0.8 },
];

function pageStyle(p: (typeof PAGES)[number], i: number) {
  return {
    "--page": i,
    "--da": `${p.da}s`,
    "--ra": `${p.ra}s`,
    "--amp": `${p.amp}deg`,
    "--db": `${p.db}s`,
    "--rb": `${p.rb}s`,
    "--ampb": `${p.ampb}deg`,
  } as CSSProperties;
}

/**
 * The brand side of the staff sign-in pages: the logo's navy as a block, the
 * logo itself in white and the pages of its open book as a large fan. A band
 * across the top on a phone, the left column from `lg`. Colours and motion are
 * `.sign-in-cover` / `.sign-in-fan` in globals.css: the pages are drawn in on
 * load, then sway in the wind, and a light passes over them one after another.
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
        className="sign-in-fan absolute right-0 bottom-0 h-[150%] w-auto overflow-visible lg:h-[80%]"
      >
        <g className="fan-gust">
          {PAGES.map((p, i) => (
            <g key={p.d} className="page-sway" style={pageStyle(p, i)}>
              <path className="page-line" d={p.d} pathLength={1} />
              <path className="page-light" d={p.d} />
            </g>
          ))}
        </g>
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
