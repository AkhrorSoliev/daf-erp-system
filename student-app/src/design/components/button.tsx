import { ActivityIndicator, Pressable, View, type PressableProps } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { cn } from '@/lib/cn';
import { tokens } from '@/design/tokens';
import { clay } from '@/design/shadows';
import { Text } from './text';

type ButtonVariant = 'primary' | 'secondary' | 'teal' | 'ghost' | 'danger';
type ButtonSize = 'sm' | 'md' | 'lg';

const dangerClay = [
  { offsetX: 0, offsetY: 6, blurRadius: 0, color: '#B5311F' },
  { offsetX: 0, offsetY: 16, blurRadius: 26, color: 'rgba(214,58,36,0.30)' },
];
const dangerClayPress = [
  { offsetX: 0, offsetY: 2, blurRadius: 0, color: '#B5311F' },
  { offsetX: 0, offsetY: 6, blurRadius: 12, color: 'rgba(214,58,36,0.28)' },
];

const palette: Record<
  ButtonVariant,
  { bg: string; label: string; icon: string; clay?: any; press?: any }
> = {
  primary: { bg: 'bg-coral-500', label: 'text-white', icon: '#FFFFFF', clay: clay.coral, press: clay.coralPress },
  teal: { bg: 'bg-teal-500', label: 'text-white', icon: '#FFFFFF', clay: clay.teal, press: clay.tealPress },
  secondary: { bg: 'bg-white', label: 'text-ink-900', icon: tokens.color.fg, clay: clay.white, press: clay.whitePress },
  danger: { bg: 'bg-danger', label: 'text-white', icon: '#FFFFFF', clay: dangerClay, press: dangerClayPress },
  ghost: { bg: 'bg-transparent', label: 'text-ink-700', icon: tokens.color.fg },
};

const sizes: Record<ButtonSize, { box: string; text: string; icon: number }> = {
  sm: { box: 'h-[42px] px-[18px] rounded-md', text: 'text-[15px]', icon: 17 },
  md: { box: 'h-[54px] px-[24px] rounded-button', text: 'text-[17px]', icon: 19 },
  lg: { box: 'h-[60px] px-[28px] rounded-[26px]', text: 'text-[18px]', icon: 21 },
};

export function Button({
  label: text,
  variant = 'primary',
  size = 'md',
  loading = false,
  iconBefore,
  disabled,
  className,
  ...props
}: Omit<PressableProps, 'children'> & {
  label: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  iconBefore?: keyof typeof Ionicons.glyphMap;
}) {
  const pal = palette[variant];
  const sz = sizes[size];
  const isDisabled = disabled || loading;
  const isGhost = variant === 'ghost';

  return (
    <Pressable
      accessibilityRole="button"
      disabled={isDisabled}
      className={cn('flex-row items-center justify-center gap-2', sz.box, pal.bg, isDisabled && 'opacity-50', className)}
      style={({ pressed }) =>
        isGhost
          ? [pressed && { transform: [{ scale: 0.97 }] }]
          : [{ boxShadow: pressed && !isDisabled ? pal.press : pal.clay, transform: [{ translateY: pressed && !isDisabled ? 4 : 0 }] }]
      }
      {...props}
    >
      {loading ? (
        <ActivityIndicator color={pal.icon} />
      ) : (
        <>
          {iconBefore ? <Ionicons name={iconBefore} size={sz.icon} color={pal.icon} /> : null}
          <Text className={cn('font-display', sz.text, pal.label)}>{text}</Text>
        </>
      )}
    </Pressable>
  );
}
