const BODY = "#b07a4f";
const DARK = "#8f5d38";
const BELLY = "#f0cfa6";
const INK = "#2a1a14";

/**
 * Dafi's head as inline SVG (ADR-0125). Classes (.all, .earL, .eL, .mo, …) are
 * what `DafiRig` animates. It is the approved mockup's `ART` plus calm starting
 * attributes (neutral mouth, state-only layers hidden) so the server-rendered head is right.
 */
export const DAFI_SVG = `<svg viewBox="30 20 140 125" aria-hidden="true" style="overflow:visible;display:block;width:100%;height:100%">
<ellipse class="sh" cx="100" cy="140" rx="46" ry="6" fill="#000" opacity=".15"/>
<g class="fxl"></g>
<g class="all">
 <g class="earL"><circle cx="58" cy="46" r="21" fill="${BODY}"/><circle cx="58" cy="49" r="10.5" fill="#efc08f"/></g>
 <g class="earR"><circle cx="142" cy="46" r="21" fill="${BODY}"/><circle cx="142" cy="49" r="10.5" fill="#efc08f"/></g>
 <ellipse cx="100" cy="86" rx="55" ry="50" fill="${BODY}"/><ellipse cx="100" cy="124" rx="40" ry="9" fill="${DARK}" opacity=".35"/>
 <circle class="chL" cx="66" cy="102" r="9" fill="#ff8f7d" opacity=".55"/><circle class="chR" cx="134" cy="102" r="9" fill="#ff8f7d" opacity=".55"/>
 <ellipse cx="100" cy="103" rx="23" ry="18" fill="${BELLY}"/>
 <ellipse cx="100" cy="94" rx="9.5" ry="6.8" fill="${INK}"/><ellipse cx="97" cy="92" rx="3" ry="1.8" fill="#fff" opacity=".7"/>
 <path d="M100 100 V106" stroke="${INK}" stroke-width="2.6" stroke-linecap="round"/>
 <ellipse class="tg" cx="100" cy="116" rx="7" ry="4" fill="#ff8f8f" opacity="0"/>
 <path class="mo" d="M88 106 Q100 118 112 106" fill="none" stroke="${INK}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
 <g class="gz">
  <g class="eL"><ellipse cx="78" cy="80" rx="7.5" ry="9.5" fill="${INK}"/><circle cx="80.5" cy="76" r="2.8" fill="#fff"/></g>
  <g class="eR"><ellipse cx="122" cy="80" rx="7.5" ry="9.5" fill="${INK}"/><circle cx="124.5" cy="76" r="2.8" fill="#fff"/></g>
 </g>
 <g class="hL" opacity="0"><path d="M69 83 Q78 70 87 83" stroke="${INK}" fill="none" stroke-width="4" stroke-linecap="round"/></g>
 <g class="hR" opacity="0"><path d="M113 83 Q122 70 131 83" stroke="${INK}" fill="none" stroke-width="4" stroke-linecap="round"/></g>
 <path class="bL" opacity="0" d="M67 65 L89 61" stroke="#6e4326" stroke-width="4" stroke-linecap="round"/><path class="bR" opacity="0" d="M133 65 L111 61" stroke="#6e4326" stroke-width="4" stroke-linecap="round"/>
 <g class="fq" opacity="0"><circle cx="164" cy="34" r="16" fill="#fff" stroke="#e6dccf" stroke-width="2"/><text x="164" y="42" text-anchor="middle" font-family="Nunito,system-ui" font-weight="900" font-size="22" fill="#8b5cf6">?</text></g>
 <g class="fs" opacity="0"><path d="M148 52 Q157 66 148 75 Q139 66 148 52Z" fill="#7cc8ff"/></g>
 <g class="fst" opacity="0"><text x="30" y="46" font-size="20">⭐</text><text x="160" y="34" font-size="17">✨</text><text x="22" y="100" font-size="15">✨</text><text x="168" y="98" font-size="19">⭐</text></g>
</g></svg>`;
