import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { useT } from "@/i18n/context";

interface SelectEmptyStateProps {
  /** A `msg()` text, drawn with `t`. */
  text: string;
  /** When given — a link to the fixing page; `onNavigate` closes the drawer. */
  action?: { href: string; label: string; onNavigate?: () => void };
}

/** In place of an empty list in a form: why it is empty and where to fix it. */
export function SelectEmptyState({ text, action }: SelectEmptyStateProps) {
  const t = useT();
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-dashed px-3 py-2 text-sm">
      <span className="text-muted-foreground">{t(text)}</span>
      {action && (
        <Link
          href={action.href}
          onClick={action.onNavigate}
          className="inline-flex items-center gap-1 font-medium text-primary hover:underline"
        >
          {t(action.label)}
          <ArrowUpRight className="size-3.5" />
        </Link>
      )}
    </div>
  );
}
