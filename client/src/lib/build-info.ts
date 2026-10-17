import { formatDdMmYyyy } from "@/lib/tashkent-time";

/** `date` is `yyyy-MM-dd` (Tashkent day of the build); `sha` is 7 characters or «dev». */
export interface BuildInfo {
  date: string;
  sha: string;
}

export function resolveBuildInfo(
  date: string | undefined,
  sha: string | undefined,
): BuildInfo | null {
  if (!date) return null;
  return { date, sha: sha || "dev" };
}

// Both reads must stay literal `process.env.NEXT_PUBLIC_*` expressions: Next
// inlines them at build time from the `env` block in next.config.ts, and a
// dynamic `process.env[name]` would be left undefined in the browser bundle.
export function currentBuildInfo(): BuildInfo | null {
  return resolveBuildInfo(
    process.env.NEXT_PUBLIC_BUILD_DATE,
    process.env.NEXT_PUBLIC_BUILD_SHA,
  );
}

export function formatBuildInfo({ date, sha }: BuildInfo): string {
  return `Yangilangan: ${formatDdMmYyyy(date)} · ${sha}`;
}
