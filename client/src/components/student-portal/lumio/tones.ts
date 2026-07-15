// Shared tone → utility-class maps for Lumio icon tiles and colored accents.
// Backgrounds use a translucent tint of the accent (`/12`–`/15`) so they read
// correctly on both the light canvas and the dark deep-ocean surface without a
// separate dark palette.
export type LumioTone = "coral" | "teal" | "amber" | "grape" | "sky" | "ink";

export const TILE_TONE: Record<LumioTone, string> = {
  coral: "bg-coral-500/12 text-coral-600",
  teal: "bg-teal-500/12 text-teal-600",
  amber: "bg-amber-500/15 text-amber-600",
  grape: "bg-grape-500/15 text-grape-500",
  sky: "bg-sky-500/12 text-sky-600",
  ink: "bg-ink-500/12 text-ink-700",
};
