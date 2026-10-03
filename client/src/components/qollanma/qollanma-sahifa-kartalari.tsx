import Link from "next/link";
import { ArrowRight } from "lucide-react";
import type { QollanmaSahifa } from "@/qollanma/turlar";
import { sahifaYoli } from "@/qollanma/sahifalar";

export function SahifaKartalari({ royxat }: { royxat: readonly QollanmaSahifa[] }) {
  return (
    <ul className="grid gap-3 sm:grid-cols-2">
      {royxat.map((s) => (
        <li key={sahifaYoli(s)}>
          <Link
            href={sahifaYoli(s)}
            className="group flex h-full flex-col rounded-lg border p-4 transition-colors hover:bg-muted/50"
          >
            <span className="flex items-center justify-between gap-2 font-medium">
              {s.sarlavha}
              <ArrowRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" aria-hidden />
            </span>
            <span className="mt-1 text-sm leading-6 text-muted-foreground">{s.qisqacha}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
