import type * as React from "react";
import type { DafLessonKind } from "../../types";

export type JoyId = "kulba" | "koprik" | "gor" | "qala";

/**
 * Which place a lesson is in the forest (spec §8): the first meeting in a hut,
 * the practice on a bridge, the passage test in a cave, the final test in a
 * castle. An old DiB lesson has no step: it is a hut.
 */
export function placeForKind(kind: DafLessonKind | null): JoyId {
  switch (kind) {
    case "SECTION_B":
      return "koprik";
    case "BRIDGE":
      return "gor";
    case "UNIT_TEST":
      return "qala";
    default:
      return "kulba";
  }
}

interface BelgiProps {
  className?: string;
}

/** A hut with a lit window. */
function Kulba({ className }: BelgiProps) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden="true">
      <ellipse cx="32" cy="56" rx="26" ry="5" fill="#3f8a72" opacity="0.35" />
      <rect x="14" y="30" width="36" height="24" rx="5" fill="#c98b5a" />
      <path d="M8 33 32 12l24 21z" fill="#7a4a2c" />
      <rect x="27" y="39" width="10" height="15" rx="3" fill="#5a341f" />
      <rect x="40" y="36" width="7" height="7" rx="2" fill="#ffe9a8" />
    </svg>
  );
}

/** A wooden bridge over a stream. */
function Koprik({ className }: BelgiProps) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden="true">
      <ellipse cx="32" cy="54" rx="28" ry="6" fill="#7fc3d0" opacity="0.6" />
      <path d="M6 44q26-26 52 0" fill="none" stroke="#8a5a3a" strokeWidth="6" strokeLinecap="round" />
      <rect x="4" y="40" width="56" height="6" rx="3" fill="#b07a4f" />
      <path d="M12 40v-8M22 36v-9M32 34v-10M42 36v-9M52 40v-8" stroke="#8a5a3a" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

/** A cave in a mossy hill. */
function Gor({ className }: BelgiProps) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden="true">
      <path d="M4 56 22 18l10 10 8-12 20 40z" fill="#7d8a8f" />
      <path d="M20 56q12-26 24 0z" fill="#2c3438" />
      <ellipse cx="14" cy="55" rx="10" ry="4" fill="#3f8a72" />
      <ellipse cx="52" cy="55" rx="9" ry="4" fill="#3f8a72" />
    </svg>
  );
}

/** A small castle with a flag. */
function Qala({ className }: BelgiProps) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden="true">
      <rect x="10" y="22" width="12" height="34" rx="2" fill="#a99bc4" />
      <rect x="42" y="22" width="12" height="34" rx="2" fill="#a99bc4" />
      <rect x="18" y="30" width="28" height="26" rx="2" fill="#bfb3d6" />
      <path d="M27 56V46a5 5 0 0 1 10 0v10z" fill="#5d4f7a" />
      <path d="M10 22v-5h4v3h4v-3h4v5zM42 22v-5h4v3h4v-3h4v5z" fill="#8d7fb0" />
      <path d="M48 17V5" stroke="#5d4f7a" strokeWidth="2" strokeLinecap="round" />
      <path d="M48 5l9 3-9 3z" fill="#ff8466" />
    </svg>
  );
}

/** The emblem of each place: hand-drawn, still SVG (the mockup's emoji are not used, spec §14). */
export const JOY_BELGISI: Record<JoyId, (p: BelgiProps) => React.JSX.Element> = {
  kulba: Kulba,
  koprik: Koprik,
  gor: Gor,
  qala: Qala,
};
