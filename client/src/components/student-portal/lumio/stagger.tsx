import * as React from "react";
import { cn } from "@/lib/utils";

export interface StaggerProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Birinchi bolaning kechikishi — ro'yxat sahifaning o'rtasida boshlansa. */
  from?: number;
  /** Bolalar orasidagi qadam. Standart — dizayn tizimidagi 55 ms. */
  stepMs?: number;
}

/**
 * Bolalarini KETMA-KET chiqaradigan o'ram.
 *
 * `FadeIn` butun blokni bitta bo'lak qilib chiqaradi: ekrandagi hamma
 * narsa bir vaqtda paydo bo'ladi va harakat bitta katta qadamga
 * aylanadi. Bu o'quvchiga qayerga qarashni aytmaydi.
 *
 * Ketma-ketlik esa ko'zni yetaklaydi — yuqoridan pastga, birinchi
 * kartadan oxirgisiga. Dizayn tizimining `lumio-stagger` qoidasi shu:
 * ota `lumio-stagger` sinfini oladi, har bola esa o'z `--i` sini.
 * Bu yerda `--i` avtomatik qo'yiladi, chunki uni har chaqiruvda qo'lda
 * yozish takrorlanadigan va unutiladigan ish.
 */
export function Stagger({
  from = 0,
  stepMs,
  className,
  style,
  children,
  ...rest
}: StaggerProps) {
  return (
    <div
      className={cn("lumio-stagger", className)}
      style={
        {
          ...(stepMs ? { ["--step" as string]: `${stepMs}ms` } : {}),
          ...style,
        } as React.CSSProperties
      }
      {...rest}
    >
      {React.Children.map(children, (child, i) =>
        React.isValidElement(child)
          ? React.cloneElement(
              child as React.ReactElement<{ style?: React.CSSProperties }>,
              {
                style: {
                  ["--i" as string]: from + i,
                  ...((child.props as { style?: React.CSSProperties }).style ??
                    {}),
                } as React.CSSProperties,
              },
            )
          : child,
      )}
    </div>
  );
}
