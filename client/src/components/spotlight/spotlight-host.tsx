"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import toast from "react-hot-toast";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverAnchor,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
} from "@/components/ui/popover";
import { useSpotlight, type SpotlightStep } from "@/hooks/use-spotlight";
import {
  routePath,
  spotlightBox,
  waitForSpotlightTarget,
  type SpotlightBox,
} from "./spotlight-target";

/** How long to wait for the button after the page opens — data loads, then the button appears. */
const FIND_TIMEOUT_MS = 5_000;
/** The tour started but the page was never reached — drop the stale tour. */
const ARRIVE_TIMEOUT_MS = 15_000;

function findVisible(selector: string): HTMLElement | null {
  const el = document.querySelector<HTMLElement>(selector);
  return el && el.getClientRects().length > 0 ? el : null;
}

/**
 * The tour's single renderer — mounted once in the layout, OUTSIDE `<main>`,
 * because the tour starts AFTER the page navigation.
 *
 * When `step` is set and `pathname` matches `step.route`'s path, the button is
 * waited on for up to 5 seconds → if found, its surroundings dim and a Popover
 * opens; if not, an explanatory toast appears instead. Closing: "Tushundim",
 * Esc, or clicking anywhere — Radix calls `onOpenChange(false)`, and the
 * clicked button still does its own job (not modal, an outside click is not
 * blocked); navigating to another page also closes it.
 */
export function SpotlightHost() {
  const step = useSpotlight((s) => s.step);
  const seq = useSpotlight((s) => s.seq);
  if (!step) return null;
  // `key` — a new tour does not inherit the previous one's state (the found
  // button, the box); no cleanup effect is needed.
  return <SpotlightRunner key={seq} step={step} />;
}

function SpotlightRunner({ step }: { step: SpotlightStep }) {
  const stop = useSpotlight((s) => s.stop);
  const pathname = usePathname();
  const [target, setTarget] = useState<HTMLElement | null>(null);
  const [box, setBox] = useState<SpotlightBox | null>(null);
  const arrivedRef = useRef(false);

  // Did we reach the page? Having reached it, then moving to another page —
  // close; never reaching it at all — drop the stale tour.
  useEffect(() => {
    if (pathname === routePath(step.route)) {
      arrivedRef.current = true;
      return;
    }
    if (arrivedRef.current) {
      stop();
      return;
    }
    const t = window.setTimeout(stop, ARRIVE_TIMEOUT_MS);
    return () => window.clearTimeout(t);
  }, [step.route, pathname, stop]);

  // Wait for the button — the wait/observe/timeout logic lives in
  // `waitForSpotlightTarget` (tested in a node test); only the real DOM
  // adapters live here.
  useEffect(() => {
    if (pathname !== routePath(step.route) || target) return;
    return waitForSpotlightTarget<HTMLElement>({
      targets: step.targets,
      lookup: findVisible,
      observe: (callback) => {
        const observer = new MutationObserver(callback);
        observer.observe(document.body, { childList: true, subtree: true, attributes: true });
        return () => observer.disconnect();
      },
      setTimer: (callback, ms) => window.setTimeout(callback, ms),
      clearTimer: (id) => window.clearTimeout(id),
      timeoutMs: FIND_TIMEOUT_MS,
      onFound: (el) => {
        el.scrollIntoView({ block: "center" });
        setTarget(el);
      },
      onTimeout: () => {
        toast(`${step.title}: ${step.body}`, { duration: 6000 });
        stop();
      },
    });
  }, [step, pathname, target, stop]);

  // Position: re-measured on scroll and resize; if the button leaves the DOM
  // (the list re-rendered) — the tour closes.
  useEffect(() => {
    if (!target) return;
    let frame = 0;
    const measure = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        if (!target.isConnected) {
          stop();
          return;
        }
        setBox(spotlightBox(target.getBoundingClientRect()));
      });
    };
    measure();
    window.addEventListener("scroll", measure, true);
    window.addEventListener("resize", measure);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", measure, true);
      window.removeEventListener("resize", measure);
    };
  }, [target, stop]);

  if (!target || !box) return null;

  return (
    <Popover
      open
      onOpenChange={(open) => {
        if (!open) stop();
      }}
    >
      <PopoverAnchor asChild>
        <div
          aria-hidden
          className="pointer-events-none fixed z-[60] rounded-lg ring-2 ring-primary"
          style={{
            top: box.top,
            left: box.left,
            width: box.width,
            height: box.height,
            boxShadow: "0 0 0 9999px rgb(0 0 0 / 0.5)",
          }}
        />
      </PopoverAnchor>
      <PopoverContent side="bottom" align="start" className="z-[61] w-80">
        <PopoverHeader>
          <PopoverTitle>{step.title}</PopoverTitle>
          <PopoverDescription>{step.body}</PopoverDescription>
        </PopoverHeader>
        <div className="flex justify-end">
          <Button size="sm" onClick={stop}>
            Tushundim
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
