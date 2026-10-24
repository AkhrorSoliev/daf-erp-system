"use client";

import { useEffect, useState } from "react";

/** The current time, refreshed once a minute: deadlines change colour on their own. */
export function useMinuteClock(): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(timer);
  }, []);
  return now;
}
