import React from 'react';

export interface ChartSeries {
  data: number[];
  color: string;
}
export interface ChartLegendItem {
  value: React.ReactNode;
  label: React.ReactNode;
  color: string;
}

export interface ProgressChartProps {
  /** Range tab labels. @default ['7 kun','1 oy','6 oy','1 yil'] */
  ranges?: string[];
  /** Controlled selected range. */
  range?: string;
  onRange?: (range: string) => void;
  /** X-axis labels. */
  labels?: string[];
  /** One or two line series. */
  series?: ChartSeries[];
  /** Legend rows (value + swatch + label). */
  legend?: ChartLegendItem[];
  /** SVG height. @default 200 */
  height?: number;
  style?: React.CSSProperties;
}

/**
 * Vocabulary progress chart — range tabs + SVG line chart + legend.
 * @startingPoint section="Learning" subtitle="Progress line chart" viewport="430x340"
 */
export function ProgressChart(props: ProgressChartProps): JSX.Element;
