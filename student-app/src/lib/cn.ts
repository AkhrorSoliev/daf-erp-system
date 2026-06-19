import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** Merge conditional Tailwind classes, de-duplicating conflicts (RNR-style). */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
