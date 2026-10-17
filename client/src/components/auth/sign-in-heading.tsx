"use client";

import { useT } from "@/i18n/context";

/**
 * The sign-in page's heading. `title` is a `msg()` text of `lib/portal.ts`;
 * drawing it here keeps it in step with the language picker, which a string
 * translated on the server would not be.
 */
export function SignInHeading({ title }: { title: string }) {
  const t = useT();
  return <h1 className="mb-8 text-2xl font-semibold tracking-tight">{t(title)}</h1>;
}
