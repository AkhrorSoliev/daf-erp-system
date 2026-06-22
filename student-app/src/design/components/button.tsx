import { useState } from 'react';
import { ActivityIndicator, Pressable, View, type PressableProps } from 'react-native';
import { MotiView } from 'moti';
import { useColorScheme } from 'nativewind';
import { Ionicons } from '@expo/vector-icons';
import { cn } from '@/lib/cn';
import { useColors } from '@/design/colors';
import { clay } from '@/design/shadows';
import { EASE, DUR } from './motion';
import { Text } from './text';

type ButtonVariant = 'primary' | 'secondary' | 'teal' | 'ghost' | 'danger';
type ButtonSize = 'sm' | 'md' | 'lg';

const dangerClay = [
  { offsetX: 0, offsetY: 6, blurRadius: 0, color: '#B5311F' },
  { offsetX: 0, offsetY: 16, blurRadius: 26, color: 'rgba(214,58,36,0.30)' },
];

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
  const colors = useColors();
  const { colorScheme } = useColorScheme();
  const [pressed, setPressed] = useState(false);

  const palette: Record<ButtonVariant, { bg: string; label: string; icon: string; clay?: any }> = {
    primary: { bg: 'bg-coral-500', label: 'text-white', icon: '#FFFFFF', clay: clay.coral },
    teal: { bg: 'bg-teal-500', label: 'text-white', icon: '#FFFFFF', clay: clay.teal },
    secondary: { bg: 'bg-surface', label: 'text-fg', icon: colors.fg, clay: colorScheme === 'dark' ? clay.whiteDark : clay.white },
    danger: { bg: 'bg-danger', label: 'text-white', icon: '#FFFFFF', clay: dangerClay },
    ghost: { bg: 'bg-transparent', label: 'text-fg-body', icon: colors.fg },
  };

  const pal = palette[variant];
  const sz = sizes[size];
  const isDisabled = disabled || loading;

  return (
    <Pressable
      accessibilityRole="button"
      disabled={isDisabled}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      className={className}
      {...props}
    >
      <MotiView
        animate={{ scale: pressed && !isDisabled ? 0.96 : 1 }}
        transition={{ type: 'timing', duration: DUR.fast, easing: EASE }}
      >
        <View
          className={cn('flex-row items-center justify-center gap-2', sz.box, pal.bg, isDisabled && 'opacity-50')}
          style={variant === 'ghost' ? undefined : { boxShadow: pal.clay }}
        >
          {loading ? (
            <ActivityIndicator color={pal.icon} />
          ) : (
            <>
              {iconBefore ? <Ionicons name={iconBefore} size={sz.icon} color={pal.icon} /> : null}
              <Text className={cn('font-display', sz.text, pal.label)}>{text}</Text>
            </>
          )}
        </View>
      </MotiView>
    </Pressable>
  );
}
