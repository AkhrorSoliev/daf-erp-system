"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { studentNavItems } from "@/lib/student-nav-items";

export function StudentBottomNav() {
  const pathname = usePathname();

  function isActive(url: string) {
    if (url === "/portal") return pathname === "/portal";
    return pathname.startsWith(url);
  }

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-background md:hidden">
      <div
        className="flex items-center justify-around"
        style={{ paddingBottom: "env(safe-area-inset-bottom, 4px)" }}
      >
        {studentNavItems.map((item) => {
          const active = isActive(item.url);
          const Icon = item.icon;
          const isAi = item.url === "/portal/ai";

          if (isAi) {
            return (
              <Link
                key={item.url}
                href={item.url}
                className="relative flex flex-col items-center justify-center px-3 min-w-16 -mt-7"
              >
                {/* Pulsing glow behind button */}
                <div
                  className={cn(
                    "absolute top-0 left-1/2 -translate-x-1/2 size-[56px] rounded-[18px] blur-lg",
                    active
                      ? "bg-gradient-to-br from-violet-500 via-fuchsia-500 to-cyan-400 animate-[ai-glow_5s_ease-in-out_infinite]"
                      : "bg-gradient-to-br from-violet-500 to-indigo-500 animate-[ai-glow_5s_ease-in-out_infinite]"
                  )}
                />

                {/* Rotating orbital ring */}
                <div className="absolute top-0 left-1/2 -translate-x-1/2 size-[64px] -translate-y-[6px]">
                  <svg
                    viewBox="0 0 64 64"
                    className={cn(
                      "size-full",
                      active
                        ? "animate-spin [animation-duration:5s]"
                        : "animate-spin [animation-duration:5s]"
                    )}
                  >
                    <defs>
                      <linearGradient
                        id="ai-orbit"
                        x1="0%"
                        y1="0%"
                        x2="100%"
                        y2="100%"
                      >
                        <stop offset="0%" stopColor="#8b5cf6" />
                        <stop offset="33%" stopColor="#d946ef" />
                        <stop offset="66%" stopColor="#06b6d4" />
                        <stop offset="100%" stopColor="#f59e0b" />
                      </linearGradient>
                    </defs>
                    <circle
                      cx="32"
                      cy="32"
                      r="30"
                      fill="none"
                      stroke="url(#ai-orbit)"
                      strokeWidth="2.5"
                      strokeDasharray="14 8 6 8 10 8"
                      strokeLinecap="round"
                      opacity={active ? 1 : 0.6}
                    />
                  </svg>
                  {/* Counter-rotating inner ring */}
                  <svg
                    viewBox="0 0 64 64"
                    className={cn(
                      "size-full absolute inset-0",
                      active
                        ? "animate-[counter-spin_5s_linear_infinite]"
                        : "animate-[counter-spin_5s_linear_infinite]"
                    )}
                  >
                    <circle
                      cx="32"
                      cy="32"
                      r="24"
                      fill="none"
                      stroke="url(#ai-orbit)"
                      strokeWidth="1.5"
                      strokeDasharray="4 16 4 16"
                      strokeLinecap="round"
                      opacity={active ? 0.6 : 0.3}
                    />
                  </svg>
                </div>

                {/* Main AI button */}
                <div
                  className={cn(
                    "relative size-[52px] rounded-[16px] flex items-center justify-center transition-all duration-500",
                    "ring-[3px] ring-background shadow-xl",
                    "animate-[ai-float_5s_ease-in-out_infinite]",
                    active
                      ? "bg-gradient-to-br from-violet-500 via-fuchsia-500 to-cyan-400 shadow-violet-500/50"
                      : "bg-gradient-to-br from-violet-600 via-purple-600 to-indigo-600 shadow-purple-500/30 dark:shadow-purple-500/20"
                  )}
                >
                  {/* Shimmer sweep */}
                  <div className="absolute inset-0 rounded-[14px] overflow-hidden">
                    <div className="absolute inset-0 bg-gradient-to-t from-transparent via-white/25 to-transparent animate-[shimmer_5s_ease-in-out_infinite]" />
                  </div>
                  {/* Border gradient overlay */}
                  <div className="absolute inset-[1px] rounded-[15px] border border-white/20" />
                  <Icon
                    className={cn(
                      "size-6 text-white drop-shadow-md relative z-10 animate-[ai-sparkle_5s_ease-in-out_infinite]",
                      active && "scale-110"
                    )}
                  />
                  {/* Floating particles */}
                  <span className="absolute -top-1.5 -right-1.5 size-2.5 rounded-full bg-amber-400 shadow-md shadow-amber-400/60 animate-[ai-particle-1_5s_ease-in-out_infinite]" />
                  <span className="absolute -bottom-1.5 -left-1.5 size-2 rounded-full bg-cyan-400 shadow-md shadow-cyan-400/60 animate-[ai-particle-2_5s_ease-in-out_infinite]" />
                  <span className="absolute -top-1 -left-1 size-1.5 rounded-full bg-fuchsia-400 shadow-md shadow-fuchsia-400/60 animate-[ai-particle-3_5s_ease-in-out_infinite]" />
                  <span className="absolute -bottom-0.5 -right-1 size-1.5 rounded-full bg-emerald-400 shadow-md shadow-emerald-400/60 animate-[ai-particle-1_5s_ease-in-out_infinite_reverse]" />
                </div>

                <span
                  className={cn(
                    "text-xs leading-tight mt-1.5 font-extrabold tracking-wider uppercase",
                    "bg-gradient-to-r from-violet-600 via-fuchsia-500 to-cyan-500 dark:from-violet-400 dark:via-fuchsia-400 dark:to-cyan-400 bg-clip-text text-transparent"
                  )}
                >
                  {item.title}
                </span>
              </Link>
            );
          }

          return (
            <Link
              key={item.url}
              href={item.url}
              className={cn(
                "flex flex-col items-center justify-center gap-0.5 py-2.5 px-3 min-h-13 min-w-15",
                active ? "text-primary" : "text-muted-foreground"
              )}
            >
              <Icon className={cn("size-5", active && "stroke-[2.5px]")} />
              <span
                className={cn(
                  "text-[10px] leading-tight",
                  active ? "font-semibold" : "font-medium"
                )}
              >
                {item.title}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
