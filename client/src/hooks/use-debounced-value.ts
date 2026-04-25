import { useEffect, useState } from "react";

/**
 * Returns a debounced copy of `value` — updated only after `delay` ms elapse
 * without further changes. Useful for deferring expensive reactions (API calls,
 * re-renders) until a rapid stream of updates settles.
 */
export function useDebouncedValue<T>(value: T, delay: number = 300): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);

  return debounced;
}
