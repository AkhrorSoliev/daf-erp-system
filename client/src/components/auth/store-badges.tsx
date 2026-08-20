import Image from "next/image";
import { cn } from "@/lib/utils";
import { STORES, BADGE_HEIGHT } from "@/lib/company";

// The two official store badges, drawn at a matching visual height.
//
// Both files are the artwork the stores publish and must not be recoloured or
// redrawn — Google's and Apple's brand guidelines both require their own asset,
// used as-is. That is also why the Google file keeps its built-in clear space
// instead of being cropped; see STORES.googlePlay for the sizing arithmetic
// that clear space forces on us.

type Store = (typeof STORES)[keyof typeof STORES];

function Badge({ store }: { store: Store }) {
  // Scale the whole file up so the artwork *inside* it lands on BADGE_HEIGHT.
  const height = BADGE_HEIGHT / store.visibleHeightRatio;
  const width = height * (store.canvas.width / store.canvas.height);

  return (
    <a
      href={store.href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={store.label}
      className="inline-flex shrink-0 rounded-[6px] opacity-90 transition-opacity hover:opacity-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-current"
    >
      <Image
        src={store.src}
        alt={store.label}
        width={Math.round(width)}
        height={Math.round(height)}
        // Local, already tiny, and one of them is an SVG — the optimizer would
        // refuse the SVG and gain nothing on the 5 KB PNG.
        unoptimized
      />
    </a>
  );
}

export function StoreBadges({ className }: { className?: string }) {
  return (
    <div className={cn("flex items-center gap-1", className)}>
      <Badge store={STORES.appStore} />
      <Badge store={STORES.googlePlay} />
    </div>
  );
}
