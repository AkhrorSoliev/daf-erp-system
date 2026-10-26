import type { LernenTemaId } from "@/lib/lernen-temalar";
import { temaTop } from "./lernen/tema/tema-reyestri";

/**
 * A look's picture on its card in the look dialog: the theme's own
 * `Miniatyura` (a static picture; never the scene's layers) when it has one,
 * else its colour dot. Both sit in one cell, so every card's label starts at
 * the same place.
 */
export function TemaRasmi({ id, swatch }: { id: LernenTemaId; swatch: string }) {
  const Miniatyura = temaTop(id).Miniatyura;
  return (
    <span aria-hidden className="flex h-10 w-14 shrink-0 items-center justify-center">
      {Miniatyura ? <Miniatyura /> : <span className="size-8 rounded-full" style={{ background: swatch }} />}
    </span>
  );
}
