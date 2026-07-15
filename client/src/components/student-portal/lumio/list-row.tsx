import * as React from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { CaretRight } from "@phosphor-icons/react";
import { IconTile } from "./icon-tile";
import type { LumioTone } from "./tones";

export interface ListRowProps {
  icon?: React.ReactNode;
  iconTone?: LumioTone;
  label: React.ReactNode;
  /** Secondary line(s); `\n` renders as multiple lines. */
  subtitle?: React.ReactNode;
  trailing?: React.ReactNode;
  chevron?: boolean;
  href?: string;
  onClick?: () => void;
  danger?: boolean;
  className?: string;
}

// White rounded "menu" row from the More screen — leading icon tile, label +
// optional subtitle, trailing content, chevron. Renders as Link / button / div.
export function ListRow({
  icon,
  iconTone = "grape",
  label,
  subtitle,
  trailing,
  chevron = true,
  href,
  onClick,
  danger = false,
  className,
}: ListRowProps) {
  const classes = cn(
    "flex w-full items-center gap-3.5 rounded-card border border-line bg-surface px-4 py-3.5 text-left shadow-lumio-sm transition-colors",
    (href || onClick) && "hover:bg-tint",
    className,
  );

  const body = (
    <>
      {icon ? (
        <IconTile icon={icon} tone={danger ? "coral" : iconTone} />
      ) : null}
      <span className="min-w-0 flex-1">
        <span
          className={cn(
            "block truncate font-display text-lg font-bold",
            danger ? "text-danger" : "text-ink-900",
          )}
        >
          {label}
        </span>
        {subtitle ? (
          <span className="mt-0.5 block whitespace-pre-line text-sm font-semibold leading-snug text-ink-500">
            {subtitle}
          </span>
        ) : null}
      </span>
      {trailing}
      {chevron ? (
        <CaretRight size={20} weight="bold" className="shrink-0 text-ink-400" />
      ) : null}
    </>
  );

  if (href) {
    return (
      <Link href={href} className={classes}>
        {body}
      </Link>
    );
  }
  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={classes}>
        {body}
      </button>
    );
  }
  return <div className={classes}>{body}</div>;
}
