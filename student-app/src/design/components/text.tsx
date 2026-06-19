import { Text as RNText, type TextProps } from 'react-native';
import { cn } from '@/lib/cn';

export type TextVariant =
  | 'display'
  | 'heading'
  | 'title'
  | 'h3'
  | 'body'
  | 'bodyStrong'
  | 'muted'
  | 'label'
  | 'caps'
  | 'num';

// Display (Baloo 2) for headings + numbers; Nunito for everything readable.
const variants: Record<TextVariant, string> = {
  display: 'font-displayx text-[34px] leading-[37px] tracking-tight text-ink-900',
  heading: 'font-displayx text-[27px] leading-[30px] tracking-tight text-ink-900',
  title: 'font-displayx text-[21px] leading-[26px] text-ink-900',
  h3: 'font-display text-[18px] leading-[23px] text-ink-900',
  body: 'font-body text-[16px] leading-[24px] text-ink-700',
  bodyStrong: 'font-bodymd text-[16px] leading-[24px] text-ink-900',
  muted: 'font-body text-[14px] leading-[20px] text-ink-500',
  label: 'font-bodymd text-[14px] leading-[19px] text-ink-900',
  caps: 'font-bodyx text-[11px] leading-[15px] tracking-[1px] uppercase text-ink-400',
  num: 'font-displayx text-ink-900',
};

export function Text({
  variant = 'body',
  className,
  ...props
}: TextProps & { variant?: TextVariant }) {
  return <RNText className={cn(variants[variant], className)} {...props} />;
}
