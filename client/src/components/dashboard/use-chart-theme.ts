"use client";

import { useTheme } from "next-themes";
import { chartPalette, type ChartPalette } from "./chart-palette";

/**
 * Diagramma ranglari uchun mavzu.
 *
 * `mounted` bayrog'i ATAYLAB yo'q: `next-themes` serverda ham, mijozning
 * birinchi renderida ham `resolvedTheme` ni `undefined` qaytaradi, ya'ni
 * ikkala tomon bir xil (yorug') palitradan boshlaydi va hidration mos
 * keladi. Mavzu aniqlangach komponent o'zi qayta chiziladi.
 */
export function useChartTheme(): { palette: ChartPalette; isDark: boolean } {
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark";
  return { palette: chartPalette(isDark), isDark };
}
