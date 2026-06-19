import { Modal, Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useColors } from '@/design/colors';
import { shadow } from '@/design/shadows';
import { Text } from './text';

export type ActionSheetOption = {
  label: string;
  onPress: () => void;
  icon?: keyof typeof Ionicons.glyphMap;
  destructive?: boolean;
};

/** Lumio bottom sheet — grab handle, action rows, tap a row or backdrop to dismiss. */
export function ActionSheet({
  visible,
  onClose,
  options,
  title,
}: {
  visible: boolean;
  onClose: () => void;
  options: ActionSheetOption[];
  title?: string;
}) {
  const colors = useColors();
  return (
    <Modal visible={visible} transparent animationType="slide" statusBarTranslucent onRequestClose={onClose}>
      <Pressable className="flex-1 justify-end bg-black/50" onPress={onClose}>
        <Pressable
          className="gap-1 rounded-t-[34px] bg-surface px-4 pb-9 pt-3"
          style={{ boxShadow: shadow.pop }}
          onPress={() => {}}
        >
          <View className="mb-2 h-1.5 w-10 self-center rounded-full bg-border" />
          {title ? (
            <Text variant="muted" className="pb-1 text-center">
              {title}
            </Text>
          ) : null}
          {options.map((o) => (
            <Pressable
              key={o.label}
              onPress={() => {
                onClose();
                o.onPress();
              }}
              className="flex-row items-center gap-3 rounded-md px-3 py-3.5 active:bg-tint"
            >
              {o.icon ? (
                <Ionicons name={o.icon} size={22} color={o.destructive ? colors.danger : colors.fg} />
              ) : null}
              <Text variant="label" className={o.destructive ? 'text-danger' : undefined}>
                {o.label}
              </Text>
            </Pressable>
          ))}
          <Pressable onPress={onClose} className="mt-1 items-center rounded-md bg-sunk py-3.5 active:opacity-80">
            <Text variant="label" className="text-fg-muted">
              Bekor qilish
            </Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
