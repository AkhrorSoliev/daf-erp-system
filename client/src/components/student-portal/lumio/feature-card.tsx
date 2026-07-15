import * as React from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { ArrowUpRight } from "@phosphor-icons/react";

type Gradient = "warm" | "sun" | "teal" | "cool" | "grape";

const GRAD: Record<Gradient, string> = {
  warm: "grad-warm clay-coral",
  sun: "grad-sun clay-amber",
  teal: "grad-teal clay-teal",
  cool: "grad-cool clay-sky",
  grape: "grad-grape clay-grape",
};

export interface FeatureCardProps {
  title: string;
  subtitle?: string;
  gradient?: Gradient;
  /** Big decorative glyph bled into the right edge. */
  art?: React.ReactNode;
  href?: string;
  onClick?: () => void;
  className?: string;
}

// Bold gradient feature tile — the headline call-to-action (e.g. the AI Deutsch
// Tutor card). Renders as a Link when `href` is set, else a button.
export function FeatureCard({
  title,
  subtitle,
  gradient = "warm",
  art,
  href,
  onClick,
  className,
}: FeatureCardProps) {
  const classes = cn(
    "clay-btn relative flex min-h-[150px] flex-col justify-center overflow-hidden rounded-feature p-6 text-left text-white",
    GRAD[gradient],
    className,
  );

  const inner = (
    <>
      {art ? (
        <span
          aria-hidden
          className="pointer-events-none absolute -right-2 top-0 bottom-0 flex w-[46%] items-center justify-end text-[96px] text-white/45"
        >
          {art}
        </span>
      ) : null}
      <span
        className={cn(
          "relative z-10 font-display text-[30px] font-extrabold leading-[1.05] tracking-tight [text-shadow:0_2px_8px_rgba(14,42,61,0.18)]",
          art && "max-w-[62%]",
        )}
      >
        {title}
      </span>
      {subtitle ? (
        <span className="relative z-10 mt-3.5 inline-flex h-11 w-fit items-center rounded-pill bg-white/20 px-4 text-[15px] font-bold backdrop-blur-sm">
          {subtitle}
        </span>
      ) : null}
      <span className="absolute right-4 top-4 flex size-11 items-center justify-center rounded-full bg-white text-ink-900 shadow-lumio-card">
        <ArrowUpRight size={22} weight="bold" />
      </span>
    </>
  );

  if (href) {
    return (
      <Link href={href} className={classes}>
        {inner}
      </Link>
    );
  }
  return (
    <button type="button" onClick={onClick} className={classes}>
      {inner}
    </button>
  );
}
