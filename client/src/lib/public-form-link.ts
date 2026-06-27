// Builds the public, shareable URL for a custom form.
//
// On production admin/lehrer/student hosts, swap the subdomain to `form.` and
// drop the `/f/` prefix — the form subdomain rewrites `/<slug>` internally.
// Local dev keeps the current origin + `/f/<slug>`.
export function buildPublicFormLink(slug: string): string {
  if (typeof window === "undefined") return `/f/${slug}`;
  const host = window.location.hostname;
  if (host.endsWith(".dafzentrum.uz")) {
    return `https://form.dafzentrum.uz/${slug}`;
  }
  return `${window.location.origin}/f/${slug}`;
}

// Appends a source tag (`?source=<name>`) to the public link so leads that
// arrive through it are attributed to that channel/ad. An empty name returns
// the bare link.
export function buildTaggedFormLink(slug: string, source?: string): string {
  const base = buildPublicFormLink(slug);
  const name = source?.trim();
  if (!name) return base;
  const sep = base.includes("?") ? "&" : "?";
  return `${base}${sep}source=${encodeURIComponent(name)}`;
}
