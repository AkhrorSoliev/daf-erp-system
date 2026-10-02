import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useDebouncedCallback } from "./use-debounced-callback";

// Testlar DOM'siz (`node`) ishlaydi, shuning uchun React o'rniga kichik o'rinbosar:
// hook bir marta chaqiriladi, effektlar darhol bajariladi, ularning tozalash
// funksiyalari yig'iladi va `unmount()` ularni React kabi chaqiradi.
const cleanups = vi.hoisted(() => [] as Array<() => void>);
vi.mock("react", () => {
  const effect = (setup: () => void | (() => void)) => {
    const cleanup = setup();
    if (cleanup) cleanups.push(cleanup);
  };
  return {
    useRef: <T>(current: T) => ({ current }),
    useCallback: <T>(fn: T) => fn,
    useEffect: effect,
    useLayoutEffect: effect,
  };
});

const unmount = () => cleanups.splice(0).forEach((cleanup) => cleanup());

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  cleanups.length = 0;
  vi.useRealTimers();
});

describe("useDebouncedCallback", () => {
  it("kechikishdan keyin oxirgi qiymat bilan bir marta chaqiradi", () => {
    const callback = vi.fn();
    const debounced = useDebouncedCallback(callback, 300);

    debounced("a");
    debounced("al");
    vi.advanceTimersByTime(299);
    expect(callback).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback).toHaveBeenCalledWith("al");
  });

  it("komponent yopilsa kutayotgan chaqiruv bekor bo'ladi", () => {
    // Qidiruvga "ali" yozib, 300 ms ichida havolani bosish: yangi sahifa ochilgach
    // kechikkan router.replace foydalanuvchini yana ?search=ali ga qaytarardi.
    const callback = vi.fn();
    const debounced = useDebouncedCallback(callback, 300);

    debounced("ali");
    unmount();
    vi.advanceTimersByTime(300);

    expect(callback).not.toHaveBeenCalled();
  });
});
