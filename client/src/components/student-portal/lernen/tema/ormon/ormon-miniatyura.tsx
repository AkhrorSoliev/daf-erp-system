import { BIOMES } from "./ormon-biom";

/** «O'rmon»'s picture on its card in Sozlamalar (spec §7): a still, tiny forest at dawn with a lit node. */
export function OrmonMiniatyura() {
  const p = BIOMES.tong;
  return (
    <svg data-miniatyura="ormon" viewBox="0 0 56 40" className="h-10 w-14" aria-hidden="true">
      <defs>
        <linearGradient id="ormon-miniatyura-osmon" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={p.sky1} />
          <stop offset="1" stopColor={p.sky2} />
        </linearGradient>
      </defs>
      <rect width="56" height="40" rx="10" fill="url(#ormon-miniatyura-osmon)" />
      <circle cx="12" cy="20" r="9" fill={p.far} opacity="0.7" />
      <circle cx="44" cy="18" r="10" fill={p.far} opacity="0.7" />
      <circle cx="8" cy="35" r="10" fill={p.near} />
      <circle cx="50" cy="36" r="9" fill={p.near} />
      <circle cx="28" cy="26" r="9" fill="#a6fde8" opacity="0.35" />
      <circle cx="28" cy="26" r="6" fill="#86ead2" />
    </svg>
  );
}
