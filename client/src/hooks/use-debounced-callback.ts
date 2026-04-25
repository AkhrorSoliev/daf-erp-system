import { useCallback, useLayoutEffect, useRef } from "react";

export function useDebouncedCallback<T extends (...args: any[]) => void>(
  callback: T,
  delay: number = 300,
): T {
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const callbackRef = useRef(callback);

  // Keep ref in sync with the latest callback without writing during render.
  useLayoutEffect(() => {
    callbackRef.current = callback;
  });

  return useCallback(
    (...args: Parameters<T>) => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(() => callbackRef.current(...args), delay);
    },
    [delay],
  ) as T;
}
