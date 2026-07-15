"use client";

import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";
import { CircleNotch } from "@phosphor-icons/react";

// Lumio Button — chunky, rounded, clay-extruded action. The `clay-*` class
// paints the resting extrude shadow; `clay-btn` drives the press (sinks +
// collapses the lip on :active) from globals.css. Focus uses `outline` (not
// `ring`) so it never fights the clay box-shadow.
export const lumioButton = cva(
  "relative inline-flex items-center justify-center gap-2 font-display font-bold tracking-tight leading-none select-none whitespace-nowrap transition-colors disabled:opacity-50 disabled:pointer-events-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-coral-500",
  {
    variants: {
      variant: {
        primary: "bg-coral-500 text-white clay-coral clay-btn",
        teal: "bg-teal-500 text-white clay-teal clay-btn",
        amber: "bg-amber-500 text-ink-900 clay-amber clay-btn",
        secondary:
          "bg-surface text-ink-900 border border-line clay-white clay-btn",
        ghost: "bg-transparent text-ink-700 hover:bg-ink-100",
        danger: "bg-danger text-white clay-btn shadow-lumio-card",
      },
      size: {
        sm: "h-10 px-4 text-sm rounded-md",
        md: "h-[52px] px-5 text-base rounded-card",
        lg: "h-[60px] px-7 text-lg rounded-feature",
      },
      block: { true: "w-full", false: "" },
    },
    defaultVariants: { variant: "primary", size: "md", block: false },
  },
);

export interface LumioButtonProps
  extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "color">,
    VariantProps<typeof lumioButton> {
  loading?: boolean;
  iconBefore?: React.ReactNode;
  iconAfter?: React.ReactNode;
}

export const Button = React.forwardRef<HTMLButtonElement, LumioButtonProps>(
  function Button(
    {
      className,
      variant,
      size,
      block,
      loading = false,
      iconBefore,
      iconAfter,
      disabled,
      children,
      type = "button",
      ...rest
    },
    ref,
  ) {
    return (
      <button
        ref={ref}
        type={type}
        disabled={disabled || loading}
        className={cn(lumioButton({ variant, size, block }), className)}
        {...rest}
      >
        {loading ? (
          <CircleNotch className="size-5 animate-spin" weight="bold" />
        ) : (
          iconBefore
        )}
        {children}
        {!loading && iconAfter}
      </button>
    );
  },
);
