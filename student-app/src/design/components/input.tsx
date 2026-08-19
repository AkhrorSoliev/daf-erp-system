import { useState } from 'react';
import { Pressable, TextInput, View, type TextInputProps } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { cn } from '@/lib/cn';
import { useColors } from '@/design/colors';
import { useT } from '@/i18n';

export function Input({ className, secureTextEntry, ...props }: TextInputProps) {
  const colors = useColors();
  const t = useT();
  const [visible, setVisible] = useState(false);
  const base =
    'h-[54px] rounded-md border border-border bg-surface px-4 font-body text-[16px] text-fg';

  // Plain input — no toggle needed.
  if (!secureTextEntry) {
    return (
      <TextInput placeholderTextColor={colors.fgFaint} className={cn(base, className)} {...props} />
    );
  }

  // Password input — overlay an eye toggle and leave room for it on the right.
  return (
    <View className="justify-center">
      <TextInput
        placeholderTextColor={colors.fgFaint}
        secureTextEntry={!visible}
        className={cn(base, 'pr-12', className)}
        {...props}
      />
      <Pressable
        onPress={() => setVisible((v) => !v)}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel={visible ? t.common.hidePassword : t.common.showPassword}
        className="absolute right-1 h-11 w-11 items-center justify-center"
      >
        <Ionicons
          name={visible ? 'eye-off-outline' : 'eye-outline'}
          size={20}
          color={colors.fgMuted}
        />
      </Pressable>
    </View>
  );
}
