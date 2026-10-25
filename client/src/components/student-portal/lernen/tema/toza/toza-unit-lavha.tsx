"use client";

import { cn } from "@/lib/utils";
import { Dafi } from "../../dafi/dafi";
import { DARAJA_FONI } from "../../yol/yopishqoq-unit-lavha";
import type { UnitLavhaProps } from "../tema-turlari";

/**
 * «Toza»: the path's level-coloured banner at the top of the unit page, with
 * Dafi waving hello. Unlike the path's sticky banner it is the only place the
 * unit's German title is shown, so screen readers read it.
 */
export function TozaUnitLavha({ daraja, matn }: UnitLavhaProps) {
  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-2xl py-2 pl-4 pr-2 text-white shadow-[0_5px_0_rgba(0,0,0,.22)]",
        DARAJA_FONI[daraja] ?? DARAJA_FONI.A1,
      )}
    >
      <p className="min-w-0 flex-1 font-display text-base font-extrabold">{matn}</p>
      <Dafi holat="salom" olcham="sm" />
    </div>
  );
}
