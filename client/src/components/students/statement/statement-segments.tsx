import { cn } from "@/lib/utils";
import type { Segment } from "./statement-types";
import { TONE_TEXT } from "./statement-utils";

/** A sentence the server split into styled parts (bold amounts, a tone). */
export function Segments({ segments }: { segments: Segment[] }) {
  return (
    <>
      {segments.map((s, i) => (
        <span
          key={i}
          className={cn(
            s.bold && "font-semibold",
            s.bold && /\d/.test(s.text) && "font-mono tabular-nums",
            s.tone && TONE_TEXT[s.tone],
          )}
        >
          {s.text}
        </span>
      ))}
    </>
  );
}
