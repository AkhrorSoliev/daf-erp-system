"use client";

import { useT } from "@/i18n/context";

/**
 * Title and one-line description of a report page whose route file holds only
 * these texts. The route passes them as `msg()` texts; this draws them in the
 * page's language.
 */
export function ReportPageHeader({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  const t = useT();
  return (
    <div>
      <h2 className="font-heading text-xl font-bold tracking-tight">{t(title)}</h2>
      <p className="text-sm text-muted-foreground">{t(description)}</p>
    </div>
  );
}
